/**
 * LP-portal overview assembly (DB-backed half of the portal).
 *
 * Shared by the read-only API (`/api/portal/overview`) and the rendered LP
 * page (`/portal`) so both surfaces serve the identical investor-scoped view.
 * Scope safety lives in `buildLpPortalView` (statements are filtered to the
 * requested investor); this module only fetches the inputs.
 */
import { prisma } from '@/lib/db/prisma';
import { buildFundPcap } from '@/lib/services/investor-reports';
import {
  buildLpPortalView,
  type LpPortalFundInput,
  type LpPortalView
} from '@/lib/services/investor-portal';

export async function buildLpPortalOverviewForInvestor(
  investorId: string
): Promise<LpPortalView | null> {
  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
    select: { id: true, code: true, name: true }
  });
  if (!investor) return null;

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

  return buildLpPortalView({ id: investor.id, code: investor.code, name: investor.name }, funds);
}
