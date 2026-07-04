import { NextResponse } from 'next/server';
import { buildLpPortalOverviewForInvestor } from '@/lib/services/investor-portal-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * LP-portal read-only overview (benchmark #1 wiring).
 *
 * Gated by the investor-portal middleware branch, which has already verified the
 * signed investor token and stamped `x-investor-id`. We re-read that header
 * (defense-in-depth — a direct hit without the middleware identity 401s) and
 * assemble the investor-scoped view from existing fund PCAPs. Read-only.
 */
export async function GET(request: Request) {
  const investorId = request.headers.get('x-investor-id');
  if (!investorId) {
    return NextResponse.json({ error: 'Investor authentication required' }, { status: 401 });
  }

  const view = await buildLpPortalOverviewForInvestor(investorId);
  if (!view) {
    return NextResponse.json({ error: 'Investor not found' }, { status: 404 });
  }

  return NextResponse.json(view);
}
