import type { KoreaIngestResult, KoreaIngestRow } from '@/lib/ingest/korea-kosis-adapter';

const FETCH_TIMEOUT_MS = 30_000;

type RebSubmarket = {
  key: string;
  label: string;
  baseVacancy: number;
  trend: number;
};

const REB_SUBMARKETS: RebSubmarket[] = [
  { key: 'gangnam', label: 'Gangnam', baseVacancy: 4.8, trend: 0.08 },
  { key: 'cbd', label: 'CBD', baseVacancy: 6.2, trend: -0.05 },
  { key: 'yeouido', label: 'Yeouido', baseVacancy: 5.5, trend: 0.02 },
  { key: 'bundang', label: 'Bundang', baseVacancy: 7.1, trend: 0.11 }
];

function buildOfficeVacancyMock(): KoreaIngestRow[] {
  const baseMonth = new Date(Date.UTC(2025, 10, 1));
  const rows: KoreaIngestRow[] = [];
  for (let monthOffset = 11; monthOffset >= 0; monthOffset -= 1) {
    const observation = new Date(
      Date.UTC(baseMonth.getUTCFullYear(), baseMonth.getUTCMonth() - monthOffset, 1)
    );
    const stepsFromStart = 11 - monthOffset;
    for (const submarket of REB_SUBMARKETS) {
      const value = Number((submarket.baseVacancy + submarket.trend * stepsFromStart).toFixed(2));
      rows.push({
        observationDate: observation,
        value,
        label: `Korea REB Office Vacancy - ${submarket.label} (MOCK)`,
        seriesKey: `kr_office_vacancy_${submarket.key}_pct`
      });
    }
  }
  return rows;
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

export async function fetchRebOfficeVacancySeries(): Promise<KoreaIngestResult> {
  const apiKey = process.env.KOREA_REB_API_KEY?.trim();
  const baseUrl = process.env.KOREA_REB_API_URL?.trim();

  if (!apiKey || !baseUrl) {
    return {
      rows: buildOfficeVacancyMock(),
      source: 'mock'
    };
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('format', 'json');
    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) {
      return {
        rows: buildOfficeVacancyMock(),
        source: 'mock',
        error: `REB request failed with status ${response.status}.`
      };
    }

    return {
      rows: buildOfficeVacancyMock(),
      source: 'mock',
      error: 'REB does not expose a structured public API; returning mock dataset.'
    };
  } catch (error) {
    return {
      rows: buildOfficeVacancyMock(),
      source: 'mock',
      error: error instanceof Error ? error.message : 'Unknown REB fetch error.'
    };
  }
}
