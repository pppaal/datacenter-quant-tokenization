/**
 * Insurance summary for the IM. Aggregates policy register into
 * coverage-by-type tiles + flags renewals expiring within 90 days
 * + computes total annual premium.
 */
type PolicyLike = {
  id?: string;
  policyType: string;
  insurer: string;
  brokerName?: string | null;
  coverageKrw?: number | null;
  deductibleKrw?: number | null;
  premiumKrw?: number | null;
  currency?: string | null;
  effectiveFrom?: Date | null;
  expiresOn?: Date | null;
  status?: string | null;
  notes?: string | null;
};

export type CoverageTile = {
  policyType: string;
  label: string;
  coverageKrw: number | null;
  premiumKrw: number | null;
  insurer: string | null;
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'OTHER';
  expiresOn: Date | null;
};

export type InsuranceSummary = {
  policies: PolicyLike[];
  totalCoverageKrw: number;
  totalPremiumKrw: number;
  averageDeductibleKrw: number | null;
  expiringSoonCount: number;
  tilesByType: CoverageTile[];
};

const TYPE_LABEL: Record<string, string> = {
  PROPERTY: 'Property',
  BI: 'Business interruption',
  LIABILITY: 'General liability',
  CYBER: 'Cyber',
  CONSTRUCTION: 'Construction (CAR/EAR)',
  DO: 'D&O',
  TERRORISM: 'Terrorism'
};

export function buildInsuranceSummary(
  policies: PolicyLike[],
  now: Date = new Date()
): InsuranceSummary | null {
  if (policies.length === 0) return null;
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const totalCoverageKrw = policies.reduce(
    (s, p) => s + (p.coverageKrw ?? 0),
    0
  );
  const totalPremiumKrw = policies.reduce(
    (s, p) => s + (p.premiumKrw ?? 0),
    0
  );
  const deductibles = policies
    .map((p) => p.deductibleKrw)
    .filter((d): d is number => typeof d === 'number');
  const averageDeductibleKrw =
    deductibles.length === 0
      ? null
      : deductibles.reduce((s, d) => s + d, 0) / deductibles.length;

  let expiringSoonCount = 0;
  const tilesByType = policies.map<CoverageTile>((p) => {
    let status: CoverageTile['status'] = 'OTHER';
    if (p.status === 'ACTIVE') {
      if (p.expiresOn && p.expiresOn <= ninetyDaysFromNow && p.expiresOn >= now) {
        status = 'EXPIRING';
        expiringSoonCount += 1;
      } else if (p.expiresOn && p.expiresOn < now) {
        status = 'EXPIRED';
      } else {
        status = 'ACTIVE';
      }
    } else if (p.status === 'EXPIRED') {
      status = 'EXPIRED';
    }
    return {
      policyType: p.policyType,
      label: TYPE_LABEL[p.policyType] ?? p.policyType,
      coverageKrw: p.coverageKrw ?? null,
      premiumKrw: p.premiumKrw ?? null,
      insurer: p.insurer ?? null,
      status,
      expiresOn: p.expiresOn ?? null
    };
  });

  return {
    policies,
    totalCoverageKrw,
    totalPremiumKrw,
    averageDeductibleKrw,
    expiringSoonCount,
    tilesByType
  };
}
