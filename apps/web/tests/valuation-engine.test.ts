import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AmortizationProfile,
  AssetClass,
  AssetStage,
  AssetStatus,
  CapexCategory,
  LeaseStatus,
  SourceStatus
} from '@prisma/client';
import { buildValuationAnalysis } from '@/lib/services/valuation-engine';

test('early-stage valuation keeps scenario dispersion above the downside floor', async () => {
  const now = new Date();

  const analysis = await buildValuationAnalysis({
    asset: {
      id: 'asset_screening_1',
      assetCode: 'GYEONGGI-HANAM-05',
      slug: 'gyeonggi-hanam-05-gyeonggi-hanam-ai-compute-campus',
      name: 'Gyeonggi Hanam AI Compute Campus',
      assetClass: AssetClass.DATA_CENTER,
      assetType: 'Data Center',
      assetSubtype: null,
      market: 'KR',
      status: AssetStatus.UNDER_REVIEW,
      stage: AssetStage.SCREENING,
      description: 'Screening-stage valuation calibration case.',
      ownerName: null,
      sponsorName: null,
      developmentSummary: null,
      targetItLoadMw: 14,
      powerCapacityMw: 16,
      landAreaSqm: 13200,
      grossFloorAreaSqm: 38100,
      rentableAreaSqm: null,
      purchasePriceKrw: null,
      occupancyAssumptionPct: 67,
      stabilizedOccupancyPct: null,
      tenantAssumption: 'AI inference and enterprise colocation mix',
      capexAssumptionKrw: 118000000000,
      opexAssumptionKrw: 5100000000,
      financingLtvPct: 53,
      financingRatePct: 5.4,
      holdingPeriodYears: null,
      exitCapRatePct: null,
      currentValuationKrw: null,
      lastEnrichedAt: now,
      createdAt: now,
      updatedAt: now
    },
    address: {
      id: 'address_screening_1',
      assetId: 'asset_screening_1',
      line1: '210 Misa-daero',
      line2: null,
      district: 'Hanam-si',
      city: 'Hanam',
      province: 'Gyeonggi',
      postalCode: null,
      country: 'KR',
      latitude: 37.5484,
      longitude: 127.2238,
      parcelId: '41450-1010',
      sourceLabel: 'manual intake',
      createdAt: now,
      updatedAt: now
    },
    siteProfile: {
      id: 'site_screening_1',
      assetId: 'asset_screening_1',
      gridAvailability: '154 kV review in progress',
      fiberAccess: 'Dual path expected',
      latencyProfile: 'Metro edge profile',
      floodRiskScore: 2.4,
      wildfireRiskScore: 1.6,
      seismicRiskScore: 1.1,
      siteNotes: 'NASA POWER climatology indicates moderate annual cooling load.',
      sourceStatus: SourceStatus.STALE,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    buildingSnapshot: {
      id: 'building_screening_1',
      assetId: 'asset_screening_1',
      zoning: 'Industrial support',
      buildingCoveragePct: 48,
      floorAreaRatioPct: 240,
      grossFloorAreaSqm: 38100,
      structureDescription: 'Shell planning basis',
      redundancyTier: 'Tier III target',
      coolingType: 'Hybrid',
      sourceStatus: SourceStatus.STALE,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    permitSnapshot: {
      id: 'permit_screening_1',
      assetId: 'asset_screening_1',
      permitStage: 'Utility review',
      zoningApprovalStatus: 'Initial review',
      environmentalReviewStatus: 'Preliminary',
      powerApprovalStatus: 'Utility review pending',
      timelineNotes: 'Pending queue allocation',
      sourceStatus: SourceStatus.STALE,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    energySnapshot: {
      id: 'energy_screening_1',
      assetId: 'asset_screening_1',
      utilityName: 'KEPCO',
      substationDistanceKm: 2.1,
      tariffKrwPerKwh: 140,
      renewableAvailabilityPct: 21,
      pueTarget: 1.34,
      backupFuelHours: 36,
      sourceStatus: SourceStatus.STALE,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    marketSnapshot: {
      id: 'market_screening_1',
      assetId: 'asset_screening_1',
      metroRegion: 'Greater Seoul',
      vacancyPct: 7.2,
      colocationRatePerKwKrw: 198000,
      capRatePct: 6.6,
      debtCostPct: 5.2,
      inflationPct: 2.2,
      constructionCostPerMwKrw: 7200000000,
      discountRatePct: 9.9,
      marketNotes: 'Fallback market benchmark applied pending source-specific refresh.',
      sourceStatus: SourceStatus.STALE,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    comparableSet: {
      id: 'comp_set_1',
      assetId: 'asset_screening_1',
      name: 'Hanam screening set',
      valuationDate: now,
      calibrationMode: 'Weighted market calibration',
      notes: 'Test comparable set',
      createdAt: now,
      updatedAt: now,
      entries: [
        {
          id: 'comp_1',
          comparableSetId: 'comp_set_1',
          label: 'Hanam peer 1',
          location: 'Hanam',
          assetType: 'Data Center',
          stage: AssetStage.PERMITTING,
          sourceLink: 'https://example.com/hanam-peer-1',
          powerCapacityMw: 14,
          grossFloorAreaSqm: 36000,
          occupancyPct: 72,
          pricePerMwKrw: null,
          valuationKrw: 142000000000,
          monthlyRatePerKwKrw: 201000,
          capRatePct: 6.4,
          discountRatePct: 9.7,
          weightPct: 0.55,
          notes: 'Primary peer',
          createdAt: now
        },
        {
          id: 'comp_2',
          comparableSetId: 'comp_set_1',
          label: 'Hanam peer 2',
          location: 'Gyeonggi',
          assetType: 'AI campus',
          stage: AssetStage.CONSTRUCTION,
          sourceLink: 'https://example.com/hanam-peer-2',
          powerCapacityMw: 18,
          grossFloorAreaSqm: 40100,
          occupancyPct: 70,
          pricePerMwKrw: null,
          valuationKrw: 168000000000,
          monthlyRatePerKwKrw: 205000,
          capRatePct: 6.25,
          discountRatePct: 9.5,
          weightPct: 0.45,
          notes: 'Secondary peer',
          createdAt: now
        }
      ]
    },
    capexLineItems: [
      {
        id: 'capex_1',
        assetId: 'asset_screening_1',
        category: CapexCategory.LAND,
        label: 'Land',
        amountKrw: 19000000000,
        spendYear: 0,
        isEmbedded: false,
        notes: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'capex_2',
        assetId: 'asset_screening_1',
        category: CapexCategory.ELECTRICAL,
        label: 'Electrical',
        amountKrw: 30000000000,
        spendYear: 1,
        isEmbedded: false,
        notes: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'capex_3',
        assetId: 'asset_screening_1',
        category: CapexCategory.SHELL_CORE,
        label: 'Shell',
        amountKrw: 26000000000,
        spendYear: 1,
        isEmbedded: false,
        notes: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'capex_4',
        assetId: 'asset_screening_1',
        category: CapexCategory.MECHANICAL,
        label: 'Mechanical',
        amountKrw: 18000000000,
        spendYear: 1,
        isEmbedded: false,
        notes: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'capex_5',
        assetId: 'asset_screening_1',
        category: CapexCategory.IT_FIT_OUT,
        label: 'IT fit-out',
        amountKrw: 9000000000,
        spendYear: 2,
        isEmbedded: false,
        notes: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'capex_6',
        assetId: 'asset_screening_1',
        category: CapexCategory.SOFT_COST,
        label: 'Soft costs',
        amountKrw: 11000000000,
        spendYear: 0,
        isEmbedded: false,
        notes: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'capex_7',
        assetId: 'asset_screening_1',
        category: CapexCategory.CONTINGENCY,
        label: 'Contingency',
        amountKrw: 5000000000,
        spendYear: 2,
        isEmbedded: false,
        notes: null,
        createdAt: now,
        updatedAt: now
      }
    ],
    leases: [
      {
        id: 'lease_1',
        assetId: 'asset_screening_1',
        tenantName: 'AI inference tenant',
        status: LeaseStatus.SIGNED,
        leasedKw: 6500,
        startYear: 2,
        termYears: 6,
        baseRatePerKwKrw: 204000,
        annualEscalationPct: 2.5,
        probabilityPct: 88,
        renewProbabilityPct: 56,
        downtimeMonths: 3,
        rentFreeMonths: 2,
        tenantImprovementKrw: 1700000000,
        leasingCommissionKrw: 300000000,
        recoverableOpexRatioPct: 48,
        fixedRecoveriesKrw: 650000000,
        expenseStopKrwPerKwMonth: 10500,
        utilityPassThroughPct: 62,
        fitOutCostKrw: 2200000000,
        notes: 'Signed but not yet delivered',
        createdAt: now,
        updatedAt: now,
        steps: [
          {
            id: 'lease_step_1',
            leaseId: 'lease_1',
            stepOrder: 1,
            startYear: 2,
            endYear: 4,
            ratePerKwKrw: 204000,
            leasedKw: 6500,
            annualEscalationPct: 2.5,
            occupancyPct: 94,
            rentFreeMonths: 1,
            tenantImprovementKrw: 480000000,
            leasingCommissionKrw: 72000000,
            recoverableOpexRatioPct: 55,
            fixedRecoveriesKrw: 240000000,
            expenseStopKrwPerKwMonth: 9500,
            utilityPassThroughPct: 70,
            notes: 'Ramp period',
            createdAt: now
          }
        ]
      }
    ],
    taxAssumption: {
      id: 'tax_1',
      assetId: 'asset_screening_1',
      acquisitionTaxPct: 4.6,
      vatRecoveryPct: 90,
      propertyTaxPct: 0.35,
      insurancePct: 0.12,
      corporateTaxPct: 24.2,
      withholdingTaxPct: 15.4,
      exitTaxPct: 1.1,
      notes: 'Screening assumptions',
      createdAt: now,
      updatedAt: now
    },
    spvStructure: {
      id: 'spv_1',
      assetId: 'asset_screening_1',
      legalStructure: 'SPC',
      managementFeePct: 1.25,
      performanceFeePct: 8,
      promoteThresholdPct: 10,
      promoteSharePct: 15,
      reserveTargetMonths: 6,
      distributionWaterfall: 'Test waterfall',
      notes: 'Screening assumptions',
      createdAt: now,
      updatedAt: now
    },
    debtFacilities: [
      {
        id: 'debt_1',
        assetId: 'asset_screening_1',
        facilityType: 'CONSTRUCTION',
        lenderName: 'Test lender',
        commitmentKrw: 62000000000,
        drawnAmountKrw: 62000000000,
        interestRatePct: 5.6,
        upfrontFeePct: 1,
        commitmentFeePct: 0.2,
        gracePeriodMonths: 12,
        amortizationTermMonths: 72,
        amortizationProfile: AmortizationProfile.SCULPTED,
        sculptedTargetDscr: 1.3,
        balloonPct: 12,
        reserveMonths: 6,
        notes: 'Synthetic test facility',
        createdAt: now,
        updatedAt: now,
        draws: [
          {
            id: 'draw_1',
            debtFacilityId: 'debt_1',
            drawYear: 1,
            drawMonth: 3,
            amountKrw: 35000000000,
            notes: null,
            createdAt: now
          },
          {
            id: 'draw_2',
            debtFacilityId: 'debt_1',
            drawYear: 2,
            drawMonth: 6,
            amountKrw: 27000000000,
            notes: null,
            createdAt: now
          }
        ]
      }
    ],
    featureSnapshots: [
      {
        id: 'feature_snapshot_1',
        assetId: 'asset_screening_1',
        snapshotDate: now,
        featureNamespace: 'document_facts',
        sourceVersion: 'document:doc_1:v1',
        approvedById: null,
        createdAt: now,
        values: [
          {
            id: 'feature_value_1',
            assetFeatureSnapshotId: 'feature_snapshot_1',
            key: 'document.occupancy_pct',
            numberValue: 74,
            textValue: null,
            jsonValue: null,
            unit: 'pct',
            sourceRef: 'document_fact:1',
            createdAt: now
          },
          {
            id: 'feature_value_2',
            assetFeatureSnapshotId: 'feature_snapshot_1',
            key: 'document.cap_rate_pct',
            numberValue: 6.9,
            textValue: null,
            jsonValue: null,
            unit: 'pct',
            sourceRef: 'document_fact:2',
            createdAt: now
          },
          {
            id: 'feature_value_3',
            assetFeatureSnapshotId: 'feature_snapshot_1',
            key: 'document.monthly_rate_per_kw_krw',
            numberValue: 210000,
            textValue: null,
            jsonValue: null,
            unit: 'KRW',
            sourceRef: 'document_fact:3',
            createdAt: now
          },
          {
            id: 'feature_value_4',
            assetFeatureSnapshotId: 'feature_snapshot_1',
            key: 'document.budget_krw',
            numberValue: 130000000000,
            textValue: null,
            jsonValue: null,
            unit: 'KRW',
            sourceRef: 'document_fact:4',
            createdAt: now
          },
          {
            id: 'feature_value_5',
            assetFeatureSnapshotId: 'feature_snapshot_1',
            key: 'document.permit_status_note',
            numberValue: null,
            textValue: 'Power approval status remains pending final utility committee slot.',
            jsonValue: null,
            unit: null,
            sourceRef: 'document_fact:5',
            createdAt: now
          }
        ]
      },
      {
        id: 'feature_snapshot_2',
        assetId: 'asset_screening_1',
        snapshotDate: now,
        featureNamespace: 'market_inputs',
        sourceVersion: 'marketSnapshot:2026-03-22T00:00:00.000Z',
        approvedById: null,
        createdAt: now,
        values: [
          {
            id: 'feature_value_6',
            assetFeatureSnapshotId: 'feature_snapshot_2',
            key: 'market.debt_cost_pct',
            numberValue: 5.9,
            textValue: null,
            jsonValue: null,
            unit: 'pct',
            sourceRef: 'market_snapshot:debt_cost',
            createdAt: now
          },
          {
            id: 'feature_value_7',
            assetFeatureSnapshotId: 'feature_snapshot_2',
            key: 'market.construction_cost_per_mw_krw',
            numberValue: 8100000000,
            textValue: null,
            jsonValue: null,
            unit: 'KRW',
            sourceRef: 'market_snapshot:construction_cost',
            createdAt: now
          }
        ]
      },
      {
        id: 'feature_snapshot_3',
        assetId: 'asset_screening_1',
        snapshotDate: now,
        featureNamespace: 'satellite_risk',
        sourceVersion: 'siteProfile:2026-03-22T00:00:00.000Z',
        approvedById: null,
        createdAt: now,
        values: [
          {
            id: 'feature_value_8',
            assetFeatureSnapshotId: 'feature_snapshot_3',
            key: 'satellite.flood_risk_score',
            numberValue: 3.1,
            textValue: null,
            jsonValue: null,
            unit: 'score',
            sourceRef: 'site_profile:flood',
            createdAt: now
          },
          {
            id: 'feature_value_9',
            assetFeatureSnapshotId: 'feature_snapshot_3',
            key: 'satellite.wildfire_risk_score',
            numberValue: 2.4,
            textValue: null,
            jsonValue: null,
            unit: 'score',
            sourceRef: 'site_profile:wildfire',
            createdAt: now
          }
        ]
      },
      {
        id: 'feature_snapshot_4',
        assetId: 'asset_screening_1',
        snapshotDate: now,
        featureNamespace: 'permit_inputs',
        sourceVersion: 'permitSnapshot:2026-03-22T00:00:00.000Z',
        approvedById: null,
        createdAt: now,
        values: [
          {
            id: 'feature_value_10',
            assetFeatureSnapshotId: 'feature_snapshot_4',
            key: 'permit.power_approval_status',
            numberValue: null,
            textValue: 'Pending utility approval',
            jsonValue: null,
            unit: null,
            sourceRef: 'permit_snapshot:power_status',
            createdAt: now
          }
        ]
      },
      {
        id: 'feature_snapshot_5',
        assetId: 'asset_screening_1',
        snapshotDate: now,
        featureNamespace: 'power_micro',
        sourceVersion: 'energySnapshot:2026-03-22T00:00:00.000Z',
        approvedById: null,
        createdAt: now,
        values: [
          {
            id: 'feature_value_11',
            assetFeatureSnapshotId: 'feature_snapshot_5',
            key: 'power.utility_name',
            numberValue: null,
            textValue: 'KEPCO',
            jsonValue: null,
            unit: null,
            sourceRef: 'energy_snapshot:utility_name',
            createdAt: now
          },
          {
            id: 'feature_value_12',
            assetFeatureSnapshotId: 'feature_snapshot_5',
            key: 'power.tariff_krw_per_kwh',
            numberValue: 158,
            textValue: null,
            jsonValue: null,
            unit: 'KRW',
            sourceRef: 'energy_snapshot:tariff_krw_per_kwh',
            createdAt: now
          },
          {
            id: 'feature_value_13',
            assetFeatureSnapshotId: 'feature_snapshot_5',
            key: 'power.pue_target',
            numberValue: 1.29,
            textValue: null,
            jsonValue: null,
            unit: null,
            sourceRef: 'energy_snapshot:pue_target',
            createdAt: now
          }
        ]
      },
      {
        id: 'feature_snapshot_6',
        assetId: 'asset_screening_1',
        snapshotDate: now,
        featureNamespace: 'revenue_micro',
        sourceVersion: 'lease:2026-03-22T00:00:00.000Z',
        approvedById: null,
        createdAt: now,
        values: [
          {
            id: 'feature_value_14',
            assetFeatureSnapshotId: 'feature_snapshot_6',
            key: 'revenue.primary_tenant',
            numberValue: null,
            textValue: 'AI inference tenant',
            jsonValue: null,
            unit: null,
            sourceRef: 'lease:tenant_name',
            createdAt: now
          },
          {
            id: 'feature_value_15',
            assetFeatureSnapshotId: 'feature_snapshot_6',
            key: 'revenue.probability_pct',
            numberValue: 72,
            textValue: null,
            jsonValue: null,
            unit: 'pct',
            sourceRef: 'lease:probability_pct',
            createdAt: now
          }
        ]
      },
      {
        id: 'feature_snapshot_7',
        assetId: 'asset_screening_1',
        snapshotDate: now,
        featureNamespace: 'legal_micro',
        sourceVersion: 'legal:2026-03-22T00:00:00.000Z',
        approvedById: null,
        createdAt: now,
        values: [
          {
            id: 'feature_value_16',
            assetFeatureSnapshotId: 'feature_snapshot_7',
            key: 'legal.encumbrance_type',
            numberValue: null,
            textValue: 'Senior mortgage',
            jsonValue: null,
            unit: null,
            sourceRef: 'encumbrance_record:type',
            createdAt: now
          },
          {
            id: 'feature_value_17',
            assetFeatureSnapshotId: 'feature_snapshot_7',
            key: 'legal.constraint_title',
            numberValue: null,
            textValue: 'Shared ingress corridor',
            jsonValue: null,
            unit: null,
            sourceRef: 'planning_constraint:title',
            createdAt: now
          },
          {
            id: 'feature_value_18',
            assetFeatureSnapshotId: 'feature_snapshot_7',
            key: 'legal.constraint_severity',
            numberValue: null,
            textValue: 'High',
            jsonValue: null,
            unit: null,
            sourceRef: 'planning_constraint:severity',
            createdAt: now
          }
        ]
      }
    ]
  });

  assert.equal(analysis.baseCaseValueKrw, analysis.scenarios[1]?.valuationKrw);
  assert.ok(analysis.scenarios[0].valuationKrw > analysis.scenarios[1].valuationKrw);
  assert.ok(analysis.scenarios[1].valuationKrw > analysis.scenarios[2].valuationKrw);
  assert.equal(
    (analysis.assumptions.leasing as { leaseCount: number }).leaseCount,
    1
  );
  assert.ok(
    ((analysis.assumptions.comparables as { directComparableValueKrw: number | null }).directComparableValueKrw ?? 0) > 0
  );
  assert.ok(
    ((analysis.assumptions.debt as { initialDebtFundingKrw: number }).initialDebtFundingKrw) > 0
  );
  assert.ok(
    Math.abs((analysis.assumptions.metrics as { occupancyPct: number }).occupancyPct - 69.25) < 0.001
  );
  assert.equal(
    (analysis.assumptions.documentFeatures as { sourceVersion: string | null }).sourceVersion,
    'document:doc_1:v1'
  );
  assert.equal(
    (analysis.assumptions.documentFeatures as { capexKrw: number | null }).capexKrw,
    130000000000
  );
  assert.ok(
    Math.abs((analysis.assumptions.metrics as { debtCostPct: number }).debtCostPct - 6.35) < 0.001
  );
  assert.equal(
    (
      (analysis.assumptions.macroRegime as { guidance: { debtCostShiftPct: number } }).guidance
    ).debtCostShiftPct,
    0.45
  );
  assert.equal(
    (analysis.assumptions.curatedFeatures as { marketInputs: { sourceVersion: string | null } }).marketInputs.sourceVersion,
    'marketSnapshot:2026-03-22T00:00:00.000Z'
  );
  assert.equal(
    (analysis.assumptions.metrics as { powerPriceKrwPerKwh: number }).powerPriceKrwPerKwh,
    158
  );
  assert.equal(
    (analysis.assumptions.metrics as { pueTarget: number }).pueTarget,
    1.29
  );
  assert.equal(
    (
      analysis.assumptions.curatedFeatures as {
        powerMicro: { sourceVersion: string | null };
        revenueMicro: { probabilityPct: number | null };
        legalMicro: { constraintSeverity: string | null };
      }
    ).powerMicro.sourceVersion,
    'energySnapshot:2026-03-22T00:00:00.000Z'
  );
  assert.equal(
    (
      analysis.assumptions.curatedFeatures as {
        powerMicro: { sourceVersion: string | null };
        revenueMicro: { probabilityPct: number | null };
        legalMicro: { constraintSeverity: string | null };
      }
    ).revenueMicro.probabilityPct,
    72
  );
  assert.equal(
    (
      analysis.assumptions.curatedFeatures as {
        powerMicro: { sourceVersion: string | null };
        revenueMicro: { probabilityPct: number | null };
        legalMicro: { constraintSeverity: string | null };
      }
    ).legalMicro.constraintSeverity,
    'High'
  );
  assert.equal(
    (analysis.assumptions.satelliteRisk as { floodRiskScore: number | null }).floodRiskScore,
    3.1
  );
  assert.equal(
    (
      analysis.assumptions.proForma as {
        baseCase: {
          years: Array<{ year: number; revenueKrw: number; debtServiceKrw: number }>;
          summary: { leveredEquityValueKrw: number };
        };
      }
    ).baseCase.years[0]?.year,
    1
  );
  assert.ok(
    (
      analysis.assumptions.proForma as {
        baseCase: {
          years: Array<{ year: number; revenueKrw: number; debtServiceKrw: number }>;
          summary: { leveredEquityValueKrw: number };
        };
      }
    ).baseCase.years[0]?.revenueKrw > 0
  );
  assert.ok(
    (
      analysis.assumptions.proForma as {
        baseCase: {
          years: Array<{ year: number; revenueKrw: number; debtServiceKrw: number }>;
          summary: { leveredEquityValueKrw: number };
        };
      }
    ).baseCase.summary.leveredEquityValueKrw > 0
  );
  assert.ok(analysis.keyRisks.some((risk) => risk.includes('Shared ingress corridor')));
  assert.ok(
    analysis.provenance.some(
      (entry) => entry.field === 'documentFeatureSnapshot' && entry.value === 'document:doc_1:v1'
    )
  );
  assert.ok(
    analysis.provenance.some(
      (entry) => entry.field === 'satelliteFeatureSnapshot' && entry.value === 'siteProfile:2026-03-22T00:00:00.000Z'
    )
  );
  assert.ok(
    analysis.provenance.some(
      (entry) => entry.field === 'powerFeatureSnapshot' && entry.value === 'energySnapshot:2026-03-22T00:00:00.000Z'
    )
  );
  assert.ok(
    analysis.provenance.some(
      (entry) => entry.field === 'legalFeatureSnapshot' && entry.value === 'legal:2026-03-22T00:00:00.000Z'
    )
  );
});
