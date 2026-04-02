import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

type Props = {
  dossier: {
    playbook: {
      label: string;
      researchHeadline: string;
      valuationVariableFamilies: string[];
      operatorFocusPoints: string[];
    };
    marketThesis: string;
    macro: {
      indicators: Array<{ label: string; value: string; direction: string }>;
    };
    market: {
      compCoverage: Array<{ label: string; value: string; detail: string }>;
      latestIndicators: Array<{ label: string; value: string; detail: string }>;
    };
    micro: {
      approvedCoverageCount: number;
      pendingBlockers: string[];
      scorecards: Array<{ key: string; label: string; status: 'good' | 'partial' | 'open'; detail: string }>;
    };
    documents: {
      latestDocumentLabel: string;
      latestDocumentHash: string | null;
      anchoredDocumentCount: number;
      documentRoomSummary: string;
    };
  };
};

function toneForStatus(status: 'good' | 'partial' | 'open') {
  if (status === 'good') return 'good' as const;
  if (status === 'partial') return 'warn' as const;
  return 'danger' as const;
}

export function ResearchDossierPanel({ dossier }: Props) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Research Dossier</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">{dossier.playbook.researchHeadline}</h3>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">{dossier.marketThesis}</p>
        </div>
        <Badge>{dossier.playbook.label}</Badge>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="fine-print">Latest Macro Indicators</div>
          <div className="mt-3 grid gap-3">
            {dossier.macro.indicators.map((indicator) => (
              <div key={indicator.label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-white">{indicator.label}</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{indicator.direction}</div>
                </div>
                <div className="text-sm text-slate-300">{indicator.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="fine-print">Comp Coverage</div>
          <div className="mt-3 grid gap-3">
            {dossier.market.compCoverage.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-white">{item.label}</div>
                  <div className="text-sm text-slate-200">{item.value}</div>
                </div>
                <div className="mt-2 text-sm text-slate-400">{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="fine-print">Approved Micro Evidence Coverage</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {dossier.micro.scorecards.map((item) => (
              <div key={item.key} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{item.label}</div>
                  <Badge tone={toneForStatus(item.status)}>{item.status}</Badge>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-400">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Pending Blockers</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {dossier.micro.pendingBlockers.length > 0 ? (
                dossier.micro.pendingBlockers.slice(0, 5).map((blocker) => (
                  <div key={blocker} className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-100">
                    {blocker}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                  No pending review blockers in the current evidence set.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Operator Focus</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {dossier.playbook.operatorFocusPoints.map((point) => (
                <Badge key={point}>{point}</Badge>
              ))}
            </div>
            <div className="mt-4 text-sm text-slate-400">{dossier.documents.documentRoomSummary}</div>
            <div className="mt-3 text-xs text-slate-500">
              Latest doc: {dossier.documents.latestDocumentLabel}
              {dossier.documents.latestDocumentHash ? ` / hash ${dossier.documents.latestDocumentHash.slice(0, 12)}` : ''}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Anchored docs: {dossier.documents.anchoredDocumentCount}
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Valuation Variable Focus</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {dossier.playbook.valuationVariableFamilies.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
