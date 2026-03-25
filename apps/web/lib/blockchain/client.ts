import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getBlockchainConfig } from '@/lib/blockchain/config';

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

  return {
    config,
    account,
    chain,
    publicClient: createPublicClient({
      chain,
      transport: http(config.rpcUrl)
    }),
    walletClient: createWalletClient({
      account,
      chain,
      transport: http(config.rpcUrl)
    })
  };
}
