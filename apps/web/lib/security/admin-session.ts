import type { AuthorizedAdminActor } from '@/lib/security/admin-auth';

export const ADMIN_SESSION_COOKIE = 'nexus_admin_session';

type AdminSessionPayload = {
  sid?: string | null;
  sub: string;
  role: AuthorizedAdminActor['role'];
  provider?: AuthorizedAdminActor['provider'];
  subject?: string | null;
  email?: string | null;
  userId?: string | null;
  sessionVersion?: number | null;
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
    sid: actor.sessionId ?? null,
    sub: actor.identifier,
    role: actor.role,
    provider: actor.provider ?? 'session',
    subject: actor.subject ?? null,
    email: actor.email ?? null,
    userId: actor.userId ?? null,
    sessionVersion: actor.sessionVersion ?? null,
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
      userId: payload.userId ?? null,
      sessionId: payload.sid ?? null,
      sessionVersion:
        typeof payload.sessionVersion === 'number' && Number.isFinite(payload.sessionVersion)
          ? payload.sessionVersion
          : null
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

export function clearAdminSessionCookie(
  response: {
    cookies: {
      set(
        name: string,
        value: string,
        options: ReturnType<typeof getAdminSessionCookieOptions> & { maxAge: number }
      ): void;
    };
  },
  env: NodeJS.ProcessEnv = process.env
) {
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    ...getAdminSessionCookieOptions(env),
    maxAge: 0
  });
}

type PersistedAdminSessionDb = {
  adminSession: {
    create(args: {
      data: {
        userId?: string | null;
        actorIdentifier: string;
        role: 'VIEWER' | 'ANALYST' | 'ADMIN';
        provider?: string;
        subject?: string | null;
        email?: string | null;
        sessionVersion?: number | null;
        expiresAt: Date;
      };
      select: {
        id: true;
        expiresAt: true;
      };
    }): Promise<{ id: string; expiresAt: Date }>;
    findUnique(args: {
      where: {
        id: string;
      };
      select: {
        id: true;
        userId: true;
        expiresAt: true;
        revokedAt: true;
        sessionVersion: true;
      };
    }): Promise<{
      id: string;
      userId: string | null;
      expiresAt: Date;
      revokedAt: Date | null;
      sessionVersion: number | null;
    } | null>;
    update(args: {
      where: {
        id: string;
      };
      data: {
        revokedAt?: Date | null;
        lastSeenAt?: Date;
      };
    }): Promise<unknown>;
    updateMany(args: {
      where: {
        userId?: string;
        revokedAt?: null;
      };
      data: {
        revokedAt: Date;
      };
    }): Promise<{ count: number }>;
  };
};

export function getAdminSessionExpiryDate(env: NodeJS.ProcessEnv = process.env, now = new Date()) {
  return new Date(now.getTime() + getSessionTtlMs(env));
}

export async function createPersistedAdminSession(
  actor: AuthorizedAdminActor,
  db: PersistedAdminSessionDb,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date()
) {
  const session = await db.adminSession.create({
    data: {
      userId: actor.userId ?? null,
      actorIdentifier: actor.identifier,
      role: actor.role,
      provider: actor.provider ?? 'session',
      subject: actor.subject ?? null,
      email: actor.email ?? null,
      sessionVersion: actor.sessionVersion ?? null,
      expiresAt: getAdminSessionExpiryDate(env, now)
    },
    select: {
      id: true,
      expiresAt: true
    }
  });

  return session;
}

export async function revokePersistedAdminSession(
  sessionId: string | null | undefined,
  db: PersistedAdminSessionDb
) {
  if (!sessionId) {
    return null;
  }

  return db.adminSession.update({
    where: {
      id: sessionId
    },
    data: {
      revokedAt: new Date()
    }
  });
}

export async function revokePersistedAdminSessionsForUser(
  userId: string | null | undefined,
  db: PersistedAdminSessionDb
) {
  if (!userId) {
    return { count: 0 };
  }

  return db.adminSession.updateMany({
    where: {
      userId,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
}

export async function getPersistedAdminSession(
  sessionId: string | null | undefined,
  db: PersistedAdminSessionDb
) {
  if (!sessionId) {
    return null;
  }

  return db.adminSession.findUnique({
    where: {
      id: sessionId
    },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      sessionVersion: true
    }
  });
}
