export type AdminAuthMode = 'disabled' | 'configured' | 'misconfigured';
export type AdminAccessRole = 'VIEWER' | 'ANALYST' | 'ADMIN';

export type AdminCredential = {
  user: string;
  password: string;
  role: AdminAccessRole;
};

export type AuthorizedAdminActor = {
  identifier: string;
  role: AdminAccessRole;
};

export type AdminAuthConfig = {
  mode: AdminAuthMode;
  credentials: AdminCredential[];
  errors: string[];
};

function trimEnv(value: string | undefined) {
  return value?.trim() ?? '';
}

export function getAdminAuthConfig(env: NodeJS.ProcessEnv = process.env): AdminAuthConfig {
  const user = trimEnv(env.ADMIN_BASIC_AUTH_USER);
  const password = trimEnv(env.ADMIN_BASIC_AUTH_PASSWORD);
  const credentials: AdminCredential[] = [];
  const errors: string[] = [];

  if (user && password) {
    credentials.push({
      user,
      password,
      role: 'ADMIN'
    });
  }

  if ((user && !password) || (!user && password)) {
    errors.push('Legacy admin basic auth credentials are incomplete.');
  }

  for (const [role, envKey] of [
    ['VIEWER', 'ADMIN_BASIC_AUTH_VIEWER_CREDENTIALS'],
    ['ANALYST', 'ADMIN_BASIC_AUTH_ANALYST_CREDENTIALS'],
    ['ADMIN', 'ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS']
  ] as const) {
    const raw = trimEnv(env[envKey]);
    if (!raw) continue;

    for (const entry of raw.split(',')) {
      const trimmedEntry = entry.trim();
      if (!trimmedEntry) continue;

      const separatorIndex = trimmedEntry.indexOf(':');
      if (separatorIndex <= 0 || separatorIndex === trimmedEntry.length - 1) {
        errors.push(`${envKey} contains an invalid credential entry.`);
        continue;
      }

      credentials.push({
        user: trimmedEntry.slice(0, separatorIndex).trim(),
        password: trimmedEntry.slice(separatorIndex + 1).trim(),
        role
      });
    }
  }

  if (credentials.length === 0 && errors.length === 0) {
    return {
      mode: 'disabled',
      credentials: [],
      errors: []
    };
  }

  if (credentials.length === 0 || errors.length > 0) {
    return {
      mode: 'misconfigured',
      credentials,
      errors
    };
  }

  return {
    mode: 'configured',
    credentials,
    errors: []
  };
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

export function authorizeAdminHeader(
  authorizationHeader: string | null | undefined,
  config: AdminAuthConfig
) {
  if (config.mode !== 'configured') {
    return null;
  }

  if (!authorizationHeader?.startsWith('Basic ')) {
    return null;
  }

  let decoded = '';

  try {
    decoded = Buffer.from(authorizationHeader.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return null;
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex < 0) {
    return null;
  }

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  const credential = config.credentials.find(
    (candidate) => safeEqual(user, candidate.user) && safeEqual(password, candidate.password)
  );

  if (!credential) {
    return null;
  }

  return {
    identifier: credential.user,
    role: credential.role
  } satisfies AuthorizedAdminActor;
}

export function authorizeAdminCredentials(
  user: string,
  password: string,
  config: AdminAuthConfig
) {
  if (config.mode !== 'configured') {
    return null;
  }

  const credential = config.credentials.find(
    (candidate) => safeEqual(user, candidate.user) && safeEqual(password, candidate.password)
  );

  if (!credential) {
    return null;
  }

  return {
    identifier: credential.user,
    role: credential.role
  } satisfies AuthorizedAdminActor;
}

const roleRank: Record<AdminAccessRole, number> = {
  VIEWER: 1,
  ANALYST: 2,
  ADMIN: 3
};

export function hasRequiredAdminRole(actorRole: AdminAccessRole, requiredRole: AdminAccessRole) {
  return roleRank[actorRole] >= roleRank[requiredRole];
}

const analystAdminPaths = [
  '/admin/assets/new',
  '/admin/deals',
  '/admin/documents',
  '/admin/funds',
  '/admin/investors',
  '/admin/macro-profiles',
  '/admin/portfolio',
  '/admin/readiness',
  '/admin/research',
  '/admin/review',
  '/admin/sources'
] as const;

export function getRequiredAdminRoleForPath(pathname: string): AdminAccessRole {
  if (pathname.startsWith('/admin/security')) return 'ADMIN';
  if (analystAdminPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return 'ANALYST';
  }
  if (pathname.startsWith('/api/readiness')) return 'ADMIN';
  if (pathname.startsWith('/api/registry')) return 'ADMIN';
  if (pathname.startsWith('/api/valuations/') && pathname.endsWith('/approval')) return 'ADMIN';
  if (pathname.startsWith('/api/')) return 'ANALYST';
  return 'VIEWER';
}

export function isAdminAuthorized(
  authorizationHeader: string | null | undefined,
  config: AdminAuthConfig
) {
  return authorizeAdminHeader(authorizationHeader, config) !== null;
}
