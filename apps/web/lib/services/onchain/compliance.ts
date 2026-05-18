import type { Hex } from 'viem';
import { buildMockTxHash, isTokenizationMockMode } from '@/lib/blockchain/mock-mode';
import {
  ensureAddress,
  ensureCountryCode,
  getTokenizationClients,
  type TokenizationDeploymentRow
} from './tokenization-client';

export async function getModules(deployment: TokenizationDeploymentRow): Promise<string[]> {
  const clients = getTokenizationClients(deployment);
  const modules = (await clients.publicClient.readContract({
    ...clients.compliance,
    functionName: 'getModules'
  })) as readonly string[];
  return Array.from(modules);
}

export async function canTransferPreflight(
  deployment: TokenizationDeploymentRow,
  input: { from: string; to: string; amount: string | bigint }
): Promise<boolean> {
  const clients = getTokenizationClients(deployment);
  const from = ensureAddress(input.from, 'from');
  const to = ensureAddress(input.to, 'to');
  const amount = typeof input.amount === 'bigint' ? input.amount : BigInt(input.amount as string);
  return (await clients.publicClient.readContract({
    ...clients.compliance,
    functionName: 'canTransfer',
    args: [from, to, amount]
  })) as boolean;
}

export async function blockCountry(
  deployment: TokenizationDeploymentRow,
  countryCode: number
): Promise<Hex> {
  const c = ensureCountryCode(countryCode, 'countryCode');
  if (isTokenizationMockMode()) {
    return buildMockTxHash('blockCountry', deployment.complianceAddress, c);
  }
  const clients = getTokenizationClients(deployment);
  if (!clients.countryRestrict) {
    throw new Error('CountryRestrictModule is not attached to this deployment.');
  }
  return clients.walletClient.writeContract({
    ...clients.countryRestrict,
    functionName: 'blockCountry',
    args: [c]
  });
}

export async function unblockCountry(
  deployment: TokenizationDeploymentRow,
  countryCode: number
): Promise<Hex> {
  const c = ensureCountryCode(countryCode, 'countryCode');
  if (isTokenizationMockMode()) {
    return buildMockTxHash('unblockCountry', deployment.complianceAddress, c);
  }
  const clients = getTokenizationClients(deployment);
  if (!clients.countryRestrict) {
    throw new Error('CountryRestrictModule is not attached to this deployment.');
  }
  return clients.walletClient.writeContract({
    ...clients.countryRestrict,
    functionName: 'unblockCountry',
    args: [c]
  });
}

export async function isCountryBlocked(
  deployment: TokenizationDeploymentRow,
  countryCode: number
): Promise<boolean> {
  const clients = getTokenizationClients(deployment);
  if (!clients.countryRestrict) return false;
  const c = ensureCountryCode(countryCode, 'countryCode');
  return (await clients.publicClient.readContract({
    ...clients.countryRestrict,
    functionName: 'isCountryBlocked',
    args: [c]
  })) as boolean;
}

export async function addModule(
  deployment: TokenizationDeploymentRow,
  moduleAddress: string
): Promise<Hex> {
  const module = ensureAddress(moduleAddress, 'moduleAddress');
  if (isTokenizationMockMode()) {
    return buildMockTxHash('addModule', deployment.complianceAddress, module);
  }
  const clients = getTokenizationClients(deployment);
  return clients.walletClient.writeContract({
    ...clients.compliance,
    functionName: 'addModule',
    args: [module]
  });
}

export async function removeModule(
  deployment: TokenizationDeploymentRow,
  moduleAddress: string
): Promise<Hex> {
  const module = ensureAddress(moduleAddress, 'moduleAddress');
  if (isTokenizationMockMode()) {
    return buildMockTxHash('removeModule', deployment.complianceAddress, module);
  }
  const clients = getTokenizationClients(deployment);
  return clients.walletClient.writeContract({
    ...clients.compliance,
    functionName: 'removeModule',
    args: [module]
  });
}
