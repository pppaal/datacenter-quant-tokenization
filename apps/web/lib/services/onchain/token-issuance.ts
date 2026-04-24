import type { Hex } from 'viem';
import {
  ensureAddress,
  getTokenizationClients,
  type TokenizationDeploymentRow
} from './tokenization-client';

function toBase(amount: string | bigint, label: string): bigint {
  if (typeof amount === 'bigint') {
    if (amount <= 0n) throw new Error(`${label} must be positive.`);
    return amount;
  }
  const trimmed = amount.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a non-negative integer (base units, decimals applied upstream).`);
  }
  const n = BigInt(trimmed);
  if (n <= 0n) throw new Error(`${label} must be positive.`);
  return n;
}

export async function mintTokens(
  deployment: TokenizationDeploymentRow,
  input: { to: string; amount: string | bigint }
): Promise<Hex> {
  const clients = getTokenizationClients(deployment);
  const to = ensureAddress(input.to, 'to');
  const amount = toBase(input.amount, 'amount');
  return clients.walletClient.writeContract({
    ...clients.token,
    functionName: 'mint',
    args: [to, amount]
  });
}

export async function burnTokens(
  deployment: TokenizationDeploymentRow,
  input: { from: string; amount: string | bigint }
): Promise<Hex> {
  const clients = getTokenizationClients(deployment);
  const from = ensureAddress(input.from, 'from');
  const amount = toBase(input.amount, 'amount');
  return clients.walletClient.writeContract({
    ...clients.token,
    functionName: 'burn',
    args: [from, amount]
  });
}

export async function forceTransfer(
  deployment: TokenizationDeploymentRow,
  input: { from: string; to: string; amount: string | bigint }
): Promise<Hex> {
  const clients = getTokenizationClients(deployment);
  const from = ensureAddress(input.from, 'from');
  const to = ensureAddress(input.to, 'to');
  const amount = toBase(input.amount, 'amount');
  return clients.walletClient.writeContract({
    ...clients.token,
    functionName: 'forceTransfer',
    args: [from, to, amount]
  });
}

export async function pauseToken(deployment: TokenizationDeploymentRow): Promise<Hex> {
  const clients = getTokenizationClients(deployment);
  return clients.walletClient.writeContract({
    ...clients.token,
    functionName: 'pause',
    args: []
  });
}

export async function unpauseToken(deployment: TokenizationDeploymentRow): Promise<Hex> {
  const clients = getTokenizationClients(deployment);
  return clients.walletClient.writeContract({
    ...clients.token,
    functionName: 'unpause',
    args: []
  });
}

export async function readTokenSupply(deployment: TokenizationDeploymentRow) {
  const clients = getTokenizationClients(deployment);
  const [totalSupply, name, symbol, decimals, paused] = await Promise.all([
    clients.publicClient.readContract({ ...clients.token, functionName: 'totalSupply' }),
    clients.publicClient.readContract({ ...clients.token, functionName: 'name' }),
    clients.publicClient.readContract({ ...clients.token, functionName: 'symbol' }),
    clients.publicClient.readContract({ ...clients.token, functionName: 'decimals' }),
    clients.publicClient.readContract({ ...clients.token, functionName: 'paused' })
  ]);
  return {
    totalSupply: totalSupply as bigint,
    name: name as string,
    symbol: symbol as string,
    decimals: Number(decimals as number),
    paused: paused as boolean
  };
}

export async function readBalance(
  deployment: TokenizationDeploymentRow,
  wallet: string
): Promise<bigint> {
  const clients = getTokenizationClients(deployment);
  const who = ensureAddress(wallet, 'wallet');
  return (await clients.publicClient.readContract({
    ...clients.token,
    functionName: 'balanceOf',
    args: [who]
  })) as bigint;
}
