import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { getDealById } from '@/lib/services/deals';
import { generateIcMemoDraft } from '@/lib/services/co-gp';
import { dealToIcMemoDraftInput } from '@/lib/services/co-gp/deal-context';

export const dynamic = 'force-dynamic';

/**
 * Co-GP IC-memo draft (benchmark #10 wiring).
 *
 * Assembles deal context via the existing `getDealById` getter and runs the co-GP
 * IC-memo generator. With no ANTHROPIC_API_KEY the generator returns its deterministic
 * offline skeleton, so the route is safe in CI/dev. ANALYST+ only.
 */
export const POST = withAdminApi({
  bodySchema: z.object({ dealId: z.string().min(1) }),
  requiredRole: 'ANALYST',
  auditAction: 'co_gp.ic_memo_draft',
  auditEntityType: 'Deal',
  auditEntityIdFromBody: (body) => body.dealId,
  async handler({ body }) {
    const deal = await getDealById(body.dealId);
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }
    const draft = await generateIcMemoDraft(dealToIcMemoDraftInput(deal));
    return NextResponse.json({ draft });
  }
});
