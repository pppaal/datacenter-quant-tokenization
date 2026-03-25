import { Asset } from '@prisma/client';

type ClimateVariables = {
  averageTempC: number;
  annualPrecipMmPerDay: number;
  solarKwhPerM2PerDay: number;
  source: 'NASA_POWER' | 'FALLBACK';
};

type MarketVariables = {
  capRate: number;
  powerPriceKrwPerKwh: number;
  rentGrowthPct: number;
  sources: string[];
};

const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  Seoul: { lat: 37.5665, lon: 126.978 },
  Busan: { lat: 35.1796, lon: 129.0756 },
  Incheon: { lat: 37.4563, lon: 126.7052 },
  Daejeon: { lat: 36.3504, lon: 127.3845 },
  Daegu: { lat: 35.8714, lon: 128.6014 }
};

type Coordinates = {
  lat: number;
  lon: number;
  source: 'GEOCODING_API' | 'CITY_FALLBACK' | 'DEFAULT_FALLBACK';
};

const COUNTRY_MARKET_DEFAULTS: Record<string, Omit<MarketVariables, 'sources'>> = {
  KR: { capRate: 0.062, powerPriceKrwPerKwh: 161, rentGrowthPct: 2.6 },
  US: { capRate: 0.069, powerPriceKrwPerKwh: 132, rentGrowthPct: 2.1 },
  JP: { capRate: 0.051, powerPriceKrwPerKwh: 184, rentGrowthPct: 1.3 },
  SG: { capRate: 0.054, powerPriceKrwPerKwh: 221, rentGrowthPct: 1.9 },
  DE: { capRate: 0.058, powerPriceKrwPerKwh: 245, rentGrowthPct: 1.7 },
  GB: { capRate: 0.061, powerPriceKrwPerKwh: 236, rentGrowthPct: 1.8 }
};

async function fetchJsonWithTimeout(url: string, timeoutMs = 5000, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store', ...init });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function geocodeAddress(asset: Asset): Promise<Coordinates | null> {
  const composedAddress = [asset.address, asset.city, asset.country].filter(Boolean).join(', ').trim();
  if (!composedAddress) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', composedAddress);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  try {
    const payload = await fetchJsonWithTimeout(url.toString(), 7000, {
      headers: {
        'User-Agent': process.env.GEOCODING_USER_AGENT || 'kdc-deal-review/1.0 (deal-review@local.dev)'
      }
    });
    const first = Array.isArray(payload) ? payload[0] : null;
    const lat = Number(first?.lat);
    const lon = Number(first?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return { lat, lon, source: 'GEOCODING_API' };
  } catch {
    return null;
  }
}

async function getCoordinates(asset: Asset): Promise<Coordinates> {
  const geocoded = await geocodeAddress(asset);
  if (geocoded) return geocoded;

  const city = CITY_COORDINATES[asset.city];
  if (city) return { ...city, source: 'CITY_FALLBACK' };

  return { lat: 37.5665, lon: 126.978, source: 'DEFAULT_FALLBACK' };
}

export async function fetchNasaClimateVariables(asset: Asset): Promise<ClimateVariables> {
  const { lat, lon } = await getCoordinates(asset);
  const params = 'T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN';
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=${params}&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;

  try {
    const json = await fetchJsonWithTimeout(url, 7000);
    const p = json?.properties?.parameter || {};
    const t2m = Number(p?.T2M?.ANN);
    const prectot = Number(p?.PRECTOTCORR?.ANN);
    const solar = Number(p?.ALLSKY_SFC_SW_DWN?.ANN);

    if ([t2m, prectot, solar].some((x) => Number.isNaN(x))) {
      throw new Error('NASA payload parse error');
    }

    return {
      averageTempC: t2m,
      annualPrecipMmPerDay: prectot,
      solarKwhPerM2PerDay: solar,
      source: 'NASA_POWER'
    };
  } catch {
    return {
      averageTempC: 13.0,
      annualPrecipMmPerDay: 3.4,
      solarKwhPerM2PerDay: 3.8,
      source: 'FALLBACK'
    };
  }
}

async function tryExternalNumber(endpoint: string | undefined, field: string) {
  if (!endpoint) return null;
  try {
    const json = await fetchJsonWithTimeout(endpoint, 5000);
    const value = Number(json?.[field]);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function getCountryMarketDefaults(country: string): Omit<MarketVariables, 'sources'> {
  const iso2 = country.trim().toUpperCase();
  return COUNTRY_MARKET_DEFAULTS[iso2] || COUNTRY_MARKET_DEFAULTS.KR;
}

export async function fetchMarketVariables(asset: Asset): Promise<MarketVariables> {
  const sources: string[] = [];
  const defaults = getCountryMarketDefaults(asset.country);

  const capRate =
    (await tryExternalNumber(process.env.GLOBAL_CAP_RATE_API_URL || process.env.KOREA_CAP_RATE_API_URL, 'capRate')) ??
    defaults.capRate;
  sources.push(process.env.GLOBAL_CAP_RATE_API_URL || process.env.KOREA_CAP_RATE_API_URL ? 'external_cap_rate_api' : 'country_fallback_cap_rate');

  const powerPriceKrwPerKwh =
    (await tryExternalNumber(
      process.env.GLOBAL_POWER_PRICE_API_URL || process.env.KOREA_POWER_PRICE_API_URL,
      'industrialPowerPrice'
    )) ?? defaults.powerPriceKrwPerKwh;
  sources.push(
    process.env.GLOBAL_POWER_PRICE_API_URL || process.env.KOREA_POWER_PRICE_API_URL
      ? 'external_power_price_api'
      : 'country_fallback_power_price'
  );

  const rentGrowthPct =
    (await tryExternalNumber(
      process.env.GLOBAL_RENT_GROWTH_API_URL || process.env.KOREA_RENT_GROWTH_API_URL,
      'rentGrowthPct'
    )) ?? defaults.rentGrowthPct;
  sources.push(
    process.env.GLOBAL_RENT_GROWTH_API_URL || process.env.KOREA_RENT_GROWTH_API_URL
      ? 'external_rent_growth_api'
      : 'country_fallback_rent_growth'
  );

  return {
    capRate,
    powerPriceKrwPerKwh,
    rentGrowthPct,
    sources
  };
}

export async function estimateAssetValue(asset: Asset) {
  const climate = await fetchNasaClimateVariables(asset);
  const market = await fetchMarketVariables(asset);

  const baseRevenue = asset.targetEquity * 0.11;
  const powerStressRatio = Math.max(0.85, 1 - (market.powerPriceKrwPerKwh - 140) / 500);
  const climateRiskRatio = Math.max(0.88, 1 - Math.max(0, climate.annualPrecipMmPerDay - 3.0) * 0.01);

  const noi = Math.max(0, baseRevenue - asset.opex) * powerStressRatio * climateRiskRatio;
  const capRateAdj = Math.max(0.04, market.capRate - market.rentGrowthPct / 1000);
  const impliedValue = noi / capRateAdj;

  return {
    oneLineSummary: `${asset.name}의 추정 자산가치는 약 ${Math.round(impliedValue).toLocaleString()} KRW입니다. (검토 보조 추정치)`,
    valuationKrw: Math.round(impliedValue),
    assumptions: {
      capRateAdj,
      powerPriceKrwPerKwh: market.powerPriceKrwPerKwh,
      rentGrowthPct: market.rentGrowthPct,
      powerStressRatio,
      climateRiskRatio
    },
    climate,
    market,
    notes: [
      '본 수치는 투자권유/확정수익 제시가 아닌 내부 딜 검토 보조 추정치입니다.',
      '외부 변수 API 미연동 시 fallback 값을 사용합니다.'
    ]
  };
}
