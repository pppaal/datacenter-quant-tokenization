import { PrismaClient, RiskSeverity } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { convertToKrw, resolveInputCurrency } from '@/lib/finance/currency';
import { assetRiskRegisterEntrySchema } from '@/lib/validations/asset-risk-register';
import { assetBundleInclude, getAssetById } from '@/lib/services/assets';
import { toNumber, toNumberOrNull } from '@/lib/math';
import {
  computeIdiosyncraticRisk,
  type IdiosyncraticRiskInputs,
  type RentRollEntry
} from '@/lib/services/valuation/idiosyncratic-risk';

export const RISK_ENGINE_SOURCE = 'IDIOSYNCRATIC_ENGINE';

async function resolveAssetCurrencyContext(assetId: string, db: PrismaClient) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { id: true, market: true, address: { select: { country: true } } }
  });
  if (!asset) throw new Error('Asset not found');
  return asset;
}

export async function createAssetRiskRegisterEntry(
  assetId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = assetRiskRegisterEntrySchema.parse(input);
  const asset = await resolveAssetCurrencyContext(assetId, db);
  const inputCurrency = resolveInputCurrency(
    asset.address?.country ?? asset.market,
    parsed.inputCurrency
  );

  await db.assetRiskRegisterEntry.create({
    data: {
      assetId,
      title: parsed.title,
      category: parsed.category,
      description: parsed.description,
      likelihood: parsed.likelihood,
      impact: parsed.impact,
      irrImpactBps: parsed.irrImpactBps,
      valueImpactKrw:
        typeof parsed.valueImpactKrw === 'number'
          ? convertToKrw(parsed.valueImpactKrw, inputCurrency)
          : null,
      mitigant: parsed.mitigant,
      residualLikelihood: parsed.residualLikelihood,
      residualImpact: parsed.residualImpact,
      status: parsed.status,
      ownerName: parsed.ownerName,
      sortOrder: typeof parsed.sortOrder === 'number' ? Math.round(parsed.sortOrder) : 0
    }
  });

  return db.asset.findUnique({ where: { id: assetId }, include: assetBundleInclude });
}

export async function deleteAssetRiskRegisterEntry(
  assetId: string,
  entryId: string,
  db: PrismaClient = prisma
) {
  // Scope the delete to the asset so an entry id alone can't reach across assets.
  await db.assetRiskRegisterEntry.deleteMany({ where: { id: entryId, assetId } });
  return db.asset.findUnique({ where: { id: assetId }, include: assetBundleInclude });
}

type AssetForRiskEngine = NonNullable<Awaited<ReturnType<typeof getAssetById>>>;

function mapZoningRisk(
  constraints: AssetForRiskEngine['planningConstraints']
): IdiosyncraticRiskInputs['zoningChangeRisk'] {
  const severities = constraints.map((c) => (c.severity ?? '').toUpperCase());
  if (severities.some((s) => s.includes('CRIT') || s.includes('HIGH'))) return 'HIGH';
  if (severities.some((s) => s.includes('MED'))) return 'MED';
  if (severities.some((s) => s.includes('LOW'))) return 'LOW';
  return 'NONE';
}

function buildRiskEngineInputs(asset: AssetForRiskEngine): IdiosyncraticRiskInputs {
  const rentRoll: RentRollEntry[] = asset.leases.map((lease) => {
    const lastStep = [...lease.steps].sort(
      (a, b) => b.endYear - a.endYear || b.stepOrder - a.stepOrder
    )[0];
    const kw = lastStep?.leasedKw ?? lease.leasedKw ?? 0;
    const rate = lastStep?.ratePerKwKrw ?? lease.baseRatePerKwKrw ?? 0;
    const startYear = lease.startYear ?? 1;
    const termYears = lease.termYears ?? 1;
    return {
      tenantName: lease.tenantName,
      annualRentKrw: kw > 0 && rate > 0 ? kw * rate * 12 : 0,
      leaseEndYear: startYear + termYears - 1,
      creditGrade: null
    };
  });

  // Relative model-year schedule: anchor the rollover window at the earliest start.
  const startYears = asset.leases
    .map((lease) => lease.startYear)
    .filter((y): y is number => typeof y === 'number');
  const asOfYear = startYears.length ? Math.min(...startYears) : undefined;

  const deferredCapexKrw = asset.capexLineItems
    .filter((item) => !item.isEmbedded)
    .reduce((sum, item) => sum + toNumber(item.amountKrw), 0);

  const floodScore = asset.siteProfile?.floodRiskScore ?? null;

  return {
    asOfYear,
    rentRoll,
    buildingValueKrw: toNumberOrNull(asset.currentValuationKrw) ?? undefined,
    deferredCapexKrw: deferredCapexKrw > 0 ? deferredCapexKrw : undefined,
    floodZoneFlag: floodScore != null && floodScore >= 3,
    zoningChangeRisk: mapZoningRisk(asset.planningConstraints),
    titleEncumbranceFlag: asset.encumbranceRecords.length > 0,
    pendingLitigationFlag: false
  };
}

function humanizeFactorKey(key: string): string {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Generate quantified risk-register rows from the idiosyncratic-risk engine.
 * Maps each non-trivial factor (MEDIUM+) to a register entry (likelihood/impact
 * from the factor severity, evidence → description, recommendation → mitigant).
 * Idempotent: replaces only this engine's prior rows, never the operator's
 * MANUAL entries.
 */
export async function generateRiskRegisterFromEngine(assetId: string, db: PrismaClient = prisma) {
  const asset = await getAssetById(assetId, db);
  if (!asset) throw new Error('Asset not found');

  const report = computeIdiosyncraticRisk(buildRiskEngineInputs(asset));
  const factors = report.factors.filter((factor) => factor.severity !== 'LOW');

  await db.$transaction(async (tx) => {
    await tx.assetRiskRegisterEntry.deleteMany({
      where: { assetId, sourceSystem: RISK_ENGINE_SOURCE }
    });
    if (factors.length === 0) return;
    await tx.assetRiskRegisterEntry.createMany({
      data: factors.map((factor, index) => ({
        assetId,
        title: factor.label,
        category: humanizeFactorKey(factor.key),
        description: factor.evidence,
        likelihood: factor.severity as RiskSeverity,
        impact: factor.severity as RiskSeverity,
        mitigant: factor.recommendation,
        status: 'OPEN',
        ownerName: 'Risk engine',
        sortOrder: index,
        sourceSystem: RISK_ENGINE_SOURCE
      }))
    });
  });

  return db.asset.findUnique({ where: { id: assetId }, include: assetBundleInclude });
}
