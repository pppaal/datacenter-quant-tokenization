import { access } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { UnderwritingAnalysis, UnderwritingBundle } from '@/lib/services/valuation-engine';

type PythonValuationResult = Pick<
  UnderwritingAnalysis,
  'baseCaseValueKrw' | 'confidenceScore' | 'keyRisks' | 'ddChecklist' | 'assumptions' | 'scenarios'
>;

const PYTHON_SCRIPT_PATH = path.resolve(process.cwd(), 'services/valuation_python/engine.py');

function resolvePythonCommand() {
  const explicit = process.env.VAL_PYTHON_EXECUTABLE?.trim();
  if (explicit) return explicit;
  return process.platform === 'win32' ? 'python' : 'python3';
}

async function scriptExists() {
  try {
    await access(PYTHON_SCRIPT_PATH);
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
  return scriptExists();
}

export async function runPythonValuation(bundle: UnderwritingBundle): Promise<PythonValuationResult | null> {
  if (!(await scriptExists())) return null;

  const pythonCommand = resolvePythonCommand();
  const payload = JSON.stringify(normalizeBundle(bundle));

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCommand, [PYTHON_SCRIPT_PATH], {
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
