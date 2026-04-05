import { spawn } from 'node:child_process';
import { prisma } from '@/lib/db/prisma';

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env
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
        `  npm run prisma:seed\n` +
        `  npm run e2e\n\n` +
        `Underlying error: ${message}`
    );
  }
}

async function assertSeededOperatorData() {
  const [assetCount, seededOffice, seededDeal, seededPortfolio, seededFund] = await Promise.all([
    prisma.asset.count(),
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

  if (assetCount === 0 || !seededOffice || !seededPortfolio || !seededFund || !seededDeal) {
    throw new Error('E2E preflight detected missing seeded demo data.');
  }
}

async function main() {
  await assertDatabaseReachable();

  try {
    await assertSeededOperatorData();
  } catch {
    console.log('Seeded demo records are missing. Running `npm run prisma:seed` before browser smoke...');
    await prisma.$disconnect();
    await runCommand('npm', ['run', 'prisma:seed']);
  }

  await prisma.$disconnect();

  await runCommand('npx', ['playwright', 'test']);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
