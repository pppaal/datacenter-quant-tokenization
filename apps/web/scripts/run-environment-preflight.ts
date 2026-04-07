function requireEnv(name: string) {
  const value = process.env[name]?.trim() ?? '';
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function requireBooleanEnv(name: string, expected: string) {
  const value = process.env[name]?.trim().toLowerCase() ?? '';
  if (value !== expected) {
    throw new Error(`${name} must be ${expected}.`);
  }
}

function validateHostedBaseUrl() {
  const baseUrl = requireEnv('PLAYWRIGHT_BASE_URL');
  const allowedHostPattern = process.env.PLAYWRIGHT_ALLOWED_HOST_PATTERN?.trim() ?? 'staging';
  const hostname = new URL(baseUrl).hostname;

  if (!hostname.includes(allowedHostPattern)) {
    throw new Error(
      `PLAYWRIGHT_BASE_URL host "${hostname}" must include "${allowedHostPattern}" for hosted mutation discipline.`
    );
  }
}

function runTarget(target: string) {
  switch (target) {
    case 'ops-worker':
      requireEnv('DATABASE_URL');
      requireEnv('ADMIN_SESSION_SECRET');
      return;
    case 'hosted-smoke':
      validateHostedBaseUrl();
      requireEnv('ADMIN_SESSION_SECRET');
      requireEnv('ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS');
      return;
    case 'hosted-mutations':
      validateHostedBaseUrl();
      requireEnv('ADMIN_SESSION_SECRET');
      requireEnv('ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS');
      requireBooleanEnv('PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS', 'true');
      return;
    case 'scim':
      requireEnv('ADMIN_SCIM_TOKEN');
      requireEnv('ADMIN_SCIM_PROVIDER');
      return;
    default:
      throw new Error(`Unsupported preflight target: ${target}`);
  }
}

function main() {
  const target = process.argv[2]?.trim();
  if (!target) {
    throw new Error('Preflight target is required.');
  }

  runTarget(target);
  console.log(`[env-preflight] ${target} configuration looks complete.`);
}

try {
  main();
} catch (error) {
  console.error(
    '[env-preflight] failed:',
    error instanceof Error ? error.message : 'Environment preflight failed.'
  );
  process.exit(1);
}
