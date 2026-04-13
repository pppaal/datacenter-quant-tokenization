import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { SourceStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  fetchKosisConstructionCostSeries,
  fetchKosisInflationSeries,
  type KoreaIngestResult,
  type KoreaIngestRow
} from '@/lib/ingest/korea-kosis-adapter';
import { fetchRebOfficeVacancySeries } from '@/lib/ingest/korea-reb-adapter';

export type IngestSourceStatusLabel = 'OK' | 'PARTIAL' | 'FAILED';

export type IngestSourceResult = {
  source: string;
  rowCount: number;
  status: IngestSourceStatusLabel;
  error?: string;
};

export type IngestRunResult = {
  runId: string;
  startedAt: Date;
  finishedAt: Date;
  sourceResults: IngestSourceResult[];
};

type IngestDb = Pick<PrismaClient, 'macroSeries'>;

type AdapterDescriptor = {
  source: string;
  frequency: 'monthly' | 'quarterly';
  sourceSystem: string;
  run: () => Promise<KoreaIngestResult>;
};

const ADAPTERS: AdapterDescriptor[] = [
  {
    source: 'kosis.inflation',
    frequency: 'monthly',
    sourceSystem: 'kosis',
    run: fetchKosisInflationSeries
  },
  {
    source: 'kosis.construction_cost',
    frequency: 'quarterly',
    sourceSystem: 'kosis',
    run: fetchKosisConstructionCostSeries
  },
  {
    source: 'reb.office_vacancy',
    frequency: 'monthly',
    sourceSystem: 'korea_reb',
    run: fetchRebOfficeVacancySeries
  }
];

function resolveSourceStatus(result: KoreaIngestResult): SourceStatus {
  return result.source === 'mock' ? SourceStatus.MANUAL : SourceStatus.FRESH;
}

function resolveUnit(seriesKey: string): string | null {
  if (seriesKey.endsWith('_pct')) return '%';
  if (seriesKey.includes('index')) return 'index';
  return null;
}

async function upsertMacroRow(
  db: IngestDb,
  row: KoreaIngestRow,
  descriptor: AdapterDescriptor,
  result: KoreaIngestResult,
  now: Date
) {
  const existing = await db.macroSeries.findFirst({
    where: {
      market: 'KR',
      seriesKey: row.seriesKey,
      observationDate: row.observationDate,
      assetId: null
    },
    select: { id: true }
  });

  const sourceStatus = resolveSourceStatus(result);
  const unit = resolveUnit(row.seriesKey);
  const sourceSystem =
    result.source === 'mock' ? `${descriptor.sourceSystem}:mock` : descriptor.sourceSystem;

  if (existing) {
    await db.macroSeries.update({
      where: { id: existing.id },
      data: {
        label: row.label,
        value: row.value,
        unit: unit ?? undefined,
        frequency: descriptor.frequency,
        sourceSystem,
        sourceStatus,
        sourceUpdatedAt: now
      }
    });
    return;
  }

  await db.macroSeries.create({
    data: {
      market: 'KR',
      seriesKey: row.seriesKey,
      label: row.label,
      frequency: descriptor.frequency,
      observationDate: row.observationDate,
      value: row.value,
      unit: unit ?? undefined,
      sourceSystem,
      sourceStatus,
      sourceUpdatedAt: now
    }
  });
}

async function runAdapter(
  db: IngestDb,
  descriptor: AdapterDescriptor,
  now: Date
): Promise<IngestSourceResult> {
  try {
    const result = await descriptor.run();
    let persisted = 0;
    let failed = 0;
    let firstError: string | undefined;

    for (const row of result.rows) {
      try {
        await upsertMacroRow(db, row, descriptor, result, now);
        persisted += 1;
      } catch (rowError) {
        failed += 1;
        if (!firstError) {
          firstError = rowError instanceof Error ? rowError.message : 'Row upsert failed.';
        }
      }
    }

    let status: IngestSourceStatusLabel;
    if (persisted === 0) {
      status = 'FAILED';
    } else if (failed > 0 || result.error) {
      status = 'PARTIAL';
    } else {
      status = 'OK';
    }

    const errorMessage = firstError ?? result.error;

    return {
      source: `${descriptor.source}:${result.source}`,
      rowCount: persisted,
      status,
      ...(errorMessage ? { error: errorMessage } : {})
    };
  } catch (error) {
    return {
      source: descriptor.source,
      rowCount: 0,
      status: 'FAILED',
      error: error instanceof Error ? error.message : 'Adapter execution failed.'
    };
  }
}

export async function runKoreaIngest(db: IngestDb = prisma): Promise<IngestRunResult> {
  const runId = randomUUID();
  const startedAt = new Date();
  const sourceResults: IngestSourceResult[] = [];

  for (const descriptor of ADAPTERS) {
    const result = await runAdapter(db, descriptor, startedAt);
    sourceResults.push(result);
  }

  const finishedAt = new Date();
  return {
    runId,
    startedAt,
    finishedAt,
    sourceResults
  };
}
