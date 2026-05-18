/**
 * Manual time-series ingestion for MacroSeries + MarketIndicatorSeries.
 *
 * Public adapters (KOSIS / BOK ECOS / REB / MOLIT) cover ongoing
 * collection, but for time-series depth — the 5-year history a CBRE-style
 * cap-rate matrix needs — operators commonly have that as quarterly REB
 * Excel reports or as their own scraped CSV. This service accepts the
 * data as a parsed array (CSV → array is done in the route) and inserts
 * with `skipDuplicates`-style conflict handling so a re-import is safe.
 */
import { AssetClass, Prisma, type PrismaClient, SourceStatus } from '@prisma/client';

export type MacroSeriesImportRow = {
  target: 'macro';
  market: string;
  seriesKey: string;
  label: string;
  observationDate: Date;
  value: number;
  unit?: string | null;
  sourceSystem?: string | null;
  frequency?: string | null;
};

export type MarketIndicatorImportRow = {
  target: 'market';
  market: string;
  region?: string | null;
  assetClass?: AssetClass | null;
  assetTier?: string | null;
  indicatorKey: string;
  observationDate: Date;
  value: number;
  unit?: string | null;
  sourceSystem?: string | null;
};

export type TimeseriesImportRow = MacroSeriesImportRow | MarketIndicatorImportRow;

export type TimeseriesImportSummary = {
  macroInserted: number;
  macroUpdated: number;
  marketInserted: number;
  marketUpdated: number;
  skippedInvalid: number;
};

/**
 * Parse a CSV-shaped payload into typed rows. Header row required, drives
 * column mapping. Required columns:
 *   target          'macro' | 'market'
 *   market          ISO-like code, e.g. KR / JP / HK / US
 *   indicatorKey    canonical key (macro: seriesKey alias)
 *   observationDate YYYY-MM-DD
 *   value           number
 * Optional:
 *   region, assetClass, assetTier, label, unit, sourceSystem, frequency
 *
 * Lines starting with `#` are treated as comments. Empty lines skipped.
 */
export function parseTimeseriesCsv(text: string): {
  rows: TimeseriesImportRow[];
  errors: Array<{ line: number; reason: string }>;
} {
  const rows: TimeseriesImportRow[] = [];
  const errors: Array<{ line: number; reason: string }> = [];
  const lines = text.split(/\r?\n/);

  let headerCols: string[] | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const cols = splitCsvLine(trimmed);
    if (!headerCols) {
      headerCols = cols.map((c) => c.toLowerCase());
      continue;
    }
    if (cols.length !== headerCols.length) {
      errors.push({ line: i + 1, reason: `column count ${cols.length} ≠ header ${headerCols.length}` });
      continue;
    }
    const obj: Record<string, string> = {};
    for (let c = 0; c < headerCols.length; c += 1) obj[headerCols[c]!] = cols[c]!;

    const target = obj.target;
    if (target !== 'macro' && target !== 'market') {
      errors.push({ line: i + 1, reason: `target must be 'macro' or 'market', got "${target}"` });
      continue;
    }
    if (!obj.market) {
      errors.push({ line: i + 1, reason: 'market is required' });
      continue;
    }
    const indicatorKey = obj.indicatorkey ?? obj.serieskey;
    if (!indicatorKey) {
      errors.push({ line: i + 1, reason: 'indicatorKey or seriesKey is required' });
      continue;
    }
    const observationDate = new Date(obj.observationdate ?? '');
    if (Number.isNaN(observationDate.getTime())) {
      errors.push({ line: i + 1, reason: `invalid observationDate "${obj.observationdate}"` });
      continue;
    }
    const value = Number(obj.value);
    if (!Number.isFinite(value)) {
      errors.push({ line: i + 1, reason: `value must be a finite number` });
      continue;
    }

    const unit = obj.unit?.trim() || null;
    const sourceSystem = obj.sourcesystem?.trim() || 'manual-csv-import';

    if (target === 'macro') {
      rows.push({
        target: 'macro',
        market: obj.market.trim(),
        seriesKey: indicatorKey.trim(),
        label: obj.label?.trim() || indicatorKey.trim(),
        observationDate,
        value,
        unit,
        sourceSystem,
        frequency: obj.frequency?.trim() || 'monthly'
      });
    } else {
      const ac = obj.assetclass?.trim().toUpperCase();
      rows.push({
        target: 'market',
        market: obj.market.trim(),
        region: obj.region?.trim() || null,
        assetClass:
          ac && (Object.values(AssetClass) as string[]).includes(ac) ? (ac as AssetClass) : null,
        assetTier: obj.assettier?.trim() || null,
        indicatorKey: indicatorKey.trim(),
        observationDate,
        value,
        unit,
        sourceSystem
      });
    }
  }
  return { rows, errors };
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV: comma-separated, double-quote escaped fields. Handles
  // commas inside quoted fields. Doesn't try to be RFC-4180 perfect —
  // operators using sophisticated CSV should use the JSON-array endpoint
  // instead.
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

/**
 * Persist parsed rows. Macro rows upsert on (market, seriesKey,
 * observationDate, assetId=null); market indicator rows upsert on the
 * same composite plus region. Conflict-friendly so a re-import of a
 * historical CSV doesn't clone rows.
 */
export async function importTimeseriesRows(
  rows: TimeseriesImportRow[],
  db: PrismaClient
): Promise<TimeseriesImportSummary> {
  const summary: TimeseriesImportSummary = {
    macroInserted: 0,
    macroUpdated: 0,
    marketInserted: 0,
    marketUpdated: 0,
    skippedInvalid: 0
  };

  for (const row of rows) {
    if (row.target === 'macro') {
      const existing = await db.macroSeries.findFirst({
        where: {
          market: row.market,
          seriesKey: row.seriesKey,
          observationDate: row.observationDate,
          assetId: null
        },
        select: { id: true }
      });
      if (existing) {
        await db.macroSeries.update({
          where: { id: existing.id },
          data: {
            label: row.label,
            value: row.value,
            unit: row.unit,
            sourceSystem: row.sourceSystem ?? 'manual-csv-import',
            sourceStatus: SourceStatus.MANUAL,
            sourceUpdatedAt: new Date()
          }
        });
        summary.macroUpdated += 1;
      } else {
        await db.macroSeries.create({
          data: {
            market: row.market,
            seriesKey: row.seriesKey,
            label: row.label,
            frequency: row.frequency ?? 'monthly',
            observationDate: row.observationDate,
            value: row.value,
            unit: row.unit,
            sourceSystem: row.sourceSystem ?? 'manual-csv-import',
            sourceStatus: SourceStatus.MANUAL,
            sourceUpdatedAt: new Date()
          }
        });
        summary.macroInserted += 1;
      }
    } else {
      const existing = await db.marketIndicatorSeries.findFirst({
        where: {
          market: row.market,
          region: row.region ?? null,
          indicatorKey: row.indicatorKey,
          observationDate: row.observationDate,
          assetId: null
        },
        select: { id: true }
      });
      if (existing) {
        await db.marketIndicatorSeries.update({
          where: { id: existing.id },
          data: {
            assetClass: row.assetClass ?? null,
            assetTier: row.assetTier ?? null,
            value: row.value,
            unit: row.unit,
            sourceSystem: row.sourceSystem ?? 'manual-csv-import',
            sourceStatus: SourceStatus.MANUAL
          }
        });
        summary.marketUpdated += 1;
      } else {
        await db.marketIndicatorSeries.create({
          data: {
            market: row.market,
            region: row.region ?? null,
            assetClass: row.assetClass ?? null,
            assetTier: row.assetTier ?? null,
            indicatorKey: row.indicatorKey,
            observationDate: row.observationDate,
            value: row.value,
            unit: row.unit,
            sourceSystem: row.sourceSystem ?? 'manual-csv-import',
            sourceStatus: SourceStatus.MANUAL
          }
        });
        summary.marketInserted += 1;
      }
    }
  }

  return summary;
}

void Prisma;
