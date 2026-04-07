import type { AuthorizedAdminActor } from '@/lib/security/admin-auth';

export const ADMIN_SESSION_COOKIE = 'nexus_admin_session';

type AdminSessionPayload = {
  sub: string;
  role: AuthorizedAdminActor['role'];
  provider?: AuthorizedAdminActor['provider'];
  subject?: string | null;
  email?: string | null;
  userId?: string | null;
  exp: number;
};

const textEncoder = new TextEncoder();

function getSessionSecret(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.ADMIN_SESSION_SECRET?.trim();
  if (configured) {
    return configured;
  }

  if (env.NODE_ENV !== 'production') {
    return 'local-dev-admin-session-secret';
  }

  return null;
}

function getSessionTtlMs(env: NodeJS.ProcessEnv = process.env) {
  const hours = Number(env.ADMIN_SESSION_TTL_HOURS ?? 12);
  return Math.max(1, Number.isFinite(hours) ? hours : 12) * 60 * 60 * 1000;
}

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
}

async function sign(value: string, secret: string) {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value));
  return Buffer.from(signature).toString('base64url');
}

function safeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length === right.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    const leftCode = left.charCodeAt(index) || 0;
    const rightCode = right.charCodeAt(index) || 0;
    difference |= leftCode ^ rightCode;
  }

  return difference === 0;
}

export async function createAdminSessionToken(
  actor: AuthorizedAdminActor,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date()
) {
  const secret = getSessionSecret(env);
  if (!secret) {
    return null;
  }

  const payload: AdminSessionPayload = {
    sub: actor.identifier,
    role: actor.role,
    provider: actor.provider ?? 'session',
    subject: actor.subject ?? null,
    email: actor.email ?? null,
    userId: actor.userId ?? null,
    exp: now.getTime() + getSessionTtlMs(env)
  };
  const payloadSegment = encode(JSON.stringify(payload));
  const signature = await sign(payloadSegment, secret);
  return `${payloadSegment}.${signature}`;
}

export async function parseAdminSessionToken(
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date()
): Promise<AuthorizedAdminActor | null> {
  if (!token) {
    return null;
  }

  const secret = getSessionSecret(env);
  if (!secret) {
    return null;
  }

  const [payloadSegment, signature] = token.split('.');
  if (!payloadSegment || !signature) {
    return null;
  }

  const expectedSignature = await sign(payloadSegment, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decode(payloadSegment)) as AdminSessionPayload;
    if (!payload.sub || !payload.role || payload.exp <= now.getTime()) {
      return null;
    }

    return {
      identifier: payload.sub,
      role: payload.role,
      provider: payload.provider ?? 'session',
      subject: payload.subject ?? null,
      email: payload.email ?? null,
      userId: payload.userId ?? null
    };
  } catch {
    return null;
  }
}

export function getAdminSessionCookieOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: getSessionTtlMs(env) / 1000
  };
}
