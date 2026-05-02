/**
 * Idiosyncratic risk engine.
 *
 * Macro risk (deal-risk.ts) measures how the deal sits on the market cycle.
 * That misses asset-specific exposures that two identical buildings in the
 * same submarket can have very different amounts of:
 *
 *   1. Tenant concentration   — single-tenant or top-3 tenants > 60% of rent
 *   2. Lease rollover         — % of NOI expiring within 1y / 3y / 5y
 *   3. Deferred CapEx         — overdue maintenance vs. building value
 *   4. Building age           — proxy for upcoming functional obsolescence
 *   5. Environmental          — soil contamination, asbestos, leakage
 *   6. Regulatory / zoning    — pending designation, FAR cut, redevelopment freeze
 *   7. Title / legal          — easements, ongoing litigation, registry liens
 *
 * Each factor contributes a continuous 0–100 score. The overall index is a
 * weighted sum, then mapped to a LOW/MODERATE/HIGH/CRITICAL band that mirrors
 * the macro engine's banding so callers can compare apples to apples.
 *
 * Design choices:
 *   - Continuous interpolation everywhere — no bucket cliffs.
 *   - Each factor returns evidence + recommendation so the report is actionable.
 *   - Factors are independent (no correlation amplifier here); macro engine
 *     already handles correlation amongst macro factors. We could extend later
 *     to model concentration × rollover correlation if needed.
 */

import type { CreditGrade } from '@/lib/services/valuation/tenant-credit';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type IdiosyncraticFactorKey =
  | 'tenant_concentration'
  | 'lease_rollover'
  | 'capex_backlog'
  | 'building_age'
  | 'environmental'
  | 'regulatory'
  | 'title_legal';

export type IdiosyncraticSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IdiosyncraticFactor = {
  key: IdiosyncraticFactorKey;
  label: string;
  score: number; // 0–100, higher = worse
  severity: IdiosyncraticSeverity;
  evidence: string;
  recommendation: string | null;
};

export type IdiosyncraticRiskBand = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type IdiosyncraticRiskReport = {
  overallScore: number; // 0–100
  band: IdiosyncraticRiskBand;
  factors: IdiosyncraticFactor[];
  topRisks: IdiosyncraticFactor[]; // up to 3, sorted by score desc
  summary: string;
};

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type RentRollEntry = {
  tenantName: string;
  annualRentKrw: number;
  leaseEndYear: number; // absolute calendar year
  creditGrade?: CreditGrade | null;
};

export type IdiosyncraticRiskInputs = {
  // Reference year — rollover windows are computed relative to this.
  // Defaults to current year if omitted.
  asOfYear?: number;

  // Tenant exposure
  rentRoll?: RentRollEntry[];

  // Physical
  buildingValueKrw?: number;
  deferredCapexKrw?: number;
  buildingAgeYears?: number;

  // Environmental flags (binary: present/not present)
  soilContaminationFlag?: boolean;
  asbestosFlag?: boolean;
  floodZoneFlag?: boolean;

  // Regulatory
  zoningChangeRisk?: 'NONE' | 'LOW' | 'MED' | 'HIGH';
  redevelopmentFreezeFlag?: boolean;

  // Title / legal
  pendingLitigationFlag?: boolean;
  titleEncumbranceFlag?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Anchor = readonly [x: number, y: number];

function interpolate(value: number, anchors: readonly Anchor[]): number {
  if (anchors.length === 0) return 0;
  if (value <= anchors[0]![0]) return anchors[0]![1];
  const last = anchors[anchors.length - 1]!;
  if (value >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1]!;
    const [x1, y1] = anchors[i]!;
    if (value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function severityFromScore(score: number): IdiosyncraticSeverity {
  if (score >= 75) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

function bandFromScore(score: number): IdiosyncraticRiskBand {
  if (score >= 75) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 35) return 'MODERATE';
  return 'LOW';
}

const SUB_IG_GRADES: ReadonlySet<CreditGrade> = new Set(['BB', 'B', 'CCC']);

// ---------------------------------------------------------------------------
// Per-factor scorers
// ---------------------------------------------------------------------------

function scoreTenantConcentration(
  rentRoll: RentRollEntry[] | undefined
): IdiosyncraticFactor | null {
  if (!rentRoll || rentRoll.length === 0) return null;

  const totalRent = rentRoll.reduce((s, r) => s + r.annualRentKrw, 0);
  if (totalRent <= 0) return null;

  const sorted = [...rentRoll].sort((a, b) => b.annualRentKrw - a.annualRentKrw);
  const topShare = sorted[0]!.annualRentKrw / totalRent;
  const top3Share = sorted.slice(0, 3).reduce((s, r) => s + r.annualRentKrw, 0) / totalRent;

  // Herfindahl–Hirschman Index, normalized to 0–1 (10000 = single tenant).
  const hhi = sorted.reduce((s, r) => s + Math.pow(r.annualRentKrw / totalRent, 2), 0);

  // Anchors driven by HHI (the proper concentration metric). Single tenant
  // HHI=1.0 → 95; perfectly spread (10 tenants of 10%) HHI=0.1 → 15.
  let score = interpolate(hhi, [
    [0.1, 15],
    [0.2, 25],
    [0.3, 35],
    [0.45, 50],
    [0.6, 65],
    [0.8, 82],
    [1.0, 95]
  ]);

  // If the top tenant is sub-IG (or unrated), concentration risk is materially
  // worse — losing them isn't "we backfill at market", it's "we backfill at
  // discount and may not backfill at all".
  const topGrade = sorted[0]!.creditGrade;
  if (topGrade && SUB_IG_GRADES.has(topGrade)) score += 12;
  else if (!topGrade && topShare > 0.4) score += 6; // unrated + dominant

  score = clamp(score, 0, 100);
  const tenantCount = sorted.length;

  const evidence =
    `${tenantCount} tenant(s); top tenant ${(topShare * 100).toFixed(0)}% of rent` +
    (tenantCount > 1 ? `, top-3 ${(top3Share * 100).toFixed(0)}%` : '') +
    `, HHI ${hhi.toFixed(2)}` +
    (topGrade ? ` (top tenant grade ${topGrade})` : '');

  const recommendation =
    score >= 65
      ? 'Negotiate rent guarantees or extended security deposit; price in tenant-loss reserve.'
      : score >= 40
        ? 'Stress-test cash flows assuming top tenant departure at next break.'
        : null;

  return {
    key: 'tenant_concentration',
    label: 'Tenant Concentration',
    score: Number(score.toFixed(1)),
    severity: severityFromScore(score),
    evidence,
    recommendation
  };
}

function scoreLeaseRollover(
  rentRoll: RentRollEntry[] | undefined,
  asOfYear: number
): IdiosyncraticFactor | null {
  if (!rentRoll || rentRoll.length === 0) return null;
  const totalRent = rentRoll.reduce((s, r) => s + r.annualRentKrw, 0);
  if (totalRent <= 0) return null;

  const inWindow = (years: number) =>
    rentRoll
      .filter((r) => r.leaseEndYear - asOfYear <= years && r.leaseEndYear - asOfYear >= 0)
      .reduce((s, r) => s + r.annualRentKrw, 0) / totalRent;

  const exp1y = inWindow(1);
  const exp3y = inWindow(3);
  const exp5y = inWindow(5);

  // 3y window is the most informative — that's the typical business-plan
  // horizon. >50% rolling in 3y is a real risk; >30% is meaningful.
  let score = interpolate(exp3y, [
    [0, 10],
    [0.15, 22],
    [0.3, 38],
    [0.45, 55],
    [0.6, 70],
    [0.8, 85],
    [1.0, 95]
  ]);

  // Near-term concentration penalty: heavy 1y rollover is much worse than 3y
  // because there's no time to remarket.
  if (exp1y >= 0.3) score += 10;
  else if (exp1y >= 0.2) score += 5;

  score = clamp(score, 0, 100);

  const evidence =
    `1y rollover ${(exp1y * 100).toFixed(0)}%, ` +
    `3y rollover ${(exp3y * 100).toFixed(0)}%, ` +
    `5y rollover ${(exp5y * 100).toFixed(0)}%`;

  const recommendation =
    exp3y >= 0.5
      ? 'Pre-lease major rollovers; underwrite mark-to-market on expiring rent at -10% to -15%.'
      : exp3y >= 0.3
        ? 'Monitor renewal probability quarterly; prepare retention package for top expirers.'
        : null;

  return {
    key: 'lease_rollover',
    label: 'Lease Rollover',
    score: Number(score.toFixed(1)),
    severity: severityFromScore(score),
    evidence,
    recommendation
  };
}

function scoreCapexBacklog(
  deferred: number | undefined,
  buildingValue: number | undefined
): IdiosyncraticFactor | null {
  if (deferred === undefined || buildingValue === undefined || buildingValue <= 0) return null;

  const ratio = deferred / buildingValue; // 0..1
  // 0% = fine, 1% = small backlog, 3% = noticeable, 5% = major, 10%+ = critical.
  const score = clamp(
    interpolate(ratio, [
      [0.0, 5],
      [0.01, 18],
      [0.03, 38],
      [0.05, 55],
      [0.08, 75],
      [0.12, 90],
      [0.2, 98]
    ]),
    0,
    100
  );

  const ratioPct = ratio * 100;
  const evidence = `Deferred CapEx ${(deferred / 1e8).toFixed(1)} 억원 = ${ratioPct.toFixed(2)}% of building value`;

  const recommendation =
    score >= 60
      ? 'Negotiate price reduction equal to remediation budget; require seller credits at closing.'
      : score >= 35
        ? 'Build 3-year CapEx plan into pro-forma; reserve cash equal to backlog.'
        : null;

  return {
    key: 'capex_backlog',
    label: 'Deferred CapEx',
    score: Number(score.toFixed(1)),
    severity: severityFromScore(score),
    evidence,
    recommendation
  };
}

function scoreBuildingAge(ageYears: number | undefined): IdiosyncraticFactor | null {
  if (ageYears === undefined) return null;
  // Modern KR office life: 30y is mid-life, 40y obsolescence pressure, 50y+ redevelopment candidate.
  const score = clamp(
    interpolate(ageYears, [
      [0, 5],
      [10, 12],
      [20, 22],
      [30, 38],
      [40, 55],
      [50, 72],
      [60, 88]
    ]),
    0,
    100
  );

  const evidence = `Building age ${ageYears} years`;
  const recommendation =
    score >= 60
      ? 'Run obsolescence vs. redevelopment NPV; consider CapEx-heavy reposition or conversion.'
      : score >= 35
        ? 'Plan major systems refresh (HVAC/elevators) within 5 years.'
        : null;

  return {
    key: 'building_age',
    label: 'Building Age / Obsolescence',
    score: Number(score.toFixed(1)),
    severity: severityFromScore(score),
    evidence,
    recommendation
  };
}

function scoreEnvironmental(
  inputs: Pick<IdiosyncraticRiskInputs, 'soilContaminationFlag' | 'asbestosFlag' | 'floodZoneFlag'>
): IdiosyncraticFactor | null {
  const { soilContaminationFlag, asbestosFlag, floodZoneFlag } = inputs;
  if (
    soilContaminationFlag === undefined &&
    asbestosFlag === undefined &&
    floodZoneFlag === undefined
  ) {
    return null;
  }

  let score = 5;
  const flagged: string[] = [];
  if (soilContaminationFlag) {
    score += 55;
    flagged.push('soil contamination');
  }
  if (asbestosFlag) {
    score += 30;
    flagged.push('asbestos');
  }
  if (floodZoneFlag) {
    score += 25;
    flagged.push('flood zone');
  }
  score = clamp(score, 0, 100);

  const evidence = flagged.length > 0 ? `Flagged: ${flagged.join(', ')}` : 'No environmental flags';
  const recommendation =
    score >= 60
      ? 'Commission Phase II ESA before binding LOI; price remediation into purchase price.'
      : score >= 30
        ? 'Confirm compliance certifications and budget abatement reserve.'
        : null;

  return {
    key: 'environmental',
    label: 'Environmental',
    score: Number(score.toFixed(1)),
    severity: severityFromScore(score),
    evidence,
    recommendation
  };
}

function scoreRegulatory(
  inputs: Pick<IdiosyncraticRiskInputs, 'zoningChangeRisk' | 'redevelopmentFreezeFlag'>
): IdiosyncraticFactor | null {
  const { zoningChangeRisk, redevelopmentFreezeFlag } = inputs;
  if (zoningChangeRisk === undefined && redevelopmentFreezeFlag === undefined) return null;

  const zoningPoints =
    zoningChangeRisk === 'HIGH'
      ? 60
      : zoningChangeRisk === 'MED'
        ? 35
        : zoningChangeRisk === 'LOW'
          ? 15
          : 5;
  const freezePoints = redevelopmentFreezeFlag ? 30 : 0;

  const score = clamp(zoningPoints + freezePoints, 0, 100);

  const parts: string[] = [];
  if (zoningChangeRisk && zoningChangeRisk !== 'NONE')
    parts.push(`Zoning change risk: ${zoningChangeRisk}`);
  if (redevelopmentFreezeFlag) parts.push('Redevelopment freeze in effect');
  const evidence = parts.length > 0 ? parts.join('; ') : 'No regulatory flags';

  const recommendation =
    score >= 60
      ? 'Confirm planning department status before LOI; model downside under freeze extension.'
      : score >= 30
        ? 'Track municipal master plan revisions; engage planning consultant.'
        : null;

  return {
    key: 'regulatory',
    label: 'Regulatory / Zoning',
    score: Number(score.toFixed(1)),
    severity: severityFromScore(score),
    evidence,
    recommendation
  };
}

function scoreTitleLegal(
  inputs: Pick<IdiosyncraticRiskInputs, 'pendingLitigationFlag' | 'titleEncumbranceFlag'>
): IdiosyncraticFactor | null {
  const { pendingLitigationFlag, titleEncumbranceFlag } = inputs;
  if (pendingLitigationFlag === undefined && titleEncumbranceFlag === undefined) return null;

  let score = 5;
  const flagged: string[] = [];
  if (pendingLitigationFlag) {
    score += 50;
    flagged.push('pending litigation');
  }
  if (titleEncumbranceFlag) {
    score += 35;
    flagged.push('title encumbrance');
  }
  score = clamp(score, 0, 100);

  const evidence = flagged.length > 0 ? `Flagged: ${flagged.join(', ')}` : 'No title/legal flags';
  const recommendation =
    score >= 60
      ? 'Resolve litigation or obtain title insurance with explicit carve-out before closing.'
      : score >= 30
        ? 'Engage title counsel for full registry review.'
        : null;

  return {
    key: 'title_legal',
    label: 'Title / Legal',
    score: Number(score.toFixed(1)),
    severity: severityFromScore(score),
    evidence,
    recommendation
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

// Weights reflect typical KR core/value-add deal sensitivity. Tenant
// concentration and lease rollover dominate cash-flow risk; environmental
// and title are binary-ish but high impact when flagged.
const FACTOR_WEIGHTS: Record<IdiosyncraticFactorKey, number> = {
  tenant_concentration: 0.2,
  lease_rollover: 0.2,
  capex_backlog: 0.15,
  building_age: 0.1,
  environmental: 0.15,
  regulatory: 0.12,
  title_legal: 0.08
};

export function computeIdiosyncraticRisk(inputs: IdiosyncraticRiskInputs): IdiosyncraticRiskReport {
  const asOfYear = inputs.asOfYear ?? new Date().getFullYear();

  const candidates: (IdiosyncraticFactor | null)[] = [
    scoreTenantConcentration(inputs.rentRoll),
    scoreLeaseRollover(inputs.rentRoll, asOfYear),
    scoreCapexBacklog(inputs.deferredCapexKrw, inputs.buildingValueKrw),
    scoreBuildingAge(inputs.buildingAgeYears),
    scoreEnvironmental(inputs),
    scoreRegulatory(inputs),
    scoreTitleLegal(inputs)
  ];

  const factors = candidates.filter((f): f is IdiosyncraticFactor => f !== null);

  // Weighted overall score, normalized to the present (i.e. only-known) factors.
  // Missing inputs shouldn't artificially deflate the score by counting as 0.
  let weightSum = 0;
  let weighted = 0;
  for (const f of factors) {
    const w = FACTOR_WEIGHTS[f.key];
    weighted += f.score * w;
    weightSum += w;
  }
  const overallScore = weightSum > 0 ? Number((weighted / weightSum).toFixed(2)) : 0;

  const band = bandFromScore(overallScore);
  const topRisks = [...factors].sort((a, b) => b.score - a.score).slice(0, 3);

  const summary = buildSummary(band, topRisks, factors.length);

  return {
    overallScore,
    band,
    factors,
    topRisks,
    summary
  };
}

function buildSummary(
  band: IdiosyncraticRiskBand,
  topRisks: IdiosyncraticFactor[],
  totalFactors: number
): string {
  if (totalFactors === 0) {
    return 'No idiosyncratic risk inputs supplied — extend due diligence to populate this analysis.';
  }
  if (topRisks.length === 0) {
    return 'No material idiosyncratic risks detected across the supplied factors.';
  }
  const top = topRisks[0]!;
  const headline =
    band === 'CRITICAL'
      ? `Critical asset-specific risk concentrated in ${top.label.toLowerCase()}.`
      : band === 'HIGH'
        ? `Material asset-specific risk; ${top.label.toLowerCase()} is the dominant driver.`
        : band === 'MODERATE'
          ? `Manageable asset-specific risk; monitor ${top.label.toLowerCase()}.`
          : 'Asset-specific risk profile is benign.';
  return headline;
}
