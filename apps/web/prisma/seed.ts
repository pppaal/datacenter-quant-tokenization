import {
  ActivityType,
  AmortizationProfile,
  AssetStage,
  AssetStatus,
  CapitalCallStatus,
  CapexCategory,
  CovenantStatus,
  DealBidStatus,
  DealLenderQuoteStatus,
  DealLossReason,
  DealNegotiationEventType,
  DealOriginationSource,
  DealStage,
  DebtFacilityType,
  DistributionStatus,
  DocumentType,
  InvestorReportType,
  InvestorReportReleaseStatus,
  LeaseStatus,
  AssetClass,
  PortfolioAssetStatus,
  PrismaClient,
  ReadinessStatus,
  RelationshipCoverageStatus,
  ReviewStatus,
  RiskSeverity,
  SourceStatus,
  TaskPriority,
  TaskStatus,
  UserRole,
  VehicleType
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { ingestFinancialStatement } from '../lib/services/financial-statements';
import { buildMacroRegimeProvenance, buildMacroRegimeSnapshot } from '../lib/services/macro/series';
import { stageReviewReadiness } from '../lib/services/readiness';
import { buildSensitivityRuns } from '../lib/services/sensitivity/engine';
import { promoteAssetSnapshotsToFeatures } from '../lib/services/feature-promotion';
import { buildValuationAnalysis } from '../lib/services/valuation-engine';

const prisma = new PrismaClient();

type SeedAssetInput = {
  assetCode: string;
  slug: string;
  name: string;
  city: string;
  province: string;
  district: string;
  line1: string;
  description: string;
  stage: AssetStage;
  status: AssetStatus;
  powerCapacityMw: number;
  targetItLoadMw: number;
  landAreaSqm: number;
  grossFloorAreaSqm: number;
  occupancyAssumptionPct: number;
  tenantAssumption: string;
  capexAssumptionKrw: number;
  opexAssumptionKrw: number;
  financingLtvPct: number;
  financingRatePct: number;
  ownerName: string;
  sponsorName: string;
  developmentSummary: string;
  siteProfile: {
    gridAvailability: string;
    fiberAccess: string;
    latencyProfile: string;
    floodRiskScore: number;
    wildfireRiskScore: number;
    seismicRiskScore: number;
    siteNotes: string;
  };
  buildingSnapshot: {
    zoning: string;
    buildingCoveragePct: number;
    floorAreaRatioPct: number;
    structureDescription: string;
    redundancyTier: string;
    coolingType: string;
  };
  permitSnapshot: {
    permitStage: string;
    zoningApprovalStatus: string;
    environmentalReviewStatus: string;
    powerApprovalStatus: string;
    timelineNotes: string;
  };
  energySnapshot: {
    utilityName: string;
    substationDistanceKm: number;
    tariffKrwPerKwh: number;
    renewableAvailabilityPct: number;
    pueTarget: number;
    backupFuelHours: number;
  };
  marketSnapshot: {
    metroRegion: string;
    vacancyPct: number;
    colocationRatePerKwKrw: number;
    capRatePct: number;
    debtCostPct: number;
    inflationPct: number;
    constructionCostPerMwKrw: number;
    discountRatePct: number;
    marketNotes: string;
  };
  comparableEntries: Array<{
    label: string;
    location: string;
    assetType: string;
    stage: AssetStage;
    sourceLink: string;
    powerCapacityMw: number;
    grossFloorAreaSqm: number;
    occupancyPct: number;
    valuationKrw: number;
    monthlyRatePerKwKrw: number;
    capRatePct: number;
    discountRatePct: number;
    weightPct: number;
    notes: string;
  }>;
  capexLineItems: Array<{
    category: CapexCategory;
    label: string;
    amountKrw: number;
    spendYear: number;
    isEmbedded?: boolean;
    notes?: string;
  }>;
  leases: Array<{
    tenantName: string;
    status: LeaseStatus;
    leasedKw: number;
    startYear: number;
    termYears: number;
    baseRatePerKwKrw: number;
    annualEscalationPct: number;
    probabilityPct: number;
    renewProbabilityPct: number;
    downtimeMonths: number;
    fitOutCostKrw?: number;
    notes?: string;
    steps?: Array<{
      stepOrder: number;
      startYear: number;
      endYear: number;
      ratePerKwKrw: number;
      leasedKw?: number;
      annualEscalationPct?: number;
      occupancyPct?: number;
      notes?: string;
    }>;
  }>;
  taxAssumption: {
    acquisitionTaxPct: number;
    vatRecoveryPct: number;
    propertyTaxPct: number;
    insurancePct: number;
    corporateTaxPct: number;
    withholdingTaxPct: number;
    exitTaxPct: number;
    notes: string;
  };
  spvStructure: {
    legalStructure: string;
    managementFeePct: number;
    performanceFeePct: number;
    promoteThresholdPct: number;
    promoteSharePct: number;
    reserveTargetMonths: number;
    distributionWaterfall: string;
    notes: string;
  };
  debtFacilities: Array<{
    facilityType: DebtFacilityType;
    lenderName: string;
    commitmentKrw: number;
    drawnAmountKrw: number;
    interestRatePct: number;
    upfrontFeePct?: number;
    commitmentFeePct?: number;
    gracePeriodMonths?: number;
    amortizationTermMonths?: number;
    amortizationProfile: AmortizationProfile;
    sculptedTargetDscr?: number;
    balloonPct?: number;
    reserveMonths?: number;
    notes?: string;
    draws: Array<{
      drawYear: number;
      drawMonth?: number;
      amountKrw: number;
      notes?: string;
    }>;
  }>;
  documents: Array<{
    title: string;
    documentType: DocumentType;
    sourceLink: string;
    aiSummary: string;
    documentHash: string;
  }>;
  readinessStatus: ReadinessStatus;
};

function buildCapexLineItems(totalCapexKrw: number, landPct: number) {
  return [
    { category: CapexCategory.LAND, label: 'Land and assembly', amountKrw: totalCapexKrw * landPct, spendYear: 0 },
    { category: CapexCategory.SHELL_CORE, label: 'Shell and core', amountKrw: totalCapexKrw * 0.22, spendYear: 1 },
    { category: CapexCategory.ELECTRICAL, label: 'Electrical and utility interconnection', amountKrw: totalCapexKrw * 0.24, spendYear: 1 },
    { category: CapexCategory.MECHANICAL, label: 'Cooling and mechanical package', amountKrw: totalCapexKrw * 0.16, spendYear: 1 },
    { category: CapexCategory.IT_FIT_OUT, label: 'White space and fit-out', amountKrw: totalCapexKrw * 0.1, spendYear: 2 },
    { category: CapexCategory.SOFT_COST, label: 'Professional fees and developer overhead', amountKrw: totalCapexKrw * 0.09, spendYear: 0 },
    { category: CapexCategory.CONTINGENCY, label: 'Contingency', amountKrw: totalCapexKrw * (0.19 - landPct), spendYear: 2 }
  ];
}

function monthOffset(date: Date, offsetMonths: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offsetMonths, 1));
}

function buildMacroSeriesSeedRows(
  market: string,
  marketSnapshot: SeedAssetInput['marketSnapshot'],
  observationDate = new Date()
) {
  const baseDate = monthOffset(observationDate, 0);
  const rows = [
    ['inflation_pct', 'Inflation', '%', marketSnapshot.inflationPct, [-0.25, -0.1, 0]],
    ['debt_cost_pct', 'Debt Cost', '%', marketSnapshot.debtCostPct, [-0.35, -0.15, 0]],
    ['cap_rate_pct', 'Market Cap Rate', '%', marketSnapshot.capRatePct, [-0.2, -0.08, 0]],
    ['discount_rate_pct', 'Discount Rate', '%', marketSnapshot.discountRatePct, [-0.2, -0.05, 0]],
    ['vacancy_pct', 'Vacancy', '%', marketSnapshot.vacancyPct, [0.7, 0.3, 0]]
  ] as const;

  return rows.flatMap(([seriesKey, label, unit, currentValue, deltas]) =>
    deltas.map((delta, index) => ({
      market,
      seriesKey,
      label,
      frequency: 'monthly',
      observationDate: monthOffset(baseDate, index - 2),
      value: Number((currentValue + delta).toFixed(2)),
      unit,
      sourceSystem: 'seed-manual',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: baseDate
    }))
  );
}

async function seedAsset(input: SeedAssetInput) {
  const asset = await prisma.asset.create({
    data: {
      assetCode: input.assetCode,
      slug: input.slug,
      name: input.name,
      assetClass: AssetClass.DATA_CENTER,
      assetType: 'Data Center',
      market: 'KR',
      status: input.status,
      stage: input.stage,
      description: input.description,
      ownerName: input.ownerName,
      sponsorName: input.sponsorName,
      developmentSummary: input.developmentSummary,
      targetItLoadMw: input.targetItLoadMw,
      powerCapacityMw: input.powerCapacityMw,
      landAreaSqm: input.landAreaSqm,
      grossFloorAreaSqm: input.grossFloorAreaSqm,
      occupancyAssumptionPct: input.occupancyAssumptionPct,
      tenantAssumption: input.tenantAssumption,
      capexAssumptionKrw: input.capexAssumptionKrw,
      opexAssumptionKrw: input.opexAssumptionKrw,
      financingLtvPct: input.financingLtvPct,
      financingRatePct: input.financingRatePct,
      lastEnrichedAt: new Date(),
      address: {
        create: {
          line1: input.line1,
          district: input.district,
          city: input.city,
          province: input.province,
          country: 'KR',
          sourceLabel: 'seed'
        }
      },
      siteProfile: {
        create: {
          ...input.siteProfile,
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: new Date()
        }
      },
      buildingSnapshot: {
        create: {
          ...input.buildingSnapshot,
          grossFloorAreaSqm: input.grossFloorAreaSqm,
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: new Date()
        }
      },
      permitSnapshot: {
        create: {
          ...input.permitSnapshot,
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: new Date()
        }
      },
      energySnapshot: {
        create: {
          ...input.energySnapshot,
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: new Date()
        }
      },
      dataCenterDetail: {
        create: {
          powerCapacityMw: input.powerCapacityMw,
          targetItLoadMw: input.targetItLoadMw,
          pueTarget: input.energySnapshot.pueTarget,
          utilityName: input.energySnapshot.utilityName,
          substationDistanceKm: input.energySnapshot.substationDistanceKm,
          renewablePct: input.energySnapshot.renewableAvailabilityPct,
          redundancyTier: input.buildingSnapshot.redundancyTier,
          coolingType: input.buildingSnapshot.coolingType,
          fiberAccess: input.siteProfile.fiberAccess,
          latencyProfile: input.siteProfile.latencyProfile
        }
      },
      marketSnapshot: {
        create: {
          ...input.marketSnapshot,
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: new Date()
        }
      },
      macroSeries: {
        create: buildMacroSeriesSeedRows('KR', input.marketSnapshot)
      },
      comparableSet: {
        create: {
          name: 'Seed comparable calibration set',
          valuationDate: new Date(),
          calibrationMode: 'Weighted market calibration',
          notes: `Comparable set for ${input.assetCode}`,
          entries: {
            create: input.comparableEntries
          }
        }
      },
      capexLineItems: {
        create: input.capexLineItems
      },
      leases: {
        create: input.leases.map((lease) => ({
          tenantName: lease.tenantName,
          status: lease.status,
          leasedKw: lease.leasedKw,
          startYear: lease.startYear,
          termYears: lease.termYears,
          baseRatePerKwKrw: lease.baseRatePerKwKrw,
          annualEscalationPct: lease.annualEscalationPct,
          probabilityPct: lease.probabilityPct,
          renewProbabilityPct: lease.renewProbabilityPct,
          downtimeMonths: lease.downtimeMonths,
          fitOutCostKrw: lease.fitOutCostKrw,
          notes: lease.notes,
          steps: lease.steps
            ? {
                create: lease.steps
              }
            : undefined
        }))
      },
      taxAssumption: {
        create: input.taxAssumption
      },
      spvStructure: {
        create: input.spvStructure
      },
      debtFacilities: {
        create: input.debtFacilities.map((facility) => ({
          facilityType: facility.facilityType,
          lenderName: facility.lenderName,
          commitmentKrw: facility.commitmentKrw,
          drawnAmountKrw: facility.drawnAmountKrw,
          interestRatePct: facility.interestRatePct,
          upfrontFeePct: facility.upfrontFeePct,
          commitmentFeePct: facility.commitmentFeePct,
          gracePeriodMonths: facility.gracePeriodMonths,
          amortizationTermMonths: facility.amortizationTermMonths,
          amortizationProfile: facility.amortizationProfile,
          sculptedTargetDscr: facility.sculptedTargetDscr,
          balloonPct: facility.balloonPct,
          reserveMonths: facility.reserveMonths,
          notes: facility.notes,
          draws: {
            create: facility.draws
          }
        }))
      },
      documents: {
        create: input.documents.map((document, index) => ({
          title: document.title,
          documentType: document.documentType,
          sourceLink: document.sourceLink,
          aiSummary: document.aiSummary,
          documentHash: document.documentHash,
          latestStoragePath: `seed/${input.assetCode}/${index + 1}.pdf`,
          versions: {
            create: {
              versionNumber: 1,
              fileName: `${document.title}.pdf`,
              fileType: 'application/pdf',
              fileSize: 2048 * (index + 1),
              storagePath: `seed/${input.assetCode}/${index + 1}.pdf`,
              sourceLink: document.sourceLink,
              extractedText: `${document.title} extracted diligence summary.`,
              aiSummary: document.aiSummary,
              documentHash: document.documentHash
            }
          }
        }))
      },
      inquiries: {
        create: {
          name: 'Institutional Coverage Team',
          company: 'Han River Infrastructure Partners',
          email: 'coverage@example.com',
          requestType: 'Sample report access',
          message:
            'Requesting sample underwriting materials and source-provenance breakdown for internal diligence benchmarking.'
        }
      },
      readinessProject: {
        create: {
          readinessStatus: input.readinessStatus,
          packageName: 'Institutional Review Package Queue',
          chainName: 'Phase 2 / not deployed',
          reviewPhase: 'Committee review',
          legalStructure: 'SPV review pending',
          nextAction:
            input.readinessStatus === ReadinessStatus.READY
              ? 'Ready for document-hash anchoring.'
              : 'Continue diligence and finalize legal workstream.'
        }
      }
    },
    include: {
      address: true,
      siteProfile: true,
      buildingSnapshot: true,
      permitSnapshot: true,
      energySnapshot: true,
      marketSnapshot: true,
      comparableSet: {
        include: {
          entries: true
        }
      },
      capexLineItems: true,
      leases: {
        include: {
          steps: true
        }
      },
      taxAssumption: true,
      spvStructure: true,
      macroSeries: {
        orderBy: {
          observationDate: 'desc'
        }
      },
      debtFacilities: {
        include: {
          draws: true
        }
      },
      readinessProject: true
    }
  });

  const reviewer = await prisma.user.findUnique({
    where: { email: 'analyst@nexusseoul.local' },
    select: { id: true }
  });

  if (input.assetCode === 'SEOUL-GANGSEO-01') {
    const approvedAt = new Date('2026-03-24T09:00:00.000Z');

    if (asset.energySnapshot) {
      await prisma.energySnapshot.update({
        where: { id: asset.energySnapshot.id },
        data: {
          reviewStatus: ReviewStatus.APPROVED,
          reviewedAt: approvedAt,
          reviewedById: reviewer?.id ?? null,
          reviewNotes: 'Utility tariff, resiliency assumptions, and substation distance verified against latest diligence pack.'
        }
      });
    }

    if (asset.permitSnapshot) {
      await prisma.permitSnapshot.update({
        where: { id: asset.permitSnapshot.id },
        data: {
          reviewStatus: ReviewStatus.APPROVED,
          reviewedAt: approvedAt,
          reviewedById: reviewer?.id ?? null,
          reviewNotes: 'Power allocation timing and planning status confirmed for committee circulation.'
        }
      });
    }

    if (asset.leases[0]) {
      await prisma.lease.update({
        where: { id: asset.leases[0].id },
        data: {
          reviewStatus: ReviewStatus.APPROVED,
          reviewedAt: approvedAt,
          reviewedById: reviewer?.id ?? null,
          reviewNotes: 'Anchor lease economics and staged ramp verified against sponsor-marked term sheet.'
        }
      });
    }

    await prisma.ownershipRecord.create({
      data: {
        assetId: asset.id,
        ownerName: input.ownerName,
        entityType: 'SPC',
        ownershipPct: 100,
        effectiveDate: approvedAt,
        sourceSystem: 'seed-manual',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: approvedAt,
        reviewStatus: ReviewStatus.APPROVED,
        reviewedAt: approvedAt,
        reviewedById: reviewer?.id ?? null,
        reviewNotes: 'Title chain and SPC ownership structure validated for current underwriting package.'
      }
    });
  }

  await promoteAssetSnapshotsToFeatures(asset.id, prisma);

  await ingestFinancialStatement({
    assetId: asset.id,
    assetName: asset.name,
    title: `${input.sponsorName} FY2024 Financial Statements`,
    extractedText: [
      `Sponsor: ${input.sponsorName}.`,
      `Revenue KRW ${Math.round(input.capexAssumptionKrw * 0.11)}.`,
      `EBITDA KRW ${Math.round(input.capexAssumptionKrw * 0.036)}.`,
      `Cash KRW ${Math.round(input.capexAssumptionKrw * 0.012)}.`,
      `Total debt KRW ${Math.round(input.capexAssumptionKrw * 0.14)}.`,
      `Total assets KRW ${Math.round(input.capexAssumptionKrw * 0.28)}.`,
      `Total equity KRW ${Math.round(input.capexAssumptionKrw * 0.12)}.`,
      `Interest expense KRW ${Math.round(input.capexAssumptionKrw * 0.008)}.`
    ].join(' ')
  });
  const creditAssessments = await prisma.creditAssessment.findMany({
    where: {
      assetId: asset.id
    },
    include: {
      counterparty: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  const analysis = await buildValuationAnalysis({
    asset,
    address: asset.address,
    siteProfile: asset.siteProfile,
    buildingSnapshot: asset.buildingSnapshot,
    permitSnapshot: asset.permitSnapshot,
    energySnapshot: asset.energySnapshot,
    marketSnapshot: asset.marketSnapshot,
    creditAssessments
  });
  const sensitivityRuns = buildSensitivityRuns(analysis);
  const macroRegime = buildMacroRegimeSnapshot(asset.macroSeries);
  const provenance = [
    ...analysis.provenance,
    ...buildMacroRegimeProvenance(asset.macroSeries),
    ...creditAssessments.map((assessment) => ({
      field: `credit.${assessment.counterparty.role.toLowerCase()}.${assessment.counterparty.name}`,
      value: assessment.score,
      sourceSystem: 'seed-financial-statement',
      mode: 'manual' as const,
      fetchedAt: assessment.createdAt.toISOString(),
      freshnessLabel: `${assessment.riskLevel} / ${assessment.assessmentType}`
    }))
  ];

  const run = await prisma.valuationRun.create({
    data: {
      assetId: asset.id,
      runLabel: 'Seeded underwriting case',
      status: 'COMPLETED',
      engineVersion: 'kdc-kr-v1',
      confidenceScore: analysis.confidenceScore,
      baseCaseValueKrw: analysis.baseCaseValueKrw,
      underwritingMemo: analysis.underwritingMemo,
      keyRisks: analysis.keyRisks,
      ddChecklist: analysis.ddChecklist,
      assumptions: {
        ...(analysis.assumptions as Prisma.InputJsonObject),
        macroRegime,
        creditSignals: creditAssessments.map((assessment) => ({
          counterpartyName: assessment.counterparty.name,
          counterpartyRole: assessment.counterparty.role,
          assessmentType: assessment.assessmentType,
          score: assessment.score,
          riskLevel: assessment.riskLevel,
          summary: assessment.summary,
          createdAt: assessment.createdAt.toISOString(),
          metrics: assessment.metrics
        }))
      } as Prisma.InputJsonValue,
      provenance: provenance as Prisma.InputJsonValue,
      scenarios: {
        create: analysis.scenarios
      },
      sensitivityRuns: {
        create: sensitivityRuns.map((run) => ({
          runType: run.runType,
          title: run.title,
          baselineMetricName: run.baselineMetricName,
          baselineMetricValue: run.baselineMetricValue,
          summary: run.summary as Prisma.InputJsonValue,
          points: {
            create: run.points.map((point) => ({
              variableKey: point.variableKey,
              variableLabel: point.variableLabel,
              shockLabel: point.shockLabel,
              shockValue: point.shockValue,
              metricName: point.metricName,
              metricValue: point.metricValue,
              deltaPct: point.deltaPct,
              sortOrder: point.sortOrder
            }))
          }
        }))
      }
    }
  });

  await prisma.asset.update({
    where: { id: asset.id },
    data: { currentValuationKrw: analysis.baseCaseValueKrw }
  });

  if (asset.readinessProject && input.readinessStatus === ReadinessStatus.READY) {
    await stageReviewReadiness(asset.id, prisma);

    if (input.assetCode === 'SEOUL-GANGSEO-01') {
      const latestDocument = await prisma.document.findFirst({
        where: { assetId: asset.id },
        orderBy: { updatedAt: 'desc' }
      });

      if (latestDocument) {
        await prisma.onchainRecord.updateMany({
          where: {
            readinessProjectId: asset.readinessProject.id,
            documentId: latestDocument.id,
            recordType: 'DOCUMENT_HASH'
          },
          data: {
            status: ReadinessStatus.ANCHORED,
            txHash: '0x8a3f6a5d9b19c613e779241db24dc8fe9121f4ae7e3d8c9fbb0723b1d94c8c42',
            chainId: 'demo-registry-sepolia',
            anchoredAt: new Date('2026-03-25T01:30:00.000Z')
          }
        });
        await prisma.readinessProject.update({
          where: { id: asset.readinessProject.id },
          data: {
            readinessStatus: ReadinessStatus.ANCHORED,
            reviewPhase: 'Evidence anchored',
            chainName: 'Demo Registry / Sepolia',
            nextAction: 'Institutional packet is staged and the latest document hash is anchored for committee review.'
          }
        });
      }
    }
  }
}

async function seedOfficeAsset() {
  const now = new Date('2026-03-26T00:00:00.000Z');
  const reviewer = await prisma.user.findUnique({
    where: { email: 'analyst@nexusseoul.local' },
    select: { id: true }
  });

  const asset = await prisma.asset.create({
    data: {
      assetCode: 'SEOUL-YEOUIDO-01',
      slug: 'seoul-yeouido-01-core-office-tower',
      name: 'Yeouido Core Office Tower',
      assetClass: AssetClass.OFFICE,
      assetType: 'Office',
      assetSubtype: 'Core',
      market: 'KR',
      status: AssetStatus.UNDER_REVIEW,
      stage: AssetStage.STABILIZED,
      description:
        'Institutional Seoul office underwriting case centered on passing rent, rollover visibility, and recapitalization readiness.',
      ownerName: 'Han River Office Holdings',
      sponsorName: 'Nexus Seoul Capital',
      developmentSummary:
        'Stabilized CBD office tower with moderate near-term rollover, current TI / LC requirements, and a live recapitalization workstream.',
      landAreaSqm: 4200,
      grossFloorAreaSqm: 34100,
      rentableAreaSqm: 28500,
      purchasePriceKrw: 312000000000,
      occupancyAssumptionPct: 93,
      stabilizedOccupancyPct: 95,
      tenantAssumption: 'Diversified domestic office tenants with staggered rollover',
      capexAssumptionKrw: 6800000000,
      opexAssumptionKrw: 14500000000,
      financingLtvPct: 52,
      financingRatePct: 4.9,
      holdingPeriodYears: 5,
      exitCapRatePct: 4.9,
      lastEnrichedAt: now,
      address: {
        create: {
          line1: '1 International Finance-ro',
          district: 'Yeongdeungpo-gu',
          city: 'Seoul',
          province: 'Seoul',
          country: 'KR',
          parcelId: '11-1234-5678',
          sourceLabel: 'seed'
        }
      },
      siteProfile: {
        create: {
          gridAvailability: 'CBD utility service confirmed',
          fiberAccess: 'Multi-carrier building access',
          latencyProfile: 'Prime CBD office corridor',
          floodRiskScore: 1.4,
          wildfireRiskScore: 0.1,
          seismicRiskScore: 0.6,
          siteNotes: 'Walking distance to Yeouido Station with direct boulevard frontage.',
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: now
        }
      },
      buildingSnapshot: {
        create: {
          zoning: 'Commercial',
          buildingCoveragePct: 58,
          floorAreaRatioPct: 830,
          grossFloorAreaSqm: 34100,
          structureDescription: 'High-rise steel and concrete office tower',
          redundancyTier: null,
          coolingType: 'Central HVAC',
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: now
        }
      },
      permitSnapshot: {
        create: {
          permitStage: 'Operational',
          zoningApprovalStatus: 'Approved',
          environmentalReviewStatus: 'Complete',
          powerApprovalStatus: 'N/A',
          timelineNotes: 'Existing operational office asset with no outstanding permit path items.',
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: now,
          reviewStatus: ReviewStatus.APPROVED,
          reviewedAt: now,
          reviewedById: reviewer?.id ?? null,
          reviewNotes: 'Operational permit status confirmed against building ledger and management packet.'
        }
      },
      energySnapshot: {
        create: {
          utilityName: 'KEPCO Seoul',
          tariffKrwPerKwh: 132,
          renewableAvailabilityPct: 18,
          pueTarget: null,
          backupFuelHours: null,
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: now,
          reviewStatus: ReviewStatus.APPROVED,
          reviewedAt: now,
          reviewedById: reviewer?.id ?? null,
          reviewNotes: 'Base-building utility and backup context confirmed for current operating case.'
        }
      },
      officeDetail: {
        create: {
          stabilizedRentPerSqmMonthKrw: 38500,
          otherIncomeKrw: 850000000,
          vacancyAllowancePct: 4.5,
          creditLossPct: 1.2,
          tenantImprovementReserveKrw: 1200000000,
          leasingCommissionReserveKrw: 420000000,
          annualCapexReserveKrw: 380000000,
          weightedAverageLeaseTermYears: 4.4
        }
      },
      marketSnapshot: {
        create: {
          metroRegion: 'Yeouido',
          vacancyPct: 6.2,
          colocationRatePerKwKrw: null,
          capRatePct: 4.8,
          debtCostPct: 4.7,
          inflationPct: 2.1,
          constructionCostPerMwKrw: null,
          discountRatePct: 7.4,
          marketNotes: 'Prime Seoul office cap rates remain disciplined, while incentive pressure is concentrated in secondary stock.',
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: now
        }
      },
      macroSeries: {
        create: buildMacroSeriesSeedRows('KR', {
          metroRegion: 'Seoul Office',
          vacancyPct: 6.2,
          colocationRatePerKwKrw: 0,
          capRatePct: 4.8,
          debtCostPct: 4.7,
          inflationPct: 2.1,
          constructionCostPerMwKrw: 0,
          discountRatePct: 7.4,
          marketNotes: 'Seoul office macro baseline'
        })
      },
      comparableSet: {
        create: {
          name: 'Prime office comps',
          valuationDate: now,
          calibrationMode: 'Market evidence',
          notes: 'CBD office transaction calibration set',
          entries: {
            create: [
              {
                label: 'Yeouido Office Comp A',
                location: 'Yeouido',
                assetType: 'Office',
                stage: AssetStage.STABILIZED,
                sourceLink: 'https://example.com/yeouido-office-a',
                powerCapacityMw: null,
                grossFloorAreaSqm: 32000,
                occupancyPct: 94,
                pricePerMwKrw: null,
                valuationKrw: 298000000000,
                monthlyRatePerKwKrw: null,
                capRatePct: 4.7,
                discountRatePct: 7.2,
                weightPct: 0.55,
                notes: 'Prime office transaction in the same office cluster.'
              },
              {
                label: 'CBD Office Comp B',
                location: 'Central Seoul',
                assetType: 'Office',
                stage: AssetStage.STABILIZED,
                sourceLink: 'https://example.com/cbd-office-b',
                powerCapacityMw: null,
                grossFloorAreaSqm: 35500,
                occupancyPct: 92,
                pricePerMwKrw: null,
                valuationKrw: 338000000000,
                monthlyRatePerKwKrw: null,
                capRatePct: 4.9,
                discountRatePct: 7.5,
                weightPct: 0.45,
                notes: 'Comparable prime Seoul office pricing point.'
              }
            ]
          }
        }
      },
      transactionComps: {
        create: [
          {
            market: 'KR',
            region: 'Yeouido',
            comparableType: 'Prime office',
            transactionDate: new Date('2025-12-01T00:00:00.000Z'),
            priceKrw: 298000000000,
            pricePerSqmKrw: 9312500,
            capRatePct: 4.7,
            buyerType: 'Institutional',
            sellerType: 'Fund',
            sourceLink: 'https://example.com/yeouido-office-a',
            sourceSystem: 'seed-manual',
            sourceStatus: SourceStatus.FRESH
          },
          {
            market: 'KR',
            region: 'Central Seoul',
            comparableType: 'CBD office',
            transactionDate: new Date('2025-11-01T00:00:00.000Z'),
            priceKrw: 338000000000,
            pricePerSqmKrw: 9510000,
            capRatePct: 4.9,
            buyerType: 'Institutional',
            sellerType: 'Developer',
            sourceLink: 'https://example.com/cbd-office-b',
            sourceSystem: 'seed-manual',
            sourceStatus: SourceStatus.FRESH
          }
        ]
      },
      rentComps: {
        create: [
          {
            market: 'KR',
            region: 'Yeouido',
            comparableType: 'Prime office',
            observationDate: new Date('2026-02-01T00:00:00.000Z'),
            monthlyRentPerSqmKrw: 39200,
            occupancyPct: 95,
            escalationPct: 2.4,
            sourceLink: 'https://example.com/yeouido-rent-1',
            sourceSystem: 'seed-manual',
            sourceStatus: SourceStatus.FRESH
          },
          {
            market: 'KR',
            region: 'Yeouido',
            comparableType: 'Prime office',
            observationDate: new Date('2026-01-01T00:00:00.000Z'),
            monthlyRentPerSqmKrw: 38100,
            occupancyPct: 94,
            escalationPct: 2.2,
            sourceLink: 'https://example.com/yeouido-rent-2',
            sourceSystem: 'seed-manual',
            sourceStatus: SourceStatus.FRESH
          }
        ]
      },
      marketIndicatorSeries: {
        create: [
          {
            market: 'KR',
            region: 'Yeouido',
            indicatorKey: 'office_vacancy_pct',
            observationDate: new Date('2026-02-01T00:00:00.000Z'),
            value: 6.2,
            unit: '%',
            sourceSystem: 'seed-manual',
            sourceStatus: SourceStatus.FRESH
          },
          {
            market: 'KR',
            region: 'Yeouido',
            indicatorKey: 'office_market_rent_krw_sqm_month',
            observationDate: new Date('2026-02-01T00:00:00.000Z'),
            value: 39200,
            unit: 'KRW/sqm/mo',
            sourceSystem: 'seed-manual',
            sourceStatus: SourceStatus.FRESH
          },
          {
            market: 'KR',
            region: 'Yeouido',
            indicatorKey: 'office_transaction_volume_index',
            observationDate: new Date('2026-02-01T00:00:00.000Z'),
            value: 104,
            unit: 'index',
            sourceSystem: 'seed-manual',
            sourceStatus: SourceStatus.FRESH
          }
        ]
      },
      pipelineProjects: {
        create: [
          {
            projectName: 'Yeouido South Office Redevelopment',
            market: 'KR',
            region: 'Yeouido',
            stageLabel: 'Pre-construction',
            expectedDeliveryDate: new Date('2028-06-01T00:00:00.000Z'),
            expectedAreaSqm: 42000,
            sponsorName: 'Local REIT JV',
            sourceLink: 'https://example.com/yeouido-pipeline',
            sourceSystem: 'seed-manual',
            sourceStatus: SourceStatus.FRESH
          }
        ]
      },
      leases: {
        create: [
          {
            tenantName: 'Domestic Securities House',
            status: LeaseStatus.ACTIVE,
            leasedKw: 0,
            startYear: 1,
            termYears: 5,
            baseRatePerKwKrw: 0,
            annualEscalationPct: 2.5,
            probabilityPct: 100,
            renewProbabilityPct: 70,
            downtimeMonths: 6,
            notes: 'Anchor office tenant; approved evidence references lease schedule and WALE support.',
            reviewStatus: ReviewStatus.APPROVED,
            reviewedAt: now,
            reviewedById: reviewer?.id ?? null,
            reviewNotes: 'Anchor tenant rent roll and WALE support verified against the lease abstract.'
          }
        ]
      },
      ownershipRecords: {
        create: {
          ownerName: 'Han River Office Holdings',
          entityType: 'SPV',
          ownershipPct: 100,
          effectiveDate: now,
          sourceSystem: 'seed-manual',
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: now,
          reviewStatus: ReviewStatus.APPROVED,
          reviewedAt: now,
          reviewedById: reviewer?.id ?? null,
          reviewNotes: 'Ownership chain validated against title and corporate registry pack.'
        }
      },
      encumbranceRecords: {
        create: {
          encumbranceType: 'Mortgage',
          holderName: 'Korean Institutional Bank',
          securedAmountKrw: 162000000000,
          priorityRank: 1,
          statusLabel: 'Outstanding',
          effectiveDate: now,
          sourceSystem: 'seed-manual',
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: now,
          reviewStatus: ReviewStatus.APPROVED,
          reviewedAt: now,
          reviewedById: reviewer?.id ?? null,
          reviewNotes: 'Senior mortgage amount and priority verified against register extract.'
        }
      },
      planningConstraints: {
        create: {
          constraintType: 'Planning review',
          title: 'Minor lobby refurbishment review',
          severity: 'Low',
          description: 'Small fit-out coordination item only; no major entitlement blocker.',
          sourceSystem: 'seed-manual',
          sourceStatus: SourceStatus.FRESH,
          sourceUpdatedAt: now,
          reviewStatus: ReviewStatus.APPROVED,
          reviewedAt: now,
          reviewedById: reviewer?.id ?? null,
          reviewNotes: 'No material planning blocker for current stabilized operating case.'
        }
      },
      taxAssumption: {
        create: {
          acquisitionTaxPct: 4.6,
          vatRecoveryPct: 0,
          propertyTaxPct: 0.33,
          insurancePct: 0.1,
          corporateTaxPct: 24.2,
          withholdingTaxPct: 15.4,
          exitTaxPct: 1,
          notes: 'Office operating case with standard domestic tax leakage.'
        }
      },
      spvStructure: {
        create: {
          legalStructure: 'Domestic office SPV',
          managementFeePct: 1.1,
          performanceFeePct: 8,
          promoteThresholdPct: 9,
          promoteSharePct: 12,
          reserveTargetMonths: 4,
          distributionWaterfall: 'Standard office core-plus waterfall',
          notes: 'Core-plus office holding structure.'
        }
      },
      debtFacilities: {
        create: {
          facilityType: DebtFacilityType.TERM,
          lenderName: 'Korean Institutional Bank',
          commitmentKrw: 162000000000,
          drawnAmountKrw: 162000000000,
          interestRatePct: 4.9,
          amortizationProfile: AmortizationProfile.MORTGAGE,
          amortizationTermMonths: 120,
          reserveMonths: 4,
          notes: 'Refinancing-ready senior term facility.',
          draws: {
            create: [{ drawYear: 0, drawMonth: 1, amountKrw: 162000000000, notes: 'Acquisition refinancing draw' }]
          }
        }
      },
      documents: {
        create: [
          {
            title: 'Office Rent Roll',
            documentType: DocumentType.LEASE,
            sourceLink: 'https://example.com/office-rent-roll',
            aiSummary: 'Current rent roll, WALE, rollover profile, and TI / LC reserve support.',
            documentHash: 'hash-office-rent-roll',
            latestStoragePath: 'seed/SEOUL-YEOUIDO-01/1.pdf',
            versions: {
              create: {
                versionNumber: 1,
                fileName: 'Office Rent Roll.pdf',
                fileType: 'application/pdf',
                fileSize: 4096,
                storagePath: 'seed/SEOUL-YEOUIDO-01/1.pdf',
                sourceLink: 'https://example.com/office-rent-roll',
                extractedText: 'Rent roll and WALE support package.',
                aiSummary: 'Current rent roll, WALE, rollover profile, and TI / LC reserve support.',
                documentHash: 'hash-office-rent-roll'
              }
            }
          },
          {
            title: 'Title And Mortgage Extract',
            documentType: DocumentType.OTHER,
            sourceLink: 'https://example.com/office-title',
            aiSummary: 'Title chain, mortgage position, and ownership confirmation for the office SPV.',
            documentHash: 'hash-office-title',
            latestStoragePath: 'seed/SEOUL-YEOUIDO-01/2.pdf',
            versions: {
              create: {
                versionNumber: 1,
                fileName: 'Title And Mortgage Extract.pdf',
                fileType: 'application/pdf',
                fileSize: 4096,
                storagePath: 'seed/SEOUL-YEOUIDO-01/2.pdf',
                sourceLink: 'https://example.com/office-title',
                extractedText: 'Title extract and mortgage schedule.',
                aiSummary: 'Title chain, mortgage position, and ownership confirmation for the office SPV.',
                documentHash: 'hash-office-title'
              }
            }
          },
          {
            title: 'Office Market Update',
            documentType: DocumentType.IM,
            sourceLink: 'https://example.com/office-market-update',
            aiSummary: 'Prime Seoul office market update with rent, vacancy, and transaction context.',
            documentHash: 'hash-office-market',
            latestStoragePath: 'seed/SEOUL-YEOUIDO-01/3.pdf',
            versions: {
              create: {
                versionNumber: 1,
                fileName: 'Office Market Update.pdf',
                fileType: 'application/pdf',
                fileSize: 4096,
                storagePath: 'seed/SEOUL-YEOUIDO-01/3.pdf',
                sourceLink: 'https://example.com/office-market-update',
                extractedText: 'Prime Seoul office market update and benchmark pack.',
                aiSummary: 'Prime Seoul office market update with rent, vacancy, and transaction context.',
                documentHash: 'hash-office-market'
              }
            }
          }
        ]
      },
      readinessProject: {
        create: {
          readinessStatus: ReadinessStatus.READY,
          packageName: 'Yeouido Core Office Review Package',
          reviewPhase: 'Committee review',
          legalStructure: 'Domestic office SPV',
          nextAction: 'Confirm refinance terms and circulate IC memo.'
        }
      }
    },
    include: {
      address: true,
      siteProfile: true,
      buildingSnapshot: true,
      permitSnapshot: true,
      energySnapshot: true,
      marketSnapshot: true,
      officeDetail: true,
      comparableSet: { include: { entries: true } },
      capexLineItems: true,
      leases: { include: { steps: true } },
      taxAssumption: true,
      spvStructure: true,
      macroSeries: { orderBy: { observationDate: 'desc' } },
      debtFacilities: { include: { draws: true } },
      readinessProject: { include: { onchainRecords: true } }
    }
  });

  await promoteAssetSnapshotsToFeatures(asset.id, prisma);

  const analysis = await buildValuationAnalysis({
    asset,
    address: asset.address,
    siteProfile: asset.siteProfile,
    buildingSnapshot: asset.buildingSnapshot,
    permitSnapshot: asset.permitSnapshot,
    energySnapshot: asset.energySnapshot,
    marketSnapshot: asset.marketSnapshot,
    officeDetail: asset.officeDetail,
    comparableSet: asset.comparableSet,
    capexLineItems: asset.capexLineItems,
    leases: asset.leases,
    taxAssumption: asset.taxAssumption,
    spvStructure: asset.spvStructure,
    debtFacilities: asset.debtFacilities,
    creditAssessments: []
  });
  const sensitivityRuns = buildSensitivityRuns(analysis);
  const macroRegime = buildMacroRegimeSnapshot(asset.macroSeries);
  const run = await prisma.valuationRun.create({
    data: {
      assetId: asset.id,
      runLabel: 'Seeded office underwriting case',
      status: 'COMPLETED',
      engineVersion: 'kr-office-v1',
      confidenceScore: analysis.confidenceScore,
      baseCaseValueKrw: analysis.baseCaseValueKrw,
      underwritingMemo: analysis.underwritingMemo,
      keyRisks: analysis.keyRisks,
      ddChecklist: analysis.ddChecklist,
      assumptions: {
        ...(analysis.assumptions as Prisma.InputJsonObject),
        macroRegime
      } as Prisma.InputJsonValue,
      provenance: analysis.provenance as Prisma.InputJsonValue,
      scenarios: { create: analysis.scenarios },
      sensitivityRuns: {
        create: sensitivityRuns.map((run) => ({
          runType: run.runType,
          title: run.title,
          baselineMetricName: run.baselineMetricName,
          baselineMetricValue: run.baselineMetricValue,
          summary: run.summary as Prisma.InputJsonValue,
          points: {
            create: run.points.map((point) => ({
              variableKey: point.variableKey,
              variableLabel: point.variableLabel,
              shockLabel: point.shockLabel,
              shockValue: point.shockValue,
              metricName: point.metricName,
              metricValue: point.metricValue,
              deltaPct: point.deltaPct,
              sortOrder: point.sortOrder
            }))
          }
        }))
      }
    }
  });

  await prisma.asset.update({
    where: { id: asset.id },
    data: { currentValuationKrw: analysis.baseCaseValueKrw }
  });

  await stageReviewReadiness(asset.id, prisma);

  const latestDocument = await prisma.document.findFirst({
    where: { assetId: asset.id },
    orderBy: { updatedAt: 'desc' }
  });

  if (latestDocument) {
    await prisma.onchainRecord.create({
      data: {
        readinessProjectId: asset.readinessProject!.id,
        documentId: latestDocument.id,
        recordType: 'DOCUMENT_HASH',
        status: ReadinessStatus.ANCHORED,
        chainId: '11155111',
        txHash: '0xofficeanchor1234567890',
        anchoredAt: new Date('2026-03-26T10:00:00.000Z'),
        payload: {
          documentHash: latestDocument.documentHash,
          documentTitle: latestDocument.title,
          latestValuationId: run.id
        } as Prisma.InputJsonValue
      }
    });
  }
}

async function seedPortfolioAndCapitalShell() {
  const [officeAsset, dataCenterAsset] = await Promise.all([
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-YEOUIDO-01' },
      include: {
        debtFacilities: true,
        documents: {
          orderBy: {
            updatedAt: 'desc'
          },
          take: 1
        }
      }
    }),
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-GANGSEO-01' },
      include: {
        debtFacilities: true,
        documents: {
          orderBy: {
            updatedAt: 'desc'
          },
          take: 1
        }
      }
    })
  ]);

  if (!officeAsset || !dataCenterAsset) {
    throw new Error('Seed assets for portfolio shell are missing');
  }

  const portfolio = await prisma.portfolio.create({
    data: {
      code: 'KR-INCOME-I',
      name: 'Korea Income & Infrastructure Portfolio I',
      strategy: 'Core Plus',
      baseCurrency: 'KRW',
      market: 'KR',
      thesis:
        'Mixed office and digital infrastructure hold strategy focused on income durability, covenant discipline, and evidence-backed exit planning.',
      assets: {
        create: [
          {
            assetId: officeAsset.id,
            status: PortfolioAssetStatus.ACTIVE,
            acquisitionDate: new Date('2025-12-20T00:00:00.000Z'),
            acquisitionCostKrw: 312000000000,
            currentHoldValueKrw: 328000000000,
            ownershipPct: 100,
            holdPeriodYears: 5,
            assetManager: 'Seoul Asset Management Team',
            notes: 'Held office seed for portfolio OS.',
            businessPlans: {
              create: {
                title: 'Yeouido Leasing And Capex Plan',
                executiveSummary:
                  'Hold through rent reversion and selective lobby/cooling system capex, with an exit case tied to CBD cap-rate compression.',
                holdStrategy: 'Protect occupancy while capturing mark-to-market on mid-term rollover.',
                leasingPlan: 'Close current downtime, defend anchor occupancy, and improve passing-to-market spread.',
                capexPlan: 'Lobby refresh, HVAC optimization, and amenity package upgrades.',
                financingPlan: 'Maintain current senior term debt while preserving DSCR cushion.',
                dispositionPlan: 'Target domestic institutional office buyer universe within 24 months.'
              }
            },
            initiatives: {
              create: [
                {
                  title: 'Anchor tenant rollover capture',
                  category: 'leasing',
                  status: TaskStatus.IN_PROGRESS,
                  priority: TaskPriority.HIGH,
                  ownerName: 'Office Asset Management Lead',
                  targetDate: new Date('2026-05-31T00:00:00.000Z'),
                  summary: 'Negotiate anchor rollover package and defend occupancy before the next committee packet.',
                  nextStep: 'Issue final TI / LC proposal and confirm board timing.'
                },
                {
                  title: 'Amenity upgrade leasing package',
                  category: 'capex',
                  status: TaskStatus.OPEN,
                  priority: TaskPriority.MEDIUM,
                  ownerName: 'Capital Projects Team',
                  targetDate: new Date('2026-06-15T00:00:00.000Z'),
                  summary: 'Tie lobby and arrival refresh to leasing campaign before summer marketing.',
                  nextStep: 'Lock final contractor budget and tenant communications plan.'
                }
              ]
            },
            monthlyKpis: {
              create: [
                {
                  periodStart: new Date('2025-10-01T00:00:00.000Z'),
                  occupancyPct: 92,
                  leasedAreaSqm: 34100,
                  passingRentKrwPerSqmMonth: 39800,
                  marketRentKrwPerSqmMonth: 42300,
                  effectiveRentKrwPerSqmMonth: 38900,
                  noiKrw: 1760000000,
                  opexKrw: 410000000,
                  capexKrw: 120000000,
                  debtOutstandingKrw: 158000000000,
                  debtServiceCoverage: 1.42,
                  ltvPct: 48.4,
                  navKrw: 324000000000,
                  cashBalanceKrw: 6200000000
                },
                {
                  periodStart: new Date('2025-11-01T00:00:00.000Z'),
                  occupancyPct: 92.5,
                  leasedAreaSqm: 34300,
                  passingRentKrwPerSqmMonth: 40100,
                  marketRentKrwPerSqmMonth: 42500,
                  effectiveRentKrwPerSqmMonth: 39200,
                  noiKrw: 1790000000,
                  opexKrw: 408000000,
                  capexKrw: 98000000,
                  debtOutstandingKrw: 157200000000,
                  debtServiceCoverage: 1.44,
                  ltvPct: 48.1,
                  navKrw: 325500000000,
                  cashBalanceKrw: 6400000000
                },
                {
                  periodStart: new Date('2025-12-01T00:00:00.000Z'),
                  occupancyPct: 93,
                  leasedAreaSqm: 34500,
                  passingRentKrwPerSqmMonth: 40400,
                  marketRentKrwPerSqmMonth: 42800,
                  effectiveRentKrwPerSqmMonth: 39500,
                  noiKrw: 1820000000,
                  opexKrw: 405000000,
                  capexKrw: 86000000,
                  debtOutstandingKrw: 156400000000,
                  debtServiceCoverage: 1.46,
                  ltvPct: 47.8,
                  navKrw: 327000000000,
                  cashBalanceKrw: 6700000000
                },
                {
                  periodStart: new Date('2026-01-01T00:00:00.000Z'),
                  occupancyPct: 93.2,
                  leasedAreaSqm: 34600,
                  passingRentKrwPerSqmMonth: 40600,
                  marketRentKrwPerSqmMonth: 43000,
                  effectiveRentKrwPerSqmMonth: 39700,
                  noiKrw: 1840000000,
                  opexKrw: 402000000,
                  capexKrw: 72000000,
                  debtOutstandingKrw: 155600000000,
                  debtServiceCoverage: 1.48,
                  ltvPct: 47.4,
                  navKrw: 328000000000,
                  cashBalanceKrw: 7000000000
                }
              ]
            },
            leaseRollSnapshots: {
              create: {
                asOfDate: new Date('2026-01-01T00:00:00.000Z'),
                next12MonthsExpiringPct: 14,
                next24MonthsExpiringPct: 29,
                weightedAverageLeaseTermYears: 4.8,
                passingRentKrwPerSqmMonth: 40600,
                marketRentKrwPerSqmMonth: 43000,
                occupancyPct: 93.2,
                watchlistSummary: 'Two mid-size tenants roll in the next 24 months; leasing spread remains positive.'
              }
            },
            budgets: {
              create: {
                fiscalYear: 2026,
                label: 'FY2026 Operating Budget',
                approvedAt: new Date('2025-12-15T00:00:00.000Z'),
                notes: 'Approved business-plan budget for hold year 1.',
                lineItems: {
                  create: [
                    {
                      category: 'NOI',
                      label: 'Net operating income',
                      annualBudgetKrw: 22100000000,
                      ytdActualKrw: 1840000000,
                      varianceKrw: -120000000
                    },
                    {
                      category: 'LEASING',
                      label: 'TI / LC reserve',
                      annualBudgetKrw: 2600000000,
                      ytdActualKrw: 72000000,
                      varianceKrw: 11000000
                    },
                    {
                      category: 'OPEX',
                      label: 'Operating expenses',
                      annualBudgetKrw: 4900000000,
                      ytdActualKrw: 402000000,
                      varianceKrw: -8000000
                    }
                  ]
                }
              }
            },
            capexProjects: {
              create: [
                {
                  name: 'Lobby And Arrival Refresh',
                  category: 'amenity',
                  statusLabel: 'IN_PROGRESS',
                  budgetKrw: 1800000000,
                  approvedBudgetKrw: 1900000000,
                  spentToDateKrw: 620000000,
                  targetCompletionDate: new Date('2026-06-30T00:00:00.000Z'),
                  summary: 'Entry experience refresh to support rent reversion.'
                }
              ]
            },
            covenantTests: {
              create: officeAsset.debtFacilities[0]
                ? [
                    {
                      debtFacilityId: officeAsset.debtFacilities[0].id,
                      asOfDate: new Date('2026-01-31T00:00:00.000Z'),
                      testName: 'DSCR',
                      thresholdValue: 1.25,
                      actualValue: 1.48,
                      unit: 'x',
                      status: CovenantStatus.PASS
                    },
                    {
                      debtFacilityId: officeAsset.debtFacilities[0].id,
                      asOfDate: new Date('2026-01-31T00:00:00.000Z'),
                      testName: 'LTV',
                      thresholdValue: 55,
                      actualValue: 47.4,
                      unit: '%',
                      status: CovenantStatus.PASS
                    }
                  ]
                : []
            },
            exitCases: {
              create: {
                caseLabel: '2027 Institutional Office Exit',
                statusLabel: 'ACTIVE',
                underwritingValueKrw: 342000000000,
                targetExitDate: new Date('2027-09-30T00:00:00.000Z'),
                targetCapRatePct: 4.9,
                targetIrrPct: 13.2,
                probabilityPct: 58,
                buyerUniverse: 'Domestic pension / insurance office buyers',
                notes: 'Exit case tied to stabilized occupancy and rent reversion.'
              }
            }
          },
          {
            assetId: dataCenterAsset.id,
            status: PortfolioAssetStatus.WATCHLIST,
            acquisitionDate: new Date('2025-08-01T00:00:00.000Z'),
            acquisitionCostKrw: 286000000000,
            currentHoldValueKrw: 301000000000,
            ownershipPct: 100,
            holdPeriodYears: 6,
            assetManager: 'Digital Infrastructure Team',
            notes: 'Held infrastructure seed for portfolio OS.',
            businessPlans: {
              create: {
                title: 'Seoul Campus Stabilization Plan',
                executiveSummary:
                  'Stabilize the first cloud anchor, clear remaining power allocation, and prepare a refinance once contracted revenue is fully visible.',
                holdStrategy: 'Increase contracted MW and preserve refinancing optionality.',
                leasingPlan: 'Convert AI pod pipeline and push staged ramp toward full utilization.',
                capexPlan: 'Electrical redundancy and white-space fit-out finishing package.',
                financingPlan: 'Bridge from construction debt into term debt once DSCR and anchor contracts season.',
                dispositionPlan: 'Maintain optionality for infra buyers or hold within core-plus vehicle.'
              }
            },
            initiatives: {
              create: [
                {
                  title: 'AI pod conversion and term sheet close',
                  category: 'leasing',
                  status: TaskStatus.BLOCKED,
                  priority: TaskPriority.URGENT,
                  ownerName: 'Digital Infra Leasing Lead',
                  targetDate: new Date('2026-04-30T00:00:00.000Z'),
                  summary: 'Close the AI training pod to clear the covenant watch and support refinance timing.',
                  blockerSummary: 'Tenant board approval and utility redundancy sign-off are both outstanding.',
                  nextStep: 'Run sponsor / tenant utility workshop and collect revised board pack.'
                },
                {
                  title: 'Refinance lender pack readiness',
                  category: 'refinance',
                  status: TaskStatus.IN_PROGRESS,
                  priority: TaskPriority.HIGH,
                  ownerName: 'Portfolio Finance Team',
                  targetDate: new Date('2026-06-10T00:00:00.000Z'),
                  summary: 'Prepare updated lender pack once fit-out and lease evidence are fully approved.',
                  nextStep: 'Roll approved evidence and Q2 KPI trend into the refinance materials.'
                }
              ]
            },
            monthlyKpis: {
              create: [
                {
                  periodStart: new Date('2025-10-01T00:00:00.000Z'),
                  occupancyPct: 68,
                  leasedAreaSqm: 51000,
                  passingRentKrwPerSqmMonth: 221000,
                  marketRentKrwPerSqmMonth: 225000,
                  effectiveRentKrwPerSqmMonth: 214000,
                  noiKrw: 2480000000,
                  opexKrw: 690000000,
                  capexKrw: 410000000,
                  debtOutstandingKrw: 97800000000,
                  debtServiceCoverage: 1.19,
                  ltvPct: 61.5,
                  navKrw: 294000000000,
                  cashBalanceKrw: 7100000000
                },
                {
                  periodStart: new Date('2025-11-01T00:00:00.000Z'),
                  occupancyPct: 69,
                  leasedAreaSqm: 51600,
                  passingRentKrwPerSqmMonth: 223000,
                  marketRentKrwPerSqmMonth: 226000,
                  effectiveRentKrwPerSqmMonth: 216000,
                  noiKrw: 2520000000,
                  opexKrw: 684000000,
                  capexKrw: 380000000,
                  debtOutstandingKrw: 97200000000,
                  debtServiceCoverage: 1.2,
                  ltvPct: 61.1,
                  navKrw: 296000000000,
                  cashBalanceKrw: 7400000000
                },
                {
                  periodStart: new Date('2025-12-01T00:00:00.000Z'),
                  occupancyPct: 70.5,
                  leasedAreaSqm: 52300,
                  passingRentKrwPerSqmMonth: 224000,
                  marketRentKrwPerSqmMonth: 227000,
                  effectiveRentKrwPerSqmMonth: 217000,
                  noiKrw: 2570000000,
                  opexKrw: 679000000,
                  capexKrw: 330000000,
                  debtOutstandingKrw: 96800000000,
                  debtServiceCoverage: 1.22,
                  ltvPct: 60.7,
                  navKrw: 298000000000,
                  cashBalanceKrw: 7700000000
                },
                {
                  periodStart: new Date('2026-01-01T00:00:00.000Z'),
                  occupancyPct: 71.2,
                  leasedAreaSqm: 52800,
                  passingRentKrwPerSqmMonth: 225000,
                  marketRentKrwPerSqmMonth: 228000,
                  effectiveRentKrwPerSqmMonth: 218000,
                  noiKrw: 2610000000,
                  opexKrw: 675000000,
                  capexKrw: 290000000,
                  debtOutstandingKrw: 96400000000,
                  debtServiceCoverage: 1.23,
                  ltvPct: 60.4,
                  navKrw: 301000000000,
                  cashBalanceKrw: 7900000000
                }
              ]
            },
            leaseRollSnapshots: {
              create: {
                asOfDate: new Date('2026-01-01T00:00:00.000Z'),
                next12MonthsExpiringPct: 22,
                next24MonthsExpiringPct: 39,
                weightedAverageLeaseTermYears: 3.6,
                passingRentKrwPerSqmMonth: 225000,
                marketRentKrwPerSqmMonth: 228000,
                occupancyPct: 71.2,
                watchlistSummary: 'AI training pod remains unsigned and drives the next 24-month rollover concentration.'
              }
            },
            budgets: {
              create: {
                fiscalYear: 2026,
                label: 'FY2026 Asset Management Budget',
                approvedAt: new Date('2025-12-20T00:00:00.000Z'),
                notes: 'Budget focused on leasing and fit-out completion.',
                lineItems: {
                  create: [
                    {
                      category: 'NOI',
                      label: 'Net operating income',
                      annualBudgetKrw: 31500000000,
                      ytdActualKrw: 2610000000,
                      varianceKrw: -140000000
                    },
                    {
                      category: 'CAPEX',
                      label: 'Residual fit-out and electrical works',
                      annualBudgetKrw: 4200000000,
                      ytdActualKrw: 290000000,
                      varianceKrw: 40000000
                    },
                    {
                      category: 'OPEX',
                      label: 'Operating expenses',
                      annualBudgetKrw: 8100000000,
                      ytdActualKrw: 675000000,
                      varianceKrw: -12000000
                    }
                  ]
                }
              }
            },
            capexProjects: {
              create: [
                {
                  name: 'Electrical Redundancy Completion',
                  category: 'electrical',
                  statusLabel: 'IN_PROGRESS',
                  budgetKrw: 2600000000,
                  approvedBudgetKrw: 2600000000,
                  spentToDateKrw: 1440000000,
                  targetCompletionDate: new Date('2026-05-31T00:00:00.000Z'),
                  summary: 'Final redundancy package before term refinancing.'
                }
              ]
            },
            covenantTests: {
              create: dataCenterAsset.debtFacilities[0]
                ? [
                    {
                      debtFacilityId: dataCenterAsset.debtFacilities[0].id,
                      asOfDate: new Date('2026-01-31T00:00:00.000Z'),
                      testName: 'DSCR',
                      thresholdValue: 1.25,
                      actualValue: 1.23,
                      unit: 'x',
                      status: CovenantStatus.WATCH,
                      cureNotes: 'Close AI pod lease and complete fit-out before refinance.'
                    },
                    {
                      debtFacilityId: dataCenterAsset.debtFacilities[0].id,
                      asOfDate: new Date('2026-01-31T00:00:00.000Z'),
                      testName: 'LTV',
                      thresholdValue: 62,
                      actualValue: 60.4,
                      unit: '%',
                      status: CovenantStatus.PASS
                    }
                  ]
                : []
            },
            exitCases: {
              create: {
                caseLabel: '2028 Infrastructure Exit',
                statusLabel: 'ACTIVE',
                underwritingValueKrw: 336000000000,
                targetExitDate: new Date('2028-06-30T00:00:00.000Z'),
                targetCapRatePct: 5.9,
                targetIrrPct: 14.1,
                probabilityPct: 46,
                buyerUniverse: 'Infra funds / digital infrastructure strategics',
                notes: 'Exit case depends on full anchor lease visibility and refinance cleanup.'
              }
            }
          }
        ]
      }
    }
  });

  const fund = await prisma.fund.create({
    data: {
      code: 'HIRF-I',
      name: 'Han River Real Estate Fund I',
      strategy: 'Core Plus / Value Add',
      baseCurrency: 'KRW',
      targetSizeKrw: 850000000000,
      committedCapitalKrw: 530000000000,
      investedCapitalKrw: 342000000000,
      dryPowderKrw: 188000000000,
      vintageYear: 2025,
      thesis: 'Korean office and digital infrastructure strategy with review-gated research and disciplined capital formation.',
      portfolioId: portfolio.id,
      vehicles: {
        create: [
          {
            name: 'HIRF-I Main Vehicle',
            vehicleType: VehicleType.FUND,
            jurisdiction: 'KR',
            assetClassFocus: 'OFFICE / DATA_CENTER'
          },
          {
            name: 'Yeouido Holdco SPV',
            vehicleType: VehicleType.SPV,
            jurisdiction: 'KR',
            assetClassFocus: 'OFFICE'
          }
        ]
      },
      mandates: {
        create: [
          {
            title: 'Domestic Pension Income Sleeve',
            investorName: 'Han River Pension',
            strategy: 'Income-first Korean real estate',
            targetAumKrw: 220000000000,
            statusLabel: 'ACTIVE'
          }
        ]
      }
    },
    include: {
      vehicles: true
    }
  });

  const investors = await prisma.$transaction([
    prisma.investor.create({
      data: {
        code: 'INV-HRP-01',
        name: 'Han River Pension',
        investorType: 'Pension',
        domicile: 'KR',
        contactName: 'Institutional Coverage',
        contactEmail: 'pension@example.com'
      }
    }),
    prisma.investor.create({
      data: {
        code: 'INV-SEM-02',
        name: 'Seoul Endowment Management',
        investorType: 'Endowment',
        domicile: 'KR',
        contactName: 'Alternatives Team',
        contactEmail: 'endowment@example.com'
      }
    })
  ]);

  const mainVehicle = fund.vehicles[0]!;

  await prisma.commitment.createMany({
    data: [
      {
        fundId: fund.id,
        vehicleId: mainVehicle.id,
        investorId: investors[0].id,
        commitmentKrw: 320000000000,
        calledKrw: 208000000000,
        distributedKrw: 22000000000,
        signedAt: new Date('2025-07-01T00:00:00.000Z'),
        statusLabel: 'ACTIVE'
      },
      {
        fundId: fund.id,
        vehicleId: mainVehicle.id,
        investorId: investors[1].id,
        commitmentKrw: 210000000000,
        calledKrw: 134000000000,
        distributedKrw: 8000000000,
        signedAt: new Date('2025-07-15T00:00:00.000Z'),
        statusLabel: 'ACTIVE'
      }
    ]
  });

  await prisma.capitalCall.createMany({
    data: [
      {
        fundId: fund.id,
        vehicleId: mainVehicle.id,
        callDate: new Date('2025-09-15T00:00:00.000Z'),
        dueDate: new Date('2025-09-30T00:00:00.000Z'),
        amountKrw: 120000000000,
        purpose: 'Initial acquisitions',
        status: CapitalCallStatus.FUNDED
      },
      {
        fundId: fund.id,
        vehicleId: mainVehicle.id,
        callDate: new Date('2026-02-10T00:00:00.000Z'),
        dueDate: new Date('2026-02-25T00:00:00.000Z'),
        amountKrw: 42000000000,
        purpose: 'Capex and leasing reserves',
        status: CapitalCallStatus.ISSUED
      }
    ]
  });

  await prisma.distribution.create({
    data: {
      fundId: fund.id,
      vehicleId: mainVehicle.id,
      distributionDate: new Date('2026-03-20T00:00:00.000Z'),
      amountKrw: 30000000000,
      purpose: 'Income distribution',
      status: DistributionStatus.PAID
    }
  });

  await prisma.investorReport.createMany({
    data: [
      {
        fundId: fund.id,
        reportType: InvestorReportType.QUARTERLY_UPDATE,
        releaseStatus: InvestorReportReleaseStatus.RELEASED,
        title: 'Q1 2026 Investor Update',
        periodEnd: new Date('2026-03-31T00:00:00.000Z'),
        draftSummary: 'Released quarterly investor letter covering occupancy, refinancing posture, and committee-approved business-plan actions.',
        reviewNotes: 'Released after capital activity reconciliation and operator sign-off.',
        publishedAt: new Date('2026-04-01T00:00:00.000Z'),
        storagePath: 'seed/funds/hirf-i/q1-2026-investor-update.pdf',
        notes: 'Released investor package anchored to portfolio KPI set.'
      },
      {
        fundId: fund.id,
        investorId: investors[0].id,
        reportType: InvestorReportType.QUARTERLY_UPDATE,
        releaseStatus: InvestorReportReleaseStatus.READY,
        title: 'Q2 2026 Pension Sleeve Draft',
        periodEnd: new Date('2026-06-30T00:00:00.000Z'),
        draftSummary: 'Draft LP update focused on leasing pipeline, covenant watch items, and staged refinance readiness.',
        reviewNotes: 'Awaiting final IC follow-up on the Seoul campus stabilization package before release.',
        notes: 'Held in ready state for controlled release after IC follow-up closes.'
      }
    ]
  });

  await prisma.ddqResponse.create({
    data: {
      fundId: fund.id,
      investorId: investors[0].id,
      title: 'Operations And Evidence Governance',
      question: 'How are underwriting evidence and hold KPIs governed across the platform?',
      answer:
        'All normalized underwriting evidence remains review-gated before promotion, and portfolio KPI / covenant summaries remain offchain within the same operating system.',
      statusLabel: 'COMPLETE'
    }
  });
}

async function seedCommitteeGovernance() {
  const meeting = await prisma.investmentCommitteeMeeting.create({
    data: {
      code: 'IC-2026-APR-15',
      title: 'April 2026 Korea Real Estate IC',
      status: 'SCHEDULED',
      scheduledFor: new Date('2026-04-15T01:00:00.000Z'),
      venueLabel: 'Seoul investment committee room',
      summary:
        'Agenda focused on office recapitalization approval and data-center packet conditioning before final lender circulation.'
    }
  });

  const [officeAsset, dataCenterAsset] = await Promise.all([
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-YEOUIDO-01' },
      include: {
        valuations: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      }
    }),
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-GANGSEO-01' },
      include: {
        valuations: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      }
    })
  ]);

  if (officeAsset?.valuations[0]) {
    await prisma.investmentCommitteePacket.create({
      data: {
        meetingId: meeting.id,
        assetId: officeAsset.id,
        valuationRunId: officeAsset.valuations[0].id,
        title: 'Yeouido Core Office Tower Recapitalization Packet',
        packetCode: 'ICPKT-SEOUL-YEOUIDO-2026Q2',
        status: 'LOCKED',
        preparedByLabel: 'analyst@nexusseoul.local',
        scheduledFor: new Date('2026-04-15T01:00:00.000Z'),
        lockedAt: new Date('2026-04-12T09:00:00.000Z'),
        packetFingerprint: 'icpkt-yeouido-2026q2',
        reportFingerprint: 'report-yeouido-2026q2',
        reviewPacketFingerprint: 'review-yeouido-2026q2',
        decisionSummary:
          'Recommend approval for recapitalization and hold-business-plan execution subject to final debt documentation.'
      }
    });
  }

  if (dataCenterAsset?.valuations[0]) {
    const packet = await prisma.investmentCommitteePacket.create({
      data: {
        meetingId: meeting.id,
        assetId: dataCenterAsset.id,
        valuationRunId: dataCenterAsset.valuations[0].id,
        title: 'Seoul Hyperscale Campus I Conditional Approval Packet',
        packetCode: 'ICPKT-SEOUL-GANGSEO-2026Q2',
        status: 'CONDITIONAL',
        preparedByLabel: 'analyst@nexusseoul.local',
        scheduledFor: new Date('2026-04-15T01:00:00.000Z'),
        lockedAt: new Date('2026-04-10T08:30:00.000Z'),
        packetFingerprint: 'icpkt-gangseo-2026q2',
        reportFingerprint: 'report-gangseo-2026q2',
        reviewPacketFingerprint: 'review-gangseo-2026q2',
        decisionSummary:
          'Conditional approval pending final utility allocation confirmation and lender-side diligence closeout.',
        followUpSummary: 'Track utility allocation letter and close lender diligence package before release.'
      }
    });

    await prisma.investmentCommitteeDecision.create({
      data: {
        packetId: packet.id,
        outcome: 'CONDITIONAL',
        decidedAt: new Date('2026-04-15T03:00:00.000Z'),
        decidedByLabel: 'IC Chair',
        notes:
          'Proceed with conditional approval only after utility confirmation is uploaded and lender diligence is marked complete.',
        followUpActions:
          'Upload final utility allocation letter; re-open packet only if debt terms materially widen.'
      }
    });
  }
}

async function seedDealExecution() {
  const [officeAsset, dataCenterAsset] = await Promise.all([
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-YEOUIDO-01' },
      include: {
        documents: {
          orderBy: { createdAt: 'asc' },
          take: 2
        }
      }
    }),
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-GANGSEO-01' },
      include: {
        documents: {
          orderBy: { createdAt: 'asc' },
          take: 2
        }
      }
    })
  ]);

  if (officeAsset) {
    await prisma.deal.create({
      data: {
        dealCode: 'DEAL-2026-0001',
        slug: 'deal-2026-0001-yeouido-office-recap',
        title: 'Yeouido Core Office Tower Recapitalization',
        stage: DealStage.IC,
        market: 'KR',
        city: 'Seoul',
        country: 'KR',
        assetClass: AssetClass.OFFICE,
        strategy: 'Core-plus recapitalization',
        headline: 'Direct owner recap with lender engagement already in motion and a live exclusivity window.',
        nextAction: 'Lock the final IC packet and clear lender comments on refinance covenants.',
        nextActionAt: new Date('2026-04-10T00:00:00.000Z'),
        targetCloseDate: new Date('2026-05-30T00:00:00.000Z'),
        sellerGuidanceKrw: 318000000000,
        bidGuidanceKrw: 312000000000,
        purchasePriceKrw: 312000000000,
        originationSource: DealOriginationSource.DIRECT_OWNER,
        originSummary: 'Owner-led recapitalization brought directly through an existing sponsor relationship.',
        statusLabel: 'ACTIVE',
        dealLead: 'analyst@nexusseoul.local',
        assetId: officeAsset.id,
        counterparties: {
          create: [
            {
              name: 'Han River Office Holdings',
              role: 'OWNER',
              company: 'Han River Office Holdings',
              email: 'owner@example.com',
              coverageOwner: 'lead underwriter',
              coverageStatus: RelationshipCoverageStatus.PRIMARY,
              lastContactAt: new Date('2026-04-06T00:00:00.000Z'),
              notes: 'Direct owner relationship; sponsor expects fast committee feedback.'
            },
            {
              name: 'Korean Institutional Bank',
              role: 'LENDER',
              company: 'Korean Institutional Bank',
              email: 'refi@example.com',
              coverageOwner: 'capital markets',
              coverageStatus: RelationshipCoverageStatus.PRIMARY,
              lastContactAt: new Date('2026-04-05T00:00:00.000Z'),
              notes: 'Refinancing bank is in diligence and covenant negotiation.'
            },
            {
              name: 'Seoul Office Advisor',
              role: 'ADVISOR',
              company: 'Seoul Office Advisor',
              coverageOwner: 'deal lead',
              coverageStatus: RelationshipCoverageStatus.BACKUP,
              lastContactAt: new Date('2026-04-02T00:00:00.000Z'),
              notes: 'Supports process management and lender workstream.'
            }
          ]
        },
        tasks: {
          create: [
            {
              title: 'Finalize IC packet release memo',
              description: 'Close remaining comments before the April IC agenda is locked.',
              status: TaskStatus.IN_PROGRESS,
              priority: TaskPriority.HIGH,
              ownerLabel: 'lead underwriter',
              dueDate: new Date('2026-04-10T00:00:00.000Z')
            },
            {
              title: 'Refinancing covenant markup',
              description: 'Resolve covenant headroom comments with lead lender.',
              status: TaskStatus.OPEN,
              priority: TaskPriority.HIGH,
              ownerLabel: 'capital markets',
              dueDate: new Date('2026-04-12T00:00:00.000Z')
            }
          ]
        },
        documentRequests: {
          create: [
            {
              title: 'Updated rent roll tie-out',
              category: 'Leasing',
              status: 'RECEIVED',
              priority: TaskPriority.HIGH,
              requestedAt: new Date('2026-04-01T00:00:00.000Z'),
              receivedAt: new Date('2026-04-03T00:00:00.000Z'),
              documentId: officeAsset.documents[0]?.id ?? null
            }
          ]
        },
        bidRevisions: {
          create: [
            {
              label: 'IC-ready recap bid',
              status: DealBidStatus.ACCEPTED,
              bidPriceKrw: 312000000000,
              depositKrw: 10000000000,
              exclusivityDays: 21,
              diligenceDays: 30,
              closeTimelineDays: 45,
              submittedAt: new Date('2026-04-04T00:00:00.000Z'),
              notes: 'Commercial paper agreed subject to committee release.'
            }
          ]
        },
        lenderQuotes: {
          create: [
            {
              facilityLabel: 'Senior refinance facility',
              status: DealLenderQuoteStatus.TERM_SHEET,
              amountKrw: 164000000000,
              ltvPct: 52,
              allInRatePct: 4.9,
              quotedAt: new Date('2026-04-05T00:00:00.000Z'),
              notes: 'Term sheet is live and tied to committee approval.'
            }
          ]
        },
        negotiationEvents: {
          create: [
            {
              eventType: DealNegotiationEventType.EXCLUSIVITY_GRANTED,
              title: 'Owner granted live exclusivity',
              effectiveAt: new Date('2026-04-04T00:00:00.000Z'),
              expiresAt: new Date('2026-04-25T00:00:00.000Z'),
              summary: 'Direct owner gave exclusivity while final packet and lender comments are cleared.'
            }
          ]
        },
        riskFlags: {
          create: [
            {
              title: 'Refinance covenant headroom',
              detail: 'Final DSCR headroom and capex reserve sizing still need lender confirmation.',
              severity: RiskSeverity.MEDIUM,
              statusLabel: 'OPEN'
            }
          ]
        },
        activityLogs: {
          create: [
            {
              activityType: ActivityType.NOTE,
              title: 'Owner process note',
              body: 'Owner wants certainty around committee timing before circulating final SPA mark-up.',
              createdByLabel: 'lead underwriter'
            }
          ]
        }
      }
    });
  }

  if (dataCenterAsset) {
    await prisma.deal.create({
      data: {
        dealCode: 'DEAL-2026-0002',
        slug: 'deal-2026-0002-seoul-campus-ai-pod',
        title: 'Seoul Hyperscale Campus I AI Pod Expansion',
        stage: DealStage.DD,
        market: 'KR',
        city: 'Seoul',
        country: 'KR',
        assetClass: AssetClass.DATA_CENTER,
        strategy: 'Digital infrastructure expansion',
        headline: 'Lender-channel process with active diligence but weaker process protection than the office recap.',
        nextAction: 'Rebuild exclusivity coverage and clear remaining power queue diligence.',
        nextActionAt: new Date('2026-04-11T00:00:00.000Z'),
        targetCloseDate: new Date('2026-06-20T00:00:00.000Z'),
        sellerGuidanceKrw: 268000000000,
        bidGuidanceKrw: 254000000000,
        purchasePriceKrw: 254000000000,
        originationSource: DealOriginationSource.LENDER_CHANNEL,
        originSummary: 'Process was surfaced through a refinancing lender seeking recapitalization certainty.',
        statusLabel: 'ACTIVE',
        dealLead: 'analyst@nexusseoul.local',
        assetId: dataCenterAsset.id,
        counterparties: {
          create: [
            {
              name: 'Refinancing Coverage Bank',
              role: 'LENDER',
              company: 'Refinancing Coverage Bank',
              coverageOwner: 'capital markets',
              coverageStatus: RelationshipCoverageStatus.PRIMARY,
              lastContactAt: new Date('2026-04-01T00:00:00.000Z'),
              notes: 'Primary lender channel originated the recapitalization path.'
            },
            {
              name: 'Seller Advisor',
              role: 'BROKER',
              company: 'Digital Infra Advisor',
              coverageOwner: 'deal team',
              coverageStatus: RelationshipCoverageStatus.BACKUP,
              lastContactAt: new Date('2026-03-20T00:00:00.000Z'),
              notes: 'Brokered process is active, but no fresh exclusivity is in force.'
            }
          ]
        },
        tasks: {
          create: [
            {
              title: 'Power queue diligence refresh',
              description: 'Update utility queue memo and operator commentary before the next DD call.',
              status: TaskStatus.BLOCKED,
              priority: TaskPriority.URGENT,
              ownerLabel: 'infrastructure underwriting',
              dueDate: new Date('2026-04-09T00:00:00.000Z')
            },
            {
              title: 'Rebuild exclusivity path',
              description: 'Secure a fresh exclusivity window before final diligence spend accelerates.',
              status: TaskStatus.OPEN,
              priority: TaskPriority.HIGH,
              ownerLabel: 'deal lead',
              dueDate: new Date('2026-04-15T00:00:00.000Z')
            }
          ]
        },
        documentRequests: {
          create: [
            {
              title: 'Utility queue confirmation',
              category: 'Power',
              status: 'REQUESTED',
              priority: TaskPriority.URGENT,
              requestedAt: new Date('2026-04-02T00:00:00.000Z'),
              dueDate: new Date('2026-04-09T00:00:00.000Z'),
              documentId: null
            }
          ]
        },
        bidRevisions: {
          create: [
            {
              label: 'Seller feedback bid',
              status: DealBidStatus.COUNTERED,
              bidPriceKrw: 254000000000,
              submittedAt: new Date('2026-04-01T00:00:00.000Z'),
              notes: 'Seller countered price and process protection terms.'
            }
          ]
        },
        lenderQuotes: {
          create: [
            {
              facilityLabel: 'Expansion recap bridge',
              status: DealLenderQuoteStatus.INDICATED,
              amountKrw: 138000000000,
              ltvPct: 54,
              quotedAt: new Date('2026-04-01T00:00:00.000Z'),
              notes: 'Indicative bridge quote pending power diligence.'
            }
          ]
        },
        negotiationEvents: {
          create: [
            {
              eventType: DealNegotiationEventType.SELLER_COUNTER,
              title: 'Seller countered price and timing',
              effectiveAt: new Date('2026-04-03T00:00:00.000Z'),
              summary: 'Seller asked for tighter timing without extending exclusivity.'
            }
          ]
        },
        riskFlags: {
          create: [
            {
              title: 'No live exclusivity',
              detail: 'Process remains exposed to competitive drift while power diligence stays open.',
              severity: RiskSeverity.HIGH,
              statusLabel: 'OPEN'
            }
          ]
        },
        activityLogs: {
          create: [
            {
              activityType: ActivityType.NOTE,
              title: 'Broker process note',
              body: 'Seller is sensitive to time and may reopen the process if power diligence drags.',
              createdByLabel: 'deal lead'
            }
          ]
        }
      }
    });
  }
}

async function main() {
  await prisma.investmentCommitteeDecision.deleteMany();
  await prisma.investmentCommitteePacket.deleteMany();
  await prisma.investmentCommitteeMeeting.deleteMany();
  await prisma.dealExecutionProbabilitySnapshot.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.riskFlag.deleteMany();
  await prisma.dealNegotiationEvent.deleteMany();
  await prisma.dealLenderQuote.deleteMany();
  await prisma.dealBidRevision.deleteMany();
  await prisma.dealDocumentRequest.deleteMany();
  await prisma.task.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.ddqResponse.deleteMany();
  await prisma.investorReport.deleteMany();
  await prisma.distribution.deleteMany();
  await prisma.capitalCall.deleteMany();
  await prisma.commitment.deleteMany();
  await prisma.investor.deleteMany();
  await prisma.mandate.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.fund.deleteMany();
  await prisma.exitCase.deleteMany();
  await prisma.covenantTest.deleteMany();
  await prisma.capexProject.deleteMany();
  await prisma.budgetLineItem.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.leaseRollSnapshot.deleteMany();
  await prisma.monthlyAssetKpi.deleteMany();
  await prisma.assetManagementInitiative.deleteMany();
  await prisma.businessPlan.deleteMany();
  await prisma.portfolioAsset.deleteMany();
  await prisma.portfolio.deleteMany();
  await prisma.onchainRecord.deleteMany();
  await prisma.readinessProject.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();
  await prisma.creditAssessment.deleteMany();
  await prisma.financialLineItem.deleteMany();
  await prisma.financialStatement.deleteMany();
  await prisma.counterparty.deleteMany();
  await prisma.debtDraw.deleteMany();
  await prisma.debtFacility.deleteMany();
  await prisma.spvStructure.deleteMany();
  await prisma.taxAssumption.deleteMany();
  await prisma.leaseStep.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.capexLineItem.deleteMany();
  await prisma.comparableEntry.deleteMany();
  await prisma.comparableSet.deleteMany();
  await prisma.sensitivityPoint.deleteMany();
  await prisma.sensitivityRun.deleteMany();
  await prisma.valuationScenario.deleteMany();
  await prisma.valuationRun.deleteMany();
  await prisma.macroSeries.deleteMany();
  await prisma.marketSnapshot.deleteMany();
  await prisma.energySnapshot.deleteMany();
  await prisma.permitSnapshot.deleteMany();
  await prisma.buildingSnapshot.deleteMany();
  await prisma.siteProfile.deleteMany();
  await prisma.address.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.sourceOverride.deleteMany();
  await prisma.sourceCache.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.adminIdentityBinding.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      {
        name: 'Platform Admin',
        email: 'admin@nexusseoul.local',
        role: UserRole.ADMIN
      },
      {
        name: 'Lead Underwriter',
        email: 'analyst@nexusseoul.local',
        role: UserRole.ANALYST
      }
    ]
  });

  await prisma.adminIdentityBinding.create({
    data: {
      provider: 'oidc',
      subject: 'seed-unmapped-analyst',
      userId: null,
      emailSnapshot: 'analyst@nexusseoul.local',
      identifierSnapshot: 'analyst@nexusseoul.local',
      lastSeenAt: new Date('2026-04-01T09:00:00.000Z')
    }
  });

  await seedAsset({
    assetCode: 'SEOUL-GANGSEO-01',
    slug: 'seoul-gangseo-01-seoul-hyperscale-campus',
    name: 'Seoul Hyperscale Campus I',
    city: 'Seoul',
    province: 'Seoul',
    district: 'Gangseo-gu',
    line1: '148 Gonghang-daero',
    description:
      'Institutional review case for a west Seoul hyperscale development with strong metro demand, dense fiber routes, and a still-active power allocation workstream.',
    stage: AssetStage.POWER_REVIEW,
    status: AssetStatus.UNDER_REVIEW,
    powerCapacityMw: 32,
    targetItLoadMw: 28,
    landAreaSqm: 18400,
    grossFloorAreaSqm: 72800,
    occupancyAssumptionPct: 78,
    tenantAssumption: 'Two domestic cloud anchor tenants plus one AI training pod',
    capexAssumptionKrw: 246000000000,
    opexAssumptionKrw: 9200000000,
    financingLtvPct: 58,
    financingRatePct: 5.2,
    ownerName: 'Seoul Infra Development SPC',
    sponsorName: 'Nexus Infrastructure Advisory',
    developmentSummary: 'Power-led underwriting case positioned for investment committee circulation.',
    siteProfile: {
      gridAvailability: '154 kV line available within 1.2 km',
      fiberAccess: 'Dual carrier route confirmed',
      latencyProfile: 'Sub-10ms to Seoul IX core',
      floodRiskScore: 1.8,
      wildfireRiskScore: 0.8,
      seismicRiskScore: 1.1,
      siteNotes: 'Drainage works and utility redundancy remain on the priority diligence list.'
    },
    buildingSnapshot: {
      zoning: 'Semi-industrial',
      buildingCoveragePct: 54,
      floorAreaRatioPct: 289,
      structureDescription: '12-storey reinforced concrete shell with rooftop mechanical deck',
      redundancyTier: 'Tier III+ design target',
      coolingType: 'Hybrid chilled-water'
    },
    permitSnapshot: {
      permitStage: 'Power allocation review',
      zoningApprovalStatus: 'Compliant',
      environmentalReviewStatus: 'Traffic and noise study submitted',
      powerApprovalStatus: 'Pending final utility committee slot',
      timelineNotes: 'Expected permit conversion within 2 quarters subject to utility queue.'
    },
    energySnapshot: {
      utilityName: 'KEPCO West Seoul',
      substationDistanceKm: 1.2,
      tariffKrwPerKwh: 143,
      renewableAvailabilityPct: 32,
      pueTarget: 1.31,
      backupFuelHours: 48
    },
    marketSnapshot: {
      metroRegion: 'Seoul Northwest',
      vacancyPct: 6.1,
      colocationRatePerKwKrw: 220000,
      capRatePct: 6.1,
      debtCostPct: 5.2,
      inflationPct: 2.3,
      constructionCostPerMwKrw: 7800000000,
      discountRatePct: 9.4,
      marketNotes: 'Hyperscale demand remains strong, but power queue discipline drives the committee timeline.'
    },
    comparableEntries: [
      {
        label: 'West Seoul Hyperscale Reference',
        location: 'Seoul',
        assetType: 'Data Center',
        stage: AssetStage.PERMITTING,
        sourceLink: 'https://example.com/comp-seoul-west',
        powerCapacityMw: 30,
        grossFloorAreaSqm: 70200,
        occupancyPct: 80,
        valuationKrw: 352000000000,
        monthlyRatePerKwKrw: 226000,
        capRatePct: 5.95,
        discountRatePct: 9.1,
        weightPct: 0.4,
        notes: 'Metro hyperscale campus with similar utility queue constraints.'
      },
      {
        label: 'Incheon AI Campus Transaction',
        location: 'Incheon',
        assetType: 'Data Center',
        stage: AssetStage.CONSTRUCTION,
        sourceLink: 'https://example.com/comp-incheon-ai',
        powerCapacityMw: 26,
        grossFloorAreaSqm: 60100,
        occupancyPct: 76,
        valuationKrw: 284000000000,
        monthlyRatePerKwKrw: 214000,
        capRatePct: 6.2,
        discountRatePct: 9.6,
        weightPct: 0.35,
        notes: 'AI-ready corridor comparable with similar tenant profile.'
      },
      {
        label: 'Greater Seoul Colocation Yield Marker',
        location: 'Gyeonggi',
        assetType: 'Colocation',
        stage: AssetStage.LIVE,
        sourceLink: 'https://example.com/comp-gyeonggi-colo',
        powerCapacityMw: 18,
        grossFloorAreaSqm: 41300,
        occupancyPct: 88,
        valuationKrw: 192000000000,
        monthlyRatePerKwKrw: 208000,
        capRatePct: 6.35,
        discountRatePct: 9.4,
        weightPct: 0.25,
        notes: 'Live colocation campus used to anchor terminal yield expectations.'
      }
    ],
    capexLineItems: buildCapexLineItems(246000000000, 0.15),
    leases: [
      {
        tenantName: 'Domestic Cloud Anchor A',
        status: LeaseStatus.SIGNED,
        leasedKw: 12000,
        startYear: 2,
        termYears: 7,
        baseRatePerKwKrw: 226000,
        annualEscalationPct: 2.5,
        probabilityPct: 92,
        renewProbabilityPct: 65,
        downtimeMonths: 3,
        fitOutCostKrw: 7800000000,
        notes: 'Anchor pre-lease with phased fit-out.',
        steps: [
          {
            stepOrder: 1,
            startYear: 2,
            endYear: 3,
            ratePerKwKrw: 226000,
            leasedKw: 12000,
            occupancyPct: 92,
            notes: 'Phase 1 delivery'
          },
          {
            stepOrder: 2,
            startYear: 4,
            endYear: 8,
            ratePerKwKrw: 233000,
            leasedKw: 12000,
            annualEscalationPct: 2.5,
            occupancyPct: 100,
            notes: 'Post-ramp stabilized term'
          }
        ]
      },
      {
        tenantName: 'AI Training Pod',
        status: LeaseStatus.PIPELINE,
        leasedKw: 6000,
        startYear: 3,
        termYears: 5,
        baseRatePerKwKrw: 242000,
        annualEscalationPct: 2.8,
        probabilityPct: 72,
        renewProbabilityPct: 55,
        downtimeMonths: 4,
        fitOutCostKrw: 4100000000,
        notes: 'High-density AI pod under negotiation.'
      }
    ],
    taxAssumption: {
      acquisitionTaxPct: 4.6,
      vatRecoveryPct: 92,
      propertyTaxPct: 0.34,
      insurancePct: 0.11,
      corporateTaxPct: 24.2,
      withholdingTaxPct: 15.4,
      exitTaxPct: 1.2,
      notes: 'Korea SPC holdco assumptions for committee base case.'
    },
    spvStructure: {
      legalStructure: 'Development SPC with operating manager',
      managementFeePct: 1.2,
      performanceFeePct: 8,
      promoteThresholdPct: 10,
      promoteSharePct: 15,
      reserveTargetMonths: 6,
      distributionWaterfall: 'Operating cash to reserves, debt service, investor pref, sponsor promote.',
      notes: 'Indicative waterfall pending counsel sign-off.'
    },
    debtFacilities: [
      {
        facilityType: DebtFacilityType.CONSTRUCTION,
        lenderName: 'Korea Infra Construction Bank',
        commitmentKrw: 98000000000,
        drawnAmountKrw: 98000000000,
        interestRatePct: 5.4,
        upfrontFeePct: 1,
        commitmentFeePct: 0.25,
        gracePeriodMonths: 18,
        amortizationTermMonths: 84,
        amortizationProfile: AmortizationProfile.SCULPTED,
        sculptedTargetDscr: 1.3,
        balloonPct: 15,
        reserveMonths: 6,
        notes: 'Indicative construction-to-term facility.',
        draws: [
          { drawYear: 1, drawMonth: 2, amountKrw: 54000000000, notes: 'Initial shell/core draw' },
          { drawYear: 2, drawMonth: 6, amountKrw: 44000000000, notes: 'Electrical and fit-out draw' }
        ]
      }
    ],
    documents: [
      {
        title: 'Power Allocation Review Memo',
        documentType: DocumentType.POWER_STUDY,
        sourceLink: 'https://example.com/power-review',
        aiSummary: 'Utility diligence memo covering allocation timing, redundancy assumptions, and queue positioning.',
        documentHash: 'hash-seoul-power'
      },
      {
        title: 'Investment Committee Draft Model',
        documentType: DocumentType.MODEL,
        sourceLink: 'https://example.com/ic-model',
        aiSummary: 'Scenario workbook for bull, base, and bear underwriting review.',
        documentHash: 'hash-seoul-model'
      }
    ],
    readinessStatus: ReadinessStatus.READY
  });

  await seedAsset({
    assetCode: 'INCHEON-CHEONGNA-02',
    slug: 'incheon-cheongna-02-ai-colocation-campus',
    name: 'Incheon AI Colocation Campus',
    city: 'Incheon',
    province: 'Incheon',
    district: 'Seo-gu',
    line1: '55 Cheomdan-ro',
    description:
      'Institutional underwriting case focused on AI-ready colocation capacity in the Incheon west corridor, with stronger renewables access and a moderate planning risk profile.',
    stage: AssetStage.PERMITTING,
    status: AssetStatus.UNDER_REVIEW,
    powerCapacityMw: 24,
    targetItLoadMw: 21,
    landAreaSqm: 16100,
    grossFloorAreaSqm: 58400,
    occupancyAssumptionPct: 73,
    tenantAssumption: 'AI inferencing and enterprise colocation mix',
    capexAssumptionKrw: 182000000000,
    opexAssumptionKrw: 7400000000,
    financingLtvPct: 55,
    financingRatePct: 5.1,
    ownerName: 'Cheongna Digital Infrastructure Co.',
    sponsorName: 'Harbor Latitude Capital',
    developmentSummary: 'West-corridor opportunity balancing AI demand with reclamation-area diligence.',
    siteProfile: {
      gridAvailability: '345 kV expansion corridor under review',
      fiberAccess: 'Carrier hotel adjacency planned',
      latencyProfile: 'Low-latency corridor to Seoul West and Incheon IX',
      floodRiskScore: 2.2,
      wildfireRiskScore: 0.9,
      seismicRiskScore: 1.3,
      siteNotes: 'Storm-surge hardening and groundwater management remain open diligence workstreams.'
    },
    buildingSnapshot: {
      zoning: 'Planned industrial',
      buildingCoveragePct: 49,
      floorAreaRatioPct: 241,
      structureDescription: '8-storey high-load hall and office block',
      redundancyTier: 'Tier III',
      coolingType: 'Direct-to-chip ready air-cooled chillers'
    },
    permitSnapshot: {
      permitStage: 'District review complete',
      zoningApprovalStatus: 'Conditional approval',
      environmentalReviewStatus: 'Community consultation ongoing',
      powerApprovalStatus: 'Transformer bay reservation requested',
      timelineNotes: 'Planning conversion tied to west-corridor substation works.'
    },
    energySnapshot: {
      utilityName: 'KEPCO Incheon',
      substationDistanceKm: 2.4,
      tariffKrwPerKwh: 137,
      renewableAvailabilityPct: 41,
      pueTarget: 1.28,
      backupFuelHours: 60
    },
    marketSnapshot: {
      metroRegion: 'Incheon / Seoul West',
      vacancyPct: 8.8,
      colocationRatePerKwKrw: 205000,
      capRatePct: 6.5,
      debtCostPct: 5.1,
      inflationPct: 2.3,
      constructionCostPerMwKrw: 7450000000,
      discountRatePct: 9.8,
      marketNotes: 'AI workload spillover provides demand support, but utility sequencing remains central to underwriting.'
    },
    comparableEntries: [
      {
        label: 'Incheon West Corridor Campus',
        location: 'Incheon',
        assetType: 'Data Center',
        stage: AssetStage.PERMITTING,
        sourceLink: 'https://example.com/comp-cheongna-west',
        powerCapacityMw: 22,
        grossFloorAreaSqm: 54800,
        occupancyPct: 74,
        valuationKrw: 238000000000,
        monthlyRatePerKwKrw: 209000,
        capRatePct: 6.35,
        discountRatePct: 9.7,
        weightPct: 0.45,
        notes: 'Closest west-corridor AI colocation comparable.'
      },
      {
        label: 'Songdo Inference Cluster',
        location: 'Incheon',
        assetType: 'AI-ready colocation',
        stage: AssetStage.CONSTRUCTION,
        sourceLink: 'https://example.com/comp-songdo-inference',
        powerCapacityMw: 20,
        grossFloorAreaSqm: 50100,
        occupancyPct: 70,
        valuationKrw: 212000000000,
        monthlyRatePerKwKrw: 201000,
        capRatePct: 6.55,
        discountRatePct: 9.95,
        weightPct: 0.3,
        notes: 'Inference-heavy demand profile with similar cooling design.'
      },
      {
        label: 'Seoul West Overflow Marker',
        location: 'Seoul West',
        assetType: 'Colocation',
        stage: AssetStage.LIVE,
        sourceLink: 'https://example.com/comp-seoul-west-overflow',
        powerCapacityMw: 17,
        grossFloorAreaSqm: 39200,
        occupancyPct: 87,
        valuationKrw: 176000000000,
        monthlyRatePerKwKrw: 214000,
        capRatePct: 6.25,
        discountRatePct: 9.5,
        weightPct: 0.25,
        notes: 'Used for terminal stabilization calibration.'
      }
    ],
    capexLineItems: buildCapexLineItems(182000000000, 0.14),
    leases: [
      {
        tenantName: 'Enterprise Colocation Suite',
        status: LeaseStatus.SIGNED,
        leasedKw: 8000,
        startYear: 2,
        termYears: 6,
        baseRatePerKwKrw: 208000,
        annualEscalationPct: 2.3,
        probabilityPct: 86,
        renewProbabilityPct: 58,
        downtimeMonths: 3,
        fitOutCostKrw: 3600000000,
        notes: 'Signed enterprise suite pre-commitment.'
      },
      {
        tenantName: 'AI Inference Cloud Pod',
        status: LeaseStatus.PIPELINE,
        leasedKw: 5000,
        startYear: 3,
        termYears: 5,
        baseRatePerKwKrw: 219000,
        annualEscalationPct: 2.7,
        probabilityPct: 68,
        renewProbabilityPct: 52,
        downtimeMonths: 4,
        fitOutCostKrw: 2900000000,
        notes: 'Pipeline tenant tied to GPU inference deployment.'
      }
    ],
    taxAssumption: {
      acquisitionTaxPct: 4.6,
      vatRecoveryPct: 91,
      propertyTaxPct: 0.36,
      insurancePct: 0.12,
      corporateTaxPct: 24.2,
      withholdingTaxPct: 15.4,
      exitTaxPct: 1.1,
      notes: 'Indicative tax leakage for Incheon hold structure.'
    },
    spvStructure: {
      legalStructure: 'Holdco / propco SPC',
      managementFeePct: 1.3,
      performanceFeePct: 8,
      promoteThresholdPct: 10.5,
      promoteSharePct: 15,
      reserveTargetMonths: 6,
      distributionWaterfall: 'Reserve and debt service before preferred distribution.',
      notes: 'Base waterfall pending investor paper.'
    },
    debtFacilities: [
      {
        facilityType: DebtFacilityType.CONSTRUCTION,
        lenderName: 'Harbor Project Finance Desk',
        commitmentKrw: 76000000000,
        drawnAmountKrw: 76000000000,
        interestRatePct: 5.3,
        upfrontFeePct: 0.95,
        commitmentFeePct: 0.25,
        gracePeriodMonths: 18,
        amortizationTermMonths: 72,
        amortizationProfile: AmortizationProfile.SCULPTED,
        sculptedTargetDscr: 1.28,
        balloonPct: 12,
        reserveMonths: 6,
        notes: 'Construction facility sized off west-corridor AI take-up.',
        draws: [
          { drawYear: 1, drawMonth: 3, amountKrw: 43000000000, notes: 'District and shell package' },
          { drawYear: 2, drawMonth: 5, amountKrw: 33000000000, notes: 'Cooling and fit-out package' }
        ]
      }
    ],
    documents: [
      {
        title: 'District Planning Diligence Pack',
        documentType: DocumentType.PERMIT,
        sourceLink: 'https://example.com/cheongna-permit',
        aiSummary: 'Planning pack covering zoning conditions, district approval sequence, and environmental consultation notes.',
        documentHash: 'hash-incheon-permit'
      },
      {
        title: 'Renewables Access Analysis',
        documentType: DocumentType.REPORT,
        sourceLink: 'https://example.com/cheongna-renewables',
        aiSummary: 'Review note summarizing renewable procurement options and expected tariff benefits.',
        documentHash: 'hash-incheon-renewables'
      }
    ],
    readinessStatus: ReadinessStatus.NOT_STARTED
  });

  await seedAsset({
    assetCode: 'BUSAN-MYEONGJI-03',
    slug: 'busan-myeongji-03-edge-compute-park',
    name: 'Busan Edge Compute Park',
    city: 'Busan',
    province: 'Busan',
    district: 'Gangseo-gu',
    line1: '88 Myeongji Osean City 11-ro',
    description:
      'Regional underwriting case for a southeast edge-compute park serving maritime, gaming, and content-delivery workloads, with a longer lease-up curve but lower unit build costs.',
    stage: AssetStage.LAND_SECURED,
    status: AssetStatus.INTAKE,
    powerCapacityMw: 18,
    targetItLoadMw: 15,
    landAreaSqm: 21200,
    grossFloorAreaSqm: 46200,
    occupancyAssumptionPct: 64,
    tenantAssumption: 'Regional edge-compute and disaster-recovery tenants',
    capexAssumptionKrw: 126000000000,
    opexAssumptionKrw: 5900000000,
    financingLtvPct: 54,
    financingRatePct: 5.0,
    ownerName: 'Southeast Data Infrastructure Fund',
    sponsorName: 'Blue Current Partners',
    developmentSummary: 'Early-stage regional diligence case emphasizing power and edge-demand validation.',
    siteProfile: {
      gridAvailability: '154 kV feed with reserve land for substation bay',
      fiberAccess: 'Regional submarine cable backhaul proximity',
      latencyProfile: 'Strong southeast edge-compute profile',
      floodRiskScore: 2.7,
      wildfireRiskScore: 1.5,
      seismicRiskScore: 1.2,
      siteNotes: 'Typhoon hardening and marine corrosion design inputs should be verified before IC.'
    },
    buildingSnapshot: {
      zoning: 'Industrial mixed use',
      buildingCoveragePct: 46,
      floorAreaRatioPct: 210,
      structureDescription: '6-storey modular campus with expansion pads',
      redundancyTier: 'Tier III',
      coolingType: 'Seawater-assisted free cooling under review'
    },
    permitSnapshot: {
      permitStage: 'Schematic and pre-consultation',
      zoningApprovalStatus: 'Pre-consultation completed',
      environmentalReviewStatus: 'Marine weather addendum required',
      powerApprovalStatus: 'Preliminary comfort letter received',
      timelineNotes: 'Lease-up and port-area planning interfaces remain early-stage.'
    },
    energySnapshot: {
      utilityName: 'KEPCO Busan',
      substationDistanceKm: 3.1,
      tariffKrwPerKwh: 135,
      renewableAvailabilityPct: 35,
      pueTarget: 1.34,
      backupFuelHours: 72
    },
    marketSnapshot: {
      metroRegion: 'Busan Southeast',
      vacancyPct: 10.7,
      colocationRatePerKwKrw: 184000,
      capRatePct: 6.9,
      debtCostPct: 5.0,
      inflationPct: 2.3,
      constructionCostPerMwKrw: 6900000000,
      discountRatePct: 10.2,
      marketNotes: 'Regional demand profile requires deeper tenant validation than Seoul metro cases.'
    },
    comparableEntries: [
      {
        label: 'Busan Port Edge Facility',
        location: 'Busan',
        assetType: 'Edge compute',
        stage: AssetStage.LAND_SECURED,
        sourceLink: 'https://example.com/comp-busan-port-edge',
        powerCapacityMw: 16,
        grossFloorAreaSqm: 43100,
        occupancyPct: 62,
        valuationKrw: 141000000000,
        monthlyRatePerKwKrw: 187000,
        capRatePct: 6.8,
        discountRatePct: 10.1,
        weightPct: 0.5,
        notes: 'Regional edge deployment with similar logistics adjacency.'
      },
      {
        label: 'Daegu DR Cluster Marker',
        location: 'Daegu',
        assetType: 'Disaster recovery',
        stage: AssetStage.PERMITTING,
        sourceLink: 'https://example.com/comp-daegu-dr',
        powerCapacityMw: 14,
        grossFloorAreaSqm: 35600,
        occupancyPct: 66,
        valuationKrw: 118000000000,
        monthlyRatePerKwKrw: 179000,
        capRatePct: 7.05,
        discountRatePct: 10.35,
        weightPct: 0.3,
        notes: 'Regional DR asset informing downside pricing.'
      },
      {
        label: 'Southeast Industrial Data Hub',
        location: 'Ulsan',
        assetType: 'Industrial compute',
        stage: AssetStage.CONSTRUCTION,
        sourceLink: 'https://example.com/comp-ulsan-hub',
        powerCapacityMw: 15,
        grossFloorAreaSqm: 37200,
        occupancyPct: 68,
        valuationKrw: 126000000000,
        monthlyRatePerKwKrw: 182000,
        capRatePct: 6.95,
        discountRatePct: 10.2,
        weightPct: 0.2,
        notes: 'Southeast industrial edge compute calibration point.'
      }
    ],
    capexLineItems: buildCapexLineItems(126000000000, 0.17),
    leases: [
      {
        tenantName: 'Maritime Data Exchange',
        status: LeaseStatus.PIPELINE,
        leasedKw: 4000,
        startYear: 3,
        termYears: 6,
        baseRatePerKwKrw: 188000,
        annualEscalationPct: 2.1,
        probabilityPct: 61,
        renewProbabilityPct: 48,
        downtimeMonths: 5,
        fitOutCostKrw: 1800000000,
        notes: 'Regional anchor opportunity tied to maritime workloads.'
      },
      {
        tenantName: 'Gaming / CDN Edge Suite',
        status: LeaseStatus.PIPELINE,
        leasedKw: 3200,
        startYear: 4,
        termYears: 5,
        baseRatePerKwKrw: 181000,
        annualEscalationPct: 2,
        probabilityPct: 57,
        renewProbabilityPct: 44,
        downtimeMonths: 5,
        fitOutCostKrw: 1500000000,
        notes: 'Edge-content suite still in commercial review.'
      }
    ],
    taxAssumption: {
      acquisitionTaxPct: 4.6,
      vatRecoveryPct: 89,
      propertyTaxPct: 0.37,
      insurancePct: 0.13,
      corporateTaxPct: 24.2,
      withholdingTaxPct: 15.4,
      exitTaxPct: 1.1,
      notes: 'Regional base case with modest insurance loading.'
    },
    spvStructure: {
      legalStructure: 'Regional development SPC',
      managementFeePct: 1.35,
      performanceFeePct: 7,
      promoteThresholdPct: 11,
      promoteSharePct: 12,
      reserveTargetMonths: 7,
      distributionWaterfall: 'Higher reserve build due to regional ramp risk.',
      notes: 'Conservative reserve-heavy structure.'
    },
    debtFacilities: [
      {
        facilityType: DebtFacilityType.CONSTRUCTION,
        lenderName: 'Southeast Infra Bank',
        commitmentKrw: 58000000000,
        drawnAmountKrw: 58000000000,
        interestRatePct: 5.25,
        upfrontFeePct: 1,
        commitmentFeePct: 0.28,
        gracePeriodMonths: 24,
        amortizationTermMonths: 84,
        amortizationProfile: AmortizationProfile.SCULPTED,
        sculptedTargetDscr: 1.32,
        balloonPct: 18,
        reserveMonths: 7,
        notes: 'Regional construction facility with conservative sculpting.',
        draws: [
          { drawYear: 1, drawMonth: 4, amountKrw: 31000000000, notes: 'Land and shell package' },
          { drawYear: 2, drawMonth: 7, amountKrw: 27000000000, notes: 'MEP and fit-out package' }
        ]
      }
    ],
    documents: [
      {
        title: 'Site Assembly Memorandum',
        documentType: DocumentType.IM,
        sourceLink: 'https://example.com/busan-site',
        aiSummary: 'Site assembly memo summarizing land control, expansion pads, and early diligence status.',
        documentHash: 'hash-busan-site'
      }
    ],
    readinessStatus: ReadinessStatus.NOT_STARTED
  });

  await seedOfficeAsset();
  await seedDealExecution();
  await seedPortfolioAndCapitalShell();
  await seedCommitteeGovernance();

  console.log('Seed complete: Korean real-estate demo assets, deal execution pipeline, portfolio/fund operating shells, and committee governance workspace loaded.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
