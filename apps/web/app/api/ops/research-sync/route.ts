import { runScopedResearchSyncRoute } from './_handler';

/**
 * Full research-sync cron: drains every official-source dataset (macro +
 * market) and rebuilds every asset dossier in one pass.
 *
 * Cadence guidance: schedule daily during business hours. The narrower
 * variants under /api/ops/research-sync/{macro,market,assets} let
 * operators run cheaper subsets more often (or rarer subsets less
 * often) without re-doing the whole sweep.
 */
export async function POST(request: Request) {
  return runScopedResearchSyncRoute(request, {
    scope: 'all',
    auditPath: '/api/ops/research-sync'
  });
}
