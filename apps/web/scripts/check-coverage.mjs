#!/usr/bin/env node
/**
 * Coverage gate + low-coverage surfacing for the Node built-in test runner.
 *
 * Dependency-free: parses the text report emitted by
 * `node --test --experimental-test-coverage` (via `npm run test:coverage`).
 * That report is a pipe-delimited table whose rows look like:
 *
 *   # file ...........................  | <line%> | <branch%> | <func%> | <uncovered lines>
 *   # all files .....................   |  91.72  |   78.73   |  90.33  |
 *
 * What this script does:
 *   1. FLOOR GATE (fail-closed). Parses the `# all files` summary row and
 *      fails (exit 1) if line% < COVERAGE_LINE_FLOOR or branch% <
 *      COVERAGE_BRANCH_FLOOR. If either summary number cannot be parsed it
 *      fails closed — a broken/empty report must never silently pass CI.
 *   2. LOW-FILE WARNING (non-fatal). Lists the per-file rows whose line
 *      coverage is below COVERAGE_FILE_WARN (default 50), sorted ascending,
 *      so localized gaps surface in the CI log as `::warning` annotations.
 *      This does NOT fail the build (per-PR diffing isn't available in-repo);
 *      it makes new/low-coverage files visible at review time.
 *
 * Usage:
 *   node scripts/check-coverage.mjs <coverage-report.txt>
 *
 * Env:
 *   COVERAGE_LINE_FLOOR    integer, default 85
 *   COVERAGE_BRANCH_FLOOR  integer, default 0 (set in CI)
 *   COVERAGE_FILE_WARN     integer per-file line% warn threshold, default 50
 *   COVERAGE_FILE_WARN_MAX max number of low files to print, default 25
 */

import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('check-coverage: missing report path argument');
  process.exit(1);
}

const LINE_FLOOR = Number.parseInt(process.env.COVERAGE_LINE_FLOOR ?? '85', 10);
const BRANCH_FLOOR = Number.parseInt(process.env.COVERAGE_BRANCH_FLOOR ?? '0', 10);
const FILE_WARN = Number.parseInt(process.env.COVERAGE_FILE_WARN ?? '50', 10);
const FILE_WARN_MAX = Number.parseInt(process.env.COVERAGE_FILE_WARN_MAX ?? '25', 10);

let report;
try {
  report = readFileSync(reportPath, 'utf8');
} catch (err) {
  console.error(`check-coverage: cannot read ${reportPath}: ${err.message}`);
  process.exit(1);
}

const lines = report.split('\n');

/** Parse a coverage table row into {name, line, branch, func} or null. */
function parseRow(raw) {
  // Only consider the coverage-table rows (Node prefixes them with "# ").
  if (!raw.startsWith('#')) return null;
  // Drop the leading "# " marker, then split on the column delimiter.
  const cols = raw.replace(/^#\s?/, '').split('|');
  if (cols.length < 4) return null;
  const name = cols[0].trim();
  const line = Number.parseFloat(cols[1]);
  const branch = Number.parseFloat(cols[2]);
  const func = Number.parseFloat(cols[3]);
  if (!name || Number.isNaN(line) || Number.isNaN(branch)) return null;
  return { name, line, branch, func };
}

// ---------------------------------------------------------------------------
// 1. Floor gate (fail-closed on parse failure).
// ---------------------------------------------------------------------------
const summary = lines.map(parseRow).find((row) => row && /^all files\b/.test(row.name));

if (!summary) {
  console.error('check-coverage: could not parse the "# all files" summary row; failing closed.');
  process.exit(1);
}

console.log(
  `Measured coverage — line ${summary.line}% (floor ${LINE_FLOOR}%), ` +
    `branch ${summary.branch}% (floor ${BRANCH_FLOOR}%)`
);

let failed = false;
if (summary.line < LINE_FLOOR) {
  console.error(`::error::Line coverage ${summary.line}% is below floor ${LINE_FLOOR}%`);
  failed = true;
}
if (summary.branch < BRANCH_FLOOR) {
  console.error(`::error::Branch coverage ${summary.branch}% is below floor ${BRANCH_FLOOR}%`);
  failed = true;
}

// ---------------------------------------------------------------------------
// 2. Low per-file warning (non-fatal).
// ---------------------------------------------------------------------------
const lowFiles = lines
  .map(parseRow)
  .filter(
    (row) =>
      row &&
      !/^all files\b/.test(row.name) &&
      // table footers / separators have no real filename; require an extension
      /\.(ts|tsx|mjs|js)$/.test(row.name) &&
      row.line < FILE_WARN
  )
  .sort((a, b) => a.line - b.line)
  .slice(0, FILE_WARN_MAX);

if (lowFiles.length > 0) {
  console.log(
    `\nLowest-coverage source files (line% < ${FILE_WARN}%, top ${lowFiles.length}) — ` +
      `review for newly-added gaps:`
  );
  for (const f of lowFiles) {
    console.log(
      `::warning::low coverage ${f.name} — line ${f.line}% / branch ${f.branch}% / func ${f.func}%`
    );
  }
}

if (failed) process.exit(1);
console.log('\nCoverage floors met.');
