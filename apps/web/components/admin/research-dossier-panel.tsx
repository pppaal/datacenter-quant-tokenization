import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ResearchHouseViewApprovalButton } from '@/components/admin/research-house-view-approval-button';

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
      officialHighlights: Array<{ label: string; value: string; detail: string }>;
    };
    micro: {
      approvedCoverageCount: number;
      pendingBlockers: string[];
      scorecards: Array<{
        key: string;
        label: string;
        status: 'good' | 'partial' | 'open';
        detail: string;
      }>;
    };
    documents: {
      latestDocumentLabel: string;
      latestDocumentHash: string | null;
      anchoredDocumentCount: number;
      documentRoomSummary: string;
    };
    freshness: {
      status: 'FRESH' | 'STALE' | 'FAILED' | 'MANUAL';
      label: string;
      headline: string;
      items: Array<{
        title: string;
        sourceSystem: string;
        freshnessStatus: 'FRESH' | 'STALE' | 'FAILED' | 'MANUAL';
        freshnessLabel: string;
        observedAt: Date | null;
      }>;
    };
    provenance: {
      sourceCount: number;
      sources: string[];
      latestSnapshotTitle: string;
      latestSnapshotDate: Date | null;
    };
    houseView: {
      draftSnapshotId: string | null;
      title: string;
      summary: string;
      approvalStatus: 'DRAFT' | 'APPROVED' | 'SUPERSEDED' | null;
      approvalLabel: string;
      approvedAt: Date | null;
      approvedById: string | null;
      snapshotDate: Date | null;
      thesisAgeDays: number | null;
      lineage: string;
    };
    sourceView: {
      title: string;
      sourceSystem: string | null;
      freshnessLabel: string | null;
      snapshotDate: Date | null;
      summary: string | null;
    };
    confidence: {
      score: number;
      level: 'high' | 'moderate' | 'low';
      thesisAgeDays: number | null;
      headline: string;
      conflicts: Array<{
        label: string;
        detail: string;
        severity: 'warn' | 'danger';
      }>;
    };
    officialSources: {
      highlights: Array<{
        label: string;
        value: string;
        sourceSystem: string;
        freshnessLabel: string;
      }>;
    };
    coverage: {
      openTaskCount: number;
      tasks: Array<{
        id: string;
        title: string;
        priority: string;
        notes: string | null;
        freshnessLabel: string | null;
      }>;
    };
  };
  canApproveHouseView?: boolean;
};

function toneForStatus(status: 'good' | 'partial' | 'open') {
  if (status === 'good') return 'good' as const;
  if (status === 'partial') return 'warn' as const;
  return 'danger' as const;
}

function toneForFreshness(status: 'FRESH' | 'STALE' | 'FAILED' | 'MANUAL') {
  if (status === 'FRESH') return 'good' as const;
  if (status === 'STALE' || status === 'MANUAL') return 'warn' as const;
  return 'danger' as const;
}

function toneForConfidence(level: 'high' | 'moderate' | 'low') {
  if (level === 'high') return 'good' as const;
  if (level === 'moderate') return 'warn' as const;
  return 'danger' as const;
}

function toneForApproval(status: 'DRAFT' | 'APPROVED' | 'SUPERSEDED' | null) {
  if (status === 'APPROVED') return 'good' as const;
  if (status === 'SUPERSEDED') return 'danger' as const;
  return 'warn' as const;
}

export function ResearchDossierPanel({ dossier, canApproveHouseView = false }: Props) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Research Dossier</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            {dossier.playbook.researchHeadline}
          </h3>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">{dossier.marketThesis}</p>
        </div>
        <Badge>{dossier.playbook.label}</Badge>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="fine-print">Latest Macro Indicators</div>
          <div className="mt-3 grid gap-3">
            {dossier.macro.indicators.map((indicator) => (
              <div
                key={indicator.label}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3"
              >
                <div>
                  <div className="text-sm font-semibold text-white">{indicator.label}</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {indicator.direction}
                  </div>
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
              <div
                key={item.label}
                className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-white">{item.label}</div>
                  <div className="text-sm text-slate-200">{item.value}</div>
                </div>
                <div className="mt-2 text-sm text-slate-400">{item.detail}</div>
              </div>
            ))}
            {dossier.market.officialHighlights.length > 0 ? (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                <div className="text-sm font-semibold text-white">Official Market Signals</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dossier.market.officialHighlights.map((item) => (
                    <Badge key={item.label}>
                      {item.label}: {item.value}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="fine-print">Approved Micro Evidence Coverage</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {dossier.micro.scorecards.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"
              >
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
                  <div
                    key={blocker}
                    className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-100"
                  >
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
            <div className="mt-4 text-sm text-slate-400">
              {dossier.documents.documentRoomSummary}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Latest doc: {dossier.documents.latestDocumentLabel}
              {dossier.documents.latestDocumentHash
                ? ` / hash ${dossier.documents.latestDocumentHash.slice(0, 12)}`
                : ''}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Anchored docs: {dossier.documents.anchoredDocumentCount}
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Freshness / Provenance</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={toneForFreshness(dossier.freshness.status)}>
                {dossier.freshness.status.toLowerCase()}
              </Badge>
              <Badge>{dossier.freshness.label}</Badge>
              <Badge>{dossier.provenance.sourceCount} sources</Badge>
            </div>
            <div className="mt-3 text-sm leading-7 text-slate-400">
              {dossier.freshness.headline}
            </div>
            <div className="mt-3 space-y-2">
              {dossier.freshness.items.map((item) => (
                <div
                  key={`${item.title}-${item.sourceSystem}`}
                  className="rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                    <Badge tone={toneForFreshness(item.freshnessStatus)}>
                      {item.freshnessLabel}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.sourceSystem}
                    {item.observedAt ? ` / ${item.observedAt.toISOString().slice(0, 10)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">House View / Source View</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={toneForApproval(dossier.houseView.approvalStatus)}>
                {dossier.houseView.approvalLabel}
              </Badge>
              {dossier.houseView.thesisAgeDays != null ? (
                <Badge>{dossier.houseView.thesisAgeDays}d thesis age</Badge>
              ) : null}
              {dossier.sourceView.freshnessLabel ? (
                <Badge>{dossier.sourceView.freshnessLabel}</Badge>
              ) : null}
            </div>
            {canApproveHouseView && dossier.houseView.draftSnapshotId ? (
              <div className="mt-3">
                <ResearchHouseViewApprovalButton
                  snapshotId={dossier.houseView.draftSnapshotId}
                  compact
                />
              </div>
            ) : null}
            <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-3">
              <div className="text-sm font-semibold text-white">{dossier.houseView.title}</div>
              <div className="mt-2 text-sm leading-7 text-slate-400">
                {dossier.houseView.summary}
              </div>
              <div className="mt-2 text-xs text-slate-500">{dossier.houseView.lineage}</div>
            </div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-3">
              <div className="text-sm font-semibold text-white">{dossier.sourceView.title}</div>
              <div className="mt-2 text-sm leading-7 text-slate-400">
                {dossier.sourceView.summary ??
                  'No explicit source-view thesis has been staged for this asset yet.'}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {dossier.sourceView.sourceSystem ?? 'research source'}
                {dossier.sourceView.snapshotDate
                  ? ` / ${dossier.sourceView.snapshotDate.toISOString().slice(0, 10)}`
                  : ''}
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Confidence / Conflict</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={toneForConfidence(dossier.confidence.level)}>
                {dossier.confidence.level}
              </Badge>
              <Badge>{dossier.confidence.score}% confidence</Badge>
              {dossier.confidence.thesisAgeDays != null ? (
                <Badge>{dossier.confidence.thesisAgeDays}d thesis age</Badge>
              ) : null}
            </div>
            <div className="mt-3 text-sm leading-7 text-slate-400">
              {dossier.confidence.headline}
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {dossier.confidence.conflicts.length > 0 ? (
                dossier.confidence.conflicts.map((item) => (
                  <div
                    key={`${item.label}-${item.detail}`}
                    className={`rounded-2xl border px-3 py-2 ${
                      item.severity === 'danger'
                        ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                        : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                    }`}
                  >
                    <div className="font-semibold">{item.label}</div>
                    <div className="mt-1 text-xs">{item.detail}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                  No source disagreement signals are currently surfacing in the dossier.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Official Source Highlights</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {dossier.officialSources.highlights.length > 0 ? (
                dossier.officialSources.highlights.map((item) => (
                  <div
                    key={`${item.sourceSystem}-${item.label}`}
                    className="rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-white">{item.label}</div>
                      <Badge>{item.value}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.sourceSystem} / {item.freshnessLabel}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 text-slate-400">
                  No official-source metrics have been staged for this dossier yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Coverage Queue</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={dossier.coverage.openTaskCount > 0 ? 'warn' : 'good'}>
                {dossier.coverage.openTaskCount} open task
                {dossier.coverage.openTaskCount === 1 ? '' : 's'}
              </Badge>
              <Badge>{dossier.provenance.latestSnapshotTitle}</Badge>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {dossier.coverage.tasks.length > 0 ? (
                dossier.coverage.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-white">{task.title}</div>
                      <Badge
                        tone={
                          task.priority === 'HIGH' || task.priority === 'URGENT' ? 'danger' : 'warn'
                        }
                      >
                        {task.priority.toLowerCase()}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {task.freshnessLabel ?? 'research coverage'}
                      {task.notes ? ` / ${task.notes}` : ''}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                  No open research coverage tasks are blocking the current dossier.
                </div>
              )}
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
