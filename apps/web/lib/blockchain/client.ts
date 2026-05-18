import { createPublicClient, createWalletClient, defineChain, fallback, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getBlockchainConfig } from '@/lib/blockchain/config';
import { isTokenizationMockMode } from '@/lib/blockchain/mock-mode';
import { runSerial } from '@/lib/blockchain/tx-queue';

export function getRegistryChainClients() {
  // Hard guard: mock mode produces a deterministic fake EOA + registry
  // address. If a future caller forgets to gate on isTokenizationMockMode
  // upstream, instantiating a real viem client bound to that fake key would
  // happily attempt to send transactions to whatever RPC is configured —
  // including, in the worst case, mainnet. Failing loudly here turns that
  // class of misconfiguration into a startup error instead of a silent
  // foot-gun. Service-layer callers all already branch on mock mode first
  // and short-circuit to buildMockTxHash, so this assertion is unreachable
  // on the happy path.
  if (isTokenizationMockMode()) {
    throw new Error(
      'getRegistryChainClients() called in mock mode. Use buildMockTxHash() / ' +
        'isTokenizationMockMode() to gate onchain calls instead.'
    );
  }
  const config = getBlockchainConfig();
  const chain = defineChain({
    id: config.chainId,
    name: config.chainName,
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: config.rpcUrls
      }
    }
  });
  const account = privateKeyToAccount(config.privateKey);
  // viem's fallback transport tries each underlying transport in order and
  // moves on to the next on transient failure. With one URL it degrades to a
  // plain http transport; with two or more (BLOCKCHAIN_RPC_URLS) it gives the
  // service single-RPC-outage tolerance without per-call retry plumbing.
  const transport =
    config.rpcUrls.length > 1
      ? fallback(config.rpcUrls.map((url) => http(url)))
      : http(config.rpcUrls[0]);
  const walletClient = createWalletClient({
    account,
    chain,
    transport
  });

  // Serialize every writeContract call from this signer so concurrent admin
  // requests produce sequential nonces. The wrap is intentionally invisible
  // to call sites: the first request starts immediately, subsequent ones
  // queue behind it, and the queue self-empties when the chain settles.
  const originalWriteContract = walletClient.writeContract.bind(walletClient);
  walletClient.writeContract = ((parameters: Parameters<typeof originalWriteContract>[0]) =>
    runSerial(`writeContract:${chain.id}:${account.address.toLowerCase()}`, () =>
      originalWriteContract(parameters)
    )) as typeof walletClient.writeContract;

  return {
    config,
    account,
    chain,
    publicClient: createPublicClient({
      chain,
      transport
    }),
    walletClient
  };
}
