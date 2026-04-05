import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { ResearchWorkspaceData, ResearchWorkspaceTab } from '@/lib/services/research/workspace';

type Props = {
  data: ResearchWorkspaceData;
  activeTab: ResearchWorkspaceTab;
};

function toneForFreshness(status: string | null | undefined) {
  if (status === 'FRESH') return 'good' as const;
  if (status === 'STALE' || status === 'MANUAL') return 'warn' as const;
  return 'danger' as const;
}

export function ResearchWorkspacePanel({ data, activeTab }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <div className="eyebrow">Workspace Status</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={data.status.didRefresh ? 'warn' : 'good'}>
            {data.status.didRefresh ? 'refreshed now' : 'served from persisted research'}
          </Badge>
          <Badge tone={data.status.staleOfficialSourceCount > 0 ? 'warn' : 'good'}>
            {data.status.staleOfficialSourceCount} official-source tasks
          </Badge>
          <Badge tone={data.status.staleAssetDossierCount > 0 ? 'warn' : 'good'}>
            {data.status.staleAssetDossierCount} unstaged asset dossiers
          </Badge>
          {data.status.latestOfficialSyncAt ? (
            <Badge>official sync {data.status.latestOfficialSyncAt.toISOString().slice(0, 10)}</Badge>
          ) : null}
          {data.status.latestAssetSyncAt ? (
            <Badge>asset sync {data.status.latestAssetSyncAt.toISOString().slice(0, 10)}</Badge>
          ) : null}
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-400">{data.status.headline}</p>
        {data.status.staleOfficialSourceCount > 0 || data.status.staleAssetDossierCount > 0 ? (
          <p className="mt-2 text-xs leading-6 text-slate-500">
            Research sync now runs explicitly. Use <span className="text-slate-300">Run Research Sync</span> to refresh
            official sources and dossier staging when coverage is stale.
          </p>
        ) : null}
        {data.status.recentRuns.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.status.recentRuns.slice(0, 4).map((run) => (
              <div key={run.id} className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">{run.triggerType.replaceAll('_', ' ')}</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={run.statusLabel === 'SUCCESS' ? 'good' : run.statusLabel === 'RUNNING' ? 'warn' : 'danger'}>
                      {run.statusLabel.toLowerCase()}
                    </Badge>
                    <Badge>{run.startedAt.toISOString().slice(0, 16).replace('T', ' ')}</Badge>
                  </div>
                </div>
                <div className="mt-2 text-xs leading-6 text-slate-400">
                  {run.officialSourceCount} official sources / {run.assetDossierCount} asset dossiers / {run.staleOfficialSourceCount} stale source tasks / {run.staleAssetDossierCount} stale asset dossiers
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {run.refreshedByActor ? `actor ${run.refreshedByActor}` : 'system run'}
                  {run.errorSummary ? ` / ${run.errorSummary}` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2">
        {data.tabs.map((tab) => (
          <Link
            key={tab}
            href={`/admin/research?tab=${tab}`}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              activeTab === tab
                ? 'border-accent/40 bg-accent/10 text-accent shadow-[0_0_0_1px_rgba(34,211,238,0.12)]'
                : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            {tab === 'assets'
              ? 'Asset Dossiers'
              : tab === 'optimization'
                ? 'Optimization Lab'
                : tab.replace(/^\w/, (char) => char.toUpperCase())}
          </Link>
        ))}
      </div>

      {activeTab === 'macro' ? (
        <Card>
          <div className="eyebrow">Macro Coverage</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Official-source macro and national research fabric</h2>
          <div className="mt-5 grid gap-4">
            {data.macro.snapshots.map((snapshot) => (
              <div key={snapshot.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{snapshot.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {snapshot.sourceSystem ?? 'research'} / {snapshot.snapshotDate.toISOString().slice(0, 10)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={toneForFreshness(snapshot.freshnessStatus)}>{snapshot.freshnessStatus?.toLowerCase() ?? 'unknown'}</Badge>
                    <Badge>{snapshot.freshnessLabel ?? 'unknown freshness'}</Badge>
                    <Badge>{snapshot.provenanceCount} provenance rows</Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-400">{snapshot.summary}</p>
                {snapshot.highlights.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {snapshot.highlights.map((item) => (
                      <Badge key={`${snapshot.id}-${item.label}`}>{item.label}: {item.value}</Badge>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {snapshot.coverage.map((item) => (
                    <Badge key={item}>{item}</Badge>
                  ))}
                </div>
              </div>
            ))}
            {data.macro.snapshots.length === 0 ? (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                No official-source macro snapshots are persisted yet.
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {activeTab === 'markets' ? (
        <Card>
          <div className="eyebrow">Market Universes</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Asset-class market coverage</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {data.markets.map((market) => (
              <div key={market.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{market.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{market.marketKey}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {market.assetClass ? <Badge>{market.assetClass.replaceAll('_', ' ')}</Badge> : null}
                    {market.snapshot ? (
                      <Badge tone={toneForFreshness(market.snapshot.freshnessStatus)}>
                        {market.snapshot.freshnessLabel ?? 'unknown'}
                      </Badge>
                    ) : null}
                    <Badge tone={market.openCoverageTasks > 0 ? 'warn' : 'good'}>
                      {market.openCoverageTasks} open tasks
                    </Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-400">{market.snapshot?.summary ?? market.thesis ?? 'No market thesis yet.'}</p>
                {market.officialHighlights.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {market.officialHighlights.map((item) => (
                      <Badge key={`${market.id}-${item.label}`}>{item.label}: {item.value}</Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {data.markets.length === 0 ? (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                No market universes are staged yet.
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {activeTab === 'submarkets' ? (
        <Card>
          <div className="eyebrow">Submarket Universes</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">City and district coverage</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {data.submarkets.map((submarket) => (
              <div key={submarket.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{submarket.label}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {[submarket.city, submarket.district].filter(Boolean).join(' / ') || 'Korea'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {submarket.assetClass ? <Badge>{submarket.assetClass.replaceAll('_', ' ')}</Badge> : null}
                    {submarket.snapshot ? (
                      <Badge tone={toneForFreshness(submarket.snapshot.freshnessStatus)}>
                        {submarket.snapshot.freshnessLabel ?? 'unknown'}
                      </Badge>
                    ) : null}
                    <Badge tone={submarket.openCoverageTasks > 0 ? 'warn' : 'good'}>
                      {submarket.openCoverageTasks} open tasks
                    </Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-400">{submarket.snapshot?.summary ?? submarket.thesis ?? 'No submarket thesis yet.'}</p>
              </div>
            ))}
            {data.submarkets.length === 0 ? (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                No submarkets are staged yet.
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {activeTab === 'assets' ? (
        <Card>
          <div className="eyebrow">Asset Dossiers</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Asset-level research coverage and blockers</h2>
          <div className="mt-5 grid gap-4">
            {data.assetDossiers.map((asset) => (
              <Link
                key={asset.assetId}
                href={`/admin/assets/${asset.assetId}`}
                className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{asset.assetName}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {asset.assetCode} / {asset.assetClass.replaceAll('_', ' ')}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={asset.sourceFreshnessTone}>{asset.freshnessBadge}</Badge>
                    <Badge>{asset.approvedCoverageCount} approved disciplines</Badge>
                    <Badge tone={asset.pendingBlockerCount > 0 ? 'warn' : 'good'}>
                      {asset.pendingBlockerCount} pending blockers
                    </Badge>
                    <Badge tone={asset.openCoverageTasks > 0 ? 'warn' : 'good'}>
                      {asset.openCoverageTasks} open tasks
                    </Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-400">{asset.marketThesis}</p>
                <div className="mt-2 text-xs text-slate-500">
                  Latest valuation: {asset.latestValuationId ?? 'not run yet'}
                </div>
              </Link>
            ))}
            {data.assetDossiers.length === 0 ? (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                No asset dossiers are available yet.
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {activeTab === 'optimization' ? (
        <Card>
          <div className="eyebrow">Optimization Lab</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Quantum-inspired portfolio search and scenario exploration
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            This tab runs deterministic quantum-inspired search on current held portfolios using operating KPIs,
            covenant pressure, research blockers, and official market signal freshness. It is a classical research
            module for operator decision support, not quantum hardware execution.
          </p>
          <div className="mt-5 grid gap-4">
            {data.optimization.map((portfolio) => (
              <Link
                key={portfolio.portfolioId}
                href={`/admin/portfolio/${portfolio.portfolioId}`}
                className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{portfolio.portfolioName}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {portfolio.portfolioCode} / {portfolio.assetCount} held assets
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="warn">{portfolio.methodologyLabel}</Badge>
                    <Badge
                      tone={
                        portfolio.objectiveScorePct >= 68
                          ? 'good'
                          : portfolio.objectiveScorePct >= 52
                            ? 'warn'
                            : 'danger'
                      }
                    >
                      objective {portfolio.objectiveScorePct.toFixed(0)}%
                    </Badge>
                    <Badge tone={portfolio.blockerCount > 0 ? 'warn' : 'good'}>
                      {portfolio.blockerCount} blockers
                    </Badge>
                    <Badge tone={portfolio.watchCount > 0 ? 'warn' : 'good'}>
                      {portfolio.watchCount} watch assets
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  <div>
                    <div className="fine-print">Primary Move</div>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{portfolio.topMove}</p>
                  </div>
                  <div>
                    <div className="fine-print">Defensive Move</div>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{portfolio.defensiveMove}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone={portfolio.addCount > 0 ? 'good' : 'neutral'}>{portfolio.addCount} adds</Badge>
                  <Badge tone={portfolio.trimCount > 0 ? 'warn' : 'neutral'}>{portfolio.trimCount} trims</Badge>
                  {portfolio.fragileScenario ? (
                    <Badge tone={portfolio.fragileScenario.weightedStressScore >= 18 ? 'danger' : 'warn'}>
                      {portfolio.fragileScenario.label} {portfolio.fragileScenario.weightedStressScore.toFixed(1)}
                    </Badge>
                  ) : null}
                </div>
                {portfolio.fragileScenario ? (
                  <p className="mt-3 text-xs leading-6 text-slate-500">
                    {portfolio.fragileScenario.commentary} Value impact{' '}
                    {portfolio.fragileScenario.weightedValueImpactPct.toFixed(1)}% / DSCR impact{' '}
                    {portfolio.fragileScenario.weightedDscrImpactPct.toFixed(1)}%.
                  </p>
                ) : null}
              </Link>
            ))}
            {data.optimization.length === 0 ? (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                No held portfolios are available for optimization research yet.
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {activeTab === 'coverage' ? (
        <Card>
          <div className="eyebrow">Coverage Queue</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Open research tasks and freshness exceptions</h2>
          <div className="mt-5 grid gap-4">
            {data.coverageQueue.map((task) => (
              <div key={task.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{task.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {task.scopeLabel} / {task.taskType}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={task.priority === 'HIGH' || task.priority === 'URGENT' ? 'danger' : 'warn'}>
                      {task.priority.toLowerCase()}
                    </Badge>
                    {task.freshnessLabel ? <Badge>{task.freshnessLabel}</Badge> : null}
                    {task.sourceSystem ? <Badge>{task.sourceSystem}</Badge> : null}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-400">{task.notes ?? 'No operator note yet.'}</p>
              </div>
            ))}
            {data.coverageQueue.length === 0 ? (
              <div className="rounded-[22px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                No open research coverage tasks are currently blocking the workspace.
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
