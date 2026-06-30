/**
 * Korea per-deal regulatory capital & feasibility calculator (benchmark #6).
 *
 * A wedge no competitor models: given a deal's value / debt / equity / tokenized
 * offering, compute leverage (LTV), equity adequacy, and the sponsor RISK-RETENTION
 * requirement (an ASA-style "skin in the game" rule), then flag feasibility.
 *
 * IMPORTANT — this is a CONFIGURABLE policy calculator, not legal advice. The
 * thresholds in `DEFAULT_KR_PROFILE` are ILLUSTRATIVE defaults; the actual
 * 자본시장법(Capital Markets Act) / 자산유동화법(ASA) figures MUST be confirmed with
 * counsel and passed in via a `KoreaRegulatoryProfile`. The math is pure and
 * parameter-driven so a verified profile drops in without code change.
 */

export type KoreaRegulatoryProfile = {
  label: string;
  /** Minimum equity contribution as % of asset value. */
  minEquityPct: number;
  /** Maximum loan-to-value as % of asset value. */
  maxLtvPct: number;
  /** Sponsor/originator risk-retention as % of the tokenized/securitized offering
   *  ("skin in the game"). Commonly cited at ~5%. */
  riskRetentionPct: number;
};

/**
 * ILLUSTRATIVE defaults — NOT a statement of current law. Confirm with counsel and
 * override per offering structure. Provided so the calculator is usable out of the box.
 */
export const DEFAULT_KR_PROFILE: KoreaRegulatoryProfile = {
  label: 'Illustrative (confirm with counsel)',
  minEquityPct: 20,
  maxLtvPct: 80,
  riskRetentionPct: 5
};

export const KR_PROFILE_CAVEAT =
  'Illustrative defaults — confirm 자본시장법/ASA thresholds with counsel before relying on these figures.';

export type DealFeasibilityInput = {
  assetValueKrw: number;
  proposedDebtKrw: number;
  sponsorEquityKrw: number;
  /** Amount to be tokenized/securitized and distributed (drives risk retention). */
  tokenizedOfferingKrw?: number | null;
};

export type FeasibilityResult = {
  profileLabel: string;
  ltvPct: number | null;
  equityPct: number | null;
  requiredMinEquityKrw: number;
  equityShortfallKrw: number;
  maxDebtKrw: number;
  debtHeadroomKrw: number;
  retentionRequiredKrw: number;
  ltvOk: boolean;
  equityOk: boolean;
  retentionOk: boolean | null;
  feasible: boolean;
  flags: string[];
  caveat: string;
};

export function assessKoreaCapitalFeasibility(
  input: DealFeasibilityInput,
  profile: KoreaRegulatoryProfile = DEFAULT_KR_PROFILE
): FeasibilityResult {
  const value = input.assetValueKrw;
  const flags: string[] = [];

  const ltvPct = value > 0 ? (input.proposedDebtKrw / value) * 100 : null;
  const equityPct = value > 0 ? (input.sponsorEquityKrw / value) * 100 : null;

  const requiredMinEquityKrw = value * (profile.minEquityPct / 100);
  const equityShortfallKrw = Math.max(requiredMinEquityKrw - input.sponsorEquityKrw, 0);
  const maxDebtKrw = value * (profile.maxLtvPct / 100);
  const debtHeadroomKrw = maxDebtKrw - input.proposedDebtKrw; // negative = over-levered

  const ltvOk = ltvPct == null ? false : ltvPct <= profile.maxLtvPct;
  const equityOk = equityPct == null ? false : equityPct >= profile.minEquityPct;

  // Risk retention only applies when an offering is being tokenized/securitized.
  const offering = input.tokenizedOfferingKrw ?? 0;
  const retentionRequiredKrw = offering > 0 ? offering * (profile.riskRetentionPct / 100) : 0;
  // We can assert retention is *funded* only relative to the sponsor's own equity:
  // the retained piece must be covered by sponsor equity, not third-party capital.
  const retentionOk = offering > 0 ? input.sponsorEquityKrw >= retentionRequiredKrw : null;

  if (!ltvOk && ltvPct != null) {
    flags.push(
      `LTV ${ltvPct.toFixed(1)}% exceeds the ${profile.maxLtvPct}% cap (max debt ${Math.round(maxDebtKrw).toLocaleString()} KRW).`
    );
  }
  if (!equityOk && equityPct != null) {
    flags.push(
      `Equity ${equityPct.toFixed(1)}% is below the ${profile.minEquityPct}% minimum (shortfall ${Math.round(equityShortfallKrw).toLocaleString()} KRW).`
    );
  }
  if (retentionOk === false) {
    flags.push(
      `Sponsor equity does not cover the ${profile.riskRetentionPct}% risk-retention (${Math.round(retentionRequiredKrw).toLocaleString()} KRW required).`
    );
  }
  if (value <= 0) {
    flags.push('Asset value must be positive to assess feasibility.');
  }

  const feasible = value > 0 && ltvOk && equityOk && retentionOk !== false;

  return {
    profileLabel: profile.label,
    ltvPct,
    equityPct,
    requiredMinEquityKrw,
    equityShortfallKrw,
    maxDebtKrw,
    debtHeadroomKrw,
    retentionRequiredKrw,
    ltvOk,
    equityOk,
    retentionOk,
    feasible,
    flags,
    caveat: KR_PROFILE_CAVEAT
  };
}
