import { runScopedResearchSyncRoute } from '../_handler';

/**
 * Macro-only research sync: drains KOSIS / BOK ECOS official sources.
 *
 * Cadence guidance: weekly. CPI, base rates, government yields, and
 * unemployment update on monthly / per-policy-decision schedules; a
 * weekly cron easily catches new releases without burning quota on
 * unchanged data. Skip the asset-dossier rebuild here — those depend
 * on market-side inputs that move faster.
 */
export async function POST(request: Request) {
  return runScopedResearchSyncRoute(request, {
    scope: 'macro',
    auditPath: '/api/ops/research-sync/macro'
  });
}
