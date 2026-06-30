import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { buildFundPcap } from '@/lib/services/investor-reports';
import { buildLpPortalView, type LpPortalFundInput } from '@/lib/services/investor-portal';

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

  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
    select: { id: true, code: true, name: true }
  });
  if (!investor) {
    return NextResponse.json({ error: 'Investor not found' }, { status: 404 });
  }

  const commitments = await prisma.commitment.findMany({
    where: { investorId },
    select: {
      fundId: true,
      fund: { select: { name: true, vehicles: { select: { name: true }, take: 1 } } }
    }
  });

  // One fund per id (an investor may hold several commitments in one fund).
  const fundMeta = new Map<string, { name: string; vehicleName: string | null }>();
  for (const c of commitments) {
    if (!fundMeta.has(c.fundId)) {
      fundMeta.set(c.fundId, {
        name: c.fund.name,
        vehicleName: c.fund.vehicles[0]?.name ?? null
      });
    }
  }

  const funds: LpPortalFundInput[] = [];
  for (const [fundId, meta] of fundMeta) {
    const pcap = await buildFundPcap(fundId);
    const statement = pcap.investors.find((s) => s.investorId === investorId);
    if (!statement) continue; // investor not in this fund's PCAP — skip defensively
    funds.push({
      fundId,
      fundName: meta.name,
      vehicleName: meta.vehicleName,
      navKrw: pcap.navKrw,
      navUsedCostBasisFallback: pcap.navUsedCostBasisFallback,
      statement
    });
  }

  const view = buildLpPortalView(
    { id: investor.id, code: investor.code, name: investor.name },
    funds
  );
  return NextResponse.json(view);
}
