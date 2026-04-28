import { spawn } from 'node:child_process';

function fail(message: string) {
  console.error(`[hosted-mutation-guard] ${message}`);
  process.exit(1);
}

const baseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim() ?? '';
const allowMutations =
  (process.env.PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS?.trim().toLowerCase() ?? 'false') === 'true';
const allowedHostPattern = process.env.PLAYWRIGHT_ALLOWED_HOST_PATTERN?.trim() ?? 'staging';

if (process.env.NODE_ENV === 'production') {
  fail('Hosted mutation runs are blocked when NODE_ENV=production.');
}

if (!baseUrl) {
  fail('PLAYWRIGHT_BASE_URL is required.');
}

if (!allowMutations) {
  fail('PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS=true is required for hosted mutation runs.');
}

let hostname = '';
try {
  hostname = new URL(baseUrl).hostname;
} catch {
  fail('PLAYWRIGHT_BASE_URL must be a valid URL.');
}

if (!hostname.includes(allowedHostPattern)) {
  fail(
    `Hosted mutation runs are restricted to hosts containing "${allowedHostPattern}". Received "${hostname}".`
  );
}

const child = spawn('npx', ['playwright', 'test', 'e2e/operator-mutation.spec.ts'], {
  stdio: 'inherit',
  shell: true,
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
