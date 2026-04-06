import { spawn } from 'node:child_process';
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
    seededFund
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
    })
  ]);

  const pendingReviewCount = pendingEnergyCount + pendingPermitCount + pendingLeaseCount;

  if (assetCount === 0 || pendingReviewCount < 2 || !seededOffice || !seededPortfolio || !seededFund || !seededDeal) {
    throw new Error('E2E preflight detected missing seeded demo data.');
  }
}

async function main() {
  await assertDatabaseReachable();

  console.log('Resetting seeded demo records before browser E2E...');
  await prisma.$disconnect();
  await runCommand('npm', ['run', 'prisma:seed']);
  await assertDatabaseReachable();
  await assertSeededOperatorData();

  await prisma.$disconnect();

  await runCommand('npx', ['playwright', 'test'], {
    BLOCKCHAIN_MOCK_MODE: process.env.BLOCKCHAIN_MOCK_MODE ?? 'true'
  });
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
