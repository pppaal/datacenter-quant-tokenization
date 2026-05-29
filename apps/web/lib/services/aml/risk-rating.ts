/**
 * AML risk rating (위험평가) derivation. Pure function — given the inputs that
 * make up an investor's risk profile, it produces a LOW/MEDIUM/HIGH rating with
 * an itemized factor list for the audit trail.
 */
import type { ScreeningOutcome } from './screening';

export type RiskFactor = { code: string; label: string; weight: number };

export type RiskRatingInput = {
  /** ISO 3166-1 alpha-3 domicile / nationality. */
  country?: string | null;
  /** Latest sanctions/PEP screening outcome, if any. */
  screening?: Pick<ScreeningOutcome, 'status' | 'isPep' | 'matchScore'> | null;
  /** Investor type, e.g. "INDIVIDUAL" | "CORPORATE" | "TRUST" | "SPV". */
  investorType?: string | null;
  /** True when beneficial ownership chain is opaque / incompletely verified. */
  hasUnverifiedBeneficialOwner?: boolean;
};

export type RiskRating = {
  rating: 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  factors: RiskFactor[];
};

// High-risk jurisdictions (FATF call-for-action / increased-monitoring sample).
// alpha-3. Operators extend via env in a real deployment.
const HIGH_RISK_COUNTRIES = new Set(['PRK', 'IRN', 'CUB', 'SYR', 'MMR', 'RUS']);

const HIGH_RISK_STRUCTURES = new Set(['TRUST', 'SPV', 'SHELL', 'NOMINEE']);

export function deriveRiskRating(input: RiskRatingInput): RiskRating {
  const factors: RiskFactor[] = [];
  let score = 0;

  const country = input.country?.toUpperCase() ?? null;
  if (country && HIGH_RISK_COUNTRIES.has(country)) {
    factors.push({
      code: 'HIGH_RISK_JURISDICTION',
      label: `High-risk jurisdiction ${country}`,
      weight: 50
    });
    score += 50;
  }

  const screening = input.screening;
  if (screening) {
    if (screening.status === 'REJECTED' || screening.status === 'CONFIRMED_MATCH') {
      factors.push({ code: 'SANCTIONS_HIT', label: 'Confirmed sanctions match', weight: 60 });
      score += 60;
    } else if (screening.status === 'ESCALATED' || screening.status === 'POTENTIAL_MATCH') {
      factors.push({ code: 'SANCTIONS_POTENTIAL', label: 'Potential sanctions match', weight: 30 });
      score += 30;
    }
    if (screening.isPep) {
      factors.push({ code: 'PEP', label: 'Politically exposed person', weight: 25 });
      score += 25;
    }
  }

  const investorType = input.investorType?.toUpperCase() ?? null;
  if (investorType && HIGH_RISK_STRUCTURES.has(investorType)) {
    factors.push({
      code: 'OPAQUE_STRUCTURE',
      label: `Opaque structure ${investorType}`,
      weight: 20
    });
    score += 20;
  }

  if (input.hasUnverifiedBeneficialOwner) {
    factors.push({ code: 'UNVERIFIED_UBO', label: 'Unverified beneficial owner', weight: 20 });
    score += 20;
  }

  const rating: RiskRating['rating'] = score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';
  return { rating, score, factors };
}
