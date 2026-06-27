import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/**
 * a11y guard: admin status banners must not render light semantic text
 * (text-{emerald,amber,rose,sky}-{50,100,200}) over a light semantic tint
 * (bg-{emerald,amber,rose,sky}-{400,500}/{5,10,20,30}). On the light theme the
 * Tailwind compat layer does NOT remap the emerald/amber/rose/sky ramps, so
 * that combination is light-on-light and fails WCAG contrast. Banners (and
 * markers) must use the semantic tokens instead, e.g.
 * `bg-[hsl(var(--success-tint))] text-[hsl(var(--success))]`.
 *
 * This test scans apps/web/components/admin and asserts ZERO occurrences of the
 * offending combo on a single className string (in either order). The tint
 * opacities now also include /20 and /30 (which the original /5,/10-only guard
 * missed — e.g. the property-map markers regression) and the sky ramp.
 */

// Light-themed admin surfaces: the shared admin components AND the admin route
// pages (which render on the light `app-shell`). The public `app/property-analyze`
// page is intentionally dark-themed, so its light-text-on-tint is correct and is
// deliberately NOT scanned here.
const SCAN_DIRS = [
  path.join(__dirname, '..', 'components', 'admin'),
  path.join(__dirname, '..', 'app', 'admin'),
  path.join(__dirname, '..', 'app', '(auth)', 'admin')
];

const SCAN_ROOT = path.join(__dirname, '..');

const LIGHT_TEXT = String.raw`text-(?:emerald|amber|rose|sky)-(?:50|100|200)`;
const LIGHT_TINT_BG = String.raw`bg-(?:emerald|amber|rose|sky)-(?:500|400)/(?:5|10|20|30)\b`;

// Match the offending pair within one className string (forward and reverse).
const OFFENDING = new RegExp(
  `(?:${LIGHT_TEXT}[^"'\`]*${LIGHT_TINT_BG})|(?:${LIGHT_TINT_BG}[^"'\`]*${LIGHT_TEXT})`
);

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsxFiles(full));
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

test('admin banners do not use light semantic text over light semantic tint', () => {
  const offenders: string[] = [];

  for (const dir of SCAN_DIRS) {
    for (const file of collectTsxFiles(dir)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (OFFENDING.test(line)) {
          offenders.push(`${path.relative(SCAN_ROOT, file)}:${index + 1}`);
        }
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Found light-on-light status banner classes (fix to semantic tokens):\n${offenders.join('\n')}`
  );
});

// The admin login + security error banners are status messages: they must carry
// role="alert" so assistive tech announces auth/config failures, and they must
// render via the semantic danger tokens (readable on the light app-shell).
test('admin login + security error banners are announced and use danger tokens', () => {
  const banners = [
    path.join(SCAN_ROOT, 'app', '(auth)', 'admin', 'login', 'page.tsx'),
    path.join(SCAN_ROOT, 'app', 'admin', 'security', 'page.tsx')
  ];
  for (const file of banners) {
    const src = readFileSync(file, 'utf8');
    assert.match(
      src,
      /role="alert"/,
      `${path.relative(SCAN_ROOT, file)} must mark its error banner role="alert"`
    );
    assert.match(
      src,
      /bg-\[hsl\(var\(--danger-tint\)\)\][^"'`]*text-\[hsl\(var\(--danger\)\)\]/,
      `${path.relative(SCAN_ROOT, file)} must use the --danger-tint / --danger token pair`
    );
  }
});
