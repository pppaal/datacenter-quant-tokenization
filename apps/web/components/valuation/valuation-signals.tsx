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

type Props = {
  confidenceScore?: number | null;
  assumptions?: Record<string, number | string | null> | null;
  provenance?: ProvenanceEntry[];
};

type SignalTone = 'good' | 'warn' | 'neutral';

type Signal = {
  title: string;
  tone: SignalTone;
  summary: string;
  detail: string;
};

function pickNumber(assumptions: Props['assumptions'], key: string) {
  const value = assumptions?.[key];
  return typeof value === 'number' ? value : null;
}

function ratioDelta(a: number | null, b: number | null) {
  if (!a || !b) return null;
  return Math.abs(a - b) / Math.max(a, b);
}

function buildSignals({
  confidenceScore,
  assumptions,
  provenance = []
}: {
  confidenceScore?: number | null;
  assumptions?: Record<string, number | string | null> | null;
  provenance: ProvenanceEntry[];
}): Signal[] {
  const weightedValue = pickNumber(assumptions, 'weightedValueKrw');
  const replacementFloor = pickNumber(assumptions, 'replacementCostFloorKrw');
  const incomeValue = pickNumber(assumptions, 'incomeApproachValueKrw');
  const dcfValue = pickNumber(assumptions, 'dcfValueKrw');
  const stageFactor = pickNumber(assumptions, 'stageFactor');
  const permitPenalty = pickNumber(assumptions, 'permitPenalty');
  const floodPenalty = pickNumber(assumptions, 'floodPenalty');

  const apiCount = provenance.filter((entry) => entry.mode.toLowerCase() === 'api').length;
  const fallbackCount = provenance.filter(
    (entry) => entry.mode.toLowerCase() === 'fallback'
  ).length;
  const floorGap = ratioDelta(weightedValue, replacementFloor);

  const valuationPosture: Signal =
    floorGap !== null && floorGap <= 0.12
      ? {
          title: 'Valuation Posture',
          tone: 'warn',
          summary: 'Floor-constrained',
          detail:
            'Weighted output is still anchored close to the replacement floor, which is typical for early-stage cases.'
        }
      : incomeValue !== null && weightedValue !== null && incomeValue > weightedValue * 1.1
        ? {
            title: 'Valuation Posture',
            tone: 'good',
            summary: 'Income-led',
            detail:
              'Income approach is pulling ahead of the weighted result, suggesting commercial assumptions are now carrying more of the case.'
          }
        : dcfValue !== null && dcfValue < 0
          ? {
              title: 'Valuation Posture',
              tone: 'warn',
              summary: 'Back-end loaded',
              detail:
                'Near-term cash flows remain thin versus build cost, so the case still relies on later stabilization.'
            }
          : {
              title: 'Valuation Posture',
              tone: 'neutral',
              summary: 'Balanced',
              detail:
                'Replacement, income, and DCF components are contributing without one single driver dominating the case.'
            };

  const sourceCoverage: Signal =
    fallbackCount >= Math.max(apiCount, 1)
      ? {
          title: 'Source Coverage',
          tone: 'warn',
          summary: 'Fallback-heavy',
          detail:
            'The run still leans on fallback inputs, so field verification and live-source refresh should precede committee use.'
        }
      : {
          title: 'Source Coverage',
          tone: 'good',
          summary: 'API-backed',
          detail:
            'Most traced fields are arriving from live or cached external sources rather than fallback benchmarks.'
        };

  const developmentReadiness: Signal =
    stageFactor !== null && stageFactor <= 0.62
      ? {
          title: 'Development Readiness',
          tone: 'warn',
          summary: 'Early-stage risk',
          detail: `Stage factor is ${formatNumber(stageFactor, 2)}, so underwriting remains sensitive to permitting and utility sequencing.`
        }
      : stageFactor !== null && stageFactor <= 0.81
        ? {
            title: 'Development Readiness',
            tone: 'neutral',
            summary: 'Mid-stage progressing',
            detail: `Stage factor is ${formatNumber(stageFactor, 2)}, indicating the case has moved beyond screening but is not yet de-risked.`
          }
        : {
            title: 'Development Readiness',
            tone: 'good',
            summary: 'Late-stage visibility',
            detail: `Stage factor is ${formatNumber(stageFactor, 2)}, which supports tighter scenario spread and stronger execution visibility.`
          };

  const diligencePressure: Signal =
    permitPenalty !== null && floodPenalty !== null && (permitPenalty < 0.95 || floodPenalty < 0.96)
      ? {
          title: 'Diligence Pressure',
          tone: 'warn',
          summary: 'Permitting / resilience review open',
          detail:
            'Permit timing or site resilience penalties are still active, so this run should be treated as committee support rather than a final underwriting view.'
        }
      : {
          title: 'Diligence Pressure',
          tone: 'good',
          summary: 'No major penalty active',
          detail:
            'Permit and site penalties are moderate, so the model is not currently applying a severe de-risking haircut.'
        };

  const confidenceContext: Signal = {
    title: 'Confidence Context',
    tone:
      confidenceScore !== null && confidenceScore !== undefined && confidenceScore >= 9
        ? 'good'
        : 'neutral',
    summary:
      confidenceScore !== null && confidenceScore !== undefined
        ? `${formatNumber(confidenceScore, 1)} / 10`
        : 'N/A',
    detail:
      confidenceScore !== null && confidenceScore !== undefined
        ? 'Confidence reflects coverage breadth, coordinate availability, permit visibility, and site-risk deductions.'
        : 'Confidence score is not available for this run.'
  };

  return [
    valuationPosture,
    sourceCoverage,
    developmentReadiness,
    diligencePressure,
    confidenceContext
  ];
}

export function ValuationSignals({ confidenceScore, assumptions, provenance = [] }: Props) {
  const signals = buildSignals({ confidenceScore, assumptions, provenance });

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="eyebrow">Driver Commentary</div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
          Interpretation layer
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {signals.map((signal) => (
          <div key={signal.title} className="rounded-2xl border border-border bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">{signal.title}</div>
              <Badge tone={signal.tone}>{signal.summary}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">{signal.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
