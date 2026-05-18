import { Badge } from '@/components/ui/badge';
import { getRunHealthFlags } from '@/lib/valuation-run-health';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

type ScenarioEntry = {
  name: string;
  valuationKrw: number;
};

type Props = {
  createdAt?: Date | string | null;
  confidenceScore?: number | null;
  provenance?: ProvenanceEntry[] | null;
  scenarios?: ScenarioEntry[] | null;
};

export function ValuationRunBadges({ createdAt, confidenceScore, provenance, scenarios }: Props) {
  const flags = getRunHealthFlags({ createdAt, confidenceScore, provenance, scenarios });

  return (
    <div className="flex flex-wrap gap-2">
      {flags.map((flag) => (
        <Badge key={flag.key} tone={flag.tone}>
          {flag.label}
        </Badge>
      ))}
    </div>
  );
}
