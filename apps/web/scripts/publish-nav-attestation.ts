/**
 * NAV attestation dry-run publisher.
 *
 * Walks every asset that has a `tokenization` row + a recent `ValuationRun`,
 * builds an EIP-712 NAV attestation, signs it with the server-side signer key,
 * and prints a JSON summary. Persistence to `OnchainRecord` is deferred to a
 * follow-up worker — that table requires a ReadinessProject FK we're not
 * establishing here.
 *
 * What gets attested (correctness):
 *   - VALUE: the fund-NAV-aware fair value of the single asset the token
 *     represents — latest valuation × the fund's ownership %, or a flagged
 *     cost-basis fallback (via `computeTokenizedAssetNavDetail`). NOT the raw
 *     whole-asset `ValuationRun.baseCaseValueKrw`. Carried as a `Decimal` so
 *     KRW NAVs above 2^53 stay exact through the 18-decimal on-chain scaling.
 *   - SUPPLY: the REAL outstanding token supply read live from
 *     `AssetToken.totalSupply()` (via `readTokenSupply`). `navPerShare` is
 *     `navValue × 1e18 / totalSupply`, so the attested per-token NAV actually
 *     reconciles to (value, supply) instead of silently equalling the whole-
 *     asset value when supply ≠ 1e18.
 *
 * In `BLOCKCHAIN_MOCK_MODE=true` there is no live chain to read supply from, so
 * the supply must be provided explicitly via `NAV_MOCK_TOKEN_SUPPLY` (base
 * units). The publisher refuses to fabricate a supply.
 *
 * Usage:
 *   NAV_SIGNER_PRIVATE_KEY=0x... \
 *   NAV_ATTESTOR_ADDRESS=0x... \
 *   NAV_ATTESTOR_CHAIN_ID=84532 \
 *   BLOCKCHAIN_MOCK_MODE=true NAV_MOCK_TOKEN_SUPPLY=1000000000000000000000000 \
 *   npx tsx apps/web/scripts/publish-nav-attestation.ts
 */
import { prisma } from '@/lib/db/prisma';
import { prepareNavAttestation } from '@/lib/blockchain/nav-attestor';
import { isTokenizationMockMode } from '@/lib/blockchain/mock-mode';
import { computeTokenizedAssetNavDetail } from '@/lib/services/fund-nav';
import { readTokenSupply } from '@/lib/services/onchain/token-issuance';
import { toDeploymentRow } from '@/lib/services/onchain/tokenization-repo';
import { logger } from '@/lib/observability/logger';

type RunResult = {
  assetCode: string;
  runId: string;
  navValueKrw: string;
  totalSupply: string;
  navSource: string;
  txHash: string;
  signer: string;
  mocked: boolean;
};

function envRequired(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(`Missing required env: ${key}`);
  }
  return v;
}

/**
 * Resolve the outstanding token supply (base units) the attestation must
 * divide by. Live-reads `AssetToken.totalSupply()` against the deployment; in
 * mock mode (no live chain) requires an explicit `NAV_MOCK_TOKEN_SUPPLY` — it
 * never silently defaults to 1e18.
 */
async function resolveTotalSupply(
  deploymentRow: Parameters<typeof toDeploymentRow>[0]
): Promise<bigint> {
  if (isTokenizationMockMode()) {
    const raw = process.env.NAV_MOCK_TOKEN_SUPPLY?.trim();
    if (!raw || !/^\d+$/.test(raw)) {
      throw new Error(
        'BLOCKCHAIN_MOCK_MODE is set but NAV_MOCK_TOKEN_SUPPLY is missing/invalid. ' +
          'Provide the token supply in base units explicitly — there is no live chain to read it from.'
      );
    }
    const supply = BigInt(raw);
    if (supply <= 0n) throw new Error('NAV_MOCK_TOKEN_SUPPLY must be a positive integer.');
    return supply;
  }
  const supply = await readTokenSupply(toDeploymentRow(deploymentRow));
  if (supply.totalSupply <= 0n) {
    throw new Error('On-chain totalSupply() is 0; refusing to attest a per-token NAV.');
  }
  return supply.totalSupply;
}

async function main(): Promise<void> {
  const signerKey = envRequired('NAV_SIGNER_PRIVATE_KEY') as `0x${string}`;
  const attestorAddress = envRequired('NAV_ATTESTOR_ADDRESS') as `0x${string}`;
  const chainId = BigInt(envRequired('NAV_ATTESTOR_CHAIN_ID'));

  const tokenizedAssets = await prisma.tokenizedAsset.findMany({
    include: {
      asset: {
        include: {
          valuations: {
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          // The fund's stake in this asset: ownership % + any explicit
          // hold-value override drive the fund-NAV-aware value the token backs.
          portfolioAssets: true
        }
      }
    }
  });

  const results: RunResult[] = [];
  for (const t of tokenizedAssets) {
    const run = t.asset.valuations[0];
    if (!run) {
      logger.info('nav-publish.skip-no-run', { assetId: t.assetId });
      continue;
    }
    try {
      // Fund-NAV-aware value for the single asset this token represents:
      // latest valuation × ownership (or hold-value override / cost fallback),
      // carried as a Decimal so we don't lose precision before on-chain scaling.
      // Pick the fund stake with the highest ownership when an asset sits in
      // multiple portfolios (deterministic; documented interim — one tokenized
      // asset is expected to map to a single fund stake).
      const stake =
        [...t.asset.portfolioAssets].sort(
          (a, b) => (b.ownershipPct ?? 100) - (a.ownershipPct ?? 100)
        )[0] ?? null;

      const nav = computeTokenizedAssetNavDetail({
        ownershipPct: stake?.ownershipPct ?? null,
        currentHoldValueKrw: stake?.currentHoldValueKrw ?? null,
        asset: {
          id: t.asset.id,
          name: t.asset.name,
          assetCode: t.asset.assetCode,
          purchasePriceKrw: t.asset.purchasePriceKrw,
          valuations: [{ baseCaseValueKrw: run.baseCaseValueKrw, createdAt: run.createdAt }]
        }
      });

      const totalSharesScaled = await resolveTotalSupply(t);

      const r = await prepareNavAttestation({
        valuationRun: {
          id: run.id,
          navValueKrw: nav.navValueKrw,
          totalSharesScaled,
          createdAt: run.createdAt
        },
        asset: { assetCode: t.asset.assetCode },
        domain: {
          name: 'NavAttestor',
          version: '1',
          chainId,
          verifyingContract: attestorAddress
        },
        signerPrivateKey: signerKey
      });
      results.push({
        assetCode: t.asset.assetCode,
        runId: run.id,
        navValueKrw: nav.navValueKrw.toString(),
        totalSupply: totalSharesScaled.toString(),
        navSource: nav.source,
        txHash: r.txHash,
        signer: r.signer,
        mocked: r.mocked
      });
      logger.info('nav-publish.ok', {
        assetCode: t.asset.assetCode,
        navValueKrw: nav.navValueKrw.toString(),
        totalSupply: totalSharesScaled.toString(),
        navSource: nav.source,
        usedCostBasisFallback: nav.usedCostBasisFallback,
        txHash: r.txHash
      });
    } catch (err) {
      logger.error('nav-publish.fail', {
        assetCode: t.asset.assetCode,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  console.log(JSON.stringify({ ok: true, count: results.length, results }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
