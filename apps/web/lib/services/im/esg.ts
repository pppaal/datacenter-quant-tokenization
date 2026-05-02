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

/**
 * Scope 1 / 2 / 3 emissions estimate for the asset, derived from
 * existing power and capex inputs. We do not store actual carbon
 * accounting yet — these are sector-default factors so the IM
 * carries a directional ESG figure rather than a blank field.
 *
 * Scope 1 — direct emissions from on-site fuel combustion
 *   ≈ backupFuelHours × generator load × diesel emission factor
 *     (assumes test-runs only, ~12 hours/yr equivalent operation)
 *
 * Scope 2 — purchased electricity
 *   = annual_kWh × KR grid factor (~0.459 kgCO2e/kWh) × (1 − renewable share)
 *
 * Scope 3 — embodied carbon (one-time, amortized over hold)
 *   ≈ totalCapexKrw × 1.2 tCO2e per ₩100M (≈ 12 tCO2e/USD M sector
 *   estimate from RICS / WBCSD CRREM curves)
 */
export type EmissionsBreakdown = {
  scope1tCO2e: number | null;
  scope2tCO2e: number | null;
  scope3tCO2e: number | null;
  totalAnnualtCO2e: number | null;
  carbonIntensitykgPerKwh: number | null;
  notes: string[];
};

const KR_GRID_EMISSION_FACTOR = 0.459; // kgCO2e/kWh, KEPCO 2024 grid mix
const DIESEL_EMISSION_FACTOR = 2.68; // kgCO2e/L
const GENERATOR_KW = 8000; // typical 32MW DC generator bank
const ASSUMED_TEST_HOURS_PER_YEAR = 12;
const SCOPE3_T_CO2E_PER_100M_KRW = 1.2;

export function buildEmissionsBreakdown(
  options: {
    powerCapacityMw: number | null;
    pueTarget: number | null;
    renewableSharePct: number | null;
    backupFuelHours: number | null;
    totalCapexKrw: number | null;
    holdYears?: number;
  }
): EmissionsBreakdown {
  const notes: string[] = [];
  let scope1 = null as number | null;
  let scope2 = null as number | null;
  let scope3 = null as number | null;
  let intensity = null as number | null;

  // Scope 2: purchased grid electricity net of renewable share
  if (options.powerCapacityMw !== null && options.pueTarget !== null) {
    const annualKwh =
      options.powerCapacityMw * 1000 * (options.pueTarget) * 8760 * 0.7; // 70% utilization proxy
    const renewableFraction = (options.renewableSharePct ?? 0) / 100;
    const gridKwh = annualKwh * (1 - renewableFraction);
    scope2 = (gridKwh * KR_GRID_EMISSION_FACTOR) / 1000;
    intensity = KR_GRID_EMISSION_FACTOR * (1 - renewableFraction);
    notes.push(
      `Scope 2: ${(annualKwh / 1_000_000).toFixed(1)} GWh × KR grid 0.459 kgCO2e/kWh × (1 − ${(renewableFraction * 100).toFixed(0)}% renewable).`
    );
  }
  // Scope 1: backup generator test runs
  if (options.backupFuelHours !== null && options.backupFuelHours > 0) {
    const litersPerHour = GENERATOR_KW * 0.25; // ~0.25 L/kWh diesel rate
    const annualLiters = litersPerHour * ASSUMED_TEST_HOURS_PER_YEAR;
    scope1 = (annualLiters * DIESEL_EMISSION_FACTOR) / 1000;
    notes.push(
      `Scope 1: ${ASSUMED_TEST_HOURS_PER_YEAR}h/yr generator test × ${GENERATOR_KW} kW × ${DIESEL_EMISSION_FACTOR} kgCO2e/L diesel.`
    );
  }
  // Scope 3: embodied carbon, amortized over hold
  if (options.totalCapexKrw !== null && options.totalCapexKrw > 0) {
    const totalEmbodied =
      (options.totalCapexKrw / 100_000_000) * SCOPE3_T_CO2E_PER_100M_KRW;
    const holdYears = options.holdYears ?? 10;
    scope3 = totalEmbodied / holdYears;
    notes.push(
      `Scope 3: ${SCOPE3_T_CO2E_PER_100M_KRW} tCO2e/₩100M sector default amortized over ${holdYears}-year hold.`
    );
  }

  const totalAnnual =
    [scope1, scope2, scope3].some((v) => v !== null)
      ? (scope1 ?? 0) + (scope2 ?? 0) + (scope3 ?? 0)
      : null;

  return {
    scope1tCO2e: scope1,
    scope2tCO2e: scope2,
    scope3tCO2e: scope3,
    totalAnnualtCO2e: totalAnnual,
    carbonIntensitykgPerKwh: intensity,
    notes
  };
}
