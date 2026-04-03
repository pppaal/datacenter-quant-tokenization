import { spawn } from 'node:child_process';
import { prisma } from '@/lib/db/prisma';

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
    throw new Error(
      `E2E preflight failed: seeded demo records are missing.\n` +
        `Expected seeded assets, deals, portfolio, and fund shells.\n` +
        `Run:\n` +
        `  npm run prisma:seed\n` +
        `  npm run e2e`
    );
  }
}

async function main() {
  await assertDatabaseReachable();
  await assertSeededOperatorData();

  await prisma.$disconnect();

  const child = spawn('npx', ['playwright', 'test'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
