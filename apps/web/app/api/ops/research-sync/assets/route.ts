import { runScopedResearchSyncRoute } from '../_handler';

/**
 * Asset dossier sync: rebuilds every asset's HOUSE-view ResearchSnapshot
 * and re-emits asset-level CoverageTasks based on current Prisma
 * inputs (lease rolls, comps, macro factors, documents).
 *
 * Cadence guidance: hourly. The official-source layer is read-only with
 * respect to this cron, so an hourly rebuild is cheap (zero outbound
 * fetches) and keeps the priority signals on the operator dashboard
 * fresh as users approve evidence and upload documents during the day.
 */
export async function POST(request: Request) {
  return runScopedResearchSyncRoute(request, {
    scope: 'assets',
    auditPath: '/api/ops/research-sync/assets'
  });
}
