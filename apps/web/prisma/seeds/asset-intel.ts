import { AssetClass, type PrismaClient } from '@prisma/client';

type IntelAsset = {
  id: string;
  assetClass: AssetClass;
  name: string;
  grossFloorAreaSqm: number | null;
};

function buildIntel(asset: IntelAsset) {
  const isDataCenter = asset.assetClass === AssetClass.DATA_CENTER;
  const now = new Date();
  const year = now.getFullYear();
  const lastYear = year - 1;
  const gfa = asset.grossFloorAreaSqm ?? (isDataCenter ? 60_000 : 30_000);
  const replacementValue = Math.round(gfa * (isDataCenter ? 9_500_000 : 6_000_000));
  const effectiveFrom = new Date(Date.UTC(lastYear, 0, 1));
  const expiresOn = new Date(Date.UTC(year + 1, 0, 1));

  const insurancePolicies = [
    {
      assetId: asset.id,
      policyType: 'PROPERTY',
      insurer: 'Samsung Fire & Marine',
      brokerName: 'Marsh Korea',
      coverageKrw: replacementValue,
      deductibleKrw: Math.round(replacementValue * 0.01),
      premiumKrw: Math.round(replacementValue * 0.0008),
      effectiveFrom,
      expiresOn,
      status: 'ACTIVE',
      notes: 'All-risk replacement cover including machinery breakdown.'
    },
    {
      assetId: asset.id,
      policyType: 'BI',
      insurer: 'DB Insurance',
      coverageKrw: Math.round(replacementValue * 0.4),
      premiumKrw: Math.round(replacementValue * 0.0004),
      effectiveFrom,
      expiresOn,
      status: 'ACTIVE',
      notes: '12-month business interruption indemnity period.'
    },
    {
      assetId: asset.id,
      policyType: isDataCenter ? 'CYBER' : 'LIABILITY',
      insurer: 'Hyundai Marine & Fire',
      coverageKrw: Math.round(replacementValue * 0.2),
      premiumKrw: Math.round(replacementValue * 0.0003),
      effectiveFrom,
      expiresOn,
      status: 'PENDING_RENEWAL',
      notes: isDataCenter
        ? 'Cyber and tenant-data liability tower.'
        : 'General and tenant liability tower.'
    }
  ];

  const baseEmissions = isDataCenter ? 14_000 : 3_200;
  const carbonRecords = [
    {
      assetId: asset.id,
      scope: 1,
      category: 'FUEL_COMBUSTION',
      vintageYear: lastYear,
      tco2e: Math.round(baseEmissions * 0.08),
      methodology: 'GHG_PROTOCOL_LB',
      verifiedBy: 'DNV',
      sourceSystem: 'ESG_LEDGER'
    },
    {
      assetId: asset.id,
      scope: 2,
      category: 'PURCHASED_ELECTRICITY',
      vintageYear: lastYear,
      tco2e: Math.round(baseEmissions * 0.78),
      methodology: 'MARKET_BASED',
      verifiedBy: 'DNV',
      sourceSystem: 'ESG_LEDGER'
    },
    {
      assetId: asset.id,
      scope: 3,
      category: 'EMBODIED',
      vintageYear: lastYear,
      tco2e: Math.round(baseEmissions * 0.14),
      methodology: 'GHG_PROTOCOL_LB',
      sourceSystem: 'ESG_LEDGER'
    }
  ];

  const sideLetters = [
    {
      assetId: asset.id,
      lpName: 'National Pension Service',
      lpEntityType: 'SOVEREIGN_PENSION',
      termCategory: 'MFN',
      termSummary: 'Most-favoured-nation on fees and key economic terms across the vehicle.',
      mfnEligible: true,
      effectiveFrom
    },
    {
      assetId: asset.id,
      lpName: 'Korea Investment Corporation',
      lpEntityType: 'SOVEREIGN_WEALTH',
      termCategory: 'COINVESTMENT',
      termSummary: 'Priority co-investment rights on follow-on capacity at cost.',
      mfnEligible: false,
      effectiveFrom
    }
  ];

  const parcels = [
    {
      assetId: asset.id,
      parcelId: `${asset.id.slice(-6).toUpperCase()}-PCL-01`,
      landUseType: isDataCenter ? 'Semi-industrial' : 'Commercial',
      zoningCode: isDataCenter ? 'SEMI_IND' : 'CBD_COMMERCIAL',
      landAreaSqm: Math.round(gfa * 0.35),
      officialLandValueKrw: Math.round(gfa * (isDataCenter ? 1_800_000 : 9_500_000)),
      roadAccess: '20m arterial frontage',
      sourceSystem: 'MOLIT'
    }
  ];

  const buildingRecords = [
    {
      assetId: asset.id,
      buildingName: asset.name,
      useType: isDataCenter ? 'Data center / Class 2 neighborhood facility' : 'Office',
      completionDate: new Date(Date.UTC(lastYear - 2, 5, 30)),
      floorCount: isDataCenter ? 7 : 21,
      basementCount: isDataCenter ? 1 : 6,
      grossFloorAreaSqm: gfa,
      structureType: 'Reinforced concrete',
      occupancyCertificate: 'Issued',
      sourceSystem: 'MOLIT'
    }
  ];

  const geoFeatures = [
    {
      assetId: asset.id,
      featureType: 'INFRASTRUCTURE',
      featureKey: 'substation_distance',
      valueNumber: isDataCenter ? 1.2 : 2.4,
      unit: 'km',
      sourceSystem: 'KEPCO'
    },
    {
      assetId: asset.id,
      featureType: 'CONNECTIVITY',
      featureKey: 'fiber_pop_count',
      valueNumber: isDataCenter ? 3 : 2,
      unit: 'POPs',
      sourceSystem: 'KT_FIBER'
    },
    {
      assetId: asset.id,
      featureType: 'TRANSIT',
      featureKey: 'nearest_station',
      valueText: isDataCenter ? 'Metro line — 1.1 km' : 'Subway line 9 — 350 m',
      sourceSystem: 'KRIC'
    },
    {
      assetId: asset.id,
      featureType: 'HAZARD',
      featureKey: 'flood_zone',
      valueText: 'Outside 100-year floodplain',
      sourceSystem: 'MOIS'
    }
  ];

  const pipelineProjects = [
    {
      assetId: asset.id,
      projectName: isDataCenter
        ? 'Competing Hyperscale Campus II'
        : 'Adjacent Grade-A Office Tower',
      market: 'KR',
      region: 'Seoul Metro',
      stageLabel: 'UNDER_CONSTRUCTION',
      expectedDeliveryDate: new Date(Date.UTC(year + 1, 8, 1)),
      expectedPowerMw: isDataCenter ? 40 : null,
      expectedAreaSqm: isDataCenter ? null : 42_000,
      sponsorName: 'Regional Infra Partners',
      sourceSystem: 'MARKET_PIPELINE'
    },
    {
      assetId: asset.id,
      projectName: isDataCenter
        ? 'Edge Compute Yard (planning)'
        : 'Mixed-use Redevelopment (planning)',
      market: 'KR',
      region: 'Seoul Metro',
      stageLabel: 'PLANNING',
      expectedDeliveryDate: new Date(Date.UTC(year + 3, 2, 1)),
      expectedPowerMw: isDataCenter ? 18 : null,
      expectedAreaSqm: isDataCenter ? null : 28_000,
      sponsorName: 'Metro Development Co.',
      sourceSystem: 'MARKET_PIPELINE'
    }
  ];

  const aiInsights = [
    {
      assetId: asset.id,
      insightType: 'RISK',
      title: 'Near-term power/lease concentration',
      content: isDataCenter
        ? 'Single anchor tenant carries most contracted load; monitor grid allocation milestones before committee lock.'
        : 'Rollover concentrated in two financial-sector tenants; refresh rent comps before committee lock.',
      modelName: 'underwriting-assistant',
      status: 'ACTIVE'
    },
    {
      assetId: asset.id,
      insightType: 'MARKET',
      title: 'Submarket supply watch',
      content:
        'Competing pipeline within the submarket could pressure stabilized rents; supply ladder reflected in the pro forma exit assumptions.',
      modelName: 'underwriting-assistant',
      status: 'ACTIVE'
    }
  ];

  return {
    insurancePolicies,
    carbonRecords,
    sideLetters,
    parcels,
    buildingRecords,
    geoFeatures,
    pipelineProjects,
    aiInsights
  };
}

/**
 * Seeds display-only intelligence (insurance, carbon, LP side letters, parcels,
 * building records, geo features, supply pipeline, AI insights) for every
 * seeded asset, so the corresponding dossier panels render in the demo. These
 * feed the UI only — they are not inputs to the valuation engine.
 */
export async function seedAssetIntel(prisma: PrismaClient): Promise<void> {
  const assets = await prisma.asset.findMany({
    select: { id: true, assetClass: true, name: true, grossFloorAreaSqm: true }
  });

  for (const asset of assets) {
    const intel = buildIntel(asset);
    await prisma.insurancePolicy.createMany({ data: intel.insurancePolicies });
    await prisma.carbonEmissionRecord.createMany({ data: intel.carbonRecords });
    await prisma.sideLetter.createMany({ data: intel.sideLetters });
    await prisma.parcel.createMany({ data: intel.parcels });
    await prisma.buildingRecord.createMany({ data: intel.buildingRecords });
    await prisma.geoFeature.createMany({ data: intel.geoFeatures });
    await prisma.pipelineProject.createMany({ data: intel.pipelineProjects });
    await prisma.aiInsight.createMany({ data: intel.aiInsights });
  }
}
