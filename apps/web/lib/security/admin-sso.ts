import type { AdminAccessRole, AuthorizedAdminActor } from '@/lib/security/admin-auth';

export type AdminSsoMode = 'disabled' | 'configured' | 'misconfigured';

type AdminSsoEndpoints = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
};

export type AdminSsoConfig = {
  mode: AdminSsoMode;
  issuerUrl: string | null;
  authorizationEndpoint: string | null;
  tokenEndpoint: string | null;
  userinfoEndpoint: string | null;
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  scopes: string;
  identifierClaim: string;
  roleClaim: string;
  defaultRole: AdminAccessRole;
  viewerRoles: string[];
  analystRoles: string[];
  adminRoles: string[];
  errors: string[];
};

export const ADMIN_SSO_STATE_COOKIE = 'nexus_admin_sso_state';
export const ADMIN_SSO_VERIFIER_COOKIE = 'nexus_admin_sso_verifier';
export const ADMIN_SSO_NEXT_COOKIE = 'nexus_admin_sso_next';

const textEncoder = new TextEncoder();

function trim(value: string | undefined) {
  return value?.trim() || '';
}

function splitList(value: string | undefined) {
  return trim(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getDefaultAppBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return trim(env.APP_BASE_URL) || 'http://localhost:3000';
}

export function getAdminSsoConfig(env: NodeJS.ProcessEnv = process.env): AdminSsoConfig {
  const issuerUrl = trim(env.ADMIN_OIDC_ISSUER_URL) || null;
  const authorizationEndpoint = trim(env.ADMIN_OIDC_AUTHORIZATION_ENDPOINT) || null;
  const tokenEndpoint = trim(env.ADMIN_OIDC_TOKEN_ENDPOINT) || null;
  const userinfoEndpoint = trim(env.ADMIN_OIDC_USERINFO_ENDPOINT) || null;
  const clientId = trim(env.ADMIN_OIDC_CLIENT_ID) || null;
  const clientSecret = trim(env.ADMIN_OIDC_CLIENT_SECRET) || null;
  const redirectUri = trim(env.ADMIN_OIDC_REDIRECT_URI) || `${getDefaultAppBaseUrl(env)}/api/admin/sso/callback`;
  const scopes = trim(env.ADMIN_OIDC_SCOPES) || 'openid profile email';
  const identifierClaim = trim(env.ADMIN_OIDC_IDENTIFIER_CLAIM) || 'email';
  const roleClaim = trim(env.ADMIN_OIDC_ROLE_CLAIM) || 'role';
  const defaultRoleRaw = trim(env.ADMIN_OIDC_DEFAULT_ROLE).toUpperCase();
  const defaultRole = (defaultRoleRaw === 'ADMIN' || defaultRoleRaw === 'ANALYST' || defaultRoleRaw === 'VIEWER'
    ? defaultRoleRaw
    : 'VIEWER') as AdminAccessRole;
  const viewerRoles = splitList(env.ADMIN_OIDC_VIEWER_ROLES);
  const analystRoles = splitList(env.ADMIN_OIDC_ANALYST_ROLES);
  const adminRoles = splitList(env.ADMIN_OIDC_ADMIN_ROLES);
  const errors: string[] = [];

  const hasAnySsoConfig = Boolean(
    issuerUrl || authorizationEndpoint || tokenEndpoint || userinfoEndpoint || clientId || clientSecret
  );

  if (!hasAnySsoConfig) {
    return {
      mode: 'disabled',
      issuerUrl,
      authorizationEndpoint,
      tokenEndpoint,
      userinfoEndpoint,
      clientId,
      clientSecret,
      redirectUri,
      scopes,
      identifierClaim,
      roleClaim,
      defaultRole,
      viewerRoles,
      analystRoles,
      adminRoles,
      errors
    };
  }

  if (!clientId || !clientSecret) {
    errors.push('ADMIN_OIDC_CLIENT_ID and ADMIN_OIDC_CLIENT_SECRET are required.');
  }

  if (!issuerUrl && (!authorizationEndpoint || !tokenEndpoint || !userinfoEndpoint)) {
    errors.push('Set ADMIN_OIDC_ISSUER_URL or provide authorization/token/userinfo endpoints explicitly.');
  }

  return {
    mode: errors.length > 0 ? 'misconfigured' : 'configured',
    issuerUrl,
    authorizationEndpoint,
    tokenEndpoint,
    userinfoEndpoint,
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    identifierClaim,
    roleClaim,
    defaultRole,
    viewerRoles,
    analystRoles,
    adminRoles,
    errors
  };
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return Buffer.from(digest).toString('base64url');
}

export function createAdminSsoCookieOptions(env: NodeJS.ProcessEnv = process.env, maxAgeSeconds = 600) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds
  };
}

export function createAdminSsoRandomValue() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

async function discoverOidcEndpoints(issuerUrl: string) {
  const response = await fetch(`${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`, {
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(`Failed to load OIDC discovery document (${response.status})`);
  }

  const body = (await response.json()) as {
    authorization_endpoint?: string;
    token_endpoint?: string;
    userinfo_endpoint?: string;
  };

  if (!body.authorization_endpoint || !body.token_endpoint || !body.userinfo_endpoint) {
    throw new Error('OIDC discovery document is missing required endpoints.');
  }

  return {
    authorizationEndpoint: body.authorization_endpoint,
    tokenEndpoint: body.token_endpoint,
    userinfoEndpoint: body.userinfo_endpoint
  } satisfies AdminSsoEndpoints;
}

export async function resolveAdminSsoEndpoints(config: AdminSsoConfig): Promise<AdminSsoEndpoints> {
  if (config.authorizationEndpoint && config.tokenEndpoint && config.userinfoEndpoint) {
    return {
      authorizationEndpoint: config.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint,
      userinfoEndpoint: config.userinfoEndpoint
    };
  }

  if (!config.issuerUrl) {
    throw new Error('SSO provider endpoints are not configured.');
  }

  return discoverOidcEndpoints(config.issuerUrl);
}

export async function buildAdminSsoAuthorizationUrl(
  config: AdminSsoConfig,
  input: {
    state: string;
    verifier: string;
  }
) {
  const endpoints = await resolveAdminSsoEndpoints(config);
  const url = new URL(endpoints.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId ?? '');
  url.searchParams.set('redirect_uri', config.redirectUri ?? '');
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', await sha256Base64Url(input.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeAdminSsoCode(
  config: AdminSsoConfig,
  input: {
    code: string;
    verifier: string;
  }
) {
  const endpoints = await resolveAdminSsoEndpoints(config);
  const response = await fetch(endpoints.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: config.redirectUri ?? '',
      client_id: config.clientId ?? '',
      client_secret: config.clientSecret ?? '',
      code_verifier: input.verifier
    }),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`SSO token exchange failed (${response.status})`);
  }

  const body = (await response.json()) as {
    access_token?: string;
  };

  if (!body.access_token) {
    throw new Error('SSO token response did not include an access token.');
  }

  return {
    accessToken: body.access_token
  };
}

export async function fetchAdminSsoProfile(config: AdminSsoConfig, accessToken: string) {
  const endpoints = await resolveAdminSsoEndpoints(config);
  const response = await fetch(endpoints.userinfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`SSO userinfo lookup failed (${response.status})`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function getClaimValue(claims: Record<string, unknown>, claimPath: string) {
  return claimPath.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, claims);
}

function normalizeClaimValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

export function mapAdminSsoClaimsToActor(
  claims: Record<string, unknown>,
  config: AdminSsoConfig
): AuthorizedAdminActor | null {
  const identifierValue =
    getClaimValue(claims, config.identifierClaim) ??
    claims.email ??
    claims.preferred_username ??
    claims.sub;

  if (typeof identifierValue !== 'string' || !identifierValue.trim()) {
    return null;
  }

  const roleValues = normalizeClaimValues(getClaimValue(claims, config.roleClaim));
  const roleLookup = new Set(roleValues.map((value) => value.toLowerCase()));

  let role: AdminAccessRole = config.defaultRole;
  if (config.adminRoles.some((value) => roleLookup.has(value.toLowerCase()))) {
    role = 'ADMIN';
  } else if (config.analystRoles.some((value) => roleLookup.has(value.toLowerCase()))) {
    role = 'ANALYST';
  } else if (config.viewerRoles.some((value) => roleLookup.has(value.toLowerCase()))) {
    role = 'VIEWER';
  }

  return {
    identifier: identifierValue.trim(),
    role
  };
}
