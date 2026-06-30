/**
 * Investor (LP) read-only access token (benchmark #1 — LP portal foundation).
 *
 * A signed, time-limited, single-investor-scoped token that mirrors the admin
 * session-token crypto in `admin-session.ts` EXACTLY (HMAC-SHA256 over a base64url
 * payload, constant-time signature comparison, production hard-block when no secret
 * is configured). It is deliberately a SEPARATE secret and cookie from the admin
 * gate, carries only `{ investorId, role: 'LP', exp }`, and grants nothing on its own
 * — middleware wiring + per-request scope checks are a separate, security-reviewed step.
 *
 * PURE and dependency-light so mint/verify are fully unit-testable (pass `env`/`now`).
 */
import { isRealProduction } from '@/lib/runtime-env';

export const INVESTOR_TOKEN_COOKIE = 'nexus_investor_token';

export type InvestorTokenPayload = {
  investorId: string;
  investorCode?: string | null;
  role: 'LP';
  exp: number; // epoch ms, matching the admin token convention
};

export type VerifiedInvestorToken = {
  investorId: string;
  investorCode: string | null;
  role: 'LP';
};

const textEncoder = new TextEncoder();

function getTokenSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.INVESTOR_TOKEN_SECRET?.trim();
  if (configured) return configured;
  if (env.NODE_ENV !== 'production') return 'local-dev-investor-token-secret';
  return null;
}

function getTokenTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const hours = Number(env.INVESTOR_TOKEN_TTL_HOURS ?? 24);
  return Math.max(1, Number.isFinite(hours) ? hours : 24) * 60 * 60 * 1000;
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value));
  return Buffer.from(signature).toString('base64url');
}

/** Constant-time string compare (no early exit), mirroring admin-session.safeEqual. */
function safeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length === right.length ? 0 : 1;
  for (let index = 0; index < maxLength; index += 1) {
    const leftCode = left.charCodeAt(index) || 0;
    const rightCode = right.charCodeAt(index) || 0;
    difference |= leftCode ^ rightCode;
  }
  return difference === 0;
}

export async function mintInvestorToken(
  investorId: string,
  investorCode: string | null = null,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date()
): Promise<string | null> {
  const secret = getTokenSecret(env);
  if (!secret || !investorId) return null;
  const payload: InvestorTokenPayload = {
    investorId,
    investorCode,
    role: 'LP',
    exp: now.getTime() + getTokenTtlMs(env)
  };
  const payloadSegment = encode(JSON.stringify(payload));
  const signature = await sign(payloadSegment, secret);
  return `${payloadSegment}.${signature}`;
}

export async function verifyInvestorToken(
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date()
): Promise<VerifiedInvestorToken | null> {
  if (!token) return null;
  const secret = getTokenSecret(env);
  if (!secret) return null;

  const [payloadSegment, signature] = token.split('.');
  if (!payloadSegment || !signature) return null;

  const expectedSignature = await sign(payloadSegment, secret);
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(decode(payloadSegment)) as InvestorTokenPayload;
    if (!payload.investorId || payload.role !== 'LP' || payload.exp <= now.getTime()) {
      return null;
    }
    return {
      investorId: payload.investorId,
      investorCode: payload.investorCode ?? null,
      role: 'LP'
    };
  } catch {
    return null;
  }
}

export function getInvestorTokenCookieOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isRealProduction(env),
    path: '/',
    maxAge: getTokenTtlMs(env) / 1000
  };
}
