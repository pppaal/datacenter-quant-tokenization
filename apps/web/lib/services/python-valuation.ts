import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { UnderwritingAnalysis, UnderwritingBundle } from '@/lib/services/valuation-engine';
import { logger } from '@/lib/observability/logger';

type PythonValuationResult = Pick<
  UnderwritingAnalysis,
  'baseCaseValueKrw' | 'confidenceScore' | 'keyRisks' | 'ddChecklist' | 'assumptions' | 'scenarios'
>;

/**
 * Resolve the cross-check engine script RELATIVE TO THIS MODULE, never via
 * `process.cwd()`. On serverless / monorepo deploys the process cwd is the
 * repo root (or an opaque lambda root), so a cwd-relative path silently fails
 * `scriptExists()` and the cross-check no-ops forever. This module lives at
 * `apps/web/lib/services/python-valuation.ts`; the engine ships at
 * `apps/web/services/valuation_python/engine.py`, two directories up.
 *
 * `VAL_PYTHON_SCRIPT_PATH` provides a stable override for non-standard
 * layouts (e.g. a bundled lambda that relocates the script).
 */
export function resolvePythonScriptPath(): string {
  const override = process.env.VAL_PYTHON_SCRIPT_PATH?.trim();
  if (override) return path.resolve(override);

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  // moduleDir = .../apps/web/lib/services → engine at .../apps/web/services/...
  return path.resolve(moduleDir, '..', '..', 'services', 'valuation_python', 'engine.py');
}

function resolvePythonCommand() {
  const explicit = process.env.VAL_PYTHON_EXECUTABLE?.trim();
  if (explicit) return explicit;
  return process.platform === 'win32' ? 'python' : 'python3';
}

async function scriptExists(scriptPath: string) {
  try {
    await access(scriptPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeBundle(bundle: UnderwritingBundle) {
  return {
    asset: {
      assetCode: bundle.asset.assetCode,
      name: bundle.asset.name,
      stage: bundle.asset.stage,
      market: bundle.asset.market,
      powerCapacityMw: bundle.asset.powerCapacityMw,
      targetItLoadMw: bundle.asset.targetItLoadMw,
      occupancyAssumptionPct: bundle.asset.occupancyAssumptionPct,
      capexAssumptionKrw: bundle.asset.capexAssumptionKrw,
      opexAssumptionKrw: bundle.asset.opexAssumptionKrw,
      financingLtvPct: bundle.asset.financingLtvPct,
      financingRatePct: bundle.asset.financingRatePct
    },
    address: {
      line1: bundle.address?.line1 ?? null,
      city: bundle.address?.city ?? null,
      province: bundle.address?.province ?? null,
      latitude: bundle.address?.latitude ?? null,
      longitude: bundle.address?.longitude ?? null,
      parcelId: bundle.address?.parcelId ?? null
    },
    siteProfile: {
      gridAvailability: bundle.siteProfile?.gridAvailability ?? null,
      fiberAccess: bundle.siteProfile?.fiberAccess ?? null,
      latencyProfile: bundle.siteProfile?.latencyProfile ?? null,
      floodRiskScore: bundle.siteProfile?.floodRiskScore ?? null,
      wildfireRiskScore: bundle.siteProfile?.wildfireRiskScore ?? null,
      seismicRiskScore: bundle.siteProfile?.seismicRiskScore ?? null,
      siteNotes: bundle.siteProfile?.siteNotes ?? null
    },
    buildingSnapshot: {
      zoning: bundle.buildingSnapshot?.zoning ?? null,
      buildingCoveragePct: bundle.buildingSnapshot?.buildingCoveragePct ?? null,
      floorAreaRatioPct: bundle.buildingSnapshot?.floorAreaRatioPct ?? null,
      grossFloorAreaSqm: bundle.buildingSnapshot?.grossFloorAreaSqm ?? null,
      structureDescription: bundle.buildingSnapshot?.structureDescription ?? null,
      redundancyTier: bundle.buildingSnapshot?.redundancyTier ?? null,
      coolingType: bundle.buildingSnapshot?.coolingType ?? null
    },
    permitSnapshot: {
      permitStage: bundle.permitSnapshot?.permitStage ?? null,
      zoningApprovalStatus: bundle.permitSnapshot?.zoningApprovalStatus ?? null,
      environmentalReviewStatus: bundle.permitSnapshot?.environmentalReviewStatus ?? null,
      powerApprovalStatus: bundle.permitSnapshot?.powerApprovalStatus ?? null,
      timelineNotes: bundle.permitSnapshot?.timelineNotes ?? null
    },
    energySnapshot: {
      utilityName: bundle.energySnapshot?.utilityName ?? null,
      substationDistanceKm: bundle.energySnapshot?.substationDistanceKm ?? null,
      tariffKrwPerKwh: bundle.energySnapshot?.tariffKrwPerKwh ?? null,
      renewableAvailabilityPct: bundle.energySnapshot?.renewableAvailabilityPct ?? null,
      pueTarget: bundle.energySnapshot?.pueTarget ?? null,
      backupFuelHours: bundle.energySnapshot?.backupFuelHours ?? null
    },
    marketSnapshot: {
      metroRegion: bundle.marketSnapshot?.metroRegion ?? null,
      vacancyPct: bundle.marketSnapshot?.vacancyPct ?? null,
      colocationRatePerKwKrw: bundle.marketSnapshot?.colocationRatePerKwKrw ?? null,
      capRatePct: bundle.marketSnapshot?.capRatePct ?? null,
      debtCostPct: bundle.marketSnapshot?.debtCostPct ?? null,
      inflationPct: bundle.marketSnapshot?.inflationPct ?? null,
      constructionCostPerMwKrw: bundle.marketSnapshot?.constructionCostPerMwKrw ?? null,
      discountRatePct: bundle.marketSnapshot?.discountRatePct ?? null,
      marketNotes: bundle.marketSnapshot?.marketNotes ?? null
    },
    comparableSet: {
      name: bundle.comparableSet?.name ?? null,
      entries:
        bundle.comparableSet?.entries.map((entry) => ({
          location: entry.location,
          powerCapacityMw: entry.powerCapacityMw,
          valuationKrw: entry.valuationKrw,
          monthlyRatePerKwKrw: entry.monthlyRatePerKwKrw,
          capRatePct: entry.capRatePct,
          discountRatePct: entry.discountRatePct,
          weightPct: entry.weightPct
        })) ?? []
    },
    capexLineItems:
      bundle.capexLineItems?.map((item) => ({
        category: item.category,
        amountKrw: item.amountKrw,
        spendYear: item.spendYear
      })) ?? [],
    leases:
      bundle.leases?.map((lease) => ({
        tenantName: lease.tenantName,
        leasedKw: lease.leasedKw,
        startYear: lease.startYear,
        termYears: lease.termYears,
        baseRatePerKwKrw: lease.baseRatePerKwKrw,
        probabilityPct: lease.probabilityPct
      })) ?? [],
    taxAssumption: {
      propertyTaxPct: bundle.taxAssumption?.propertyTaxPct ?? null,
      corporateTaxPct: bundle.taxAssumption?.corporateTaxPct ?? null,
      exitTaxPct: bundle.taxAssumption?.exitTaxPct ?? null
    },
    spvStructure: {
      managementFeePct: bundle.spvStructure?.managementFeePct ?? null,
      performanceFeePct: bundle.spvStructure?.performanceFeePct ?? null
    },
    debtFacilities:
      bundle.debtFacilities?.map((facility) => ({
        facilityType: facility.facilityType,
        commitmentKrw: facility.commitmentKrw,
        interestRatePct: facility.interestRatePct,
        amortizationProfile: facility.amortizationProfile,
        draws: facility.draws.map((draw) => ({
          drawYear: draw.drawYear,
          amountKrw: draw.amountKrw
        }))
      })) ?? []
  };
}

export async function canUsePythonValuation() {
  return scriptExists(resolvePythonScriptPath());
}

export async function runPythonValuation(
  bundle: UnderwritingBundle
): Promise<PythonValuationResult | null> {
  const scriptPath = resolvePythonScriptPath();
  if (!(await scriptExists(scriptPath))) {
    // Make the misconfiguration observable instead of silently no-opping.
    // `python` mode (in valuation-runner) surfaces this differently by
    // re-throwing on cross-check failure; in `auto` mode the null return is
    // expected behavior, but the missing script almost always indicates a
    // deploy/path issue rather than an intentional opt-out.
    logger.warn('python_valuation_script_missing', {
      scriptPath,
      hint: 'set VAL_PYTHON_SCRIPT_PATH or ship services/valuation_python/engine.py with the bundle'
    });
    return null;
  }

  const pythonCommand = resolvePythonCommand();
  const payload = JSON.stringify(normalizeBundle(bundle));

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCommand, [scriptPath], {
      cwd: process.cwd(),
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python valuation engine exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as PythonValuationResult);
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}
