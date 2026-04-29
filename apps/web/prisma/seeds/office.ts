import {
  AmortizationProfile,
  AssetClass,
  AssetStage,
  AssetStatus,
  DebtFacilityType,
  DocumentType,
  LeaseStatus,
  type Prisma,
  type PrismaClient,
  ReadinessStatus,
  ReviewStatus,
  SourceStatus
} from '@prisma/client';
import { promoteAssetSnapshotsToFeatures } from '../../lib/services/feature-promotion';
import { buildMacroRegimeSnapshot } from '../../lib/services/macro/series';
import { stageReviewReadiness } from '../../lib/services/readiness';
import { buildSensitivityRuns } from '../../lib/services/sensitivity/engine';
import { buildValuationAnalysis } from '../../lib/services/valuation-engine';
import {
  buildMacroSeriesSeedRows,
  deterministicDocumentHash
} from './helpers';

/**
 * Seeds the Yeouido Core Office Tower demo asset along with its lease,
 * macro series, valuation run, sensitivity runs, and on-chain record.
 * Extracted from prisma/seed.ts so the orchestrator file can fit in a
 * single editor pane and so this domain can be re-seeded independently.
 */
export async function seedOfficeAsset(prisma: PrismaClient) {
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
