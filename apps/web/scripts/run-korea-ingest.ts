import { prisma } from '@/lib/db/prisma';
import { runKoreaIngest } from '@/lib/services/data-ingest';

async function main() {
  console.log('[ingest:korea] starting Korea public data ingest...');
  const result = await runKoreaIngest(prisma);
  const durationMs = result.finishedAt.getTime() - result.startedAt.getTime();
  console.log(`[ingest:korea] run ${result.runId} completed in ${durationMs}ms`);
  console.log(`[ingest:korea] startedAt  = ${result.startedAt.toISOString()}`);
  console.log(`[ingest:korea] finishedAt = ${result.finishedAt.toISOString()}`);
  console.log('[ingest:korea] source results:');
  for (const source of result.sourceResults) {
    const base = `  - ${source.source.padEnd(42)} ${source.status.padEnd(8)} rows=${source.rowCount}`;
    if (source.error) {
      console.log(`${base}  error=${source.error}`);
    } else {
      console.log(base);
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('[ingest:korea] failed:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
