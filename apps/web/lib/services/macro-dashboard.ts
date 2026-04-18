import type { PrismaClient } from '@prisma/client';
import { AssetClass } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildMacroRegimeAnalysis } from '@/lib/services/macro/regime';
import { buildFullTrendAnalysis } from '@/lib/services/macro/trend';
import { buildTemplateNarrative, type MacroNarrative } from '@/lib/services/macro/narrative';

type TrendPoint = {
  date: string;
  value: number;
};

export type MacroTrendSeries = {
  label: string;
  seriesKey: string;
  unit: string;
  points: TrendPoint[];
  latestValue: number;
  changeDirection: 'up' | 'down' | 'flat';
  changePct: number;
};

export type MacroDashboardData = {
  interestRateSeries: MacroTrendSeries[];
  vacancySeries: MacroTrendSeries[];
  capRateSeries: MacroTrendSeries[];
  marketIndicators: MacroTrendSeries[];
  summary: {
    totalSeriesCount: number;
    latestObservationDate: string | null;
    staleSeriesCount: number;
  };
  narrative: MacroNarrative | null;
};

function classifySeriesKey(key: string) {
  const normalized = key.toLowerCase();
  if (
    normalized.includes('interest') ||
    normalized.includes('base_rate') ||
    normalized.includes('bok_rate') ||
    normalized.includes('debt_cost') ||
    normalized.includes('discount_rate') ||
    normalized.includes('policy_rate')
  )
    return 'interest';
  if (normalized.includes('vacancy') || normalized.includes('occupancy')) return 'vacancy';
  if (normalized.includes('cap_rate') || normalized.includes('yield')) return 'cap_rate';
  return 'market';
}

function computeChange(points: TrendPoint[]): {
  direction: 'up' | 'down' | 'flat';
  changePct: number;
} {
  if (points.length < 2) return { direction: 'flat', changePct: 0 };
  const latest = points[points.length - 1].value;
  const previous = points[points.length - 2].value;
  if (previous === 0) return { direction: 'flat', changePct: 0 };
  const pctChange = ((latest - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pctChange) < 0.05) return { direction: 'flat', changePct: 0 };
  return { direction: pctChange > 0 ? 'up' : 'down', changePct: pctChange };
}

function buildTrendSeries(
  label: string,
  seriesKey: string,
  unit: string,
  rawPoints: Array<{ observationDate: Date; value: number | null }>
): MacroTrendSeries {
  const points = rawPoints
    .filter((p) => p.value != null)
    .sort((a, b) => a.observationDate.getTime() - b.observationDate.getTime())
    .slice(-24)
    .map((p) => ({
      date: p.observationDate.toISOString().slice(0, 10),
      value: p.value!,
    }));

  const latestValue = points[points.length - 1]?.value ?? 0;
  const { direction, changePct } = computeChange(points);

  return {
    label,
    seriesKey,
    unit,
    points,
    latestValue,
    changeDirection: direction,
    changePct,
  };
}

export async function buildMacroDashboard(
  assetId?: string,
  db: PrismaClient = prisma
): Promise<MacroDashboardData> {
  const macroSeries = await db.macroSeries.findMany({
    where: assetId ? { assetId } : {},
    orderBy: { observationDate: 'asc' },
    take: 500,
  });

  const marketIndicators = await db.marketIndicatorSeries.findMany({
    where: assetId ? { assetId } : {},
    orderBy: { observationDate: 'asc' },
    take: 500,
  });

  // Group macro series by seriesKey
  const macroByKey = new Map<string, typeof macroSeries>();
  for (const record of macroSeries) {
    const existing = macroByKey.get(record.seriesKey) ?? [];
    existing.push(record);
    macroByKey.set(record.seriesKey, existing);
  }

  // Group market indicators by indicatorKey
  const indicatorByKey = new Map<string, typeof marketIndicators>();
  for (const record of marketIndicators) {
    const existing = indicatorByKey.get(record.indicatorKey) ?? [];
    existing.push(record);
    indicatorByKey.set(record.indicatorKey, existing);
  }

  const interestRateSeries: MacroTrendSeries[] = [];
  const vacancySeries: MacroTrendSeries[] = [];
  const capRateSeries: MacroTrendSeries[] = [];
  const otherIndicators: MacroTrendSeries[] = [];

  for (const [key, records] of macroByKey) {
    const label = records[0]?.label ?? key;
    const unit =
      records[0]?.unit ??
      (key.includes('rate') || key.includes('pct') ? '%' : '');
    const series = buildTrendSeries(label, key, unit, records);
    const category = classifySeriesKey(key);

    if (category === 'interest') interestRateSeries.push(series);
    else if (category === 'vacancy') vacancySeries.push(series);
    else if (category === 'cap_rate') capRateSeries.push(series);
    else otherIndicators.push(series);
  }

  for (const [key, records] of indicatorByKey) {
    const label = key;
    const unit =
      records[0]?.unit ??
      (key.includes('rate') || key.includes('pct') || key.includes('vacancy')
        ? '%'
        : '');
    const series = buildTrendSeries(label, key, unit, records);
    const category = classifySeriesKey(key);

    if (category === 'interest') interestRateSeries.push(series);
    else if (category === 'vacancy') vacancySeries.push(series);
    else if (category === 'cap_rate') capRateSeries.push(series);
    else otherIndicators.push(series);
  }

  const allSeries = [
    ...interestRateSeries,
    ...vacancySeries,
    ...capRateSeries,
    ...otherIndicators,
  ];
  const allDates = allSeries
    .flatMap((s) => s.points.map((p) => p.date))
    .sort();
  const latestDate = allDates[allDates.length - 1] ?? null;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const staleCount = allSeries.filter((s) => {
    const lastDate = s.points[s.points.length - 1]?.date;
    return !lastDate || lastDate < thirtyDaysAgo;
  }).length;

  // Build macro narrative from factor snapshot + regime + trend analysis
  let narrative: MacroNarrative | null = null;
  try {
    const regime = buildMacroRegimeAnalysis({ assetClass: AssetClass.DATA_CENTER, market: 'KR', series: macroSeries });
    const trends = buildFullTrendAnalysis(macroSeries);
    narrative = buildTemplateNarrative({
      market: 'KR',
      asOf: latestDate,
      regime,
      trends
    });
  } catch {
    // Narrative generation is non-critical — proceed without it
  }

  return {
    interestRateSeries,
    vacancySeries,
    capRateSeries,
    marketIndicators: otherIndicators,
    summary: {
      totalSeriesCount: allSeries.length,
      latestObservationDate: latestDate,
      staleSeriesCount: staleCount,
    },
    narrative,
  };
}
