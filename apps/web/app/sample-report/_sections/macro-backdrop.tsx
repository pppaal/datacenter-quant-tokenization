import { Card } from '@/components/ui/card';
import { formatMacroValue } from '@/lib/services/im/sections';
import { ProvenancePill } from './helpers';
import { formatDate } from '@/lib/utils';
import type { SampleReportData } from './types';

export function MacroBackdropSection({ data }: { data: SampleReportData }) {
  const { macroBackdrop, provenanceByCard } = data;
  if (!(macroBackdrop.length > 0)) {
    return null;
  }
  return (
    <section id="im-macro" className="app-shell py-4">
      <Card>
        <div className="eyebrow">Macro backdrop</div>
        <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
          Latest reading per series from the official-source feed (KOSIS / BOK ECOS). The cap-rate
          and discount-rate underwriting both anchor here.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          {macroBackdrop.map((point) => (
            <div
              key={point.seriesKey}
              className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4"
            >
              <div className="fine-print">{point.label}</div>
              <div className="mt-2 text-xl font-semibold text-[hsl(var(--foreground))]">
                {formatMacroValue(point)}
              </div>
              <div className="mt-1 text-xs text-[hsl(var(--muted))]">
                {formatDate(point.observationDate)}
              </div>
            </div>
          ))}
        </div>
        <ProvenancePill entries={provenanceByCard.macro} />
      </Card>
    </section>
  );
}
