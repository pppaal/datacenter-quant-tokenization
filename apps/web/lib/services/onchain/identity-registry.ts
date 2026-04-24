import type { Address, Hex } from 'viem';
import {
  ensureAddress,
  ensureCountryCode,
  getTokenizationClients,
  type TokenizationDeploymentRow
} from './tokenization-client';

export type IdentityReadResult = {
  registered: boolean;
  countryCode: number;
  registeredAt: number;
};

export async function isVerified(
  deployment: TokenizationDeploymentRow,
  wallet: string
): Promise<boolean> {
  const clients = getTokenizationClients(deployment);
  const who = ensureAddress(wallet, 'wallet');
  return (await clients.publicClient.readContract({
    ...clients.identity,
    functionName: 'isVerified',
    args: [who]
  })) as boolean;
}

export async function getIdentity(
  deployment: TokenizationDeploymentRow,
  wallet: string
): Promise<IdentityReadResult> {
  const clients = getTokenizationClients(deployment);
  const who = ensureAddress(wallet, 'wallet');
  const [registered, countryCode, registeredAt] = (await clients.publicClient.readContract({
    ...clients.identity,
    functionName: 'getIdentity',
    args: [who]
  })) as [boolean, number, bigint];
  return {
    registered,
    countryCode: Number(countryCode),
    registeredAt: Number(registeredAt)
  };
}

export async function registerIdentity(
  deployment: TokenizationDeploymentRow,
  input: { wallet: string; countryCode: number }
): Promise<Hex> {
  const clients = getTokenizationClients(deployment);
  const wallet = ensureAddress(input.wallet, 'wallet');
  const countryCode = ensureCountryCode(input.countryCode, 'countryCode');
  return clients.walletClient.writeContract({
    ...clients.identity,
    functionName: 'registerIdentity',
    args: [wallet, countryCode]
  });
}

export async function updateCountry(
  deployment: TokenizationDeploymentRow,
  input: { wallet: string; countryCode: number }
): Promise<Hex> {
  const clients = getTokenizationClients(deployment);
  const wallet = ensureAddress(input.wallet, 'wallet');
  const countryCode = ensureCountryCode(input.countryCode, 'countryCode');
  return clients.walletClient.writeContract({
    ...clients.identity,
    functionName: 'updateCountry',
    args: [wallet, countryCode]
  });
}

export async function removeIdentity(
  deployment: TokenizationDeploymentRow,
  wallet: string
): Promise<Hex> {
  const clients = getTokenizationClients(deployment);
  const who: Address = ensureAddress(wallet, 'wallet');
  return clients.walletClient.writeContract({
    ...clients.identity,
    functionName: 'removeIdentity',
    args: [who]
  });
}
