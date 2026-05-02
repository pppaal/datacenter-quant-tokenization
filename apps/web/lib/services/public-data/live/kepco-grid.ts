/**
 * KEPCO grid-access live adapter scaffold.
 *
 * KEPCO does not yet expose a public REST API for substation capacity at the
 * granularity we need (most ops teams scrape the 전력계통도 PDFs or run a B2B
 * data agreement with KEPCO BizPLAZA). Until that contract is in place, this
 * adapter:
 *   1. Reads a CSV/JSON snapshot file path from `KEPCO_SUBSTATION_DATA_PATH`,
 *      or fetches a JSON URL from `KEPCO_SUBSTATION_DATA_URL`.
 *   2. Picks the closest substation by haversine distance.
 *   3. Returns a `GridAccess` record with the snapshot's free-capacity field.
 *
 * If neither env var is set, returns null and the caller falls back to mock.
 *
 * The schema expected from the snapshot is intentionally minimal:
 *   { name: string, latitude: number, longitude: number,
 *     availableCapacityMw: number | null, tariffKrwPerKwh: number,
 *     fiberBackboneAvailable: boolean,
 *     renewableSourcingAvailablePct: number | null }
 */
import type {
  GridAccess,
  GridAccessConnector,
  LatLng,
  ParcelIdentifier
} from '@/lib/services/public-data/types';

type SubstationRecord = {
  name: string;
  latitude: number;
  longitude: number;
  availableCapacityMw: number | null;
  tariffKrwPerKwh: number;
  fiberBackboneAvailable: boolean;
  renewableSourcingAvailablePct: number | null;
};

export class LiveKepcoGridAccess implements GridAccessConnector {
  private cache: SubstationRecord[] | null = null;

  constructor(
    private readonly snapshotPath: string | undefined = process.env.KEPCO_SUBSTATION_DATA_PATH,
    private readonly snapshotUrl: string | undefined = process.env.KEPCO_SUBSTATION_DATA_URL,
    private readonly timeoutMs: number = 8000
  ) {}

  async fetch(parcel: ParcelIdentifier, location: LatLng): Promise<GridAccess | null> {
    const dataset = await this.loadDataset();
    if (!dataset || dataset.length === 0) return null;

    let best: { rec: SubstationRecord; distanceKm: number } | null = null;
    for (const rec of dataset) {
      const d = haversineKm(location, { latitude: rec.latitude, longitude: rec.longitude });
      if (!best || d < best.distanceKm) best = { rec, distanceKm: d };
    }
    if (!best) return null;

    return {
      pnu: parcel.pnu,
      nearestSubstationName: best.rec.name,
      nearestSubstationDistanceKm: roundTo(best.distanceKm, 2),
      availableCapacityMw: best.rec.availableCapacityMw,
      tariffKrwPerKwh: best.rec.tariffKrwPerKwh,
      fiberBackboneAvailable: best.rec.fiberBackboneAvailable,
      renewableSourcingAvailablePct: best.rec.renewableSourcingAvailablePct
    };
  }

  private async loadDataset(): Promise<SubstationRecord[] | null> {
    if (this.cache) return this.cache;
    try {
      if (this.snapshotPath) {
        const fs = await import('node:fs/promises');
        const raw = await fs.readFile(this.snapshotPath, 'utf-8');
        this.cache = parseDataset(raw);
        return this.cache;
      }
      if (this.snapshotUrl) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const res = await fetch(this.snapshotUrl, { signal: controller.signal });
          if (!res.ok) return null;
          const raw = await res.text();
          this.cache = parseDataset(raw);
          return this.cache;
        } finally {
          clearTimeout(timer);
        }
      }
      return null;
    } catch (err) {
      console.warn('[kepco-grid] dataset load failed', err);
      return null;
    }
  }
}

function parseDataset(raw: string): SubstationRecord[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const json = JSON.parse(trimmed) as SubstationRecord[];
    return json.filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
  }
  // CSV fallback: name,lat,lng,availableCapacityMw,tariffKrwPerKwh,fiber,renewablePct
  return trimmed
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .slice(1) // header
    .map((line): SubstationRecord => {
      const [name, lat, lng, cap, tariff, fiber, renewable] = line.split(',');
      return {
        name: name.trim(),
        latitude: Number(lat),
        longitude: Number(lng),
        availableCapacityMw: cap === '' ? null : Number(cap),
        tariffKrwPerKwh: Number(tariff),
        fiberBackboneAvailable: fiber.trim().toLowerCase() === 'true',
        renewableSourcingAvailablePct: renewable === '' ? null : Number(renewable)
      };
    });
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function roundTo(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
