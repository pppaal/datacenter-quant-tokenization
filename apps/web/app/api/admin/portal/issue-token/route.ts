import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';
import {
  mintInvestorToken,
  getInvestorTokenCookieOptions,
  INVESTOR_TOKEN_COOKIE
} from '@/lib/security/investor-token';

export const dynamic = 'force-dynamic';

/**
 * Issue an LP-portal access token for an investor (benchmark #1 wiring).
 *
 * ADMIN-gated: token issuance is an operator action (the firm hands the LP a
 * time-limited access link), never self-serve. Returns the signed token + the
 * cookie name/TTL so the operator UI can deliver it. Fails closed with 503 when
 * INVESTOR_TOKEN_SECRET is unconfigured (production hard-block).
 */
export const POST = withAdminApi({
  bodySchema: z.object({ investorId: z.string().min(1) }),
  requiredRole: 'ADMIN',
  auditAction: 'portal.issue_token',
  auditEntityType: 'Investor',
  auditEntityIdFromBody: (body) => body.investorId,
  async handler({ body }) {
    const investor = await prisma.investor.findUnique({
      where: { id: body.investorId },
      select: { id: true, code: true }
    });
    if (!investor) {
      return NextResponse.json({ error: 'Investor not found' }, { status: 404 });
    }
    const token = await mintInvestorToken(investor.id, investor.code);
    if (!token) {
      return NextResponse.json(
        { error: 'Investor token signing is not configured' },
        { status: 503 }
      );
    }
    return NextResponse.json({
      token,
      cookieName: INVESTOR_TOKEN_COOKIE,
      expiresInSeconds: getInvestorTokenCookieOptions().maxAge
    });
  }
});
