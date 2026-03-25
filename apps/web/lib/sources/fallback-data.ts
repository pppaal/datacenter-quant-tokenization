export const FALLBACK_SOURCE_DATA = {
  geospatial: {
    'SEOUL-GANGSEO-01': {
      latitude: 37.5607,
      longitude: 126.8235,
      parcelId: '11500-2034',
      gridAvailability: '154 kV line available within 1.2 km',
      fiberAccess: 'Dual carrier route confirmed',
      latencyProfile: 'Sub-10ms to Seoul core exchanges',
      floodRiskScore: 1.8,
      wildfireRiskScore: 0.8,
      seismicRiskScore: 1.1
    },
    'INCHEON-CHEONGNA-02': {
      latitude: 37.5348,
      longitude: 126.6502,
      parcelId: '28177-4412',
      gridAvailability: '345 kV expansion corridor under review',
      fiberAccess: 'Carrier hotel adjacency planned',
      latencyProfile: 'Low-latency corridor to west Seoul and Incheon IX',
      floodRiskScore: 2.2,
      wildfireRiskScore: 0.9,
      seismicRiskScore: 1.3
    },
    'BUSAN-MYEONGJI-03': {
      latitude: 35.1064,
      longitude: 128.9096,
      parcelId: '26440-8821',
      gridAvailability: '154 kV feed with reserve land for substation bay',
      fiberAccess: 'Regional submarine cable backhaul proximity',
      latencyProfile: 'Strong southeast edge-compute profile',
      floodRiskScore: 2.7,
      wildfireRiskScore: 1.4,
      seismicRiskScore: 1.2
    }
  },
  building: {
    'SEOUL-GANGSEO-01': {
      zoning: 'Semi-industrial',
      permitStage: 'Power allocation in review; building permit package prepared',
      zoningApprovalStatus: 'Compliant',
      environmentalReviewStatus: 'Noise and traffic study submitted',
      powerApprovalStatus: 'Utility allocation pending final committee',
      buildingCoveragePct: 54,
      floorAreaRatioPct: 289,
      redundancyTier: 'Tier III+ design target',
      coolingType: 'Hybrid chilled-water',
      structureDescription: '12-storey reinforced concrete shell with rooftop mechanical deck'
    },
    'INCHEON-CHEONGNA-02': {
      zoning: 'Planned industrial',
      permitStage: 'District review complete; EPC pre-construction',
      zoningApprovalStatus: 'Conditional approval',
      environmentalReviewStatus: 'Community consultation ongoing',
      powerApprovalStatus: 'Transformer bay reservation requested',
      buildingCoveragePct: 49,
      floorAreaRatioPct: 241,
      redundancyTier: 'Tier III',
      coolingType: 'Direct-to-chip ready air-cooled chillers',
      structureDescription: '8-storey high-load hall and office block'
    },
    'BUSAN-MYEONGJI-03': {
      zoning: 'Logistics support / industrial mixed use',
      permitStage: 'Land secured; permit package at schematic stage',
      zoningApprovalStatus: 'Pre-consultation completed',
      environmentalReviewStatus: 'Marine weather addendum required',
      powerApprovalStatus: 'Preliminary utility comfort letter received',
      buildingCoveragePct: 46,
      floorAreaRatioPct: 210,
      redundancyTier: 'Tier III',
      coolingType: 'Seawater-assisted free cooling overlay under review',
      structureDescription: '6-storey edge-compute campus with modular expansion pads'
    }
  },
  energy: {
    'SEOUL-GANGSEO-01': {
      utilityName: 'KEPCO West Seoul',
      substationDistanceKm: 1.2,
      tariffKrwPerKwh: 143,
      renewableAvailabilityPct: 32,
      pueTarget: 1.31,
      backupFuelHours: 48
    },
    'INCHEON-CHEONGNA-02': {
      utilityName: 'KEPCO Incheon',
      substationDistanceKm: 2.4,
      tariffKrwPerKwh: 137,
      renewableAvailabilityPct: 41,
      pueTarget: 1.28,
      backupFuelHours: 60
    },
    'BUSAN-MYEONGJI-03': {
      utilityName: 'KEPCO Busan',
      substationDistanceKm: 3.1,
      tariffKrwPerKwh: 135,
      renewableAvailabilityPct: 35,
      pueTarget: 1.34,
      backupFuelHours: 72
    }
  },
  macro: {
    'SEOUL-GANGSEO-01': {
      metroRegion: 'Seoul Northwest',
      vacancyPct: 6.1,
      colocationRatePerKwKrw: 220000,
      capRatePct: 6.1,
      debtCostPct: 5.2,
      inflationPct: 2.3,
      constructionCostPerMwKrw: 7800000000,
      discountRatePct: 9.4,
      policyRatePct: 3.5,
      creditSpreadBps: 185,
      rentGrowthPct: 2.8,
      transactionVolumeIndex: 112,
      constructionCostIndex: 118,
      marketNotes: 'Seoul hyperscale supply remains constrained by land and grid approvals.'
    },
    'INCHEON-CHEONGNA-02': {
      metroRegion: 'Incheon / Seoul West',
      vacancyPct: 8.8,
      colocationRatePerKwKrw: 205000,
      capRatePct: 6.5,
      debtCostPct: 5.1,
      inflationPct: 2.3,
      constructionCostPerMwKrw: 7450000000,
      discountRatePct: 9.8,
      policyRatePct: 3.5,
      creditSpreadBps: 176,
      rentGrowthPct: 2.1,
      transactionVolumeIndex: 96,
      constructionCostIndex: 114,
      marketNotes: 'Incheon benefits from AI workload spillover and logistics adjacency.'
    },
    'BUSAN-MYEONGJI-03': {
      metroRegion: 'Busan Southeast',
      vacancyPct: 10.7,
      colocationRatePerKwKrw: 184000,
      capRatePct: 6.9,
      debtCostPct: 5.0,
      inflationPct: 2.3,
      constructionCostPerMwKrw: 6900000000,
      discountRatePct: 10.2,
      policyRatePct: 3.5,
      creditSpreadBps: 168,
      rentGrowthPct: 1.7,
      transactionVolumeIndex: 84,
      constructionCostIndex: 109,
      marketNotes: 'Regional demand is smaller but latency-sensitive edge deployments support underwriting.'
    }
  },
  climate: {
    'SEOUL-GANGSEO-01': {
      climateRiskNote: 'Low-to-moderate flood exposure with strong drainage infrastructure.',
      floodRiskScore: 1.8,
      wildfireRiskScore: 0.8,
      recentAverageTempC: 15.5,
      recentPrecipMm: 28,
      recentFireHotspots: 0,
      recentMaxFireRadiativePowerMw: 0
    },
    'INCHEON-CHEONGNA-02': {
      climateRiskNote: 'Reclamation-area monitoring required for storm surge and groundwater management.',
      floodRiskScore: 2.3,
      wildfireRiskScore: 0.9,
      recentAverageTempC: 14.9,
      recentPrecipMm: 36,
      recentFireHotspots: 0,
      recentMaxFireRadiativePowerMw: 0
    },
    'BUSAN-MYEONGJI-03': {
      climateRiskNote: 'Typhoon resiliency and marine corrosion mitigation should stay in the diligence scope.',
      floodRiskScore: 2.8,
      wildfireRiskScore: 1.5,
      recentAverageTempC: 16.8,
      recentPrecipMm: 44,
      recentFireHotspots: 1,
      recentMaxFireRadiativePowerMw: 8
    }
  }
} as const;

export const DEFAULT_FALLBACK_SOURCE_DATA = {
  geospatial: {
    latitude: 37.5665,
    longitude: 126.978,
    parcelId: 'manual-review-required',
    gridAvailability: 'Grid review pending manual confirmation',
    fiberAccess: 'Carrier review pending manual confirmation',
    latencyProfile: 'Metro-latency review pending',
    floodRiskScore: 2.4,
    wildfireRiskScore: 1.1,
    seismicRiskScore: 1.4
  },
  building: {
    zoning: 'Manual zoning review required',
    permitStage: 'Permit review pending',
    zoningApprovalStatus: 'Manual review',
    environmentalReviewStatus: 'Manual review',
    powerApprovalStatus: 'Utility review pending',
    buildingCoveragePct: 48,
    floorAreaRatioPct: 220,
    redundancyTier: 'Tier III target',
    coolingType: 'Cooling strategy under review',
    structureDescription: 'Building program pending detailed diligence'
  },
  energy: {
    utilityName: 'KEPCO region review pending',
    substationDistanceKm: 2.8,
    tariffKrwPerKwh: 140,
    renewableAvailabilityPct: 30,
    pueTarget: 1.34,
    backupFuelHours: 48
  },
  macro: {
    metroRegion: 'Korea regional benchmark',
    vacancyPct: 8.9,
    colocationRatePerKwKrw: 198000,
    capRatePct: 6.6,
    debtCostPct: 5.2,
    inflationPct: 2.3,
    constructionCostPerMwKrw: 7200000000,
    discountRatePct: 9.9,
    policyRatePct: 3.5,
    creditSpreadBps: 175,
    rentGrowthPct: 2,
    transactionVolumeIndex: 100,
    constructionCostIndex: 112,
    marketNotes: 'Fallback market benchmark applied pending source-specific refresh.'
  },
  climate: {
    climateRiskNote: 'Climate overlay not configured; manual resiliency review remains required.',
    floodRiskScore: 2.4,
    wildfireRiskScore: 1.1,
    recentAverageTempC: 15,
    recentPrecipMm: 30,
    recentFireHotspots: 0,
    recentMaxFireRadiativePowerMw: 0
  }
} as const;
