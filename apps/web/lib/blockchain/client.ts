import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getBlockchainConfig } from '@/lib/blockchain/config';
import { runSerial } from '@/lib/blockchain/tx-queue';

export function getRegistryChainClients() {
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
        http: [config.rpcUrl]
      }
    }
  });
  const account = privateKeyToAccount(config.privateKey);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl)
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
      transport: http(config.rpcUrl)
    }),
    walletClient
  };
}
