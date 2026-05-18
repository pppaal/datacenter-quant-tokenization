import { runScopedResearchSyncRoute } from '../_handler';

/**
 * Market-only research sync: drains REB property statistics, MOLIT real
 * transactions / building ledger / building permit / land use planning /
 * land characteristics / official land price, plus cadastral geometry
 * and building energy datasets.
 *
 * Cadence guidance: daily during business hours. New transactions,
 * permits, and land-use changes land throughout the day; a daily cron
 * keeps cap-rate / vacancy / rent benchmarks fresh without overrunning
 * the macro endpoints. Skip asset dossier rebuild here — the assets
 * cron handles per-asset dossier refresh on a separate schedule so a
 * market-data hiccup doesn't block per-asset coverage signals.
 */
export async function POST(request: Request) {
  return runScopedResearchSyncRoute(request, {
    scope: 'market',
    auditPath: '/api/ops/research-sync/market'
  });
}
