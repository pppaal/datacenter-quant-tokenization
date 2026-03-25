import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

type AssetConfidenceInput = {
  engineVersion?: string | null;
  confidenceScore?: number | null;
  address?: {
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  siteProfile?: {
    floodRiskScore?: number | null;
  } | null;
  buildingSnapshot?: object | null;
  permitSnapshot?: {
    powerApprovalStatus?: string | null;
  } | null;
  energySnapshot?: object | null;
  marketSnapshot?: object | null;
  provenance?: ProvenanceEntry[];
};

type Driver = {
  label: string;
  value: string;
  detail: string;
  tone: 'neutral' | 'good' | 'warn';
};

function modeWeights(engineVersion?: string | null) {
  return engineVersion?.includes('-py-')
    ? {
        base: 4.5,
        sectionWeight: 0.85,
        coordinate: 0.35,
        permit: 0.25,
        riskPenalty: 0.05
      }
    : {
        base: 4.4,
        sectionWeight: 0.9,
        coordinate: 0.4,
        permit: 0.35,
        riskPenalty: 0.05
      };
}

function buildDrivers(input: AssetConfidenceInput): Driver[] {
  const weights = modeWeights(input.engineVersion);
  const sectionCount = [
    input.siteProfile,
    input.buildingSnapshot,
    input.permitSnapshot,
    input.energySnapshot,
    input.marketSnapshot
  ].filter(Boolean).length;
  const hasCoordinates = Boolean(input.address?.latitude && input.address?.longitude);
  const hasPermitVisibility = Boolean(input.permitSnapshot?.powerApprovalStatus);
  const floodRiskScore = input.siteProfile?.floodRiskScore ?? 0;
  const fallbackCount =
    input.provenance?.filter((entry) => entry.mode.toLowerCase() === 'fallback').length ?? 0;
  const apiCount = input.provenance?.filter((entry) => entry.mode.toLowerCase() === 'api').length ?? 0;

  const uncappedScore =
    weights.base +
    sectionCount * weights.sectionWeight +
    (hasCoordinates ? weights.coordinate : 0) +
    (hasPermitVisibility ? weights.permit : 0) -
    floodRiskScore * weights.riskPenalty;
  const cappedDelta =
    input.confidenceScore !== null && input.confidenceScore !== undefined
      ? Math.max(0, uncappedScore - input.confidenceScore)
      : 0;

  return [
    {
      label: 'Base Model',
      value: `+${formatNumber(weights.base, 1)}`,
      detail: 'Starting confidence before coverage and risk adjustments.',
      tone: 'neutral'
    },
    {
      label: 'Snapshot Coverage',
      value: `+${formatNumber(sectionCount * weights.sectionWeight, 1)}`,
      detail: `${sectionCount}/5 underwriting sections are populated for this run.`,
      tone: sectionCount >= 4 ? 'good' : 'warn'
    },
    {
      label: 'Coordinate Certainty',
      value: hasCoordinates ? `+${formatNumber(weights.coordinate, 2)}` : '+0.00',
      detail: hasCoordinates
        ? 'Latitude and longitude are available for geospatial and climate overlays.'
        : 'Missing coordinates reduce geospatial confidence.',
      tone: hasCoordinates ? 'good' : 'warn'
    },
    {
      label: 'Permit Visibility',
      value: hasPermitVisibility ? `+${formatNumber(weights.permit, 2)}` : '+0.00',
      detail: hasPermitVisibility
        ? 'Permit or power-approval status is explicitly present in the run context.'
        : 'No explicit permit visibility uplift was available.',
      tone: hasPermitVisibility ? 'good' : 'warn'
    },
    {
      label: 'Site-Risk Deduction',
      value: `-${formatNumber(floodRiskScore * weights.riskPenalty, 2)}`,
      detail: `Flood-risk score of ${formatNumber(floodRiskScore, 2)} is reducing confidence modestly.`,
      tone: floodRiskScore > 2 ? 'warn' : 'neutral'
    },
    {
      label: 'Source Quality',
      value: `${apiCount} API / ${fallbackCount} fallback`,
      detail:
        fallbackCount > apiCount
          ? 'Fallback benchmarks still dominate more traced fields than live sources.'
          : 'Live-source coverage is at least keeping pace with fallback usage.',
      tone: fallbackCount > apiCount ? 'warn' : 'good'
    },
    {
      label: 'Cap Adjustment',
      value: cappedDelta > 0 ? `-${formatNumber(cappedDelta, 2)}` : '0.00',
      detail:
        cappedDelta > 0
          ? 'The model hit its confidence ceiling, so the displayed score is capped below the uncapped sum.'
          : 'No ceiling adjustment was required for this run.',
      tone: cappedDelta > 0 ? 'neutral' : 'good'
    }
  ];
}

function rerunRecommendation(input: AssetConfidenceInput) {
  const fallbackCount =
    input.provenance?.filter((entry) => entry.mode.toLowerCase() === 'fallback').length ?? 0;
  const permitVisibility = Boolean(input.permitSnapshot?.powerApprovalStatus);
  const hasCoordinates = Boolean(input.address?.latitude && input.address?.longitude);

  if (fallbackCount >= 2 || !permitVisibility || !hasCoordinates) {
    return {
      tone: 'warn' as const,
      label: 'Re-run Recommended',
      detail: 'Refresh live sources after enrichment or manual overrides before presenting this run as a tighter committee view.'
    };
  }

  return {
    tone: 'good' as const,
    label: 'Current Run Stable',
    detail: 'Coverage is sufficient for ongoing review, though normal source refresh cadence should still apply.'
  };
}

export function ConfidenceBreakdown(input: AssetConfidenceInput) {
  const drivers = buildDrivers(input);
  const rerun = rerunRecommendation(input);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Confidence Breakdown</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {input.confidenceScore !== null && input.confidenceScore !== undefined
              ? `${formatNumber(input.confidenceScore, 1)} / 10`
              : 'N/A'}
          </div>
        </div>
        <Badge tone={rerun.tone}>{rerun.label}</Badge>
      </div>
      <p className="text-sm leading-6 text-slate-300">{rerun.detail}</p>
      <div className="grid gap-4 xl:grid-cols-2">
        {drivers.map((driver) => (
          <div key={driver.label} className="rounded-2xl border border-border bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">{driver.label}</div>
              <Badge tone={driver.tone}>{driver.value}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">{driver.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

