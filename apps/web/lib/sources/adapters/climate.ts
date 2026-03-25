import { SourceStatus } from '@prisma/client';
import { DEFAULT_FALLBACK_SOURCE_DATA, FALLBACK_SOURCE_DATA } from '@/lib/sources/fallback-data';
import { fetchJsonWithRetry, fetchTextWithRetry, type Fetcher } from '@/lib/sources/http';
import type { SourceCacheStore, SourceEnvelope } from '@/lib/sources/types';

export type ClimateOverlayData = {
  climateRiskNote: string;
  floodRiskScore?: number;
  wildfireRiskScore?: number;
  recentAverageTempC?: number;
  recentMaxTempC?: number;
  recentPrecipMm?: number;
  heavyRainDays?: number;
  hotDaysCount?: number;
  recentSatellitePrecipMm?: number;
  recentFireHotspots?: number;
  recentMaxFireRadiativePowerMw?: number;
};

type Input = {
  assetCode: string;
  latitude?: number | null;
  longitude?: number | null;
};

type NasaPowerClimatologyResponse = {
  properties?: {
    parameter?: {
      T2M?: { ANN?: number };
      PRECTOTCORR?: { ANN?: number };
      ALLSKY_SFC_SW_DWN?: { ANN?: number };
    };
  };
};

type NasaPowerDailyResponse = {
  properties?: {
    parameter?: {
      T2M?: Record<string, number | string>;
      T2M_MAX?: Record<string, number | string>;
      PRECTOTCORR?: Record<string, number | string>;
    };
  };
};

type GpmOpenSearchResponse = {
  items?: Array<{
    action?: Array<{
      title?: string;
      url?: string;
      type?: string;
    }>;
  }>;
};

type GeoJsonFeature = {
  properties?: Record<string, unknown>;
};

type GeoJsonResponse = {
  type?: string;
  features?: GeoJsonFeature[];
};

async function syncSupplementalSourceCaches({
  store,
  assetCode,
  now,
  ttlHours,
  recentSatellitePrecipMm,
  recentFireHotspots,
  recentMaxFireRadiativePowerMw,
  firmsConfigured
}: {
  store: SourceCacheStore;
  assetCode: string;
  now: Date;
  ttlHours: number;
  recentSatellitePrecipMm?: number | null;
  recentFireHotspots?: number | null;
  recentMaxFireRadiativePowerMw?: number | null;
  firmsConfigured: boolean;
}) {
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  await store.upsertCache('nasa-gpm-imerg', assetCode, {
    status: recentSatellitePrecipMm !== null && recentSatellitePrecipMm !== undefined ? SourceStatus.FRESH : SourceStatus.STALE,
    payload: {
      recentSatellitePrecipMm: recentSatellitePrecipMm ?? null
    },
    fetchedAt: now,
    expiresAt,
    freshnessLabel:
      recentSatellitePrecipMm !== null && recentSatellitePrecipMm !== undefined
        ? 'near-real-time precipitation overlay'
        : 'overlay unavailable'
  });

  await store.upsertCache('nasa-firms', assetCode, {
    status: recentFireHotspots !== null && recentFireHotspots !== undefined ? SourceStatus.FRESH : SourceStatus.STALE,
    payload: {
      recentFireHotspots: recentFireHotspots ?? null,
      recentMaxFireRadiativePowerMw: recentMaxFireRadiativePowerMw ?? null
    },
    fetchedAt: now,
    expiresAt,
    freshnessLabel:
      recentFireHotspots !== null && recentFireHotspots !== undefined
        ? 'near-real-time hotspot overlay'
        : firmsConfigured
          ? 'overlay unavailable'
          : 'map key not configured'
  });
}

function formatPowerDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function resolveReferenceDate() {
  const explicit = process.env.NASA_POWER_REFERENCE_DATE;
  if (explicit) {
    const parsed = new Date(explicit);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

function summarizeSeries(series?: Record<string, number | string>) {
  const values = Object.values(series ?? {})
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) return null;
  return values;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildBbox(latitude: number, longitude: number, deltaDegrees = 0.1) {
  const minLon = longitude - deltaDegrees;
  const minLat = latitude - deltaDegrees;
  const maxLon = longitude + deltaDegrees;
  const maxLat = latitude + deltaDegrees;
  return `${minLon.toFixed(3)},${minLat.toFixed(3)},${maxLon.toFixed(3)},${maxLat.toFixed(3)}`;
}

function pickNumericValue(properties?: Record<string, unknown>) {
  if (!properties) return null;

  const preferredKeys = ['value', 'precip', 'precipitation', 'surface', 'rate', 'mean', 'max'];
  for (const key of preferredKeys) {
    const match = Object.entries(properties).find(([candidate]) => candidate.toLowerCase().includes(key));
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) return parsed;
      if (typeof match[1] === 'string') {
        const extracted = Number(match[1].match(/-?\d+(\.\d+)?/)?.[0]);
        if (Number.isFinite(extracted)) return extracted;
      }
    }
  }

  for (const value of Object.values(properties)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    if (typeof value === 'string') {
      const extracted = Number(value.match(/-?\d+(\.\d+)?/)?.[0]);
      if (Number.isFinite(extracted)) return extracted;
    }
  }

  return null;
}

async function fetchRecentGpmPrecipMm(
  latitude: number,
  longitude: number,
  referenceDate: Date,
  fetcher?: Fetcher
) {
  const endDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 1);

  const openSearchUrl = new URL(
    process.env.NASA_GPM_OPENSEARCH_URL || 'https://gpm.nasa.gov/cgi-bin/api/GeoJSON/timeseries'
  );
  openSearchUrl.searchParams.set('start', startDate.toISOString());
  openSearchUrl.searchParams.set('end', endDate.toISOString());
  openSearchUrl.searchParams.set('lat', String(latitude));
  openSearchUrl.searchParams.set('lon', String(longitude));
  openSearchUrl.searchParams.set('dataset', process.env.NASA_GPM_DATASET || 'IMERG');

  try {
    const openSearch = (await fetchJsonWithRetry(
      openSearchUrl.toString(),
      { cache: 'no-store' },
      { fetcher }
    )) as GpmOpenSearchResponse;
    const actionUrl =
      openSearch.items?.[0]?.action?.find((action) => action.url && action.type?.includes('geo+json'))?.url ??
      openSearch.items?.[0]?.action?.find((action) => action.url)?.url;

    if (!actionUrl) return null;

    const resolvedUrl = actionUrl
      .replace('{BBOX}', buildBbox(latitude, longitude))
      .replace('{bbox}', buildBbox(latitude, longitude))
      .replace('{MINLON}', String(longitude - 0.1))
      .replace('{MINLAT}', String(latitude - 0.1))
      .replace('{MAXLON}', String(longitude + 0.1))
      .replace('{MAXLAT}', String(latitude + 0.1));

    const geoJson = (await fetchJsonWithRetry(
      resolvedUrl,
      { cache: 'no-store' },
      { fetcher }
    )) as GeoJsonResponse;
    const values = (geoJson.features ?? [])
      .map((feature) => pickNumericValue(feature.properties))
      .filter((value): value is number => Number.isFinite(value));

    if (values.length === 0) return null;
    return Math.max(...values);
  } catch {
    return null;
  }
}

function parseCsvRows(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',').map((column) => column.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));
  });
}

async function fetchRecentFirmsSummary(
  latitude: number,
  longitude: number,
  fetcher?: Fetcher
) {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY?.trim();
  if (!mapKey) return null;

  const bbox = buildBbox(latitude, longitude, Number(process.env.NASA_FIRMS_BBOX_DEGREES ?? 0.25));
  const days = Math.max(1, Number(process.env.NASA_FIRMS_LOOKBACK_DAYS ?? 7));
  const sensor = process.env.NASA_FIRMS_SENSOR || 'VIIRS_SNPP_NRT';
  const baseUrl = process.env.NASA_FIRMS_API_URL || 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
  const url = `${baseUrl}/${mapKey}/${sensor}/${bbox}/${days}`;

  try {
    const csv = await fetchTextWithRetry(url, { cache: 'no-store' }, { fetcher });
    const rows = parseCsvRows(csv);
    if (rows.length === 0) {
      return {
        hotspotCount: 0,
        maxFrpMw: 0
      };
    }

    const frpValues = rows
      .map((row) => Number(row.frp ?? row.FRP ?? row.power ?? 0))
      .filter((value) => Number.isFinite(value));

    return {
      hotspotCount: rows.length,
      maxFrpMw: frpValues.length > 0 ? Math.max(...frpValues) : 0
    };
  } catch {
    return null;
  }
}

function buildNasaClimateNote(values: {
  averageTempC: number;
  precipMmPerDay: number;
  solarKwhPerM2PerDay: number;
  recentAverageTempC?: number | null;
  recentMaxTempC?: number | null;
  recentPrecipMm?: number | null;
  heavyRainDays?: number | null;
  hotDaysCount?: number | null;
  recentSatellitePrecipMm?: number | null;
  recentFireHotspots?: number | null;
  recentMaxFireRadiativePowerMw?: number | null;
  floodRiskScore: number;
  wildfireRiskScore: number;
}) {
  const heatFlag = values.averageTempC >= 18 ? 'elevated warm-season cooling load' : 'moderate annual cooling load';
  const floodFlag =
    values.floodRiskScore >= 3.2 ? 'heightened flood-resilience review' : 'standard flood-resilience review';
  const fireFlag =
    values.wildfireRiskScore >= 2 ? 'satellite fire-screening follow-up' : 'routine wildfire screening';
  const recentOverlay =
    values.recentAverageTempC === null || values.recentAverageTempC === undefined
      ? 'Near-real-time overlay was unavailable, so the note uses climatology only.'
      : `Recent NASA POWER daily NRT shows average temperature ${values.recentAverageTempC.toFixed(
          1
        )}C, max temperature ${values.recentMaxTempC?.toFixed(1) ?? 'n/a'}C, cumulative precipitation ${values.recentPrecipMm?.toFixed(
          1
        ) ?? 'n/a'} mm, ${values.heavyRainDays ?? 0} heavy-rain days, and ${values.hotDaysCount ?? 0} hot days above 30C.`;
  const gpmOverlay =
    values.recentSatellitePrecipMm === null || values.recentSatellitePrecipMm === undefined
      ? 'GPM IMERG precipitation overlay unavailable.'
      : `GPM IMERG near-real-time precipitation within the local bbox reached ${values.recentSatellitePrecipMm.toFixed(
          1
        )} mm/day.`;
  const firmsOverlay =
    values.recentFireHotspots === null || values.recentFireHotspots === undefined
      ? 'FIRMS hotspot overlay unavailable or not configured.'
      : `FIRMS detected ${values.recentFireHotspots} recent hotspot(s) with max FRP ${values.recentMaxFireRadiativePowerMw?.toFixed(
          1
        ) ?? '0.0'} MW.`;

  return `NASA POWER climatology indicates average temperature ${values.averageTempC.toFixed(
    1
  )}C, precipitation ${values.precipMmPerDay.toFixed(2)} mm/day, and solar exposure ${values.solarKwhPerM2PerDay.toFixed(
    2
  )} kWh/m2/day. ${recentOverlay} ${gpmOverlay} ${firmsOverlay} Use this as diligence support for ${heatFlag}, ${floodFlag}, and ${fireFlag}.`;
}

export function createClimateAdapter(store: SourceCacheStore, fetcher?: Fetcher) {
  return {
    async fetch(input: Input): Promise<SourceEnvelope<ClimateOverlayData>> {
      const sourceSystem = process.env.CLIMATE_OVERLAY_API_URL ? 'climate-overlay' : 'nasa-power';
      const now = new Date();
      const cached = await store.getFreshCache<ClimateOverlayData>(sourceSystem, input.assetCode, now);
      if (cached) {
        return {
          sourceSystem,
          status: cached.status,
          mode: 'cache',
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
          freshnessLabel: cached.freshnessLabel,
          data: cached.payload,
          provenance: Object.entries(cached.payload).map(([field, value]) => ({
            field,
            value: typeof value === 'number' || typeof value === 'string' ? value : null,
            sourceSystem,
            mode: 'cache',
            fetchedAt: cached.fetchedAt.toISOString(),
            freshnessLabel: cached.freshnessLabel
          }))
        };
      }

      const fallback =
        FALLBACK_SOURCE_DATA.climate[input.assetCode as keyof typeof FALLBACK_SOURCE_DATA.climate] ??
        DEFAULT_FALLBACK_SOURCE_DATA.climate;
      const ttlHours = Number(process.env.SOURCE_CACHE_TTL_HOURS ?? 24);

      try {
        let data: ClimateOverlayData;

        if (process.env.CLIMATE_OVERLAY_API_URL) {
          const url = new URL(process.env.CLIMATE_OVERLAY_API_URL);
          url.searchParams.set('assetCode', input.assetCode);
          const payload = (await fetchJsonWithRetry(
            url.toString(),
            {
              headers: {
                Authorization: `Bearer ${process.env.CLIMATE_OVERLAY_API_KEY || ''}`
              },
              cache: 'no-store'
            },
            { fetcher }
          )) as Partial<ClimateOverlayData>;

          data = {
            climateRiskNote: String(payload.climateRiskNote ?? fallback.climateRiskNote),
            floodRiskScore: Number(payload.floodRiskScore ?? fallback.floodRiskScore),
            wildfireRiskScore: Number(payload.wildfireRiskScore ?? fallback.wildfireRiskScore),
            recentAverageTempC: Number(payload.recentAverageTempC ?? fallback.recentAverageTempC),
            recentPrecipMm: Number(payload.recentPrecipMm ?? fallback.recentPrecipMm),
            recentFireHotspots: Number(payload.recentFireHotspots ?? fallback.recentFireHotspots),
            recentMaxFireRadiativePowerMw: Number(
              payload.recentMaxFireRadiativePowerMw ?? fallback.recentMaxFireRadiativePowerMw
            )
          };
        } else {
          if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
            throw new Error('missing_coordinates');
          }
          const latitude = Number(input.latitude);
          const longitude = Number(input.longitude);

          const climatologyUrl = new URL(
            process.env.NASA_POWER_API_URL || 'https://power.larc.nasa.gov/api/temporal/climatology/point'
          );
          climatologyUrl.searchParams.set('parameters', 'T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN');
          climatologyUrl.searchParams.set('community', 'RE');
          climatologyUrl.searchParams.set('longitude', String(longitude));
          climatologyUrl.searchParams.set('latitude', String(latitude));
          climatologyUrl.searchParams.set('format', 'JSON');

          const payload = (await fetchJsonWithRetry(
            climatologyUrl.toString(),
            { cache: 'no-store' },
            { fetcher }
          )) as NasaPowerClimatologyResponse;

          const parameter = payload.properties?.parameter;
          const averageTempC = Number(parameter?.T2M?.ANN);
          const precipMmPerDay = Number(parameter?.PRECTOTCORR?.ANN);
          const solarKwhPerM2PerDay = Number(parameter?.ALLSKY_SFC_SW_DWN?.ANN);
          if ([averageTempC, precipMmPerDay, solarKwhPerM2PerDay].some((value) => Number.isNaN(value))) {
            throw new Error('nasa_power_parse_error');
          }

          const recentWindowDays = Math.max(7, Number(process.env.NASA_POWER_RECENT_WINDOW_DAYS ?? 30));
          const referenceDate = resolveReferenceDate();
          const endDate = new Date(
            Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
          );
          endDate.setUTCDate(endDate.getUTCDate() - 2);
          const startDate = new Date(endDate);
          startDate.setUTCDate(startDate.getUTCDate() - (recentWindowDays - 1));

          let recentAverageTempC: number | null = null;
          let recentMaxTempC: number | null = null;
          let recentPrecipMm: number | null = null;
          let heavyRainDays: number | null = null;
          let hotDaysCount: number | null = null;

          try {
            const dailyUrl = new URL(
              process.env.NASA_POWER_DAILY_API_URL || 'https://power.larc.nasa.gov/api/temporal/daily/point'
            );
            dailyUrl.searchParams.set('parameters', 'T2M,T2M_MAX,PRECTOTCORR');
            dailyUrl.searchParams.set('community', 'RE');
            dailyUrl.searchParams.set('longitude', String(longitude));
            dailyUrl.searchParams.set('latitude', String(latitude));
            dailyUrl.searchParams.set('start', formatPowerDate(startDate));
            dailyUrl.searchParams.set('end', formatPowerDate(endDate));
            dailyUrl.searchParams.set('format', 'JSON');

            const dailyPayload = (await fetchJsonWithRetry(
              dailyUrl.toString(),
              { cache: 'no-store' },
              { fetcher }
            )) as NasaPowerDailyResponse;

            const recentTemps = summarizeSeries(dailyPayload.properties?.parameter?.T2M);
            const recentMaxTemps = summarizeSeries(dailyPayload.properties?.parameter?.T2M_MAX);
            const recentPrecip = summarizeSeries(dailyPayload.properties?.parameter?.PRECTOTCORR);

            if (recentTemps && recentMaxTemps && recentPrecip) {
              recentAverageTempC =
                recentTemps.reduce((sum, value) => sum + value, 0) / Math.max(recentTemps.length, 1);
              recentMaxTempC = Math.max(...recentMaxTemps);
              recentPrecipMm = recentPrecip.reduce((sum, value) => sum + value, 0);
              heavyRainDays = recentPrecip.filter((value) => value >= 30).length;
              hotDaysCount = recentMaxTemps.filter((value) => value >= 30).length;
            }
          } catch {
            recentAverageTempC = null;
          }

          const recentSatellitePrecipMm = await fetchRecentGpmPrecipMm(
            latitude,
            longitude,
            referenceDate,
            fetcher
          );
          const firmsSummary = await fetchRecentFirmsSummary(latitude, longitude, fetcher);
          const recentFireHotspots = firmsSummary?.hotspotCount ?? null;
          const recentMaxFireRadiativePowerMw = firmsSummary?.maxFrpMw ?? null;

          await syncSupplementalSourceCaches({
            store,
            assetCode: input.assetCode,
            now,
            ttlHours,
            recentSatellitePrecipMm,
            recentFireHotspots,
            recentMaxFireRadiativePowerMw,
            firmsConfigured: Boolean(process.env.NASA_FIRMS_MAP_KEY?.trim())
          });

          const floodRiskScore = clamp(
            1 +
              (precipMmPerDay / 2.4) +
              ((recentPrecipMm ?? 0) / 60) +
              ((recentSatellitePrecipMm ?? 0) / 35) +
              (heavyRainDays ?? 0) * 0.28,
            0.8,
            5
          );
          const wildfireRiskScore = clamp(
            0.6 +
              (hotDaysCount ?? 0) * 0.25 +
              (recentAverageTempC ? Math.max(recentAverageTempC - 18, 0) * 0.08 : 0) +
              (recentFireHotspots ?? 0) * 0.45 +
              ((recentMaxFireRadiativePowerMw ?? 0) / 30),
            0.4,
            5
          );

          data = {
            climateRiskNote: buildNasaClimateNote({
              averageTempC,
              precipMmPerDay,
              solarKwhPerM2PerDay,
              recentAverageTempC,
              recentMaxTempC,
              recentPrecipMm,
              heavyRainDays,
              hotDaysCount,
              recentSatellitePrecipMm,
              recentFireHotspots,
              recentMaxFireRadiativePowerMw,
              floodRiskScore,
              wildfireRiskScore
            }),
            floodRiskScore,
            wildfireRiskScore,
            recentAverageTempC: recentAverageTempC ?? undefined,
            recentMaxTempC: recentMaxTempC ?? undefined,
            recentPrecipMm: recentPrecipMm ?? undefined,
            heavyRainDays: heavyRainDays ?? undefined,
            hotDaysCount: hotDaysCount ?? undefined,
            recentSatellitePrecipMm: recentSatellitePrecipMm ?? undefined,
            recentFireHotspots: recentFireHotspots ?? undefined,
            recentMaxFireRadiativePowerMw: recentMaxFireRadiativePowerMw ?? undefined
          };
        }

        const entry = {
          status: SourceStatus.FRESH,
          payload: data,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
          freshnessLabel:
            process.env.CLIMATE_OVERLAY_API_URL ? 'fresh api' : 'nasa power + gpm/firms nrt'
        };
        await store.upsertCache(sourceSystem, input.assetCode, entry);

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
        if (sourceSystem === 'nasa-power') {
          await syncSupplementalSourceCaches({
            store,
            assetCode: input.assetCode,
            now,
            ttlHours,
            recentSatellitePrecipMm: null,
            recentFireHotspots: null,
            recentMaxFireRadiativePowerMw: null,
            firmsConfigured: Boolean(process.env.NASA_FIRMS_MAP_KEY?.trim())
          });
        }

        const entry = {
          status: SourceStatus.STALE,
          payload: fallback,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
          freshnessLabel: 'fallback dataset'
        };
        await store.upsertCache(sourceSystem, input.assetCode, entry);

        return {
          sourceSystem,
          status: SourceStatus.STALE,
          mode: 'fallback',
          fetchedAt: entry.fetchedAt,
          expiresAt: entry.expiresAt,
          freshnessLabel: entry.freshnessLabel,
          data: fallback,
          provenance: Object.entries(fallback).map(([field, value]) => ({
            field,
            value: typeof value === 'number' || typeof value === 'string' ? value : null,
            sourceSystem,
            mode: 'fallback',
            fetchedAt: entry.fetchedAt.toISOString(),
            freshnessLabel: entry.freshnessLabel
          }))
        };
      }
    }
  };
}
