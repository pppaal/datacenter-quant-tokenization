import {
  AmortizationProfile,
  AssetStage,
  AssetStatus,
  CapexCategory,
  DebtFacilityType,
  DocumentType,
  LeaseStatus,
  AssetClass,
  PrismaClient,
  ReadinessStatus,
  ReviewStatus,
  SourceStatus,
  UserRole
} from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { ingestFinancialStatement } from '../lib/services/financial-statements';

function deterministicDocumentHash(...parts: string[]): string {
  return createHash('sha256').update(parts.filter(Boolean).join(':')).digest('hex');
}
import { buildMacroRegimeProvenance, buildMacroRegimeSnapshot } from '../lib/services/macro/series';
import { stageReviewReadiness } from '../lib/services/readiness';
import { buildSensitivityRuns } from '../lib/services/sensitivity/engine';
import { promoteAssetSnapshotsToFeatures } from '../lib/services/feature-promotion';
import { buildValuationAnalysis } from '../lib/services/valuation-engine';
import { seedCommitteeGovernance } from './seeds/committee';
import { seedDealExecution } from './seeds/deals';
import { seedPortfolioAndCapitalShell } from './seeds/portfolio';
import { seedQuarterlyMarketBootstrap } from './seeds/quarterly';
import { seedResearchAndMacro } from './seeds/research';

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
    {
      category: CapexCategory.LAND,
      label: 'Land and assembly',
      amountKrw: totalCapexKrw * landPct,
      spendYear: 0
    },
    {
      category: CapexCategory.SHELL_CORE,
      label: 'Shell and core',
      amountKrw: totalCapexKrw * 0.22,
      spendYear: 1
    },
    {
      category: CapexCategory.ELECTRICAL,
      label: 'Electrical and utility interconnection',
      amountKrw: totalCapexKrw * 0.24,
      spendYear: 1
    },
    {
      category: CapexCategory.MECHANICAL,
      label: 'Cooling and mechanical package',
      amountKrw: totalCapexKrw * 0.16,
      spendYear: 1
    },
    {
      category: CapexCategory.IT_FIT_OUT,
      label: 'White space and fit-out',
      amountKrw: totalCapexKrw * 0.1,
      spendYear: 2
    },
    {
      category: CapexCategory.SOFT_COST,
      label: 'Professional fees and developer overhead',
      amountKrw: totalCapexKrw * 0.09,
      spendYear: 0
    },
    {
      category: CapexCategory.CONTINGENCY,
      label: 'Contingency',
      amountKrw: totalCapexKrw * (0.19 - landPct),
      spendYear: 2
    }
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

  // 12 monthly deltas (oldest → newest) for each series key.
  // Provides enough history for trend analysis, moving averages, and anomaly detection.
  const rows: Array<[string, string, string, number, number[]]> = [
    [
      'inflation_pct',
      'Inflation',
      '%',
      marketSnapshot.inflationPct,
      [-0.6, -0.5, -0.45, -0.35, -0.3, -0.25, -0.2, -0.15, -0.12, -0.1, -0.05, 0]
    ],
    [
      'debt_cost_pct',
      'Debt Cost',
      '%',
      marketSnapshot.debtCostPct,
      [-0.8, -0.7, -0.6, -0.55, -0.45, -0.35, -0.3, -0.25, -0.2, -0.15, -0.05, 0]
    ],
    [
      'cap_rate_pct',
      'Market Cap Rate',
      '%',
      marketSnapshot.capRatePct,
      [-0.5, -0.45, -0.4, -0.35, -0.3, -0.25, -0.2, -0.15, -0.1, -0.08, -0.03, 0]
    ],
    [
      'discount_rate_pct',
      'Discount Rate',
      '%',
      marketSnapshot.discountRatePct,
      [-0.5, -0.45, -0.4, -0.35, -0.3, -0.2, -0.15, -0.12, -0.1, -0.05, -0.02, 0]
    ],
    [
      'vacancy_pct',
      'Vacancy',
      '%',
      marketSnapshot.vacancyPct,
      [1.5, 1.3, 1.1, 0.9, 0.8, 0.7, 0.5, 0.4, 0.3, 0.2, 0.1, 0]
    ],
    [
      'policy_rate_pct',
      'Policy Rate',
      '%',
      3.5,
      [-0.75, -0.75, -0.5, -0.5, -0.5, -0.25, -0.25, -0.25, 0, 0, 0, 0]
    ],
    [
      'credit_spread_bps',
      'Credit Spread',
      'bps',
      180,
      [40, 35, 30, 25, 20, 15, 10, 5, 0, -5, -5, 0]
    ],
    [
      'rent_growth_pct',
      'Rent Growth',
      '%',
      2.1,
      [-0.5, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.3, 0.2, 0.1, 0.05, 0]
    ],
    [
      'transaction_volume_index',
      'Transaction Volume',
      'idx',
      98,
      [-15, -12, -10, -8, -6, -5, -4, -3, -2, -1, 0, 0]
    ],
    [
      'construction_cost_index',
      'Construction Cost',
      'idx',
      108,
      [-12, -10, -8, -7, -6, -5, -4, -3, -2, -1, -0.5, 0]
    ]
  ];

  return rows.flatMap(([seriesKey, label, unit, currentValue, deltas]) =>
    deltas.map((delta, index) => ({
      market,
      seriesKey,
      label,
      frequency: 'monthly',
      observationDate: monthOffset(baseDate, index - (deltas.length - 1)),
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
          reviewNotes:
            'Utility tariff, resiliency assumptions, and substation distance verified against latest diligence pack.'
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
          reviewNotes:
            'Power allocation timing and planning status confirmed for committee circulation.'
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
          reviewNotes:
            'Anchor lease economics and staged ramp verified against sponsor-marked term sheet.'
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
        reviewNotes:
          'Title chain and SPC ownership structure validated for current underwriting package.'
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

  await prisma.valuationRun.create({
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
            nextAction:
              'Institutional packet is staged and the latest document hash is anchored for committee review.'
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
          reviewNotes:
            'Operational permit status confirmed against building ledger and management packet.'
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
          reviewNotes:
            'Base-building utility and backup context confirmed for current operating case.'
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
          marketNotes:
            'Prime Seoul office cap rates remain disciplined, while incentive pressure is concentrated in secondary stock.',
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
            notes:
              'Anchor office tenant; approved evidence references lease schedule and WALE support.',
            reviewStatus: ReviewStatus.APPROVED,
            reviewedAt: now,
            reviewedById: reviewer?.id ?? null,
            reviewNotes:
              'Anchor tenant rent roll and WALE support verified against the lease abstract.'
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
            create: [
              {
                drawYear: 0,
                drawMonth: 1,
                amountKrw: 162000000000,
                notes: 'Acquisition refinancing draw'
              }
            ]
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
            documentHash: deterministicDocumentHash('seed-doc', 'office-rent-roll'),
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
                aiSummary:
                  'Current rent roll, WALE, rollover profile, and TI / LC reserve support.',
                documentHash: deterministicDocumentHash('seed-doc', 'office-rent-roll')
              }
            }
          },
          {
            title: 'Title And Mortgage Extract',
            documentType: DocumentType.OTHER,
            sourceLink: 'https://example.com/office-title',
            aiSummary:
              'Title chain, mortgage position, and ownership confirmation for the office SPV.',
            documentHash: deterministicDocumentHash('seed-doc', 'office-title'),
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
                aiSummary:
                  'Title chain, mortgage position, and ownership confirmation for the office SPV.',
                documentHash: deterministicDocumentHash('seed-doc', 'office-title')
              }
            }
          },
          {
            title: 'Office Market Update',
            documentType: DocumentType.IM,
            sourceLink: 'https://example.com/office-market-update',
            aiSummary:
              'Prime Seoul office market update with rent, vacancy, and transaction context.',
            documentHash: deterministicDocumentHash('seed-doc', 'office-market'),
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
                aiSummary:
                  'Prime Seoul office market update with rent, vacancy, and transaction context.',
                documentHash: deterministicDocumentHash('seed-doc', 'office-market')
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

async function main() {
  await prisma.investmentCommitteeDecision.deleteMany();
  await prisma.investmentCommitteePacket.deleteMany();
  await prisma.investmentCommitteeMeeting.deleteMany();
  await prisma.dealExecutionProbabilitySnapshot.deleteMany();
  await prisma.dealDiligenceDeliverable.deleteMany();
  await prisma.dealDiligenceWorkstream.deleteMany();
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
  await prisma.researchSnapshot.deleteMany();
  await prisma.submarket.deleteMany();
  await prisma.marketUniverse.deleteMany();
  await prisma.macroFactor.deleteMany();
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
    developmentSummary:
      'Power-led underwriting case positioned for investment committee circulation.',
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
      marketNotes:
        'Hyperscale demand remains strong, but power queue discipline drives the committee timeline.'
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
      distributionWaterfall:
        'Operating cash to reserves, debt service, investor pref, sponsor promote.',
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
          {
            drawYear: 2,
            drawMonth: 6,
            amountKrw: 44000000000,
            notes: 'Electrical and fit-out draw'
          }
        ]
      }
    ],
    documents: [
      {
        title: 'Power Allocation Review Memo',
        documentType: DocumentType.POWER_STUDY,
        sourceLink: 'https://example.com/power-review',
        aiSummary:
          'Utility diligence memo covering allocation timing, redundancy assumptions, and queue positioning.',
        documentHash: deterministicDocumentHash('seed-doc', 'seoul-power')
      },
      {
        title: 'Investment Committee Draft Model',
        documentType: DocumentType.MODEL,
        sourceLink: 'https://example.com/ic-model',
        aiSummary: 'Scenario workbook for bull, base, and bear underwriting review.',
        documentHash: deterministicDocumentHash('seed-doc', 'seoul-model')
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
    developmentSummary:
      'West-corridor opportunity balancing AI demand with reclamation-area diligence.',
    siteProfile: {
      gridAvailability: '345 kV expansion corridor under review',
      fiberAccess: 'Carrier hotel adjacency planned',
      latencyProfile: 'Low-latency corridor to Seoul West and Incheon IX',
      floodRiskScore: 2.2,
      wildfireRiskScore: 0.9,
      seismicRiskScore: 1.3,
      siteNotes:
        'Storm-surge hardening and groundwater management remain open diligence workstreams.'
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
      marketNotes:
        'AI workload spillover provides demand support, but utility sequencing remains central to underwriting.'
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
          {
            drawYear: 1,
            drawMonth: 3,
            amountKrw: 43000000000,
            notes: 'District and shell package'
          },
          {
            drawYear: 2,
            drawMonth: 5,
            amountKrw: 33000000000,
            notes: 'Cooling and fit-out package'
          }
        ]
      }
    ],
    documents: [
      {
        title: 'District Planning Diligence Pack',
        documentType: DocumentType.PERMIT,
        sourceLink: 'https://example.com/cheongna-permit',
        aiSummary:
          'Planning pack covering zoning conditions, district approval sequence, and environmental consultation notes.',
        documentHash: deterministicDocumentHash('seed-doc', 'incheon-permit')
      },
      {
        title: 'Renewables Access Analysis',
        documentType: DocumentType.REPORT,
        sourceLink: 'https://example.com/cheongna-renewables',
        aiSummary:
          'Review note summarizing renewable procurement options and expected tariff benefits.',
        documentHash: deterministicDocumentHash('seed-doc', 'incheon-renewables')
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
    developmentSummary:
      'Early-stage regional diligence case emphasizing power and edge-demand validation.',
    siteProfile: {
      gridAvailability: '154 kV feed with reserve land for substation bay',
      fiberAccess: 'Regional submarine cable backhaul proximity',
      latencyProfile: 'Strong southeast edge-compute profile',
      floodRiskScore: 2.7,
      wildfireRiskScore: 1.5,
      seismicRiskScore: 1.2,
      siteNotes:
        'Typhoon hardening and marine corrosion design inputs should be verified before IC.'
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
      marketNotes:
        'Regional demand profile requires deeper tenant validation than Seoul metro cases.'
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
        aiSummary:
          'Site assembly memo summarizing land control, expansion pads, and early diligence status.',
        documentHash: deterministicDocumentHash('seed-doc', 'busan-site')
      }
    ],
    readinessStatus: ReadinessStatus.NOT_STARTED
  });

  await seedOfficeAsset();
  await seedDealExecution(prisma);
  await seedPortfolioAndCapitalShell(prisma);
  await seedCommitteeGovernance(prisma);
  await seedResearchAndMacro(prisma);
  await seedQuarterlyMarketBootstrap(prisma);

  console.log(
    'Seed complete: Korean real-estate demo assets, deal execution pipeline, portfolio/fund operating shells, committee governance, and research workspace loaded.'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
