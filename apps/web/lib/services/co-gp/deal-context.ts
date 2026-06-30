/**
 * Deal → co-GP context mappers (benchmark #10 wiring).
 *
 * PURE adapters that project an already-fetched deal record onto the co-GP input
 * shapes, so the admin route is a thin orchestration layer and the mapping stays
 * unit-testable without a DB. Structural input types keep these decoupled from the
 * exact Prisma payload (a `DealDetailRecord` is a superset and assigns cleanly).
 */
import type { IcMemoDraftInput } from '@/lib/services/co-gp/co-gp';

export type DealForCoGp = {
  dealCode: string;
  title: string;
  market?: string | null;
  assetClass?: string | null;
  stage?: string | null;
  headline?: string | null;
  purchasePriceKrw?: number | null;
  bidGuidanceKrw?: number | null;
  sellerGuidanceKrw?: number | null;
  asset?: { documents?: Array<{ title: string; aiSummary?: string | null }> | null } | null;
};

const MAX_CONTEXT_DOCS = 6;

export function dealToIcMemoDraftInput(deal: DealForCoGp): IcMemoDraftInput {
  // Best-available price signal: agreed price → our bid → seller guidance.
  const purchasePriceKrw =
    deal.purchasePriceKrw ?? deal.bidGuidanceKrw ?? deal.sellerGuidanceKrw ?? null;

  const documents = (deal.asset?.documents ?? [])
    .slice(0, MAX_CONTEXT_DOCS)
    .map((d) => ({ title: d.title, summary: d.aiSummary ?? null }));

  return {
    dealCode: deal.dealCode,
    assetName: deal.title,
    market: deal.market ?? null,
    assetClass: deal.assetClass ?? null,
    stage: deal.stage ?? null,
    purchasePriceKrw,
    recentActivity: deal.headline ?? null,
    documents
  };
}
