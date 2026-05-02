import {
  AmortizationProfile,
  AssetClass,
  AssetStage,
  AssetStatus,
  CapexCategory,
  DebtFacilityType,
  DocumentType,
  LeaseStatus,
  type Prisma,
  type PrismaClient,
  ReadinessStatus,
  ReviewStatus,
  SourceStatus
} from '@prisma/client';
import { ingestFinancialStatement } from '../../lib/services/financial-statements';
import { promoteAssetSnapshotsToFeatures } from '../../lib/services/feature-promotion';
import {
  buildMacroRegimeProvenance,
  buildMacroRegimeSnapshot
} from '../../lib/services/macro/series';
import { stageReviewReadiness } from '../../lib/services/readiness';
import { buildSensitivityRuns } from '../../lib/services/sensitivity/engine';
import { buildValuationAnalysis } from '../../lib/services/valuation-engine';
import { buildMacroSeriesSeedRows } from './helpers';

/**
 * Datacenter asset factory used by the demo seed. Constructs a complete
 * asset graph (asset row, parcels, leases, comps, capex, financials,
 * documents, macro series, valuation run, sensitivity, on-chain anchor)
 * from a fully-specified SeedAssetInput record.
 *
 * Extracted from prisma/seed.ts so the orchestrator file can fit in a
 * single editor pane and so this domain can be re-seeded independently
 * (matches the pattern already in committee / deals / portfolio /
 * quarterly / research / office seed modules).
 */

export type SeedAssetInput = {
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
export async function seedAsset(prisma: PrismaClient, input: SeedAssetInput) {
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

