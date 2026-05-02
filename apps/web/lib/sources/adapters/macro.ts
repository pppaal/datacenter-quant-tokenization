import { SourceStatus } from '@prisma/client';
import { DEFAULT_FALLBACK_SOURCE_DATA, FALLBACK_SOURCE_DATA } from '@/lib/sources/fallback-data';
import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import type { SourceCacheStore, SourceEnvelope } from '@/lib/sources/types';

export type MacroData = {
  metroRegion: string;
  vacancyPct: number;
  colocationRatePerKwKrw: number;
  capRatePct: number;
  debtCostPct: number;
  inflationPct: number;
  constructionCostPerMwKrw: number;
  discountRatePct: number;
  policyRatePct?: number | null;
  creditSpreadBps?: number | null;
  rentGrowthPct?: number | null;
  transactionVolumeIndex?: number | null;
  constructionCostIndex?: number | null;
  marketNotes: string;
};

export type MacroFetchInput =
  | string
  | {
      assetCode: string;
      market?: string | null;
      country?: string | null;
    };

type KosisResponseRow = {
  DT?: string;
  PRD_DE?: string;
  TBL_NM?: string;
  UNIT_NM?: string;
};

type FredObservation = {
  date?: string;
  value?: string;
};

type FredResponse = {
  observations?: FredObservation[];
};

type BlsSeriesEntry = {
  year?: string;
  period?: string;
  periodName?: string;
  value?: string;
};

type BlsResponse = {
  Results?: {
    series?: Array<{
      seriesID?: string;
      data?: BlsSeriesEntry[];
    }>;
  };
};

type TreasuryResponse = {
  data?: Array<Record<string, string | number | null>>;
};

const DEFAULT_US_FALLBACK_MACRO: MacroData = {
  metroRegion: 'United States benchmark',
  vacancyPct: 7.2,
  colocationRatePerKwKrw: 235000,
  capRatePct: 5.9,
  debtCostPct: 6.0,
  inflationPct: 2.8,
  constructionCostPerMwKrw: 8_200_000_000,
  discountRatePct: 8.6,
  policyRatePct: 5.25,
  creditSpreadBps: 165,
  rentGrowthPct: 2.1,
  transactionVolumeIndex: 96,
  constructionCostIndex: 121,
  marketNotes: 'US benchmark fallback applied pending live FRED or custom macro ingestion.'
};

const EURO_AREA_MARKETS = new Set([
  'EU',
  'EA',
  'EUR',
  'AT',
  'BE',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK'
]);

function parseSeriesValue(value?: string) {
  if (!value) return null;
  const normalized = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeMarket(input?: string | null) {
  return String(input ?? 'KR')
    .trim()
    .toUpperCase();
}

function isEuroAreaMarket(market: string) {
  return EURO_AREA_MARKETS.has(market);
}

function hasConfiguredSeries(prefix: string, suffix = '_SERIES_ID') {
  return Boolean(process.env[`${prefix}${suffix}`]?.trim());
}

function formatBlsPeriod(entry: BlsSeriesEntry) {
  if (!entry.year) return null;
  if (!entry.period) return entry.year;
  if (/^M\d{2}$/i.test(entry.period)) {
    return `${entry.year}-${entry.period.slice(1)}`;
  }

  return `${entry.year}-${entry.period}`;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function resolveMacroRequest(input: MacroFetchInput) {
  if (typeof input === 'string') {
    return {
      assetCode: input,
      market: 'KR'
    };
  }

  return {
    assetCode: input.assetCode,
    market: normalizeMarket(input.country ?? input.market)
  };
}

function getFallbackMacro(assetCode: string, market: string): MacroData {
  const seeded = FALLBACK_SOURCE_DATA.macro[assetCode as keyof typeof FALLBACK_SOURCE_DATA.macro];
  if (seeded) return seeded;
  if (market === 'US') return DEFAULT_US_FALLBACK_MACRO;

  return {
    ...DEFAULT_FALLBACK_SOURCE_DATA.macro,
    metroRegion:
      market === 'KR' ? DEFAULT_FALLBACK_SOURCE_DATA.macro.metroRegion : `${market} benchmark`,
    marketNotes:
      market === 'KR'
        ? DEFAULT_FALLBACK_SOURCE_DATA.macro.marketNotes
        : `Fallback market benchmark applied for ${market} pending source-specific refresh.`
  };
}

async function fetchKosisLatestValue(
  userStatsId: string,
  fetcher?: Fetcher,
  options?: {
    prdSe?: string;
    itemId?: string;
  }
) {
  const apiKey = process.env.KOREA_KOSIS_API_KEY;
  if (!apiKey) return null;

  const url = new URL(
    process.env.KOREA_KOSIS_BASE_URL || 'https://kosis.kr/openapi/statisticsData.do'
  );
  url.searchParams.set('method', 'getList');
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('jsonVD', 'Y');
  url.searchParams.set('userStatsId', userStatsId);
  url.searchParams.set('prdSe', options?.prdSe || 'M');
  url.searchParams.set('newEstPrdCnt', process.env.KOREA_KOSIS_NEWEST_COUNT || '1');
  url.searchParams.set('prdInterval', '1');
  if (options?.itemId) {
    url.searchParams.set('itmId', options.itemId);
  }

  const payload = (await fetchJsonWithRetry(
    url.toString(),
    { cache: 'no-store' },
    { fetcher }
  )) as KosisResponseRow[];

  const first = Array.isArray(payload) ? payload[0] : null;
  const value = parseSeriesValue(first?.DT);
  if (value === null) return null;

  return {
    value,
    period: first?.PRD_DE || null,
    title: first?.TBL_NM || 'KOSIS statistic',
    unit: first?.UNIT_NM || ''
  };
}

async function fetchKosisLatestValueByTable(
  input: {
    orgId?: string;
    tblId?: string;
    itmId?: string;
    objL1?: string;
    objL2?: string;
    prdSe?: string;
  },
  fetcher?: Fetcher
) {
  const apiKey = process.env.KOREA_KOSIS_API_KEY;
  if (!apiKey || !input.orgId || !input.tblId || !input.itmId) return null;

  const url = new URL(
    process.env.KOREA_KOSIS_BASE_URL || 'https://kosis.kr/openapi/statisticsData.do'
  );
  url.searchParams.set('method', 'getList');
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('jsonVD', 'Y');
  url.searchParams.set('orgId', input.orgId);
  url.searchParams.set('tblId', input.tblId);
  url.searchParams.set('itmId', input.itmId);
  url.searchParams.set('prdSe', input.prdSe || 'M');
  url.searchParams.set('newEstPrdCnt', process.env.KOREA_KOSIS_NEWEST_COUNT || '1');
  url.searchParams.set('prdInterval', '1');
  if (input.objL1) url.searchParams.set('objL1', input.objL1);
  if (input.objL2) url.searchParams.set('objL2', input.objL2);

  const payload = (await fetchJsonWithRetry(
    url.toString(),
    { cache: 'no-store' },
    { fetcher }
  )) as KosisResponseRow[];

  const first = Array.isArray(payload) ? payload[0] : null;
  const value = parseSeriesValue(first?.DT);
  if (value === null) return null;

  return {
    value,
    period: first?.PRD_DE || null,
    title: first?.TBL_NM || 'KOSIS statistic',
    unit: first?.UNIT_NM || ''
  };
}

async function fetchConfiguredKosisSeries(prefix: string, fetcher?: Fetcher) {
  const userStatsId = process.env[`${prefix}_USER_STATS_ID`];
  if (userStatsId) {
    return fetchKosisLatestValue(userStatsId, fetcher, {
      prdSe: process.env[`${prefix}_PRD_SE`] || 'M',
      itemId: process.env[`${prefix}_ITEM_ID`]
    });
  }

  return fetchKosisLatestValueByTable(
    {
      orgId: process.env[`${prefix}_ORG_ID`],
      tblId: process.env[`${prefix}_TBL_ID`],
      itmId: process.env[`${prefix}_ITM_ID`],
      objL1: process.env[`${prefix}_OBJ_L1`],
      objL2: process.env[`${prefix}_OBJ_L2`],
      prdSe: process.env[`${prefix}_PRD_SE`] || 'M'
    },
    fetcher
  );
}

async function fetchFredLatestObservation(
  seriesId: string,
  fetcher?: Fetcher,
  options?: {
    title?: string;
    unit?: string;
  }
) {
  const apiKey = process.env.US_FRED_API_KEY;
  if (!apiKey) return null;

  const url = new URL(
    process.env.US_FRED_BASE_URL || 'https://api.stlouisfed.org/fred/series/observations'
  );
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('sort_order', 'desc');
  url.searchParams.set('limit', process.env.US_FRED_OBSERVATION_LIMIT || '12');

  const payload = (await fetchJsonWithRetry(
    url.toString(),
    { cache: 'no-store' },
    { fetcher }
  )) as FredResponse;

  const observation = payload.observations?.find(
    (candidate) => parseSeriesValue(candidate.value) !== null
  );
  const value = parseSeriesValue(observation?.value);
  if (value === null) return null;

  return {
    value,
    period: observation?.date || null,
    title: options?.title ?? seriesId,
    unit: options?.unit ?? ''
  };
}

async function fetchConfiguredFredSeries(
  prefix: string,
  fetcher?: Fetcher,
  options?: {
    title?: string;
    unit?: string;
  }
) {
  const seriesId = process.env[`${prefix}_SERIES_ID`];
  if (!seriesId) return null;

  return fetchFredLatestObservation(seriesId, fetcher, options);
}

async function fetchBlsLatestObservation(
  seriesId: string,
  fetcher?: Fetcher,
  options?: {
    title?: string;
    unit?: string;
  }
) {
  const url = process.env.US_BLS_BASE_URL || 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
  const registrationKey = process.env.US_BLS_API_KEY || process.env.BLS_API_KEY;
  const payloadBody: Record<string, unknown> = {
    seriesid: [seriesId],
    latest: true
  };

  if (registrationKey) {
    payloadBody.registrationkey = registrationKey;
  }

  const payload = (await fetchJsonWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payloadBody),
      cache: 'no-store'
    },
    { fetcher }
  )) as BlsResponse;

  const series = payload.Results?.series?.[0];
  const observation = series?.data?.find((candidate) => parseSeriesValue(candidate.value) !== null);
  const value = parseSeriesValue(observation?.value);
  if (value === null) return null;

  return {
    value,
    period: observation ? formatBlsPeriod(observation) : null,
    title: options?.title ?? series?.seriesID ?? seriesId,
    unit: options?.unit ?? ''
  };
}

async function fetchConfiguredBlsSeries(
  prefix: string,
  fetcher?: Fetcher,
  options?: {
    title?: string;
    unit?: string;
  }
) {
  const seriesId = process.env[`${prefix}_SERIES_ID`];
  if (!seriesId) return null;
  return fetchBlsLatestObservation(seriesId, fetcher, options);
}

async function fetchConfiguredTreasurySeries(
  prefix: string,
  fetcher?: Fetcher,
  options?: {
    title?: string;
    unit?: string;
  }
) {
  const endpoint = process.env[`${prefix}_ENDPOINT`];
  const valueField = process.env[`${prefix}_FIELD`];
  if (!endpoint || !valueField) return null;

  const dateField = process.env[`${prefix}_DATE_FIELD`] || 'record_date';
  const baseUrl =
    process.env.US_TREASURY_API_BASE_URL ||
    'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';
  const url = endpoint.startsWith('http')
    ? new URL(endpoint)
    : new URL(endpoint.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`);

  if (!url.searchParams.has('sort')) {
    url.searchParams.set('sort', `-${dateField}`);
  }
  if (!url.searchParams.has('page[size]')) {
    url.searchParams.set('page[size]', '1');
  }

  const payload = (await fetchJsonWithRetry(
    url.toString(),
    { cache: 'no-store' },
    { fetcher }
  )) as TreasuryResponse;

  const row = payload.data?.[0];
  if (!row) return null;
  const rawValue = row[valueField];
  const value = parseSeriesValue(
    typeof rawValue === 'number' ? String(rawValue) : String(rawValue ?? '')
  );
  if (value === null) return null;

  return {
    value,
    period: String(row[dateField] ?? ''),
    title: options?.title ?? prefix,
    unit: options?.unit ?? ''
  };
}

async function fetchEcbLatestObservation(
  flowRef: string,
  key: string,
  fetcher?: Fetcher,
  options?: {
    title?: string;
    unit?: string;
  }
) {
  const baseUrl =
    process.env.ECB_DATA_API_BASE_URL || 'https://data-api.ecb.europa.eu/service/data';
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/${flowRef}/${key}`);
  url.searchParams.set('format', 'csvdata');
  url.searchParams.set('detail', 'dataonly');
  url.searchParams.set('lastNObservations', '1');

  const response = await (fetcher
    ? fetcher(url.toString(), { cache: 'no-store' })
    : fetch(url.toString(), { cache: 'no-store' }));
  if (!response.ok) {
    throw new Error(`ecb_request_failed_${response.status}`);
  }

  const csv = await response.text();
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const header = parseCsvLine(lines[0]);
  const valueIndex = header.findIndex((cell) => cell === 'OBS_VALUE');
  const dateIndex = header.findIndex((cell) => cell === 'TIME_PERIOD');
  if (valueIndex < 0) return null;

  const row = parseCsvLine(lines[lines.length - 1]);
  const value = parseSeriesValue(row[valueIndex]);
  if (value === null) return null;

  return {
    value,
    period: dateIndex >= 0 ? (row[dateIndex] ?? null) : null,
    title: options?.title ?? `${flowRef}:${key}`,
    unit: options?.unit ?? ''
  };
}

async function fetchConfiguredEcbSeries(
  prefix: string,
  fetcher?: Fetcher,
  options?: {
    title?: string;
    unit?: string;
  }
) {
  const flowRef = process.env[`${prefix}_FLOW_REF`];
  const key = process.env[`${prefix}_KEY`];
  if (!flowRef || !key) return null;
  return fetchEcbLatestObservation(flowRef, key, fetcher, options);
}

function buildCustomApiMacroData(payload: Partial<MacroData>, fallback: MacroData) {
  return {
    metroRegion: String(payload.metroRegion ?? fallback.metroRegion),
    vacancyPct: Number(payload.vacancyPct ?? fallback.vacancyPct),
    colocationRatePerKwKrw: Number(
      payload.colocationRatePerKwKrw ?? fallback.colocationRatePerKwKrw
    ),
    capRatePct: Number(payload.capRatePct ?? fallback.capRatePct),
    debtCostPct: Number(payload.debtCostPct ?? fallback.debtCostPct),
    inflationPct: Number(payload.inflationPct ?? fallback.inflationPct),
    constructionCostPerMwKrw: Number(
      payload.constructionCostPerMwKrw ?? fallback.constructionCostPerMwKrw
    ),
    discountRatePct: Number(payload.discountRatePct ?? fallback.discountRatePct),
    policyRatePct: Number(payload.policyRatePct ?? fallback.policyRatePct),
    creditSpreadBps: Number(payload.creditSpreadBps ?? fallback.creditSpreadBps),
    rentGrowthPct: Number(payload.rentGrowthPct ?? fallback.rentGrowthPct),
    transactionVolumeIndex: Number(
      payload.transactionVolumeIndex ?? fallback.transactionVolumeIndex
    ),
    constructionCostIndex: Number(payload.constructionCostIndex ?? fallback.constructionCostIndex),
    marketNotes: String(payload.marketNotes ?? fallback.marketNotes)
  };
}

async function fetchKoreaMacroData(fallback: MacroData, fetcher?: Fetcher) {
  const inflation = process.env.KOREA_KOSIS_INFLATION_USER_STATS_ID
    ? await fetchKosisLatestValue(process.env.KOREA_KOSIS_INFLATION_USER_STATS_ID, fetcher, {
        prdSe: process.env.KOREA_KOSIS_INFLATION_PRD_SE || 'M',
        itemId: process.env.KOREA_KOSIS_INFLATION_ITEM_ID
      })
    : await fetchKosisLatestValueByTable(
        {
          orgId: process.env.KOREA_KOSIS_INFLATION_ORG_ID,
          tblId: process.env.KOREA_KOSIS_INFLATION_TBL_ID,
          itmId: process.env.KOREA_KOSIS_INFLATION_ITM_ID,
          objL1: process.env.KOREA_KOSIS_INFLATION_OBJ_L1,
          objL2: process.env.KOREA_KOSIS_INFLATION_OBJ_L2,
          prdSe: process.env.KOREA_KOSIS_INFLATION_PRD_SE || 'M'
        },
        fetcher
      );

  const constructionCost = process.env.KOREA_KOSIS_CONSTRUCTION_COST_USER_STATS_ID
    ? await fetchKosisLatestValue(
        process.env.KOREA_KOSIS_CONSTRUCTION_COST_USER_STATS_ID,
        fetcher,
        {
          prdSe: process.env.KOREA_KOSIS_CONSTRUCTION_COST_PRD_SE || 'Q',
          itemId: process.env.KOREA_KOSIS_CONSTRUCTION_COST_ITEM_ID
        }
      )
    : await fetchKosisLatestValueByTable(
        {
          orgId: process.env.KOREA_KOSIS_CONSTRUCTION_COST_ORG_ID,
          tblId: process.env.KOREA_KOSIS_CONSTRUCTION_COST_TBL_ID,
          itmId: process.env.KOREA_KOSIS_CONSTRUCTION_COST_ITM_ID,
          objL1: process.env.KOREA_KOSIS_CONSTRUCTION_COST_OBJ_L1,
          objL2: process.env.KOREA_KOSIS_CONSTRUCTION_COST_OBJ_L2,
          prdSe: process.env.KOREA_KOSIS_CONSTRUCTION_COST_PRD_SE || 'Q'
        },
        fetcher
      );
  const policyRate = await fetchConfiguredKosisSeries('KOREA_KOSIS_POLICY_RATE', fetcher);
  const creditSpread = await fetchConfiguredKosisSeries('KOREA_KOSIS_CREDIT_SPREAD', fetcher);
  const rentGrowth = await fetchConfiguredKosisSeries('KOREA_KOSIS_RENT_GROWTH', fetcher);
  const transactionVolume = await fetchConfiguredKosisSeries(
    'KOREA_KOSIS_TRANSACTION_VOLUME',
    fetcher
  );
  const constructionCostIndex = await fetchConfiguredKosisSeries(
    'KOREA_KOSIS_CONSTRUCTION_COST_INDEX',
    fetcher
  );

  if (
    !inflation &&
    !constructionCost &&
    !policyRate &&
    !creditSpread &&
    !rentGrowth &&
    !transactionVolume &&
    !constructionCostIndex
  ) {
    throw new Error('missing_kosis_series');
  }

  return {
    sourceSystem: 'kosis-statistics',
    data: {
      metroRegion: fallback.metroRegion,
      vacancyPct: fallback.vacancyPct,
      colocationRatePerKwKrw: fallback.colocationRatePerKwKrw,
      capRatePct: fallback.capRatePct,
      debtCostPct: fallback.debtCostPct,
      inflationPct: inflation?.value ?? fallback.inflationPct,
      constructionCostPerMwKrw: constructionCost?.value ?? fallback.constructionCostPerMwKrw,
      discountRatePct: fallback.discountRatePct,
      policyRatePct: policyRate?.value ?? fallback.policyRatePct,
      creditSpreadBps: creditSpread?.value ?? fallback.creditSpreadBps,
      rentGrowthPct: rentGrowth?.value ?? fallback.rentGrowthPct,
      transactionVolumeIndex: transactionVolume?.value ?? fallback.transactionVolumeIndex,
      constructionCostIndex: constructionCostIndex?.value ?? fallback.constructionCostIndex,
      marketNotes: [
        fallback.marketNotes,
        inflation
          ? `KOSIS inflation series: ${inflation.title} (${inflation.period || 'latest'})`
          : null,
        constructionCost
          ? `KOSIS construction-cost series: ${constructionCost.title} (${constructionCost.period || 'latest'})`
          : null,
        policyRate
          ? `KOSIS policy-rate series: ${policyRate.title} (${policyRate.period || 'latest'})`
          : null,
        creditSpread
          ? `KOSIS credit-spread series: ${creditSpread.title} (${creditSpread.period || 'latest'})`
          : null,
        rentGrowth
          ? `KOSIS rent-growth series: ${rentGrowth.title} (${rentGrowth.period || 'latest'})`
          : null,
        transactionVolume
          ? `KOSIS transaction-volume series: ${transactionVolume.title} (${transactionVolume.period || 'latest'})`
          : null,
        constructionCostIndex
          ? `KOSIS construction-index series: ${constructionCostIndex.title} (${constructionCostIndex.period || 'latest'})`
          : null
      ]
        .filter(Boolean)
        .join(' ')
    }
  };
}

async function fetchUsMacroData(fallback: MacroData, fetcher?: Fetcher) {
  const inflation = await fetchConfiguredFredSeries('US_FRED_INFLATION', fetcher, {
    title: 'US Inflation',
    unit: '%'
  });
  const policyRate = await fetchConfiguredFredSeries('US_FRED_POLICY_RATE', fetcher, {
    title: 'US Policy Rate',
    unit: '%'
  });
  const creditSpread = await fetchConfiguredFredSeries('US_FRED_CREDIT_SPREAD', fetcher, {
    title: 'US Credit Spread',
    unit: 'bps'
  });
  const rentGrowth = await fetchConfiguredFredSeries('US_FRED_RENT_GROWTH', fetcher, {
    title: 'US Rent Growth',
    unit: '%'
  });
  const transactionVolume = await fetchConfiguredFredSeries('US_FRED_TRANSACTION_VOLUME', fetcher, {
    title: 'US Transaction Volume',
    unit: 'idx'
  });
  const constructionCostIndex = await fetchConfiguredFredSeries(
    'US_FRED_CONSTRUCTION_COST_INDEX',
    fetcher,
    {
      title: 'US Construction Cost Index',
      unit: 'idx'
    }
  );
  const debtCost = await fetchConfiguredFredSeries('US_FRED_DEBT_COST', fetcher, {
    title: 'US Debt Cost',
    unit: '%'
  });
  const discountRate = await fetchConfiguredFredSeries('US_FRED_DISCOUNT_RATE', fetcher, {
    title: 'US Discount Rate',
    unit: '%'
  });
  const capRate = await fetchConfiguredFredSeries('US_FRED_CAP_RATE', fetcher, {
    title: 'US Market Cap Rate',
    unit: '%'
  });
  const vacancy = await fetchConfiguredFredSeries('US_FRED_VACANCY', fetcher, {
    title: 'US Vacancy',
    unit: '%'
  });
  const constructionCostPerMw = await fetchConfiguredFredSeries(
    'US_FRED_CONSTRUCTION_COST_PER_MW',
    fetcher,
    {
      title: 'US Replacement Cost per MW',
      unit: 'krw'
    }
  );
  const colocationRate = await fetchConfiguredFredSeries('US_FRED_COLOCATION_RATE', fetcher, {
    title: 'US Colocation Rate',
    unit: 'krw'
  });
  const blsInflation = await fetchConfiguredBlsSeries('US_BLS_INFLATION', fetcher, {
    title: 'US BLS Inflation',
    unit: '%'
  });
  const blsConstructionCostIndex = await fetchConfiguredBlsSeries(
    'US_BLS_CONSTRUCTION_COST_INDEX',
    fetcher,
    {
      title: 'US BLS Construction Cost Index',
      unit: 'idx'
    }
  );
  const blsRentGrowth = await fetchConfiguredBlsSeries('US_BLS_RENT_GROWTH', fetcher, {
    title: 'US BLS Rent Growth',
    unit: '%'
  });
  const treasuryPolicyRate = await fetchConfiguredTreasurySeries(
    'US_TREASURY_POLICY_PROXY',
    fetcher,
    {
      title: 'US Treasury Policy Proxy',
      unit: '%'
    }
  );
  const treasuryDebtCost = await fetchConfiguredTreasurySeries('US_TREASURY_DEBT_COST', fetcher, {
    title: 'US Treasury Debt Cost Proxy',
    unit: '%'
  });
  const treasuryDiscountRate = await fetchConfiguredTreasurySeries(
    'US_TREASURY_DISCOUNT_RATE',
    fetcher,
    {
      title: 'US Treasury Discount Rate Proxy',
      unit: '%'
    }
  );

  if (
    !inflation &&
    !policyRate &&
    !creditSpread &&
    !rentGrowth &&
    !transactionVolume &&
    !constructionCostIndex &&
    !debtCost &&
    !discountRate &&
    !capRate &&
    !vacancy &&
    !constructionCostPerMw &&
    !colocationRate &&
    !blsInflation &&
    !blsConstructionCostIndex &&
    !blsRentGrowth &&
    !treasuryPolicyRate &&
    !treasuryDebtCost &&
    !treasuryDiscountRate
  ) {
    throw new Error('missing_us_macro_series');
  }

  const usedSupplementalPublicSources = Boolean(
    blsInflation ||
    blsConstructionCostIndex ||
    blsRentGrowth ||
    treasuryPolicyRate ||
    treasuryDebtCost ||
    treasuryDiscountRate
  );

  return {
    sourceSystem: usedSupplementalPublicSources ? 'us-public-macro-stack' : 'us-fred',
    data: {
      metroRegion: fallback.metroRegion,
      vacancyPct: vacancy?.value ?? fallback.vacancyPct,
      colocationRatePerKwKrw: colocationRate?.value ?? fallback.colocationRatePerKwKrw,
      capRatePct: capRate?.value ?? fallback.capRatePct,
      debtCostPct: debtCost?.value ?? treasuryDebtCost?.value ?? fallback.debtCostPct,
      inflationPct: inflation?.value ?? blsInflation?.value ?? fallback.inflationPct,
      constructionCostPerMwKrw: constructionCostPerMw?.value ?? fallback.constructionCostPerMwKrw,
      discountRatePct:
        discountRate?.value ?? treasuryDiscountRate?.value ?? fallback.discountRatePct,
      policyRatePct: policyRate?.value ?? treasuryPolicyRate?.value ?? fallback.policyRatePct,
      creditSpreadBps: creditSpread?.value ?? fallback.creditSpreadBps,
      rentGrowthPct: rentGrowth?.value ?? blsRentGrowth?.value ?? fallback.rentGrowthPct,
      transactionVolumeIndex: transactionVolume?.value ?? fallback.transactionVolumeIndex,
      constructionCostIndex:
        constructionCostIndex?.value ??
        blsConstructionCostIndex?.value ??
        fallback.constructionCostIndex,
      marketNotes: [
        fallback.marketNotes,
        inflation
          ? `FRED inflation series: ${inflation.title} (${inflation.period || 'latest'})`
          : null,
        policyRate
          ? `FRED policy-rate series: ${policyRate.title} (${policyRate.period || 'latest'})`
          : null,
        creditSpread
          ? `FRED credit-spread series: ${creditSpread.title} (${creditSpread.period || 'latest'})`
          : null,
        rentGrowth
          ? `FRED rent-growth series: ${rentGrowth.title} (${rentGrowth.period || 'latest'})`
          : null,
        transactionVolume
          ? `FRED transaction-volume series: ${transactionVolume.title} (${transactionVolume.period || 'latest'})`
          : null,
        constructionCostIndex
          ? `FRED construction-cost-index series: ${constructionCostIndex.title} (${constructionCostIndex.period || 'latest'})`
          : null,
        debtCost
          ? `FRED debt-cost series: ${debtCost.title} (${debtCost.period || 'latest'})`
          : null,
        discountRate
          ? `FRED discount-rate series: ${discountRate.title} (${discountRate.period || 'latest'})`
          : null,
        capRate ? `FRED cap-rate series: ${capRate.title} (${capRate.period || 'latest'})` : null,
        vacancy ? `FRED vacancy series: ${vacancy.title} (${vacancy.period || 'latest'})` : null,
        blsInflation
          ? `BLS inflation series: ${blsInflation.title} (${blsInflation.period || 'latest'})`
          : null,
        blsConstructionCostIndex
          ? `BLS construction-cost-index series: ${blsConstructionCostIndex.title} (${blsConstructionCostIndex.period || 'latest'})`
          : null,
        blsRentGrowth
          ? `BLS rent-growth proxy series: ${blsRentGrowth.title} (${blsRentGrowth.period || 'latest'})`
          : null,
        treasuryPolicyRate
          ? `Treasury policy-proxy series: ${treasuryPolicyRate.title} (${treasuryPolicyRate.period || 'latest'})`
          : null,
        treasuryDebtCost
          ? `Treasury debt-cost proxy series: ${treasuryDebtCost.title} (${treasuryDebtCost.period || 'latest'})`
          : null,
        treasuryDiscountRate
          ? `Treasury discount-rate proxy series: ${treasuryDiscountRate.title} (${treasuryDiscountRate.period || 'latest'})`
          : null
      ]
        .filter(Boolean)
        .join(' ')
    }
  };
}

async function fetchEuroMacroData(fallback: MacroData, fetcher?: Fetcher) {
  const inflation = await fetchConfiguredEcbSeries('ECB_INFLATION', fetcher, {
    title: 'Euro Area Inflation',
    unit: '%'
  });
  const policyRate = await fetchConfiguredEcbSeries('ECB_POLICY_RATE', fetcher, {
    title: 'ECB Policy Rate',
    unit: '%'
  });
  const creditSpread = await fetchConfiguredEcbSeries('ECB_CREDIT_SPREAD', fetcher, {
    title: 'Euro Area Credit Spread',
    unit: 'bps'
  });
  const rentGrowth = await fetchConfiguredEcbSeries('ECB_RENT_GROWTH', fetcher, {
    title: 'Euro Area Rent Growth',
    unit: '%'
  });
  const transactionVolume = await fetchConfiguredEcbSeries('ECB_TRANSACTION_VOLUME', fetcher, {
    title: 'Euro Area Transaction Volume',
    unit: 'idx'
  });
  const constructionCostIndex = await fetchConfiguredEcbSeries(
    'ECB_CONSTRUCTION_COST_INDEX',
    fetcher,
    {
      title: 'Euro Area Construction Cost Index',
      unit: 'idx'
    }
  );

  if (
    !inflation &&
    !policyRate &&
    !creditSpread &&
    !rentGrowth &&
    !transactionVolume &&
    !constructionCostIndex
  ) {
    throw new Error('missing_ecb_series');
  }

  return {
    sourceSystem: 'ecb-data-api',
    data: {
      metroRegion: fallback.metroRegion,
      vacancyPct: fallback.vacancyPct,
      colocationRatePerKwKrw: fallback.colocationRatePerKwKrw,
      capRatePct: fallback.capRatePct,
      debtCostPct: fallback.debtCostPct,
      inflationPct: inflation?.value ?? fallback.inflationPct,
      constructionCostPerMwKrw: fallback.constructionCostPerMwKrw,
      discountRatePct: fallback.discountRatePct,
      policyRatePct: policyRate?.value ?? fallback.policyRatePct,
      creditSpreadBps: creditSpread?.value ?? fallback.creditSpreadBps,
      rentGrowthPct: rentGrowth?.value ?? fallback.rentGrowthPct,
      transactionVolumeIndex: transactionVolume?.value ?? fallback.transactionVolumeIndex,
      constructionCostIndex: constructionCostIndex?.value ?? fallback.constructionCostIndex,
      marketNotes: [
        fallback.marketNotes,
        inflation
          ? `ECB inflation series: ${inflation.title} (${inflation.period || 'latest'})`
          : null,
        policyRate
          ? `ECB policy-rate series: ${policyRate.title} (${policyRate.period || 'latest'})`
          : null,
        creditSpread
          ? `ECB credit-spread series: ${creditSpread.title} (${creditSpread.period || 'latest'})`
          : null,
        rentGrowth
          ? `ECB rent-growth series: ${rentGrowth.title} (${rentGrowth.period || 'latest'})`
          : null,
        transactionVolume
          ? `ECB transaction-volume series: ${transactionVolume.title} (${transactionVolume.period || 'latest'})`
          : null,
        constructionCostIndex
          ? `ECB construction-cost-index series: ${constructionCostIndex.title} (${constructionCostIndex.period || 'latest'})`
          : null
      ]
        .filter(Boolean)
        .join(' ')
    }
  };
}

export function createMacroAdapter(store: SourceCacheStore, fetcher?: Fetcher) {
  return {
    async fetch(input: MacroFetchInput): Promise<SourceEnvelope<MacroData>> {
      const request = resolveMacroRequest(input);
      const customMacroApiUrl = process.env.GLOBAL_MACRO_API_URL || process.env.KOREA_MACRO_API_URL;
      const customMacroApiKey =
        process.env.GLOBAL_MACRO_API_KEY || process.env.KOREA_MACRO_API_KEY || '';
      const fallback = getFallbackMacro(request.assetCode, request.market);
      const usHasSupplementalPublicStack =
        hasConfiguredSeries('US_BLS_INFLATION') ||
        hasConfiguredSeries('US_BLS_CONSTRUCTION_COST_INDEX') ||
        hasConfiguredSeries('US_BLS_RENT_GROWTH') ||
        Boolean(process.env.US_TREASURY_POLICY_PROXY_ENDPOINT?.trim()) ||
        Boolean(process.env.US_TREASURY_DEBT_COST_ENDPOINT?.trim()) ||
        Boolean(process.env.US_TREASURY_DISCOUNT_RATE_ENDPOINT?.trim());
      const defaultSourceSystem = customMacroApiUrl
        ? 'global-macro-api'
        : request.market === 'US'
          ? usHasSupplementalPublicStack
            ? 'us-public-macro-stack'
            : 'us-fred'
          : isEuroAreaMarket(request.market)
            ? 'ecb-data-api'
            : process.env.KOREA_KOSIS_API_KEY
              ? 'kosis-statistics'
              : 'korea-macro-rates';
      const now = new Date();
      const cached = await store.getFreshCache<MacroData>(
        defaultSourceSystem,
        request.assetCode,
        now
      );
      if (cached) {
        return {
          sourceSystem: defaultSourceSystem,
          status: cached.status,
          mode: 'cache',
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
          freshnessLabel: cached.freshnessLabel,
          data: cached.payload,
          provenance: Object.entries(cached.payload).map(([field, value]) => ({
            field,
            value: typeof value === 'number' || typeof value === 'string' ? value : null,
            sourceSystem: defaultSourceSystem,
            mode: 'cache',
            fetchedAt: cached.fetchedAt.toISOString(),
            freshnessLabel: cached.freshnessLabel
          }))
        };
      }

      const ttlHours = Number(process.env.SOURCE_CACHE_TTL_HOURS ?? 24);

      try {
        let sourceSystem = defaultSourceSystem;
        let data: MacroData;

        if (customMacroApiUrl) {
          const url = new URL(customMacroApiUrl);
          url.searchParams.set('assetCode', request.assetCode);
          url.searchParams.set('market', request.market);
          const payload = (await fetchJsonWithRetry(
            url.toString(),
            {
              headers: {
                Authorization: `Bearer ${customMacroApiKey}`
              },
              cache: 'no-store'
            },
            { fetcher }
          )) as Partial<MacroData>;

          sourceSystem = 'global-macro-api';
          data = buildCustomApiMacroData(payload, fallback);
        } else if (request.market === 'US') {
          const usMacro = await fetchUsMacroData(fallback, fetcher);
          sourceSystem = usMacro.sourceSystem;
          data = usMacro.data;
        } else if (isEuroAreaMarket(request.market)) {
          const euroMacro = await fetchEuroMacroData(fallback, fetcher);
          sourceSystem = euroMacro.sourceSystem;
          data = euroMacro.data;
        } else {
          const koreaMacro = await fetchKoreaMacroData(fallback, fetcher);
          sourceSystem = koreaMacro.sourceSystem;
          data = koreaMacro.data;
        }

        const entry = {
          status: SourceStatus.FRESH,
          payload: data,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
          freshnessLabel: 'fresh api'
        };
        await store.upsertCache(sourceSystem, request.assetCode, entry);

        return {
          sourceSystem,
          status: SourceStatus.FRESH,
          mode: 'api',
          fetchedAt: entry.fetchedAt,
          expiresAt: entry.expiresAt,
          freshnessLabel: entry.freshnessLabel,
          data,
          provenance: Object.entries(data).map(([field, value]) => ({
            field,
            value: typeof value === 'number' || typeof value === 'string' ? value : null,
            sourceSystem,
            mode: 'api',
            fetchedAt: entry.fetchedAt.toISOString(),
            freshnessLabel: entry.freshnessLabel
          }))
        };
      } catch {
        const entry = {
          status: SourceStatus.STALE,
          payload: fallback,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
          freshnessLabel: 'fallback dataset'
        };
        await store.upsertCache(defaultSourceSystem, request.assetCode, entry);

        return {
          sourceSystem: defaultSourceSystem,
          status: SourceStatus.STALE,
          mode: 'fallback',
          fetchedAt: entry.fetchedAt,
          expiresAt: entry.expiresAt,
          freshnessLabel: entry.freshnessLabel,
          data: fallback,
          provenance: Object.entries(fallback).map(([field, value]) => ({
            field,
            value: typeof value === 'number' || typeof value === 'string' ? value : null,
            sourceSystem: defaultSourceSystem,
            mode: 'fallback',
            fetchedAt: entry.fetchedAt.toISOString(),
            freshnessLabel: entry.freshnessLabel
          }))
        };
      }
    }
  };
}
