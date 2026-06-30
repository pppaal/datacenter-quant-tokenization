import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { getFundById } from '@/lib/services/capital';
import { generateNotice } from '@/lib/services/co-gp';
import {
  capitalCallToNoticeInput,
  distributionToNoticeInput
} from '@/lib/services/co-gp/fund-context';

export const dynamic = 'force-dynamic';

/**
 * Co-GP capital-call / distribution notice draft (benchmark #10 wiring).
 *
 * Loads the fund + the named capital-call or distribution record and runs the co-GP
 * notice generator. Offline-skeleton safe (no ANTHROPIC_API_KEY → deterministic text).
 * ANALYST+ only.
 */
export const POST = withAdminApi({
  bodySchema: z.object({
    fundId: z.string().min(1),
    kind: z.enum(['CAPITAL_CALL', 'DISTRIBUTION']),
    recordId: z.string().min(1)
  }),
  requiredRole: 'ANALYST',
  auditAction: 'co_gp.notice_draft',
  auditEntityType: 'Fund',
  auditEntityIdFromBody: (body) => body.fundId,
  async handler({ body }) {
    const fund = await getFundById(body.fundId);
    if (!fund) {
      return NextResponse.json({ error: 'Fund not found' }, { status: 404 });
    }
    const noticeDate = new Date().toISOString().slice(0, 10);

    if (body.kind === 'CAPITAL_CALL') {
      const call = fund.capitalCalls.find((c) => c.id === body.recordId);
      if (!call) {
        return NextResponse.json({ error: 'Capital call not found' }, { status: 404 });
      }
      const notice = await generateNotice(capitalCallToNoticeInput(fund, call, noticeDate));
      return NextResponse.json({ notice });
    }

    const distribution = fund.distributions.find((d) => d.id === body.recordId);
    if (!distribution) {
      return NextResponse.json({ error: 'Distribution not found' }, { status: 404 });
    }
    const notice = await generateNotice(distributionToNoticeInput(fund, distribution, noticeDate));
    return NextResponse.json({ notice });
  }
});
