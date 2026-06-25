import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/**
 * a11y guard: admin status banners must not render light semantic text
 * (text-{emerald,amber,rose}-{50,100,200}) over a light semantic tint
 * (bg-{emerald,amber,rose}-{500,400}/{5,10}). On the light theme the Tailwind
 * compat layer does NOT remap the emerald/amber/rose ramps, so that combination
 * is light-on-light and fails WCAG contrast. Banners must use the semantic
 * tokens instead, e.g. `bg-[hsl(var(--success-tint))] text-[hsl(var(--success))]`.
 *
 * This test scans apps/web/components/admin and asserts ZERO occurrences of the
 * offending combo on a single className string (in either order).
 */

const ADMIN_DIR = path.join(__dirname, '..', 'components', 'admin');

const LIGHT_TEXT = String.raw`text-(?:emerald|amber|rose)-(?:50|100|200)`;
const LIGHT_TINT_BG = String.raw`bg-(?:emerald|amber|rose)-(?:500|400)/(?:5|10)\b`;

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

  for (const file of collectTsxFiles(ADMIN_DIR)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (OFFENDING.test(line)) {
        offenders.push(`${path.relative(ADMIN_DIR, file)}:${index + 1}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `Found light-on-light status banner classes (fix to semantic tokens):\n${offenders.join('\n')}`
  );
});
