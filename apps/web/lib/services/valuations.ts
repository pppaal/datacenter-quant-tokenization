import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { generateUnderwritingMemo } from '@/lib/ai/openai';
import { buildForecastDecisionNarrative, getForecastDecisionGuideForRun } from '@/lib/services/forecast/decision';
import { getGradientBoostingForecastForRun } from '@/lib/services/forecast/gradient-boosting';
import { buildMacroRegimeProvenance, buildMacroRegimeSnapshot } from '@/lib/services/macro/series';
import { assetBundleInclude, enrichAssetFromSources } from '@/lib/services/assets';
import { syncDealProbabilitySnapshotsForAssetDeals } from '@/lib/services/deals';
import { buildSensitivityRuns } from '@/lib/services/sensitivity/engine';
import { runValuationAnalysis } from '@/lib/services/valuation-runner';
import { valuationApprovalSchema, valuationRunSchema } from '@/lib/validations/valuation';

function canSyncDealProbabilitySnapshots(db: PrismaClient) {
  return Boolean(
    db &&
      typeof db === 'object' &&
      'deal' in db &&
      db.deal &&
      typeof db.deal.findMany === 'function'
  );
}

export async function createValuationRun(input: unknown, db: PrismaClient = prisma) {
  const parsed = valuationRunSchema.parse(input);

  let asset = await db.asset.findUnique({
    where: { id: parsed.assetId },
    include: assetBundleInclude
  });

  if (!asset) throw new Error('Asset not found');

  if (!asset.marketSnapshot || !asset.energySnapshot || !asset.permitSnapshot) {
    asset = await enrichAssetFromSources(parsed.assetId, db);
    if (!asset) throw new Error('Asset enrichment failed');
  }

  const bundle = {
    asset,
    address: asset.address,
    siteProfile: asset.siteProfile,
    buildingSnapshot: asset.buildingSnapshot,
    permitSnapshot: asset.permitSnapshot,
    energySnapshot: asset.energySnapshot,
    marketSnapshot: asset.marketSnapshot,
    transactionComps: asset.transactionComps,
    rentComps: asset.rentComps,
    marketIndicatorSeries: asset.marketIndicatorSeries,
    macroSeries: asset.macroSeries,
    officeDetail: asset.officeDetail,
    creditAssessments: asset.creditAssessments
  };
  const { analysis, engineVersion } = await runValuationAnalysis(bundle);
  const sensitivityRuns = buildSensitivityRuns(analysis);
  const macroRegime =
    typeof analysis.assumptions === 'object' &&
    analysis.assumptions !== null &&
    'macroRegime' in analysis.assumptions
      ? analysis.assumptions.macroRegime
      : buildMacroRegimeSnapshot(asset.macroSeries ?? []);
  const latestCreditAssessments = (asset.creditAssessments ?? []).map((assessment) => ({
    counterpartyName: assessment.counterparty.name,
    counterpartyRole: assessment.counterparty.role,
    assessmentType: assessment.assessmentType,
    score: assessment.score,
    riskLevel: assessment.riskLevel,
    summary: assessment.summary,
    createdAt: assessment.createdAt.toISOString(),
    metrics: assessment.metrics
  }));
  const assumptions = {
    ...analysis.assumptions,
    macroRegime,
    creditSignals: latestCreditAssessments
  };
  const creditProvenance = latestCreditAssessments.map((assessment) => ({
    field: `credit.${assessment.counterpartyRole.toLowerCase()}.${assessment.counterpartyName}`,
    value: assessment.score,
    sourceSystem: 'financial-statement-ingestion',
    mode: 'manual' as const,
    fetchedAt: assessment.createdAt,
    freshnessLabel: `${assessment.riskLevel} / ${assessment.assessmentType}`
  }));
  const provenance = [
    ...analysis.provenance,
    ...buildMacroRegimeProvenance(asset.macroSeries ?? []),
    ...creditProvenance
  ];

  const run = await db.valuationRun.create({
    data: {
      assetId: asset.id,
      runLabel: parsed.runLabel,
      status: 'COMPLETED',
      engineVersion,
      confidenceScore: analysis.confidenceScore,
      baseCaseValueKrw: analysis.baseCaseValueKrw,
      underwritingMemo: analysis.underwritingMemo,
      keyRisks: analysis.keyRisks,
      ddChecklist: analysis.ddChecklist,
      assumptions: assumptions as Prisma.InputJsonValue,
      provenance: provenance as Prisma.InputJsonValue,
      scenarios: {
        create: analysis.scenarios.map((scenario) => ({
          name: scenario.name,
          valuationKrw: scenario.valuationKrw,
          impliedYieldPct: scenario.impliedYieldPct,
          exitCapRatePct: scenario.exitCapRatePct,
          debtServiceCoverage: scenario.debtServiceCoverage,
          notes: scenario.notes,
          scenarioOrder: scenario.scenarioOrder
        }))
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
    },
    include: {
      asset: true,
      scenarios: {
        orderBy: {
          scenarioOrder: 'asc'
        }
      },
      sensitivityRuns: {
        include: {
          points: {
            orderBy: {
              sortOrder: 'asc'
            }
          }
        }
      }
    }
  });

  await db.asset.update({
    where: { id: asset.id },
    data: {
      currentValuationKrw: analysis.baseCaseValueKrw
    }
  });

  if (canSyncDealProbabilitySnapshots(db)) {
    await syncDealProbabilitySnapshotsForAssetDeals(asset.id, 'valuation_refreshed', db);
  }

  const enrichedMemo = await rebuildValuationMemoIfPossible({
    runId: run.id,
    analysis,
    db
  });

  if (!enrichedMemo) {
    return run;
  }

  const finalizedRun = await db.valuationRun.update({
    where: { id: run.id },
    data: {
      underwritingMemo: enrichedMemo
    },
    include: {
      asset: true,
      scenarios: {
        orderBy: {
          scenarioOrder: 'asc'
        }
      },
      sensitivityRuns: {
        include: {
          points: {
            orderBy: {
              sortOrder: 'asc'
            }
          }
        }
      }
    }
  });

  return finalizedRun;
}

export async function listValuationRuns(db: PrismaClient = prisma) {
  return db.valuationRun.findMany({
    include: {
      asset: {
        include: {
          address: true,
          siteProfile: true
        }
      },
      scenarios: {
        orderBy: {
          scenarioOrder: 'asc'
        }
      },
      sensitivityRuns: {
        include: {
          points: {
            orderBy: {
              sortOrder: 'asc'
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
}

export async function getValuationRunById(id: string, db: PrismaClient = prisma) {
  return db.valuationRun.findUnique({
    where: { id },
    include: {
      asset: {
        include: {
          address: true,
          siteProfile: true,
          buildingSnapshot: true,
          permitSnapshot: true,
          energySnapshot: true,
          marketSnapshot: true,
          transactionComps: {
            orderBy: {
              transactionDate: 'desc'
            },
            take: 6
          },
          rentComps: {
            orderBy: {
              observationDate: 'desc'
            },
            take: 6
          },
          marketIndicatorSeries: {
            orderBy: {
              observationDate: 'desc'
            },
            take: 12
          },
          realizedOutcomes: {
            orderBy: {
              observationDate: 'desc'
            },
            take: 12
          },
          creditAssessments: {
            include: {
              counterparty: true,
              financialStatement: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 6
          },
          featureSnapshots: {
            include: {
              values: {
                orderBy: {
                  key: 'asc'
                }
              }
            },
            orderBy: {
              snapshotDate: 'desc'
            },
            take: 16
          },
          valuations: {
            select: {
              id: true,
              runLabel: true,
              baseCaseValueKrw: true,
              confidenceScore: true,
              engineVersion: true,
              createdAt: true,
              assumptions: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 8
          }
        }
      },
      scenarios: {
        orderBy: {
          scenarioOrder: 'asc'
        }
      },
      sensitivityRuns: {
        include: {
          points: {
            orderBy: {
              sortOrder: 'asc'
            }
          }
        }
      }
    }
  });
}

export async function updateValuationApproval(
  id: string,
  input: unknown,
  actor: {
    identifier?: string | null;
  },
  db: PrismaClient = prisma
) {
  const parsed = valuationApprovalSchema.parse(input);
  const existing = await db.valuationRun.findUnique({
    where: { id },
    select: {
      id: true,
      assetId: true
    }
  });

  if (!existing) {
    throw new Error('Valuation run not found');
  }

  return db.valuationRun.update({
    where: { id },
    data: {
      approvalStatus: parsed.approvalStatus,
      approvalNotes: parsed.approvalNotes?.trim() || null,
      approvedByLabel: actor.identifier?.trim() || 'unknown_actor',
      approvedAt: parsed.approvalStatus === 'PENDING_REVIEW' ? null : new Date()
    },
    include: {
      asset: {
        include: {
          address: true
        }
      },
      scenarios: {
        orderBy: {
          scenarioOrder: 'asc'
        }
      }
    }
  });
}

async function rebuildValuationMemoIfPossible({
  runId,
  analysis,
  db
}: {
  runId: string;
  analysis: Awaited<ReturnType<typeof runValuationAnalysis>>['analysis'];
  db: PrismaClient;
}) {
  if (
    !db.valuationRun ||
    typeof db.valuationRun.findUnique !== 'function' ||
    typeof db.valuationRun.findMany !== 'function' ||
    typeof db.macroFactor?.findMany !== 'function' ||
    typeof db.realizedOutcome?.findMany !== 'function'
  ) {
    return null;
  }

  try {
    const boostedForecast = await getGradientBoostingForecastForRun(runId, db);
    const forecastDecisionGuide = await getForecastDecisionGuideForRun(runId, boostedForecast, db);
    const forecastDecisionNarrative = buildForecastDecisionNarrative(forecastDecisionGuide);
    return await generateUnderwritingMemo(analysis, {
      forecastDecisionNarrative
    });
  } catch {
    return null;
  }
}
