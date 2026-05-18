export type KoreaIngestRow = {
  observationDate: Date;
  value: number;
  label: string;
  seriesKey: string;
};

export type KoreaIngestResult = {
  rows: KoreaIngestRow[];
  source: 'mock' | 'kosis' | 'reb';
  error?: string;
};

type KosisResponseRow = {
  DT?: string;
  PRD_DE?: string;
  TBL_NM?: string;
  UNIT_NM?: string;
  ITM_NM?: string;
};

const FETCH_TIMEOUT_MS = 30_000;

function parseKosisValue(raw?: string): number | null {
  if (!raw) return null;
  const normalized = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(normalized) ? normalized : null;
}

function parseKosisPeriod(prdDe?: string): Date | null {
  if (!prdDe) return null;
  const trimmed = prdDe.trim();
  if (/^\d{6}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(4, 6));
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
      return new Date(Date.UTC(year, month - 1, 1));
    }
  }
  if (/^\d{4}Q[1-4]$/i.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const quarter = Number(trimmed.slice(5, 6));
    const month = (quarter - 1) * 3;
    return new Date(Date.UTC(year, month, 1));
  }
  if (/^\d{4}$/.test(trimmed)) {
    return new Date(Date.UTC(Number(trimmed), 0, 1));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

function buildInflationMock(): KoreaIngestRow[] {
  const baseMonth = new Date(Date.UTC(2025, 10, 1));
  const values = [3.1, 2.9, 2.8, 2.6, 2.5];
  return values.map((value, index) => {
    const offset = values.length - 1 - index;
    const observation = new Date(
      Date.UTC(baseMonth.getUTCFullYear(), baseMonth.getUTCMonth() - offset, 1)
    );
    return {
      observationDate: observation,
      value,
      label: 'Korea CPI YoY (MOCK)',
      seriesKey: 'kr_cpi_yoy_pct'
    };
  });
}

function buildConstructionCostMock(): KoreaIngestRow[] {
  const baseMonth = new Date(Date.UTC(2025, 10, 1));
  const values = [148.2, 149.4, 150.1, 151.3, 152.0];
  return values.map((value, index) => {
    const offset = values.length - 1 - index;
    const observation = new Date(
      Date.UTC(baseMonth.getUTCFullYear(), baseMonth.getUTCMonth() - offset, 1)
    );
    return {
      observationDate: observation,
      value,
      label: 'Korea Construction Cost Index (MOCK)',
      seriesKey: 'kr_construction_cost_index'
    };
  });
}

type KosisSeriesConfig = {
  seriesKey: string;
  label: string;
  userStatsIdEnv: string;
  prdSeEnv: string;
  itemIdEnv: string;
  orgIdEnv: string;
  tblIdEnv: string;
  itmIdEnv: string;
  objL1Env: string;
  objL2Env: string;
  defaultPrdSe: string;
  mockBuilder: () => KoreaIngestRow[];
};

function buildKosisUrl(
  apiKey: string,
  baseUrl: string,
  config: KosisSeriesConfig,
  newestCount: string
): string | null {
  const url = new URL(baseUrl);
  url.searchParams.set('method', 'getList');
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('jsonVD', 'Y');
  url.searchParams.set('newEstPrdCnt', newestCount);
  url.searchParams.set('prdInterval', '1');

  const userStatsId = process.env[config.userStatsIdEnv]?.trim();
  const prdSe = process.env[config.prdSeEnv]?.trim() || config.defaultPrdSe;
  url.searchParams.set('prdSe', prdSe);

  if (userStatsId) {
    url.searchParams.set('userStatsId', userStatsId);
    const itemId = process.env[config.itemIdEnv]?.trim();
    if (itemId) url.searchParams.set('itmId', itemId);
    return url.toString();
  }

  const orgId = process.env[config.orgIdEnv]?.trim();
  const tblId = process.env[config.tblIdEnv]?.trim();
  const itmId = process.env[config.itmIdEnv]?.trim();
  if (!orgId || !tblId || !itmId) {
    return null;
  }
  url.searchParams.set('orgId', orgId);
  url.searchParams.set('tblId', tblId);
  url.searchParams.set('itmId', itmId);
  const objL1 = process.env[config.objL1Env]?.trim();
  const objL2 = process.env[config.objL2Env]?.trim();
  if (objL1) url.searchParams.set('objL1', objL1);
  if (objL2) url.searchParams.set('objL2', objL2);
  return url.toString();
}

async function runKosisSeries(config: KosisSeriesConfig): Promise<KoreaIngestResult> {
  const apiKey = process.env.KOREA_KOSIS_API_KEY?.trim();
  const baseUrl =
    process.env.KOREA_KOSIS_BASE_URL?.trim() || 'https://kosis.kr/openapi/statisticsData.do';
  const newestCount = process.env.KOREA_KOSIS_NEWEST_COUNT?.trim() || '12';

  if (!apiKey) {
    return {
      rows: config.mockBuilder(),
      source: 'mock'
    };
  }

  const requestUrl = buildKosisUrl(apiKey, baseUrl, config, newestCount);
  if (!requestUrl) {
    return {
      rows: config.mockBuilder(),
      source: 'mock',
      error: 'KOSIS series identifiers not configured; using mock dataset.'
    };
  }

  try {
    const response = await fetchWithTimeout(requestUrl);
    if (!response.ok) {
      return {
        rows: config.mockBuilder(),
        source: 'mock',
        error: `KOSIS request failed with status ${response.status}.`
      };
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      return {
        rows: config.mockBuilder(),
        source: 'mock',
        error: 'KOSIS response was not a JSON array.'
      };
    }

    const rows: KoreaIngestRow[] = [];
    for (const raw of payload as KosisResponseRow[]) {
      const value = parseKosisValue(raw?.DT);
      const observationDate = parseKosisPeriod(raw?.PRD_DE);
      if (value === null || !observationDate) continue;
      rows.push({
        observationDate,
        value,
        label: raw?.TBL_NM?.trim() || config.label,
        seriesKey: config.seriesKey
      });
    }

    if (rows.length === 0) {
      return {
        rows: config.mockBuilder(),
        source: 'mock',
        error: 'KOSIS response contained no parseable rows.'
      };
    }

    return { rows, source: 'kosis' };
  } catch (error) {
    return {
      rows: config.mockBuilder(),
      source: 'mock',
      error: error instanceof Error ? error.message : 'Unknown KOSIS fetch error.'
    };
  }
}

export async function fetchKosisInflationSeries(): Promise<KoreaIngestResult> {
  return runKosisSeries({
    seriesKey: 'kr_cpi_yoy_pct',
    label: 'Korea CPI YoY',
    userStatsIdEnv: 'KOREA_KOSIS_INFLATION_USER_STATS_ID',
    prdSeEnv: 'KOREA_KOSIS_INFLATION_PRD_SE',
    itemIdEnv: 'KOREA_KOSIS_INFLATION_ITEM_ID',
    orgIdEnv: 'KOREA_KOSIS_INFLATION_ORG_ID',
    tblIdEnv: 'KOREA_KOSIS_INFLATION_TBL_ID',
    itmIdEnv: 'KOREA_KOSIS_INFLATION_ITM_ID',
    objL1Env: 'KOREA_KOSIS_INFLATION_OBJ_L1',
    objL2Env: 'KOREA_KOSIS_INFLATION_OBJ_L2',
    defaultPrdSe: 'M',
    mockBuilder: buildInflationMock
  });
}

export async function fetchKosisConstructionCostSeries(): Promise<KoreaIngestResult> {
  return runKosisSeries({
    seriesKey: 'kr_construction_cost_index',
    label: 'Korea Construction Cost Index',
    userStatsIdEnv: 'KOREA_KOSIS_CONSTRUCTION_COST_USER_STATS_ID',
    prdSeEnv: 'KOREA_KOSIS_CONSTRUCTION_COST_PRD_SE',
    itemIdEnv: 'KOREA_KOSIS_CONSTRUCTION_COST_ITEM_ID',
    orgIdEnv: 'KOREA_KOSIS_CONSTRUCTION_COST_ORG_ID',
    tblIdEnv: 'KOREA_KOSIS_CONSTRUCTION_COST_TBL_ID',
    itmIdEnv: 'KOREA_KOSIS_CONSTRUCTION_COST_ITM_ID',
    objL1Env: 'KOREA_KOSIS_CONSTRUCTION_COST_OBJ_L1',
    objL2Env: 'KOREA_KOSIS_CONSTRUCTION_COST_OBJ_L2',
    defaultPrdSe: 'Q',
    mockBuilder: buildConstructionCostMock
  });
}
