export type AdminAuthMode = 'disabled' | 'configured' | 'misconfigured';

export type AdminAuthConfig = {
  mode: AdminAuthMode;
  user: string;
  password: string;
};

function trimEnv(value: string | undefined) {
  return value?.trim() ?? '';
}

export function getAdminAuthConfig(env: NodeJS.ProcessEnv = process.env): AdminAuthConfig {
  const user = trimEnv(env.ADMIN_BASIC_AUTH_USER);
  const password = trimEnv(env.ADMIN_BASIC_AUTH_PASSWORD);

  if (!user && !password) {
    return {
      mode: 'disabled',
      user: '',
      password: ''
    };
  }

  if (!user || !password) {
    return {
      mode: 'misconfigured',
      user,
      password
    };
  }

  return {
    mode: 'configured',
    user,
    password
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

export function isAdminAuthorized(
  authorizationHeader: string | null | undefined,
  config: AdminAuthConfig
) {
  if (config.mode !== 'configured') {
    return false;
  }

  if (!authorizationHeader?.startsWith('Basic ')) {
    return false;
  }

  let decoded = '';

  try {
    decoded = Buffer.from(authorizationHeader.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex < 0) {
    return false;
  }

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  return safeEqual(user, config.user) && safeEqual(password, config.password);
}
