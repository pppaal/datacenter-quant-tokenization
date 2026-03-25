import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

function getKnownSystems() {
  return [
    'korea-geospatial',
    'juso-address',
    'korea-building-permit',
    'korea-energy',
    'global-fx-rates',
    'global-macro-api',
    'global-market-api',
    'us-fred',
    'us-public-macro-stack',
    'us-bls',
    'us-treasury-fiscal-data',
    'ecb-data-api',
    'korea-macro-rates',
    'kosis-statistics',
    ...(process.env.CLIMATE_OVERLAY_API_URL
      ? ['climate-overlay']
      : ['nasa-power', 'nasa-gpm-imerg', 'nasa-firms'])
  ];
}

export type MacroConnectorReadiness = {
  id: string;
  label: string;
  priority: number;
  status: 'CONFIGURED' | 'PARTIAL' | 'MISSING';
  description: string;
  fields: string[];
  envKeys: string[];
  configuredKeys: string[];
};

export type GlobalMarketLaunchPlan = {
  region: string;
  phase: number;
  status: 'NOW' | 'NEXT' | 'LATER';
  thesis: string;
  assetClasses: string[];
  macroSources: string[];
  marketSources: string[];
  blockers: string[];
};

export type FreeMacroSourceCatalogItem = {
  id: string;
  label: string;
  region: string;
  providerType: 'central_bank' | 'statistics_agency' | 'fiscal' | 'multilateral';
  coverage: string[];
  cadence: 'intraday' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'release_based';
  realtimeClass: 'REALTIME' | 'NEAR_REALTIME' | 'RELEASE_BASED' | 'LOW_FREQUENCY';
  auth: 'none' | 'api_key' | 'registration';
  docsUrl: string;
  note: string;
};

type MacroConnectorDefinition = {
  id: string;
  label: string;
  priority: number;
  description: string;
  fields: string[];
  requiredGroups: string[][];
  optionalKeys?: string[];
};

const macroConnectorDefinitions: MacroConnectorDefinition[] = [
  {
    id: 'custom_macro_api',
    label: 'Global Macro API',
    priority: 1,
    description: 'Preferred single endpoint for market, rates, spreads, leasing, and cost data.',
    fields: [
      'vacancy',
      'cap rate',
      'debt cost',
      'discount rate',
      'policy rate',
      'credit spread',
      'rent growth',
      'transaction volume',
      'construction cost index'
    ],
    requiredGroups: [['GLOBAL_MACRO_API_URL'], ['KOREA_MACRO_API_URL']],
    optionalKeys: ['GLOBAL_MACRO_API_KEY', 'KOREA_MACRO_API_KEY']
  },
  {
    id: 'global_fx_api',
    label: 'Global FX API',
    priority: 2,
    description: 'Live FX connector for non-KRW asset intake, micro data, and display normalization.',
    fields: ['fx rates', 'currency normalization'],
    requiredGroups: [['GLOBAL_FX_API_URL']],
    optionalKeys: ['GLOBAL_FX_API_KEY']
  },
  {
    id: 'global_market_api',
    label: 'Global Market API',
    priority: 3,
    description: 'Market-layer connector for vacancy, cap rates, transaction comps, rent comps, and indicator history.',
    fields: ['vacancy', 'cap rate', 'transaction comps', 'rent comps', 'market indicators'],
    requiredGroups: [['GLOBAL_MARKET_API_URL'], ['US_MARKET_API_URL']],
    optionalKeys: ['GLOBAL_MARKET_API_KEY', 'US_MARKET_API_KEY']
  },
  {
    id: 'us_fred_inflation',
    label: 'US FRED Inflation',
    priority: 4,
    description: 'US CPI or inflation series for the macro regime engine in the first global launch market.',
    fields: ['inflation'],
    requiredGroups: [['US_FRED_API_KEY', 'US_FRED_INFLATION_SERIES_ID']],
    optionalKeys: ['US_FRED_BASE_URL']
  },
  {
    id: 'us_fred_policy_rate',
    label: 'US FRED Policy Rate',
    priority: 5,
    description: 'Fed funds or policy-rate series for capital-market and refinancing interpretation.',
    fields: ['policy rate'],
    requiredGroups: [['US_FRED_API_KEY', 'US_FRED_POLICY_RATE_SERIES_ID']],
    optionalKeys: ['US_FRED_BASE_URL']
  },
  {
    id: 'us_fred_credit_spread',
    label: 'US FRED Credit Spread',
    priority: 6,
    description: 'Spread proxy for debt tightness and refinance risk in US underwriting.',
    fields: ['credit spread'],
    requiredGroups: [['US_FRED_API_KEY', 'US_FRED_CREDIT_SPREAD_SERIES_ID']],
    optionalKeys: ['US_FRED_BASE_URL']
  },
  {
    id: 'us_fred_rent_growth',
    label: 'US FRED Rent Growth',
    priority: 7,
    description: 'Rent-growth or leasing-demand proxy for the US market module.',
    fields: ['rent growth'],
    requiredGroups: [['US_FRED_API_KEY', 'US_FRED_RENT_GROWTH_SERIES_ID']],
    optionalKeys: ['US_FRED_BASE_URL']
  },
  {
    id: 'us_fred_transaction_volume',
    label: 'US FRED Transaction Volume',
    priority: 8,
    description: 'Liquidity proxy for US exit-market depth and underwriting confidence.',
    fields: ['transaction volume'],
    requiredGroups: [['US_FRED_API_KEY', 'US_FRED_TRANSACTION_VOLUME_SERIES_ID']],
    optionalKeys: ['US_FRED_BASE_URL']
  },
  {
    id: 'us_fred_construction_cost_index',
    label: 'US FRED Construction Cost Index',
    priority: 9,
    description: 'US construction-cost pressure series for replacement-cost and contingency overlays.',
    fields: ['construction cost index'],
    requiredGroups: [['US_FRED_API_KEY', 'US_FRED_CONSTRUCTION_COST_INDEX_SERIES_ID']],
    optionalKeys: ['US_FRED_BASE_URL']
  },
  {
    id: 'us_bls_inflation',
    label: 'US BLS Inflation',
    priority: 10,
    description: 'Official BLS inflation series for a second free US inflation source beyond FRED.',
    fields: ['inflation'],
    requiredGroups: [['US_BLS_INFLATION_SERIES_ID']],
    optionalKeys: ['US_BLS_API_KEY', 'BLS_API_KEY', 'US_BLS_BASE_URL']
  },
  {
    id: 'us_bls_construction_cost_index',
    label: 'US BLS Construction Cost Index',
    priority: 11,
    description: 'BLS/PPI-style construction cost pressure series for replacement-cost overlays.',
    fields: ['construction cost index'],
    requiredGroups: [['US_BLS_CONSTRUCTION_COST_INDEX_SERIES_ID']],
    optionalKeys: ['US_BLS_API_KEY', 'BLS_API_KEY', 'US_BLS_BASE_URL']
  },
  {
    id: 'us_bls_rent_growth',
    label: 'US BLS Rent Growth',
    priority: 12,
    description: 'BLS leasing or shelter proxy series for rent-growth confirmation.',
    fields: ['rent growth'],
    requiredGroups: [['US_BLS_RENT_GROWTH_SERIES_ID']],
    optionalKeys: ['US_BLS_API_KEY', 'BLS_API_KEY', 'US_BLS_BASE_URL']
  },
  {
    id: 'us_treasury_policy_proxy',
    label: 'US Treasury Policy Proxy',
    priority: 13,
    description: 'Treasury Fiscal Data endpoint for a daily short-rate or front-end yield proxy.',
    fields: ['policy rate proxy'],
    requiredGroups: [['US_TREASURY_POLICY_PROXY_ENDPOINT', 'US_TREASURY_POLICY_PROXY_FIELD']],
    optionalKeys: ['US_TREASURY_POLICY_PROXY_DATE_FIELD', 'US_TREASURY_API_BASE_URL']
  },
  {
    id: 'us_treasury_debt_cost',
    label: 'US Treasury Debt Cost',
    priority: 14,
    description: 'Treasury Fiscal Data endpoint for debt-cost or funding benchmark proxy.',
    fields: ['debt cost'],
    requiredGroups: [['US_TREASURY_DEBT_COST_ENDPOINT', 'US_TREASURY_DEBT_COST_FIELD']],
    optionalKeys: ['US_TREASURY_DEBT_COST_DATE_FIELD', 'US_TREASURY_API_BASE_URL']
  },
  {
    id: 'us_treasury_discount_rate',
    label: 'US Treasury Discount Rate',
    priority: 15,
    description: 'Treasury Fiscal Data endpoint for discount-rate or long-end yield proxy.',
    fields: ['discount rate'],
    requiredGroups: [['US_TREASURY_DISCOUNT_RATE_ENDPOINT', 'US_TREASURY_DISCOUNT_RATE_FIELD']],
    optionalKeys: ['US_TREASURY_DISCOUNT_RATE_DATE_FIELD', 'US_TREASURY_API_BASE_URL']
  },
  {
    id: 'ecb_inflation',
    label: 'ECB Inflation',
    priority: 16,
    description: 'ECB Data API series for euro-area inflation in the global market stack.',
    fields: ['inflation'],
    requiredGroups: [['ECB_INFLATION_FLOW_REF', 'ECB_INFLATION_KEY']],
    optionalKeys: ['ECB_DATA_API_BASE_URL']
  },
  {
    id: 'ecb_policy_rate',
    label: 'ECB Policy Rate',
    priority: 17,
    description: 'ECB Data API series for deposit or main refinancing rate.',
    fields: ['policy rate'],
    requiredGroups: [['ECB_POLICY_RATE_FLOW_REF', 'ECB_POLICY_RATE_KEY']],
    optionalKeys: ['ECB_DATA_API_BASE_URL']
  },
  {
    id: 'ecb_credit_spread',
    label: 'ECB Credit Spread',
    priority: 18,
    description: 'ECB Data API series for euro credit conditions or spread proxy.',
    fields: ['credit spread'],
    requiredGroups: [['ECB_CREDIT_SPREAD_FLOW_REF', 'ECB_CREDIT_SPREAD_KEY']],
    optionalKeys: ['ECB_DATA_API_BASE_URL']
  },
  {
    id: 'ecb_rent_growth',
    label: 'ECB Rent Growth',
    priority: 19,
    description: 'ECB Data API series for leasing-demand or rent-growth proxy in euro markets.',
    fields: ['rent growth'],
    requiredGroups: [['ECB_RENT_GROWTH_FLOW_REF', 'ECB_RENT_GROWTH_KEY']],
    optionalKeys: ['ECB_DATA_API_BASE_URL']
  },
  {
    id: 'ecb_transaction_volume',
    label: 'ECB Transaction Volume',
    priority: 20,
    description: 'ECB Data API series for liquidity or transaction-volume proxy.',
    fields: ['transaction volume'],
    requiredGroups: [['ECB_TRANSACTION_VOLUME_FLOW_REF', 'ECB_TRANSACTION_VOLUME_KEY']],
    optionalKeys: ['ECB_DATA_API_BASE_URL']
  },
  {
    id: 'ecb_construction_cost_index',
    label: 'ECB Construction Cost Index',
    priority: 21,
    description: 'ECB Data API series for euro-area construction-cost pressure.',
    fields: ['construction cost index'],
    requiredGroups: [['ECB_CONSTRUCTION_COST_INDEX_FLOW_REF', 'ECB_CONSTRUCTION_COST_INDEX_KEY']],
    optionalKeys: ['ECB_DATA_API_BASE_URL']
  },
  {
    id: 'kosis_inflation',
    label: 'KOSIS Inflation',
    priority: 22,
    description: 'Monthly inflation benchmark for growth, construction pressure, and discount-rate framing.',
    fields: ['inflation'],
    requiredGroups: [
      ['KOREA_KOSIS_INFLATION_USER_STATS_ID'],
      ['KOREA_KOSIS_INFLATION_ORG_ID', 'KOREA_KOSIS_INFLATION_TBL_ID', 'KOREA_KOSIS_INFLATION_ITM_ID']
    ]
  },
  {
    id: 'kosis_construction_cost',
    label: 'KOSIS Construction Cost',
    priority: 23,
    description: 'Raw construction cost or cost benchmark for replacement cost pressure.',
    fields: ['construction cost'],
    requiredGroups: [
      ['KOREA_KOSIS_CONSTRUCTION_COST_USER_STATS_ID'],
      [
        'KOREA_KOSIS_CONSTRUCTION_COST_ORG_ID',
        'KOREA_KOSIS_CONSTRUCTION_COST_TBL_ID',
        'KOREA_KOSIS_CONSTRUCTION_COST_ITM_ID'
      ]
    ]
  },
  {
    id: 'kosis_policy_rate',
    label: 'KOSIS Policy Rate',
    priority: 24,
    description: 'Policy rate input for capital-market regime and refinancing posture.',
    fields: ['policy rate'],
    requiredGroups: [
      ['KOREA_KOSIS_POLICY_RATE_USER_STATS_ID'],
      ['KOREA_KOSIS_POLICY_RATE_ORG_ID', 'KOREA_KOSIS_POLICY_RATE_TBL_ID', 'KOREA_KOSIS_POLICY_RATE_ITM_ID']
    ]
  },
  {
    id: 'kosis_credit_spread',
    label: 'KOSIS Credit Spread',
    priority: 25,
    description: 'Credit spread input for capital tightness and refinance stress.',
    fields: ['credit spread'],
    requiredGroups: [
      ['KOREA_KOSIS_CREDIT_SPREAD_USER_STATS_ID'],
      ['KOREA_KOSIS_CREDIT_SPREAD_ORG_ID', 'KOREA_KOSIS_CREDIT_SPREAD_TBL_ID', 'KOREA_KOSIS_CREDIT_SPREAD_ITM_ID']
    ]
  },
  {
    id: 'kosis_rent_growth',
    label: 'KOSIS Rent Growth',
    priority: 26,
    description: 'Leasing-market direction input for rent growth and demand conviction.',
    fields: ['rent growth'],
    requiredGroups: [
      ['KOREA_KOSIS_RENT_GROWTH_USER_STATS_ID'],
      ['KOREA_KOSIS_RENT_GROWTH_ORG_ID', 'KOREA_KOSIS_RENT_GROWTH_TBL_ID', 'KOREA_KOSIS_RENT_GROWTH_ITM_ID']
    ]
  },
  {
    id: 'kosis_transaction_volume',
    label: 'KOSIS Transaction Volume',
    priority: 27,
    description: 'Liquidity proxy for exit market depth and refinance availability.',
    fields: ['transaction volume'],
    requiredGroups: [
      ['KOREA_KOSIS_TRANSACTION_VOLUME_USER_STATS_ID'],
      [
        'KOREA_KOSIS_TRANSACTION_VOLUME_ORG_ID',
        'KOREA_KOSIS_TRANSACTION_VOLUME_TBL_ID',
        'KOREA_KOSIS_TRANSACTION_VOLUME_ITM_ID'
      ]
    ]
  },
  {
    id: 'kosis_construction_cost_index',
    label: 'KOSIS Construction Cost Index',
    priority: 28,
    description: 'Cost-pressure index for macro construction regime classification.',
    fields: ['construction cost index'],
    requiredGroups: [
      ['KOREA_KOSIS_CONSTRUCTION_COST_INDEX_USER_STATS_ID'],
      [
        'KOREA_KOSIS_CONSTRUCTION_COST_INDEX_ORG_ID',
        'KOREA_KOSIS_CONSTRUCTION_COST_INDEX_TBL_ID',
        'KOREA_KOSIS_CONSTRUCTION_COST_INDEX_ITM_ID'
      ]
    ]
  }
];

function hasValue(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getConfiguredKeys(groups: string[][], env: NodeJS.ProcessEnv) {
  return groups.flat().filter((key) => hasValue(env[key]));
}

function resolveConnectorStatus(definition: MacroConnectorDefinition, env: NodeJS.ProcessEnv) {
  const groupSatisfied = definition.requiredGroups.some((group) => group.every((key) => hasValue(env[key])));
  const configuredKeys = [
    ...getConfiguredKeys(definition.requiredGroups, env),
    ...(definition.optionalKeys ?? []).filter((key) => hasValue(env[key]))
  ];

  if (groupSatisfied) return { status: 'CONFIGURED' as const, configuredKeys };
  if (configuredKeys.length > 0) return { status: 'PARTIAL' as const, configuredKeys };
  return { status: 'MISSING' as const, configuredKeys };
}

export function listMacroConnectorReadiness(env: NodeJS.ProcessEnv = process.env): MacroConnectorReadiness[] {
  return macroConnectorDefinitions.map((definition) => {
    const { status, configuredKeys } = resolveConnectorStatus(definition, env);

    return {
      id: definition.id,
      label: definition.label,
      priority: definition.priority,
      status,
      description: definition.description,
      fields: definition.fields,
      envKeys: [...new Set([...definition.requiredGroups.flat(), ...(definition.optionalKeys ?? [])])],
      configuredKeys
    };
  });
}

export function listGlobalMarketLaunchPlan(): GlobalMarketLaunchPlan[] {
  return [
    {
      region: 'United States',
      phase: 1,
      status: 'NOW',
      thesis: 'Deepest transaction market and richest public macro stack. Best first global market for underwriting credibility.',
      assetClasses: ['Office', 'Industrial', 'Multifamily', 'Retail', 'Data Center'],
      macroSources: ['FRED', 'BLS', 'Treasury yields', 'CMBS spread proxies'],
      marketSources: ['CoStar', 'MSCI/RCA', 'broker reports', 'internal comp ingestion'],
      blockers: ['licensed market data access', 'submarket vacancy/rent feed normalization']
    },
    {
      region: 'United Kingdom / Europe',
      phase: 2,
      status: 'NEXT',
      thesis: 'High institutional relevance and cross-border capital flows. Strong fit for office, logistics, and living sectors.',
      assetClasses: ['Office', 'Industrial', 'Multifamily', 'Retail', 'Data Center'],
      macroSources: ['ECB', 'Bank of England', 'Eurostat', 'ONS'],
      marketSources: ['MSCI', 'broker reports', 'local transaction comp feeds'],
      blockers: ['country-by-country rent index mapping', 'currency normalization', 'permit/zoning fragmentation']
    },
    {
      region: 'Japan / Singapore',
      phase: 3,
      status: 'NEXT',
      thesis: 'Core APAC gateway markets with strong data center and logistics relevance.',
      assetClasses: ['Industrial', 'Office', 'Data Center', 'Multifamily'],
      macroSources: ['BoJ', 'MAS', 'government statistics', 'local bond curves'],
      marketSources: ['JLL/CBRE reports', 'local comps', 'power and infra sources'],
      blockers: ['localized market terms', 'power and utility data access', 'language-specific document extraction']
    },
    {
      region: 'Middle East / Rest of APAC',
      phase: 4,
      status: 'LATER',
      thesis: 'Attractive for infra and data center growth, but source reliability and standardization are less mature.',
      assetClasses: ['Industrial', 'Hospitality', 'Data Center', 'Specialty'],
      macroSources: ['central bank releases', 'World Bank', 'IMF', 'local statistics agencies'],
      marketSources: ['broker reports', 'partner data rooms', 'manual comp curation'],
      blockers: ['data consistency', 'market conventions', 'lower public transparency']
    }
  ];
}

export function listFreeMacroSourceCatalog(): FreeMacroSourceCatalogItem[] {
  return [
    {
      id: 'fred',
      label: 'FRED',
      region: 'United States',
      providerType: 'central_bank',
      coverage: ['rates', 'credit spreads', 'labor proxies', 'housing', 'financial conditions'],
      cadence: 'release_based',
      realtimeClass: 'RELEASE_BASED',
      auth: 'api_key',
      docsUrl: 'https://fred.stlouisfed.org/docs/api/fred/series_observations.html',
      note: 'Best free US macro hub, but update timing follows the underlying release calendar rather than true tick realtime.'
    },
    {
      id: 'bls',
      label: 'BLS Public Data API',
      region: 'United States',
      providerType: 'statistics_agency',
      coverage: ['CPI', 'PPI', 'employment', 'wages', 'productivity'],
      cadence: 'release_based',
      realtimeClass: 'RELEASE_BASED',
      auth: 'registration',
      docsUrl: 'https://www.bls.gov/developers/',
      note: 'Core inflation and labor source. Free, official, and reliable, but tied to BLS publication schedules.'
    },
    {
      id: 'bea',
      label: 'BEA API',
      region: 'United States',
      providerType: 'statistics_agency',
      coverage: ['GDP', 'personal income', 'regional accounts', 'trade', 'industry data'],
      cadence: 'release_based',
      realtimeClass: 'RELEASE_BASED',
      auth: 'registration',
      docsUrl: 'https://www.bea.gov/resources/developer-tools',
      note: 'Best free source for GDP, regional accounts, and national accounts structure. Good for macro and local demand context.'
    },
    {
      id: 'treasury_fiscal_data',
      label: 'U.S. Treasury Fiscal Data API',
      region: 'United States',
      providerType: 'fiscal',
      coverage: ['yield proxies', 'debt issuance', 'government cash flows', 'fiscal balance context'],
      cadence: 'daily',
      realtimeClass: 'NEAR_REALTIME',
      auth: 'none',
      docsUrl: 'https://fiscaldata.treasury.gov/api-documentation/',
      note: 'Strong free fiscal and debt-market context. Some datasets update daily and can feed liquidity or issuance factors.'
    },
    {
      id: 'ecb_data_portal',
      label: 'ECB Data API',
      region: 'Euro Area',
      providerType: 'central_bank',
      coverage: ['policy rates', 'bond yields', 'money supply', 'banking and credit'],
      cadence: 'daily',
      realtimeClass: 'NEAR_REALTIME',
      auth: 'none',
      docsUrl: 'https://data.ecb.europa.eu/help/api/data',
      note: 'Free official euro-area macro source. Good for rates, banking, and credit context across Europe.'
    },
    {
      id: 'world_bank',
      label: 'World Bank Indicators API',
      region: 'Global',
      providerType: 'multilateral',
      coverage: ['population', 'GDP per capita', 'debt', 'development indicators', 'long-run structural data'],
      cadence: 'annual',
      realtimeClass: 'LOW_FREQUENCY',
      auth: 'none',
      docsUrl: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation',
      note: 'Good global cross-country baseline, but not suitable for high-frequency macro regime updates.'
    },
    {
      id: 'oecd',
      label: 'OECD Data API',
      region: 'OECD / Global',
      providerType: 'multilateral',
      coverage: ['leading indicators', 'productivity', 'housing', 'business surveys', 'trade'],
      cadence: 'release_based',
      realtimeClass: 'RELEASE_BASED',
      auth: 'none',
      docsUrl: 'https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html',
      note: 'Useful for international comparables and leading indicators. Free, but rate-limited and not a realtime feed.'
    },
    {
      id: 'imf',
      label: 'IMF Data API',
      region: 'Global',
      providerType: 'multilateral',
      coverage: ['balance of payments', 'IFS', 'public finance', 'external sector'],
      cadence: 'release_based',
      realtimeClass: 'RELEASE_BASED',
      auth: 'registration',
      docsUrl: 'https://data.imf.org/en/Resource-Pages/IMF-API',
      note: 'Useful for cross-country macro and external accounts, but not the first source for near-real-time workflows.'
    }
  ];
}

export async function listSourceStatus(db: PrismaClient = prisma) {
  const caches = await db.sourceCache.findMany({
    orderBy: {
      fetchedAt: 'desc'
    }
  });

  return getKnownSystems().map((sourceSystem) => {
    const latest = caches.find((cache) => cache.sourceSystem === sourceSystem);
    return {
      sourceSystem,
      status: latest?.status ?? 'FAILED',
      freshnessLabel: latest?.freshnessLabel ?? 'not yet queried',
      fetchedAt: latest?.fetchedAt ?? null,
      expiresAt: latest?.expiresAt ?? null,
      cacheKey: latest?.cacheKey ?? null
    };
  });
}
