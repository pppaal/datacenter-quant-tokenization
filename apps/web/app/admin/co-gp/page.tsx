import { CoGpConsole } from '@/components/admin/co-gp-console';

export const dynamic = 'force-dynamic';

/**
 * Co-GP operator console (benchmark #10). Drives the admin co-GP routes
 * (IC-memo / notice / LP-Q&A). With no ANTHROPIC_API_KEY the routes return their
 * deterministic offline skeletons, so the page is usable in any environment.
 */
export default function CoGpPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white">Co-GP assistant</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Draft IC memos, capital-call / distribution notices, and LP Q&amp;A answers grounded in
          existing deal, fund, and data-room context. Drafts are starting points for operator review
          — verify before sending.
        </p>
      </div>
      <CoGpConsole />
    </section>
  );
}
