import { headers } from 'next/headers';
import { Badge } from '@/components/ui/badge';
import { SourcesRefreshButton } from '@/components/admin/sources-refresh-button';
import { Card } from '@/components/ui/card';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { getAdminActorFromHeaders } from '@/lib/security/admin-request';
import { getSourceRefreshHealth, listRecentSourceRefreshRuns } from '@/lib/services/source-refresh';
import {
  listFreeMacroSourceCatalog,
  listGlobalMarketLaunchPlan,
  listKoreaResearchSourceCatalog,
  listMacroConnectorReadiness,
  listSourceStatus
} from '@/lib/services/sources';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function toneForReadiness(status: 'CONFIGURED' | 'PARTIAL' | 'MISSING') {
  if (status === 'CONFIGURED') return 'good' as const;
  if (status === 'PARTIAL') return 'warn' as const;
  return 'danger' as const;
}

function toneForLaunchStatus(status: 'NOW' | 'NEXT' | 'LATER') {
  if (status === 'NOW') return 'good' as const;
  if (status === 'NEXT') return 'warn' as const;
  return 'neutral' as const;
}

function toneForRealtimeClass(status: 'REALTIME' | 'NEAR_REALTIME' | 'RELEASE_BASED' | 'LOW_FREQUENCY') {
  if (status === 'REALTIME') return 'good' as const;
  if (status === 'NEAR_REALTIME') return 'good' as const;
  if (status === 'RELEASE_BASED') return 'warn' as const;
  return 'neutral' as const;
}

export default async function SourcesPage() {
  const actor = getAdminActorFromHeaders(await headers());
  const canRefreshSources = actor ? hasRequiredAdminRole(actor.role, 'ANALYST') : false;
  const [rows, refreshHealth, recentRuns] = await Promise.all([
    listSourceStatus(),
    getSourceRefreshHealth(),
    listRecentSourceRefreshRuns()
  ]);
  const macroConnectors = listMacroConnectorReadiness();
  const launchPlan = listGlobalMarketLaunchPlan();
  const freeMacroCatalog = listFreeMacroSourceCatalog();
  const koreaResearchCatalog = listKoreaResearchSourceCatalog();
  const configuredCount = macroConnectors.filter((connector) => connector.status === 'CONFIGURED').length;
  const partialCount = macroConnectors.filter((connector) => connector.status === 'PARTIAL').length;

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">API Source Status</div>
        <h2 className="mt-2 text-3xl font-semibold text-white">Adapter health and cache freshness</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
          NASA climate ingestion now tracks POWER climatology and daily near-real-time refresh separately from GPM
          precipitation and FIRMS hotspot overlays.
        </p>
        {canRefreshSources ? (
          <div className="mt-4">
            <SourcesRefreshButton />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="metric-card">
          <div className="fine-print">Configured Data Connectors</div>
          <div className="mt-3 text-2xl font-semibold text-white">{configuredCount}</div>
          <p className="mt-2 text-sm text-slate-400">Ready for live ingestion without additional env wiring.</p>
        </div>
        <div className="metric-card">
          <div className="fine-print">Partial Connectors</div>
          <div className="mt-3 text-2xl font-semibold text-white">{partialCount}</div>
          <p className="mt-2 text-sm text-slate-400">Some env keys exist, but the connector still cannot run end-to-end.</p>
        </div>
        <div className="metric-card">
          <div className="fine-print">Priority 1 Goal</div>
          <div className="mt-3 text-2xl font-semibold text-white">Macro + Market + FX APIs</div>
          <p className="mt-2 text-sm text-slate-400">Best path to replace fallback-heavy market assumptions and static FX conversion with live feeds.</p>
        </div>
      </div>

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Refresh Operations</div>
          <h3 className="mt-2 text-xl font-semibold text-white">Batch status, stale assets, and recent source refresh runs</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Source refresh is now an explicit operator or cron-triggered job. Use this panel to see stale adapter coverage,
            stale assets waiting for enrichment, and the most recent run results before research or underwriting relies on them.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Stale Threshold</div>
            <div className="mt-3 text-2xl font-semibold text-white">{refreshHealth.staleThresholdHours}h</div>
            <p className="mt-2 text-sm text-slate-400">Assets older than this enrichment window enter the refresh queue.</p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Stale Source Systems</div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {refreshHealth.sourceFreshness.stale + refreshHealth.sourceFreshness.failed}
            </div>
            <p className="mt-2 text-sm text-slate-400">
              {refreshHealth.sourceFreshness.latestFetchAt
                ? `Latest fetch ${formatDate(refreshHealth.sourceFreshness.latestFetchAt)}`
                : 'No source fetch history yet.'}
            </p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Stale Assets</div>
            <div className="mt-3 text-2xl font-semibold text-white">{refreshHealth.assetFreshness.staleCandidates}</div>
            <p className="mt-2 text-sm text-slate-400">Assets waiting for re-enrichment before the research fabric is fully current.</p>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Recent Source Refresh Runs</div>
            <div className="mt-4 space-y-3">
              {recentRuns.length > 0 ? (
                recentRuns.map((run) => (
                  <div key={run.id} className="rounded-[18px] border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{run.triggerType.toLowerCase()} refresh</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          Started {formatDate(run.startedAt)}
                        </div>
                      </div>
                      <Badge tone={run.statusLabel === 'SUCCESS' ? 'good' : run.statusLabel === 'RUNNING' ? 'warn' : 'danger'}>
                        {run.statusLabel.toLowerCase()}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div>
                        <div className="fine-print">Sources</div>
                        <div className="mt-1 text-sm text-white">{run.sourceSystemCount}</div>
                      </div>
                      <div>
                        <div className="fine-print">Stale</div>
                        <div className="mt-1 text-sm text-white">{run.staleSourceSystemCount}</div>
                      </div>
                      <div>
                        <div className="fine-print">Refreshed</div>
                        <div className="mt-1 text-sm text-white">{run.refreshedAssetCount}</div>
                      </div>
                      <div>
                        <div className="fine-print">Failed</div>
                        <div className="mt-1 text-sm text-white">{run.failedAssetCount}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-slate-400">
                      {run.errorSummary
                        ? run.errorSummary
                        : `Triggered by ${run.refreshedByActor ?? 'system'} with batch size ${run.batchSize}.`}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-white/10 bg-slate-950/20 p-4 text-sm text-slate-400">
                  No source refresh runs have been recorded yet.
                </div>
              )}
            </div>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="fine-print">Stale Asset Queue</div>
            <div className="mt-4 space-y-3">
              {refreshHealth.assetFreshness.staleAssets.length > 0 ? (
                refreshHealth.assetFreshness.staleAssets.map((asset) => (
                  <div key={asset.assetId} className="rounded-[18px] border border-white/10 bg-slate-950/40 p-4">
                    <div className="text-sm font-semibold text-white">{asset.assetCode}</div>
                    <div className="mt-1 text-sm text-slate-300">{asset.assetName}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {asset.city ?? 'Unknown city'} · Last enriched {formatDate(asset.lastEnrichedAt)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-white/10 bg-slate-950/20 p-4 text-sm text-slate-400">
                  No stale assets are waiting for a source refresh run.
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Macro Source Plan</div>
          <h3 className="mt-2 text-xl font-semibold text-white">Connector readiness and implementation priority</h3>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Start with market, macro, and FX APIs if possible. If not, wire the official free public stack in order:
            US FRED, BLS, Treasury Fiscal Data, ECB, then Korea KOSIS. After that, add a market comps feed so the
            regime engine and comparable layer can move away from fallback assumptions toward live rates, leasing,
            liquidity, and transaction evidence.
          </p>
        </div>
        <div className="grid gap-4">
          {macroConnectors.map((connector) => (
            <div
              key={connector.id}
              className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="fine-print">Priority {connector.priority}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{connector.label}</div>
                </div>
                <Badge tone={toneForReadiness(connector.status)}>{connector.status.toLowerCase()}</Badge>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{connector.description}</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="fine-print">Covers</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {connector.fields.map((field) => (
                      <Badge key={field}>{field}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Configured Env Keys</div>
                  <div className="mt-2 text-sm text-slate-400">
                    {connector.configuredKeys.length > 0
                      ? connector.configuredKeys.join(', ')
                      : 'none configured yet'}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                Required keys: {connector.envKeys.join(', ')}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Global Launch Plan</div>
          <h3 className="mt-2 text-xl font-semibold text-white">Region sequencing for global underwriting rollout</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Do not expand everywhere at once. Launch the underwriting stack market by market, starting with the
            deepest public macro and transaction data environments, then add localized market modules.
          </p>
        </div>
        <div className="grid gap-4">
          {launchPlan.map((region) => (
            <div key={region.region} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="fine-print">Phase {region.phase}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{region.region}</div>
                </div>
                <Badge tone={toneForLaunchStatus(region.status)}>{region.status.toLowerCase()}</Badge>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{region.thesis}</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="fine-print">Target Asset Classes</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {region.assetClasses.map((item) => (
                      <Badge key={item}>{item}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Macro Sources</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-400">
                    {region.macroSources.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Market Sources</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-400">
                    {region.marketSources.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Main Blockers</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-400">
                    {region.blockers.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Korea Official Research Stack</div>
          <h3 className="mt-2 text-xl font-semibold text-white">Normalized registry for public Korean property and planning data</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            These adapters stay env-configured and fallback-safe. They are intended to feed macro, market, parcel,
            permit, land, and building evidence into the same review-gated underwriting workflow rather than a
            separate research product.
          </p>
        </div>
        <div className="grid gap-4">
          {koreaResearchCatalog.map((source) => (
            <div key={source.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="fine-print">{source.sourceSystem}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{source.label}</div>
                </div>
                <Badge tone={toneForReadiness(source.status)}>{source.status.toLowerCase()}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {source.coverage.map((coverage) => (
                  <Badge key={coverage}>{coverage}</Badge>
                ))}
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{source.fallbackNote}</p>
              <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                Env keys: {source.envKeys.join(', ') || 'none'}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <div className="eyebrow">Free Macro Universe</div>
          <h3 className="mt-2 text-xl font-semibold text-white">Official free sources you can actually wire today</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Free macro data is not the same thing as true realtime data. Most official sources are release-based or
            near-real-time, so the underwriting stack should classify cadence explicitly instead of pretending every
            feed is tick-level live.
          </p>
        </div>
        <div className="grid gap-4">
          {freeMacroCatalog.map((source) => (
            <div key={source.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="fine-print">{source.region}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{source.label}</div>
                </div>
                <Badge tone={toneForRealtimeClass(source.realtimeClass)}>{source.realtimeClass.toLowerCase()}</Badge>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{source.note}</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="fine-print">Coverage</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {source.coverage.map((item) => (
                      <Badge key={item}>{item}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="fine-print">Cadence</div>
                  <div className="mt-2 text-sm text-slate-400">{source.cadence.replaceAll('_', ' ')}</div>
                </div>
                <div>
                  <div className="fine-print">Auth</div>
                  <div className="mt-2 text-sm text-slate-400">{source.auth.replaceAll('_', ' ')}</div>
                </div>
                <div>
                  <div className="fine-print">Docs</div>
                  <a
                    className="mt-2 inline-flex text-sm text-cyan-300 transition hover:text-cyan-200"
                    href={source.docsUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open official docs
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {rows.map((row) => (
          <Card key={row.sourceSystem}>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-white">{row.sourceSystem}</div>
              <Badge tone={row.status === 'FRESH' ? 'good' : row.status === 'STALE' ? 'warn' : 'danger'}>
                {row.status}
              </Badge>
            </div>
            <div className="mt-4 text-sm text-slate-400">
              <div>Freshness: {row.freshnessLabel}</div>
              <div className="mt-1">Last fetch: {formatDate(row.fetchedAt)}</div>
              <div className="mt-1">Expires: {formatDate(row.expiresAt)}</div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Last key: {row.cacheKey ?? 'N/A'}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
