import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';

function runCommand(
  command: string,
  args: string[],
  envOverrides: Record<string, string | undefined> = {}
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        ...envOverrides
      }
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 1}`));
    });
  });
}

function getBrowserAdminCredentialEnv() {
  const envCredential = process.env.ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS?.trim();
  if (envCredential) {
    return envCredential;
  }

  const legacyUser = process.env.ADMIN_BASIC_AUTH_USER?.trim();
  const legacyPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD?.trim();
  if (legacyUser && legacyPassword) {
    return `${legacyUser}:${legacyPassword}`;
  }

  return 'admin@nexusseoul.local:secret';
}

function resolveDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return null;
  }

  try {
    return new URL(databaseUrl);
  } catch {
    return null;
  }
}

function canSafelyResetE2EDatabase() {
  const parsed = resolveDatabaseUrl();
  if (!parsed) {
    return false;
  }

  const databaseName = parsed.pathname.replace(/^\//, '');
  return (
    ['127.0.0.1', 'localhost'].includes(parsed.hostname) && databaseName === 'korea_dc_underwriting'
  );
}

async function assertDatabaseReachable() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `E2E preflight failed: local database is not reachable.\n` +
        `Current DATABASE_URL points to ${process.env.DATABASE_URL ?? 'an unset DATABASE_URL'}.\n` +
        `Start Postgres, then run:\n` +
        `  npm run db:e2e:up\n` +
        `  npm run prisma:seed\n` +
        `  npm run e2e\n\n` +
        `Or use the one-command local path:\n` +
        `  npm run e2e:local\n\n` +
        `Underlying error: ${message}`
    );
  }
}

async function assertSeededOperatorData() {
  const [
    assetCount,
    pendingEnergyCount,
    pendingPermitCount,
    pendingLeaseCount,
    seededOffice,
    seededDeal,
    seededPortfolio,
    seededFund,
    seededUnmappedIdentity
  ] = await Promise.all([
    prisma.asset.count(),
    prisma.energySnapshot.count({ where: { reviewStatus: 'PENDING' } }),
    prisma.permitSnapshot.count({ where: { reviewStatus: 'PENDING' } }),
    prisma.lease.count({ where: { reviewStatus: 'PENDING' } }),
    prisma.asset.findFirst({
      where: { name: 'Yeouido Core Office Tower' },
      select: { id: true }
    }),
    prisma.deal.findFirst({
      select: { id: true }
    }),
    prisma.portfolio.findFirst({
      where: { name: 'Korea Income & Infrastructure Portfolio I' },
      select: { id: true }
    }),
    prisma.fund.findFirst({
      where: { name: 'Han River Real Estate Fund I' },
      select: { id: true }
    }),
    prisma.adminIdentityBinding.findFirst({
      where: { userId: null },
      select: { id: true }
    })
  ]);

  const pendingReviewCount = pendingEnergyCount + pendingPermitCount + pendingLeaseCount;

  if (
    assetCount === 0 ||
    pendingReviewCount < 2 ||
    !seededOffice ||
    !seededPortfolio ||
    !seededFund ||
    !seededDeal ||
    !seededUnmappedIdentity
  ) {
    throw new Error('E2E preflight detected missing seeded demo data.');
  }
}

async function prepareE2EDatabaseSchema() {
  console.log('Applying checked-in Prisma migrations before browser E2E...');
  await prisma.$disconnect();

  try {
    await runCommand('npx', ['prisma', 'migrate', 'deploy']);
  } catch (error) {
    if (!canSafelyResetE2EDatabase()) {
      throw error;
    }

    console.warn(
      'Prisma migrate deploy failed against the local E2E database. Resetting the dedicated scratch database and replaying the checked-in migration chain.'
    );
    await runCommand('npx', [
      'prisma',
      'migrate',
      'reset',
      '--force',
      '--skip-seed',
      '--skip-generate'
    ]);
  }

  console.log('Reconciling remaining schema drift on the dedicated E2E database...');
  await runCommand('npx', ['prisma', 'db', 'push', '--skip-generate']);
  await assertDatabaseReachable();
}

async function clearNextBuildOutput() {
  const buildPath = path.join(process.cwd(), 'build');
  await rm(buildPath, { recursive: true, force: true });
}

async function main() {
  await assertDatabaseReachable();
  await prepareE2EDatabaseSchema();

  console.log('Resetting seeded demo records before browser E2E...');
  await prisma.$disconnect();
  await runCommand('npm', ['run', 'prisma:seed']);
  await assertDatabaseReachable();
  await assertSeededOperatorData();
  await clearNextBuildOutput();

  await prisma.$disconnect();
  process.env.ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS = getBrowserAdminCredentialEnv();

  await runCommand('npx', ['playwright', 'test'], {
    BLOCKCHAIN_MOCK_MODE: process.env.BLOCKCHAIN_MOCK_MODE ?? 'true',
    ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS: process.env.ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS
  });
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
