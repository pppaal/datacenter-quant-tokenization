export type SatelliteRiskAssumptions = {
  floodRiskScore?: number | null;
  wildfireRiskScore?: number | null;
  climateNote?: string | null;
  recentSatellitePrecipMm?: number | null;
  recentFireHotspots?: number | null;
  recentMaxFireRadiativePowerMw?: number | null;
};

type SiteProfileLike = {
  floodRiskScore?: number | null;
  wildfireRiskScore?: number | null;
  siteNotes?: string | null;
} | null;

export type SatelliteRiskSnapshot = {
  floodRiskScore: number | null;
  wildfireRiskScore: number | null;
  climateNote: string | null;
  recentSatellitePrecipMm: number | null;
  recentFireHotspots: number | null;
  recentMaxFireRadiativePowerMw: number | null;
};

function asFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function readSatelliteRiskAssumptions(assumptions: unknown): SatelliteRiskAssumptions | null {
  if (!assumptions || typeof assumptions !== 'object') return null;

  const candidate =
    'satelliteRisk' in assumptions &&
    assumptions.satelliteRisk &&
    typeof assumptions.satelliteRisk === 'object'
      ? (assumptions.satelliteRisk as Record<string, unknown>)
      : null;

  if (!candidate) return null;

  return {
    floodRiskScore: asFiniteNumber(candidate.floodRiskScore),
    wildfireRiskScore: asFiniteNumber(candidate.wildfireRiskScore),
    climateNote: asString(candidate.climateNote),
    recentSatellitePrecipMm: asFiniteNumber(candidate.recentSatellitePrecipMm),
    recentFireHotspots: asFiniteNumber(candidate.recentFireHotspots),
    recentMaxFireRadiativePowerMw: asFiniteNumber(candidate.recentMaxFireRadiativePowerMw)
  };
}

export function resolveSatelliteRiskSnapshot({
  assumptions,
  siteProfile
}: {
  assumptions?: unknown;
  siteProfile?: SiteProfileLike;
}): SatelliteRiskSnapshot {
  const satelliteRisk = readSatelliteRiskAssumptions(assumptions);

  return {
    floodRiskScore: satelliteRisk?.floodRiskScore ?? siteProfile?.floodRiskScore ?? null,
    wildfireRiskScore: satelliteRisk?.wildfireRiskScore ?? siteProfile?.wildfireRiskScore ?? null,
    climateNote: satelliteRisk?.climateNote ?? siteProfile?.siteNotes ?? null,
    recentSatellitePrecipMm: satelliteRisk?.recentSatellitePrecipMm ?? null,
    recentFireHotspots: satelliteRisk?.recentFireHotspots ?? null,
    recentMaxFireRadiativePowerMw: satelliteRisk?.recentMaxFireRadiativePowerMw ?? null
  };
}

export function getSatelliteRiskTone(score?: number | null): 'good' | 'warn' | 'danger' {
  if ((score ?? 0) >= 3.2) return 'danger';
  if ((score ?? 0) >= 1.8) return 'warn';
  return 'good';
}

export function getSatelliteRiskLabel(score?: number | null) {
  if ((score ?? 0) >= 3.2) return 'Elevated';
  if ((score ?? 0) >= 1.8) return 'Watch';
  return 'Routine';
}
