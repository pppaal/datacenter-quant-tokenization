import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/**
 * Light-theme migration guard. The shared UI primitives (components/ui) and the
 * admin surface (components/admin) all render on light token panels, so they
 * must not hard-code the old dark-theme grayscale utilities. Although the
 * globals.css compat layer remaps most of these at runtime, new code should use
 * the semantic tokens directly (e.g. `text-[hsl(var(--foreground))]`,
 * `bg-[hsl(var(--panel-alt))]`, `border-[hsl(var(--border))]`) so the compat
 * shim can eventually be retired and so unmapped variants (placeholder:/focus:/
 * high-opacity whites) don't silently render light-on-light.
 *
 * This scans components/ui and components/admin and asserts ZERO raw
 * occurrences of:
 *   - text-white
 *   - bg-slate-950 (any opacity)
 *   - border-white/<n>
 *
 * If a genuinely intentional dark surface is ever introduced here, add its
 * `relativePath` to IGNORE with a one-line justification — there are none today.
 */

const DIRS = [
  path.join(__dirname, '..', 'components', 'ui'),
  path.join(__dirname, '..', 'components', 'admin')
];

// Documented, intentional exceptions (relative to apps/web/components). Empty by
// design: everything in ui/ and admin/ renders on light panels.
const IGNORE = new Set<string>([]);

// Raw dark-theme utilities that must not appear as a Tailwind class. The
// negative lookbehind keeps `text-white` from matching e.g. a hyphenated word,
// and excludes longer color stops so this only catches the literal token.
const FORBIDDEN: { label: string; re: RegExp }[] = [
  { label: 'text-white', re: /(?<![\w-])text-white\b/ },
  { label: 'bg-slate-950', re: /(?<![\w-])bg-slate-950(?:\/\d+)?\b/ },
  { label: 'border-white/<n>', re: /(?<![\w-])border-white\/\d+\b/ }
];

// Strip line/block comment bodies so doc-comments that mention old class names
// (for historical context) don't trip the scan. We only care about live JSX.
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
}

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full));
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

test('components/ui + components/admin contain no raw dark-theme utilities', () => {
  const componentsRoot = path.join(__dirname, '..', 'components');
  const offenders: string[] = [];

  for (const dir of DIRS) {
    for (const file of collectFiles(dir)) {
      const rel = path.relative(componentsRoot, file);
      if (IGNORE.has(rel)) continue;

      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (isCommentLine(line)) return;
        for (const { label, re } of FORBIDDEN) {
          if (re.test(line)) {
            offenders.push(`${rel}:${index + 1} → ${label}`);
          }
        }
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Found raw dark-theme classes (convert to light-theme tokens):\n${offenders.join('\n')}`
  );
});
