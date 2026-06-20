import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFigmaTokens,
  extractRootBlock,
  globalsCssVarsFromTokens,
  hexToHslTriplet,
  hslTripletToHex,
  parseRootTokens
} from '@/lib/design/figma-tokens';

const SAMPLE_CSS = `
:root {
  /* Core surfaces */
  --background: 210 20% 98%; /* #F7F8FA cool near-white */
  --accent: 201 89% 36%; /* #0A6FAE primary accent */
  --on-accent: 0 0% 100%; /* white */
  --shadow-xs: 0 1px 2px rgba(16, 24, 40, 0.04);
  --font-sans: 'Inter', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
}
.other { color: red; }
`;

test('hslTripletToHex converts known anchors', () => {
  assert.equal(hslTripletToHex('0 0% 100%'), '#ffffff');
  assert.equal(hslTripletToHex('0 0% 0%'), '#000000');
  // Exact HSL→hex (the CSS comments carry designer-rounded approximations).
  assert.equal(hslTripletToHex('210 20% 98%'), '#f9fafb');
  assert.equal(hslTripletToHex('201 89% 36%'), '#0a74ae');
});

test('hslTripletToHex rejects garbage', () => {
  assert.throws(() => hslTripletToHex('not a triplet'), /invalid_hsl_triplet/);
});

test('hexToHslTriplet round-trips with hslTripletToHex', () => {
  for (const triplet of ['210 20% 98%', '201 89% 36%', '152 58% 30%', '0 0% 100%']) {
    const hex = hslTripletToHex(triplet);
    const back = hexToHslTriplet(hex);
    // Re-hex the round-tripped triplet; rounding may shift the triplet by 1 but
    // the resulting color must be identical.
    assert.equal(hslTripletToHex(back), hex, `round-trip ${triplet} → ${hex}`);
  }
});

test('extractRootBlock returns only the :root body', () => {
  const body = extractRootBlock(SAMPLE_CSS);
  assert.ok(body.includes('--accent: 201 89% 36%'));
  assert.ok(!body.includes('.other'));
});

test('parseRootTokens classifies colors / fonts / shadows', () => {
  const { colors, fonts, shadows } = parseRootTokens(SAMPLE_CSS);
  assert.deepEqual(Object.keys(colors).sort(), ['accent', 'background', 'on-accent']);
  assert.equal(colors.accent, '201 89% 36%');
  assert.deepEqual(Object.keys(fonts).sort(), ['mono', 'sans']);
  assert.ok(fonts.sans.includes('Inter'));
  assert.equal(shadows.xs, '0 1px 2px rgba(16, 24, 40, 0.04)');
});

test('buildFigmaTokens emits W3C-shaped tokens with hex colors', () => {
  const doc = buildFigmaTokens(SAMPLE_CSS);
  assert.equal(doc.color.accent.$type, 'color');
  assert.equal(doc.color.accent.$value, '#0a74ae');
  assert.equal(doc.color.accent.$description, '--accent');
  assert.equal(doc.fontFamily.sans.$type, 'fontFamily');
  assert.equal(doc.shadow.xs.$type, 'shadow');
  assert.equal(doc.shadow.xs.$value, '0 1px 2px rgba(16, 24, 40, 0.04)');
});

test('globalsCssVarsFromTokens re-emits :root color lines (reverse path)', () => {
  const doc = buildFigmaTokens(SAMPLE_CSS);
  const lines = globalsCssVarsFromTokens(doc);
  assert.ok(lines.some((l) => l.includes('--accent: 201 89% 36%')));
  assert.ok(lines.some((l) => l.includes('--on-accent: 0 0% 100%')));
});
