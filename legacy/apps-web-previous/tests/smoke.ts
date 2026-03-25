/* eslint-disable no-console */

type HeadersMap = Record<string, string>;

function parseSetCookie(setCookie: string[] | undefined): HeadersMap {
  const jar: HeadersMap = {};
  if (!setCookie) return jar;
  for (const line of setCookie) {
    const [kv] = line.split(';');
    const [k, v] = kv.split('=');
    jar[k] = v;
  }
  return jar;
}

function cookieHeader(jar: HeadersMap) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function main() {
  const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';

  const assetsPage = await fetch(`${base}/assets`);
  if (!assetsPage.ok) throw new Error('public asset listing page failed');

  const assetRes = await fetch(`${base}/api/assets`);
  const assets = await assetRes.json();
  if (!Array.isArray(assets.items) || assets.items.length === 0) throw new Error('no published assets');

  const inquiryRes = await fetch(`${base}/api/inquiries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: base
    },
    body: JSON.stringify({
      assetId: assets.items[0].id,
      name: 'Smoke Tester',
      company: 'QA Labs',
      email: 'smoke@example.com',
      phone: '010-9999-8888',
      investorType: 'Institutional',
      ticketSize: 'KRW 10B',
      message: 'smoke test inquiry submission'
    })
  });
  if (!inquiryRes.ok) throw new Error('inquiry submission failed');

  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  const csrf = await csrfRes.json();
  const jar = parseSetCookie((csrfRes.headers as any).getSetCookie?.() || undefined);

  const loginRes = await fetch(`${base}/api/auth/callback/credentials?json=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(jar)
    },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email: adminEmail,
      password: adminPassword,
      callbackUrl: `${base}/admin/assets`,
      json: 'true'
    })
  });
  const loginCookies = parseSetCookie((loginRes.headers as any).getSetCookie?.() || undefined);
  Object.assign(jar, loginCookies);
  if (!loginRes.ok) throw new Error('admin login failed');

  const assetId = assets.items[0].id;
  const patchRes = await fetch(`${base}/api/admin/assets/${assetId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader(jar),
      Origin: base
    },
    body: JSON.stringify({ summary: `Updated by smoke test ${Date.now()}` })
  });
  if (!patchRes.ok) throw new Error('admin asset update failed');

  console.log('Smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
