import { classifyAssetTier } from '@/lib/services/research/tier-classifier';
import {
  AssetClass,
  AssetStatus,
  ReviewStatus,
  type Prisma,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildMacroFactorCreateInputs } from '@/lib/services/macro/factors';
import {
  buildMacroSeriesCreateInputs,
  normalizeMacroObservationDate
} from '@/lib/services/macro/series';
import { promoteAssetSnapshotsToFeatures } from '@/lib/services/feature-promotion';
import { createMemorySourceCacheStore, createPrismaSourceCacheStore } from '@/lib/sources/cache';
import { createBuildingPermitAdapter } from '@/lib/sources/adapters/building';
import { createClimateAdapter } from '@/lib/sources/adapters/climate';
import { createEnergyAdapter } from '@/lib/sources/adapters/energy';
import { createFxAdapter } from '@/lib/sources/adapters/fx';
import { createGeospatialAdapter } from '@/lib/sources/adapters/geospatial';
import { createMacroAdapter } from '@/lib/sources/adapters/macro';
import { createMarketAdapter } from '@/lib/sources/adapters/market';
import {
  assetIntakeSchema,
  assetIntakeUpdateSchema,
  buildAssetCreateInput,
  type AssetIntakeInput,
  type AssetIntakeUpdateInput
} from '@/lib/validations/asset';
import { type SupportedCurrency, resolveInputCurrency } from '@/lib/finance/currency';
import type { SourceCacheStore } from '@/lib/sources/types';

export const assetBundleInclude = {
  address: true,
  siteProfile: true,
  buildingSnapshot: true,
  permitSnapshot: true,
  energySnapshot: true,
  marketSnapshot: true,
  macroSeries: {
    orderBy: [
      {
        observationDate: 'desc' as const
      },
      {
        label: 'asc' as const
      }
    ],
    take: 24
  },
  macroFactors: {
    orderBy: [
      {
        observationDate: 'desc' as const
      },
      {
        label: 'asc' as const
      }
    ],
    take: 24
  },
  realizedOutcomes: {
    orderBy: {
      observationDate: 'desc' as const
    },
    take: 12
  },
  officeDetail: true,
  counterparties: {
    orderBy: {
      updatedAt: 'desc' as const
    },
    include: {
      financialStatements: {
        orderBy: {
          createdAt: 'desc' as const
        },
        take: 2,
        include: {
          creditAssessments: {
            orderBy: {
              createdAt: 'desc' as const
            },
            take: 1
          }
        }
      }
    },
    take: 6
  },
  creditAssessments: {
    orderBy: {
      createdAt: 'desc' as const
    },
    include: {
      counterparty: true,
      financialStatement: true
    },
    take: 6
  },
  ownershipRecords: {
    orderBy: {
      effectiveDate: 'desc' as const
    },
    take: 3
  },
  encumbranceRecords: {
    orderBy: {
      effectiveDate: 'desc' as const
    },
    take: 3
  },
  planningConstraints: {
    orderBy: {
      updatedAt: 'desc' as const
    },
    take: 3
  },
  pipelineProjects: {
    orderBy: {
      expectedDeliveryDate: 'asc' as const
    },
    take: 6
  },
  geoFeatures: {
    orderBy: {
      updatedAt: 'desc' as const
    },
    take: 12
  },
  comparableSet: {
    include: {
      entries: {
        orderBy: {
          createdAt: 'asc' as const
        }
      }
    }
  },
  capexLineItems: {
    orderBy: {
      spendYear: 'asc' as const
    }
  },
  leases: {
    include: {
      steps: {
        orderBy: {
          stepOrder: 'asc' as const
        }
      }
    },
    orderBy: {
      startYear: 'asc' as const
    }
  },
  taxAssumption: true,
  spvStructure: true,
  debtFacilities: {
    include: {
      draws: {
        orderBy: {
          drawYear: 'asc' as const
        }
      }
    },
    orderBy: {
      createdAt: 'asc' as const
    }
  },
  featureSnapshots: {
    include: {
      values: {
        orderBy: {
          key: 'asc' as const
        }
      }
    },
    orderBy: {
      snapshotDate: 'desc' as const
    },
    take: 8
  },
  researchSnapshots: {
    orderBy: {
      snapshotDate: 'desc' as const
    },
    take: 6
  },
  coverageTasks: {
    orderBy: {
      updatedAt: 'desc' as const
    },
    take: 12
  },
  transactionComps: {
    orderBy: {
      transactionDate: 'desc' as const
    },
    take: 6
  },
  rentComps: {
    orderBy: {
      observationDate: 'desc' as const
    },
    take: 6
  },
  marketIndicatorSeries: {
    orderBy: {
      observationDate: 'desc' as const
    },
    take: 12
  },
  documents: {
    include: {
      versions: {
        orderBy: {
          versionNumber: 'desc' as const
        }
      }
    },
    orderBy: {
      updatedAt: 'desc' as const
    }
  },
  valuations: {
    include: {
      scenarios: {
        orderBy: {
          scenarioOrder: 'asc' as const
        }
      },
      sensitivityRuns: {
        include: {
          points: {
            orderBy: {
              sortOrder: 'asc' as const
            }
          }
        },
        orderBy: {
          createdAt: 'desc' as const
        }
      }
    },
    orderBy: {
      createdAt: 'desc' as const
    },
    take: 6
  },
  readinessProject: {
    include: {
      onchainRecords: {
        orderBy: {
          createdAt: 'desc' as const
        }
      }
    }
  },
  media: {
    orderBy: [
      { sortOrder: 'asc' as const },
      { createdAt: 'asc' as const }
    ]
  }
} satisfies Prisma.AssetInclude;

const assetMoneyFields = [
  'purchasePriceKrw',
  'stabilizedRentPerSqmMonthKrw',
  'otherIncomeKrw',
  'tenantImprovementReserveKrw',
  'leasingCommissionReserveKrw',
  'annualCapexReserveKrw',
  'capexAssumptionKrw',
  'opexAssumptionKrw'
] as const;

function resolveSourceCacheStore(db: unknown): SourceCacheStore {
  if (db && typeof db === 'object' && 'sourceCache' in db && 'sourceOverride' in db) {
    return createPrismaSourceCacheStore(db as PrismaClient);
  }

  return createMemorySourceCacheStore();
}

async function normalizeAssetMoneyFieldsToKrw<T extends AssetIntakeInput | AssetIntakeUpdateInput>(
  input: T,
  currency: SupportedCurrency,
  store: SourceCacheStore
) {
  if (currency === 'KRW') return input;

  const fx = await createFxAdapter(store).fetch(currency);
  const normalized = { ...input } as T;

  for (const field of assetMoneyFields) {
    const value = input[field];
    if (typeof value === 'number') {
      (normalized as Record<string, unknown>)[field] = Math.round(value * fx.data.rateToKrw);
    }
  }

  return normalized;
}

export async function createAsset(
  input: unknown,
  db: Pick<PrismaClient, 'asset'> &
    Partial<Pick<PrismaClient, 'sourceCache' | 'sourceOverride'>> = prisma
) {
  const parsed = assetIntakeSchema.parse(input);
  const inputCurrency = resolveInputCurrency(parsed.country, parsed.inputCurrency);
  const normalized = await normalizeAssetMoneyFieldsToKrw(
    parsed,
    inputCurrency,
    resolveSourceCacheStore(db)
  );
  return db.asset.create({
    data: buildAssetCreateInput(normalized, { normalizeMoney: false }),
    include: assetBundleInclude
  });
}

export async function updateAsset(
  id: string,
  input: Partial<AssetIntakeUpdateInput>,
  db: PrismaClient = prisma
) {
  const existing = await db.asset.findUnique({
    where: { id },
    include: { address: true, siteProfile: true }
  });

  if (!existing) throw new Error('Asset not found');

  const parsed = assetIntakeUpdateSchema.parse(input);
  const inputCurrency = resolveInputCurrency(
    parsed.country ?? existing.address?.country,
    parsed.inputCurrency
  );
  const normalized = await normalizeAssetMoneyFieldsToKrw(
    parsed,
    inputCurrency,
    resolveSourceCacheStore(db)
  );

  return db.asset.update({
    where: { id },
    data: {
      assetClass: parsed.assetClass,
      assetType: parsed.assetType,
      assetSubtype: parsed.assetSubtype,
      status: parsed.status,
      stage: parsed.stage,
      description: parsed.description,
      ownerName: parsed.ownerName,
      sponsorName: parsed.sponsorName,
      developmentSummary: parsed.developmentSummary,
      targetItLoadMw: parsed.targetItLoadMw,
      powerCapacityMw: parsed.powerCapacityMw,
      landAreaSqm: parsed.landAreaSqm,
      grossFloorAreaSqm: parsed.grossFloorAreaSqm,
      rentableAreaSqm: parsed.rentableAreaSqm,
      purchasePriceKrw: normalized.purchasePriceKrw,
      occupancyAssumptionPct: parsed.occupancyAssumptionPct,
      stabilizedOccupancyPct: parsed.stabilizedOccupancyPct,
      tenantAssumption: parsed.tenantAssumption,
      capexAssumptionKrw: normalized.capexAssumptionKrw,
      opexAssumptionKrw: normalized.opexAssumptionKrw,
      financingLtvPct: parsed.financingLtvPct,
      financingRatePct: parsed.financingRatePct,
      holdingPeriodYears: parsed.holdingPeriodYears,
      exitCapRatePct: parsed.exitCapRatePct,
      officeDetail:
        parsed.assetClass === AssetClass.OFFICE &&
        (parsed.stabilizedRentPerSqmMonthKrw !== undefined ||
          parsed.otherIncomeKrw !== undefined ||
          parsed.vacancyAllowancePct !== undefined ||
          parsed.creditLossPct !== undefined ||
          parsed.tenantImprovementReserveKrw !== undefined ||
          parsed.leasingCommissionReserveKrw !== undefined ||
          parsed.annualCapexReserveKrw !== undefined ||
          parsed.weightedAverageLeaseTermYears !== undefined)
          ? {
              upsert: {
                update: {
                  stabilizedRentPerSqmMonthKrw: normalized.stabilizedRentPerSqmMonthKrw,
                  otherIncomeKrw: normalized.otherIncomeKrw,
                  vacancyAllowancePct: parsed.vacancyAllowancePct,
                  creditLossPct: parsed.creditLossPct,
                  tenantImprovementReserveKrw: normalized.tenantImprovementReserveKrw,
                  leasingCommissionReserveKrw: normalized.leasingCommissionReserveKrw,
                  annualCapexReserveKrw: normalized.annualCapexReserveKrw,
                  weightedAverageLeaseTermYears: parsed.weightedAverageLeaseTermYears
                },
                create: {
                  stabilizedRentPerSqmMonthKrw: normalized.stabilizedRentPerSqmMonthKrw,
                  otherIncomeKrw: normalized.otherIncomeKrw,
                  vacancyAllowancePct: parsed.vacancyAllowancePct,
                  creditLossPct: parsed.creditLossPct,
                  tenantImprovementReserveKrw: normalized.tenantImprovementReserveKrw,
                  leasingCommissionReserveKrw: normalized.leasingCommissionReserveKrw,
                  annualCapexReserveKrw: normalized.annualCapexReserveKrw,
                  weightedAverageLeaseTermYears: parsed.weightedAverageLeaseTermYears
                }
              }
            }
          : undefined,
      dataCenterDetail:
        parsed.assetClass === AssetClass.DATA_CENTER &&
        (parsed.powerCapacityMw !== undefined || parsed.targetItLoadMw !== undefined)
          ? {
              upsert: {
                update: {
                  powerCapacityMw: parsed.powerCapacityMw,
                  targetItLoadMw: parsed.targetItLoadMw
                },
                create: {
                  powerCapacityMw: parsed.powerCapacityMw,
                  targetItLoadMw: parsed.targetItLoadMw,
                  fiberAccess: 'Pending enrichment',
                  latencyProfile: 'Initial intake'
                }
              }
            }
          : undefined,
      address: parsed.line1
        ? {
            upsert: {
              update: {
                line1: parsed.line1,
                line2: parsed.line2,
                district: parsed.district,
                city: parsed.city,
                province: parsed.province,
                postalCode: parsed.postalCode,
                country: parsed.country,
                latitude: parsed.latitude,
                longitude: parsed.longitude,
                parcelId: parsed.parcelId
              },
              create: {
                line1: parsed.line1,
                line2: parsed.line2,
                district: parsed.district,
                city: parsed.city ?? 'Seoul',
                province: parsed.province ?? 'Seoul',
                postalCode: parsed.postalCode,
                country: parsed.country ?? 'KR',
                latitude: parsed.latitude,
                longitude: parsed.longitude,
                parcelId: parsed.parcelId,
                sourceLabel: 'manual intake'
              }
            }
          }
        : undefined,
      siteProfile: parsed.siteNotes
        ? {
            upsert: {
              update: {
                siteNotes: parsed.siteNotes
              },
              create: {
                gridAvailability: 'Pending enrichment',
                fiberAccess: 'Pending enrichment',
                latencyProfile: 'Initial intake',
                siteNotes: parsed.siteNotes
              }
            }
          }
        : undefined
    },
    include: assetBundleInclude
  });
}

export async function listAssets(db: PrismaClient = prisma) {
  return db.asset.findMany({
    include: {
      address: true,
      siteProfile: true,
      marketSnapshot: true,
      valuations: {
        take: 1,
        orderBy: {
          createdAt: 'desc'
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });
}

export async function getAssetById(id: string, db: PrismaClient = prisma) {
  return db.asset.findUnique({
    where: { id },
    include: assetBundleInclude
  });
}

export async function getAssetBySlug(slug: string, db: PrismaClient = prisma) {
  return db.asset.findUnique({
    where: { slug },
    include: assetBundleInclude
  });
}

export async function enrichAssetFromSources(assetId: string, db: PrismaClient = prisma) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: {
      address: true,
      comparableSet: {
        include: {
          entries: true
        }
      }
    }
  });

  if (!asset || !asset.address) throw new Error('Asset or address not found');

  const store = createPrismaSourceCacheStore(db);
  const geospatial = await createGeospatialAdapter(store).fetch({
    assetCode: asset.assetCode,
    address: asset.address.line1,
    city: asset.address.city,
    province: asset.address.province
  });
  const building = await createBuildingPermitAdapter(store).fetch(asset.assetCode);
  const energy = await createEnergyAdapter(store).fetch(asset.assetCode);
  const macro = await createMacroAdapter(store).fetch({
    assetCode: asset.assetCode,
    market: asset.market,
    country: asset.address.country
  });
  const marketData = await createMarketAdapter(store).fetch({
    assetCode: asset.assetCode,
    assetClass: asset.assetClass,
    market: asset.market,
    country: asset.address.country,
    metroRegion: macro.data.metroRegion
  });
  const climate = await createClimateAdapter(store).fetch({
    assetCode: asset.assetCode,
    latitude: geospatial.data.latitude,
    longitude: geospatial.data.longitude
  });

  const sourceUpdatedAt = new Date();
  const macroObservationDate = normalizeMacroObservationDate(sourceUpdatedAt);
  const macroSeriesInputs = buildMacroSeriesCreateInputs({
    market: asset.market,
    macro: macro.data,
    sourceSystem: macro.sourceSystem,
    sourceStatus: macro.status,
    sourceUpdatedAt,
    observationDate: macroObservationDate
  });
  const macroFactorInputs = buildMacroFactorCreateInputs({
    market: asset.market,
    marketSnapshot: {
      id: 'derived',
      assetId: asset.id,
      metroRegion: macro.data.metroRegion,
      vacancyPct: marketData.data.vacancyPct ?? macro.data.vacancyPct,
      colocationRatePerKwKrw: macro.data.colocationRatePerKwKrw,
      capRatePct: marketData.data.capRatePct ?? macro.data.capRatePct,
      debtCostPct: macro.data.debtCostPct,
      inflationPct: macro.data.inflationPct,
      constructionCostPerMwKrw: macro.data.constructionCostPerMwKrw,
      discountRatePct: macro.data.discountRatePct,
      marketNotes: [macro.data.marketNotes, marketData.data.marketNotes].filter(Boolean).join(' '),
      sourceStatus: marketData.status === 'FRESH' ? marketData.status : macro.status,
      sourceUpdatedAt,
      createdAt: sourceUpdatedAt,
      updatedAt: sourceUpdatedAt
    },
    series: macroSeriesInputs.map((row, index) => ({
      id: `derived_${index}`,
      assetId: asset.id,
      market: row.market,
      seriesKey: row.seriesKey,
      label: row.label,
      frequency: row.frequency,
      observationDate: row.observationDate,
      value: row.value,
      unit: row.unit,
      sourceSystem: row.sourceSystem,
      sourceStatus: row.sourceStatus,
      sourceUpdatedAt: row.sourceUpdatedAt,
      createdAt: sourceUpdatedAt,
      updatedAt: sourceUpdatedAt
    })),
    sourceSystem: 'macro-factor-engine',
    sourceStatus: marketData.status === 'FRESH' ? marketData.status : macro.status,
    sourceUpdatedAt,
    observationDate: macroObservationDate
  });

  await db.asset.update({
    where: { id: assetId },
    data: {
      status: AssetStatus.UNDER_REVIEW,
      lastEnrichedAt: sourceUpdatedAt,
      address: {
        update: {
          latitude: geospatial.data.latitude,
          longitude: geospatial.data.longitude,
          parcelId: geospatial.data.parcelId,
          sourceLabel: `${geospatial.sourceSystem} (${geospatial.mode})`
        }
      },
      siteProfile: {
        upsert: {
          update: {
            gridAvailability: geospatial.data.gridAvailability,
            fiberAccess: geospatial.data.fiberAccess,
            latencyProfile: geospatial.data.latencyProfile,
            floodRiskScore: climate.data.floodRiskScore ?? geospatial.data.floodRiskScore,
            wildfireRiskScore: climate.data.wildfireRiskScore,
            seismicRiskScore: geospatial.data.seismicRiskScore,
            siteNotes: climate.data.climateRiskNote,
            sourceStatus: climate.status,
            sourceUpdatedAt
          },
          create: {
            gridAvailability: geospatial.data.gridAvailability,
            fiberAccess: geospatial.data.fiberAccess,
            latencyProfile: geospatial.data.latencyProfile,
            floodRiskScore: climate.data.floodRiskScore ?? geospatial.data.floodRiskScore,
            wildfireRiskScore: climate.data.wildfireRiskScore,
            seismicRiskScore: geospatial.data.seismicRiskScore,
            siteNotes: climate.data.climateRiskNote,
            sourceStatus: climate.status,
            sourceUpdatedAt
          }
        }
      },
      buildingSnapshot: {
        upsert: {
          update: {
            zoning: building.data.zoning,
            buildingCoveragePct: building.data.buildingCoveragePct,
            floorAreaRatioPct: building.data.floorAreaRatioPct,
            grossFloorAreaSqm: asset.grossFloorAreaSqm,
            structureDescription: building.data.structureDescription,
            redundancyTier: building.data.redundancyTier,
            coolingType: building.data.coolingType,
            sourceStatus: building.status,
            sourceUpdatedAt
          },
          create: {
            zoning: building.data.zoning,
            buildingCoveragePct: building.data.buildingCoveragePct,
            floorAreaRatioPct: building.data.floorAreaRatioPct,
            grossFloorAreaSqm: asset.grossFloorAreaSqm,
            structureDescription: building.data.structureDescription,
            redundancyTier: building.data.redundancyTier,
            coolingType: building.data.coolingType,
            sourceStatus: building.status,
            sourceUpdatedAt
          }
        }
      },
      permitSnapshot: {
        upsert: {
          update: {
            permitStage: building.data.permitStage,
            zoningApprovalStatus: building.data.zoningApprovalStatus,
            environmentalReviewStatus: building.data.environmentalReviewStatus,
            powerApprovalStatus: building.data.powerApprovalStatus,
            timelineNotes: climate.data.climateRiskNote,
            reviewStatus: ReviewStatus.PENDING,
            reviewedAt: null,
            reviewedById: null,
            reviewNotes: null,
            sourceStatus: building.status,
            sourceUpdatedAt
          },
          create: {
            permitStage: building.data.permitStage,
            zoningApprovalStatus: building.data.zoningApprovalStatus,
            environmentalReviewStatus: building.data.environmentalReviewStatus,
            powerApprovalStatus: building.data.powerApprovalStatus,
            timelineNotes: climate.data.climateRiskNote,
            reviewStatus: ReviewStatus.PENDING,
            sourceStatus: building.status,
            sourceUpdatedAt
          }
        }
      },
      energySnapshot: {
        upsert: {
          update: {
            utilityName: energy.data.utilityName,
            substationDistanceKm: energy.data.substationDistanceKm,
            tariffKrwPerKwh: energy.data.tariffKrwPerKwh,
            renewableAvailabilityPct: energy.data.renewableAvailabilityPct,
            pueTarget: energy.data.pueTarget,
            backupFuelHours: energy.data.backupFuelHours,
            reviewStatus: ReviewStatus.PENDING,
            reviewedAt: null,
            reviewedById: null,
            reviewNotes: null,
            sourceStatus: energy.status,
            sourceUpdatedAt
          },
          create: {
            utilityName: energy.data.utilityName,
            substationDistanceKm: energy.data.substationDistanceKm,
            tariffKrwPerKwh: energy.data.tariffKrwPerKwh,
            renewableAvailabilityPct: energy.data.renewableAvailabilityPct,
            pueTarget: energy.data.pueTarget,
            backupFuelHours: energy.data.backupFuelHours,
            reviewStatus: ReviewStatus.PENDING,
            sourceStatus: energy.status,
            sourceUpdatedAt
          }
        }
      },
      marketSnapshot: {
        upsert: {
          update: {
            metroRegion: macro.data.metroRegion,
            vacancyPct: marketData.data.vacancyPct ?? macro.data.vacancyPct,
            colocationRatePerKwKrw: macro.data.colocationRatePerKwKrw,
            capRatePct: marketData.data.capRatePct ?? macro.data.capRatePct,
            debtCostPct: macro.data.debtCostPct,
            inflationPct: macro.data.inflationPct,
            constructionCostPerMwKrw: macro.data.constructionCostPerMwKrw,
            discountRatePct: macro.data.discountRatePct,
            marketNotes: [macro.data.marketNotes, marketData.data.marketNotes]
              .filter(Boolean)
              .join(' '),
            sourceStatus: marketData.status === 'FRESH' ? marketData.status : macro.status,
            sourceUpdatedAt
          },
          create: {
            metroRegion: macro.data.metroRegion,
            vacancyPct: marketData.data.vacancyPct ?? macro.data.vacancyPct,
            colocationRatePerKwKrw: macro.data.colocationRatePerKwKrw,
            capRatePct: marketData.data.capRatePct ?? macro.data.capRatePct,
            debtCostPct: macro.data.debtCostPct,
            inflationPct: macro.data.inflationPct,
            constructionCostPerMwKrw: macro.data.constructionCostPerMwKrw,
            discountRatePct: macro.data.discountRatePct,
            marketNotes: [macro.data.marketNotes, marketData.data.marketNotes]
              .filter(Boolean)
              .join(' '),
            sourceStatus: marketData.status === 'FRESH' ? marketData.status : macro.status,
            sourceUpdatedAt
          }
        }
      },
      macroSeries: {
        deleteMany: {
          observationDate: macroObservationDate
        },
        create: macroSeriesInputs
      },
      macroFactors: {
        deleteMany: {
          observationDate: macroObservationDate
        },
        create: macroFactorInputs
      }
    }
  });

  await Promise.all([
    db.transactionComp.deleteMany({
      where: {
        assetId,
        sourceSystem: marketData.sourceSystem
      }
    }),
    db.rentComp.deleteMany({
      where: {
        assetId,
        sourceSystem: marketData.sourceSystem
      }
    }),
    db.marketIndicatorSeries.deleteMany({
      where: {
        assetId,
        sourceSystem: marketData.sourceSystem
      }
    })
  ]);

  if (marketData.data.transactionComps.length > 0) {
    await db.transactionComp.createMany({
      data: marketData.data.transactionComps.map((comp) => ({
        assetId,
        market: asset.market,
        region: comp.region,
        // Tier classifier runs at intake so the cap-rate aggregator's
        // submarket × tier matrix can group on real values from day one
        // instead of waiting for a separate backfill pass.
        assetClass: asset.assetClass,
        assetTier: classifyAssetTier({
          comparableType: comp.comparableType,
          assetClass: asset.assetClass,
          grossFloorAreaSqm: asset.grossFloorAreaSqm
        }),
        comparableType: comp.comparableType,
        transactionDate: comp.transactionDate ? new Date(comp.transactionDate) : null,
        priceKrw: comp.priceKrw ?? null,
        pricePerSqmKrw: comp.pricePerSqmKrw ?? null,
        pricePerMwKrw: comp.pricePerMwKrw ?? null,
        capRatePct: comp.capRatePct ?? null,
        buyerType: comp.buyerType ?? null,
        sellerType: comp.sellerType ?? null,
        sourceLink: comp.sourceLink ?? null,
        sourceSystem: marketData.sourceSystem,
        sourceStatus: marketData.status
      }))
    });
  }

  if (marketData.data.rentComps.length > 0) {
    await db.rentComp.createMany({
      data: marketData.data.rentComps.map((comp) => ({
        assetId,
        market: asset.market,
        region: comp.region,
        comparableType: comp.comparableType,
        observationDate: comp.observationDate ? new Date(comp.observationDate) : null,
        monthlyRentPerSqmKrw: comp.monthlyRentPerSqmKrw ?? null,
        monthlyRatePerKwKrw: comp.monthlyRatePerKwKrw ?? null,
        occupancyPct: comp.occupancyPct ?? null,
        escalationPct: comp.escalationPct ?? null,
        sourceLink: comp.sourceLink ?? null,
        sourceSystem: marketData.sourceSystem,
        sourceStatus: marketData.status
      }))
    });
  }

  if (marketData.data.indicators.length > 0) {
    await db.marketIndicatorSeries.createMany({
      data: marketData.data.indicators.map((indicator) => ({
        assetId,
        market: asset.market,
        region: indicator.region ?? marketData.data.metroRegion ?? macro.data.metroRegion,
        indicatorKey: indicator.indicatorKey,
        observationDate: indicator.observationDate
          ? new Date(indicator.observationDate)
          : sourceUpdatedAt,
        value: indicator.value,
        unit: indicator.unit ?? null,
        sourceSystem: marketData.sourceSystem,
        sourceStatus: marketData.status
      }))
    });
  }

  if (
    (asset.comparableSet?.entries.length ?? 0) === 0 &&
    marketData.data.transactionComps.length > 0
  ) {
    const comparableSet = await db.comparableSet.upsert({
      where: {
        assetId
      },
      update: {
        name: marketData.data.comparableSetName ?? `${asset.name} market comparable set`,
        notes: marketData.data.comparableSetNotes ?? asset.comparableSet?.notes ?? null
      },
      create: {
        assetId,
        name: marketData.data.comparableSetName ?? `${asset.name} market comparable set`,
        notes: marketData.data.comparableSetNotes ?? null,
        calibrationMode: 'Weighted market calibration'
      }
    });

    await db.comparableEntry.deleteMany({
      where: {
        comparableSetId: comparableSet.id
      }
    });

    await db.comparableEntry.createMany({
      data: marketData.data.transactionComps.map((comp, index) => ({
        comparableSetId: comparableSet.id,
        label: comp.label,
        location: comp.region,
        assetType: comp.comparableType,
        stage: asset.stage,
        sourceLink: comp.sourceLink ?? null,
        grossFloorAreaSqm: comp.grossFloorAreaSqm ?? null,
        valuationKrw: comp.priceKrw ?? null,
        capRatePct: comp.capRatePct ?? null,
        weightPct: Number((100 / marketData.data.transactionComps.length).toFixed(2)),
        notes: `Auto-seeded from ${marketData.sourceSystem} market comp ${index + 1}.`
      }))
    });
  }

  try {
    await promoteAssetSnapshotsToFeatures(assetId, db);
  } catch {
    // Feature promotion should not block enrichment completion.
  }

  return getAssetById(assetId, db);
}
