/**
 * ESG snapshot for the IM. Pulls operational sustainability
 * metrics — PUE / renewable share / backup hours / utility — from
 * the asset's EnergySnapshot, classifies each against a band, and
 * returns IM-renderable rows.
 *
 * PUE bands: 1.20 = best-in-class hyperscale; 1.50 = laggard.
 * Renewable %: ≥40 strong; 20–40 moderate; <20 weak.
 * Backup hours: ≥72 strong; 24–72 moderate; <24 weak.
 */

type EnergySnapshotLike = {
  utilityName?: string | null;
  substationDistanceKm?: number | null;
  tariffKrwPerKwh?: number | null;
  renewableAvailabilityPct?: number | null;
  pueTarget?: number | null;
  backupFuelHours?: number | null;
  sourceStatus?: string | null;
  sourceUpdatedAt?: Date | null;
};

export type EsgRowTone = 'good' | 'warn' | 'risk' | null;

export type EsgMetricRow = {
  key: 'pue' | 'renewable' | 'backup' | 'tariff' | 'substation';
  label: string;
  value: number | null;
  unit: string;
  band: string | null;
  tone: EsgRowTone;
  interpretation: string;
};

export type EsgSummary = {
  utility: string | null;
  rows: EsgMetricRow[];
  /**
   * Composite ESG band — green if all metrics are good, amber if
   * any moderate, red if any risk. null when not enough metrics on
   * file to render a verdict.
   */
  composite: EsgRowTone;
};

function bandFor(
  value: number | null,
  goodThreshold: number,
  warnThreshold: number,
  preferred: 'higher' | 'lower'
): { band: string; tone: EsgRowTone } {
  if (value === null) return { band: 'n/a', tone: null };
  if (preferred === 'higher') {
    if (value >= goodThreshold) return { band: 'strong', tone: 'good' };
    if (value >= warnThreshold) return { band: 'moderate', tone: 'warn' };
    return { band: 'weak', tone: 'risk' };
  }
  if (value <= goodThreshold) return { band: 'strong', tone: 'good' };
  if (value <= warnThreshold) return { band: 'moderate', tone: 'warn' };
  return { band: 'weak', tone: 'risk' };
}

export function buildEsgSummary(
  snapshot: EnergySnapshotLike | null
): EsgSummary | null {
  if (!snapshot) return null;
  const rows: EsgMetricRow[] = [];

  const pueBand = bandFor(snapshot.pueTarget ?? null, 1.3, 1.45, 'lower');
  rows.push({
    key: 'pue',
    label: 'PUE target',
    value: snapshot.pueTarget ?? null,
    unit: '',
    band: pueBand.band,
    tone: pueBand.tone,
    interpretation:
      snapshot.pueTarget === null || snapshot.pueTarget === undefined
        ? 'Not specified.'
        : snapshot.pueTarget <= 1.3
          ? 'Best-in-class hyperscale energy efficiency.'
          : snapshot.pueTarget <= 1.45
            ? 'In line with KR data-center sector median.'
            : 'PUE above sector median; energy cost and Scope-2 emissions elevated.'
  });

  const renewBand = bandFor(snapshot.renewableAvailabilityPct ?? null, 40, 20, 'higher');
  rows.push({
    key: 'renewable',
    label: 'Renewable energy share',
    value: snapshot.renewableAvailabilityPct ?? null,
    unit: '%',
    band: renewBand.band,
    tone: renewBand.tone,
    interpretation:
      snapshot.renewableAvailabilityPct === null || snapshot.renewableAvailabilityPct === undefined
        ? 'Not specified.'
        : snapshot.renewableAvailabilityPct >= 40
          ? 'Strong renewable mix; supports Scope-2 reduction commitments.'
          : snapshot.renewableAvailabilityPct >= 20
            ? 'Moderate renewable mix; PPA path required to meet typical LP ESG targets.'
            : 'Renewable share below sector norms; Scope-2 reduction plan required.'
  });

  const backupBand = bandFor(snapshot.backupFuelHours ?? null, 72, 24, 'higher');
  rows.push({
    key: 'backup',
    label: 'Backup fuel autonomy',
    value: snapshot.backupFuelHours ?? null,
    unit: 'hrs',
    band: backupBand.band,
    tone: backupBand.tone,
    interpretation:
      snapshot.backupFuelHours === null || snapshot.backupFuelHours === undefined
        ? 'Not specified.'
        : snapshot.backupFuelHours >= 72
          ? 'Above Tier-IV uptime minimum; strong continuity profile.'
          : snapshot.backupFuelHours >= 24
            ? 'Meets Tier-III minimum; refueling logistics required for extended outages.'
            : 'Below Tier-III minimum; outage exposure flag.'
  });

  rows.push({
    key: 'tariff',
    label: 'Power tariff',
    value: snapshot.tariffKrwPerKwh ?? null,
    unit: 'KRW/kWh',
    band: null,
    tone: null,
    interpretation:
      snapshot.tariffKrwPerKwh === null || snapshot.tariffKrwPerKwh === undefined
        ? 'Not specified.'
        : 'Anchors the operating-cost stack; sector-wide rates have moved with the KEPCO industrial schedule.'
  });

  rows.push({
    key: 'substation',
    label: 'Substation distance',
    value: snapshot.substationDistanceKm ?? null,
    unit: 'km',
    band: null,
    tone: null,
    interpretation:
      snapshot.substationDistanceKm === null || snapshot.substationDistanceKm === undefined
        ? 'Not specified.'
        : 'Distance drives interconnection cost and lead-time risk; <2 km is a positive signal.'
  });

  const tones = rows.map((r) => r.tone).filter(Boolean) as Exclude<EsgRowTone, null>[];
  let composite: EsgRowTone = null;
  if (tones.length > 0) {
    if (tones.includes('risk')) composite = 'risk';
    else if (tones.includes('warn')) composite = 'warn';
    else composite = 'good';
  }

  return {
    utility: snapshot.utilityName ?? null,
    rows,
    composite
  };
}
