/**
 * NAV attestation dry-run publisher.
 *
 * Walks every asset that has a `tokenization` row + a recent
 * `ValuationRun`, builds an EIP-712 NAV attestation, signs it with the
 * server-side signer key, and prints a JSON summary. Persistence to
 * `OnchainRecord` is deferred to a follow-up worker — that table
 * requires a ReadinessProject FK we're not establishing here.
 *
 * In `BLOCKCHAIN_MOCK_MODE=true` the publisher emits a deterministic
 * mock txHash so test runs stay reproducible.
 *
 * Usage:
 *   NAV_SIGNER_PRIVATE_KEY=0x... \
 *   NAV_ATTESTOR_ADDRESS=0x... \
 *   NAV_ATTESTOR_CHAIN_ID=84532 \
 *   BLOCKCHAIN_MOCK_MODE=true \
 *   npx tsx apps/web/scripts/publish-nav-attestation.ts
 */
import { prisma } from '@/lib/db/prisma';
import { prepareNavAttestation } from '@/lib/blockchain/nav-attestor';
import { logger } from '@/lib/observability/logger';

type RunResult = {
  assetCode: string;
  runId: string;
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
          }
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
      const r = await prepareNavAttestation({
        valuationRun: {
          id: run.id,
          baseCaseValueKrw: run.baseCaseValueKrw,
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
        txHash: r.txHash,
        signer: r.signer,
        mocked: r.mocked
      });
      logger.info('nav-publish.ok', {
        assetCode: t.asset.assetCode,
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
