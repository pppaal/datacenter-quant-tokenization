import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { getFundById } from '@/lib/services/capital';
import { buildFundPcap } from '@/lib/services/investor-reports';
import { listDeals } from '@/lib/services/deals';
import { answerLpQuestion } from '@/lib/services/co-gp';
import { buildLpQaInput } from '@/lib/services/co-gp/fund-context';

export const dynamic = 'force-dynamic';

/**
 * Co-GP LP Q&A (benchmark #10 wiring).
 *
 * Grounds the answer in the optional fund's PCAP totals + the deal pipeline, then runs
 * the co-GP responder. With no ANTHROPIC_API_KEY it returns a low-confidence stub (the
 * responder refuses to fabricate). ANALYST+ only.
 */
export const POST = withAdminApi({
  bodySchema: z.object({
    question: z.string().min(1).max(2000),
    fundId: z.string().min(1).optional()
  }),
  requiredRole: 'ANALYST',
  auditAction: 'co_gp.lp_qa',
  auditEntityType: 'Fund',
  auditEntityIdFromBody: (body) => body.fundId ?? null,
  async handler({ body }) {
    const asOf = new Date().toISOString().slice(0, 10);

    let fundName: string | null = null;
    let pcap = null;
    if (body.fundId) {
      const fund = await getFundById(body.fundId);
      if (!fund) {
        return NextResponse.json({ error: 'Fund not found' }, { status: 404 });
      }
      fundName = fund.name;
      pcap = await buildFundPcap(body.fundId);
    }

    const deals = await listDeals();
    const answer = await answerLpQuestion(
      buildLpQaInput({ question: body.question, asOf, fundName, pcap, deals })
    );
    return NextResponse.json({ answer });
  }
});
