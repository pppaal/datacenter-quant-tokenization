/**
 * Figma design-token bridge.
 *
 * `app/globals.css` `:root` is the single source of truth for the platform's
 * design tokens (HSL color triplets + shadow scale + font families). Designers
 * work in Figma via the Tokens Studio plugin, which speaks the W3C Design
 * Tokens JSON format. This module parses `:root` and emits that JSON so the
 * exact production palette can be imported into Figma — and, in reverse,
 * `globalsCssVarsFromTokens` re-emits the `:root` color block from an edited
 * token doc so a designer's changes round-trip back into the app.
 *
 * Pure (no IO) so it is unit-testable; the `scripts/export-figma-tokens.ts`
 * CLI does the file reads/writes.
 */

export type DesignTokenType = 'color' | 'fontFamily' | 'shadow';

export type DesignToken = {
  $value: string;
  $type: DesignTokenType;
  /** Original CSS custom-property name, e.g. "--accent-hover". */
  $description?: string;
};

export type FigmaTokenDocument = {
  $description: string;
  color: Record<string, DesignToken>;
  fontFamily: Record<string, DesignToken>;
  shadow: Record<string, DesignToken>;
};

export type ParsedRoot = {
  colors: Record<string, string>; // name (no --) → HSL triplet "210 20% 98%"
  fonts: Record<string, string>; // name → font stack
  shadows: Record<string, string>; // name → raw CSS shadow value
};

const HSL_TRIPLET = /^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/;

/** Extract the first `:root { ... }` block body from a CSS string. */
export function extractRootBlock(css: string): string {
  const start = css.indexOf(':root');
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  if (open === -1) return '';
  // Walk to the matching close brace.
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return '';
}

/**
 * Parse the `--name: value;` declarations in a `:root` body. Multi-line values
 * (the font stacks) are joined. Trailing `/* ... *\/` comments are stripped.
 */
export function parseRootTokens(css: string): ParsedRoot {
  const body = extractRootBlock(css);
  // Strip block comments so a `;` inside a comment can't end a declaration early.
  const noComments = body.replace(/\/\*[\s\S]*?\*\//g, '');
  const colors: Record<string, string> = {};
  const fonts: Record<string, string> = {};
  const shadows: Record<string, string> = {};

  for (const decl of noComments.split(';')) {
    const m = /\s*--([a-z0-9-]+)\s*:\s*([\s\S]+)\s*$/i.exec(decl.trim());
    if (!m) continue;
    const name = m[1]!;
    const value = m[2]!.replace(/\s+/g, ' ').trim();
    if (name.startsWith('font-')) {
      fonts[name.slice('font-'.length)] = value;
    } else if (name.startsWith('shadow-')) {
      shadows[name.slice('shadow-'.length)] = value;
    } else if (HSL_TRIPLET.test(value)) {
      colors[name] = value;
    }
  }
  return { colors, fonts, shadows };
}

/** Convert an `"H S% L%"` triplet to a `#rrggbb` hex string. */
export function hslTripletToHex(triplet: string): string {
  const parts = triplet.trim().split(/\s+/);
  const h = Number(parts[0]);
  const s = Number(String(parts[1]).replace('%', '')) / 100;
  const l = Number(String(parts[2]).replace('%', '')) / 100;
  if (![h, s, l].every(Number.isFinite)) {
    throw new Error(`invalid_hsl_triplet:${triplet}`);
  }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Build the W3C/Tokens-Studio token document from a globals.css string. */
export function buildFigmaTokens(css: string): FigmaTokenDocument {
  const { colors, fonts, shadows } = parseRootTokens(css);
  const doc: FigmaTokenDocument = {
    $description:
      'Generated from apps/web/app/globals.css :root. Do not hand-edit — run `npm run design:tokens`. Import into Figma via the Tokens Studio plugin.',
    color: {},
    fontFamily: {},
    shadow: {}
  };
  for (const [name, triplet] of Object.entries(colors)) {
    doc.color[name] = {
      $value: hslTripletToHex(triplet),
      $type: 'color',
      $description: `--${name}`
    };
  }
  for (const [name, stack] of Object.entries(fonts)) {
    doc.fontFamily[name] = { $value: stack, $type: 'fontFamily', $description: `--font-${name}` };
  }
  for (const [name, shadow] of Object.entries(shadows)) {
    doc.shadow[name] = { $value: shadow, $type: 'shadow', $description: `--shadow-${name}` };
  }
  return doc;
}

/**
 * Reverse direction: re-emit the `:root` color custom-properties from an edited
 * token document, as `--name: H S% L%;` lines (Tailwind's `hsl(var(--x))`
 * wiring expects triplets, so we convert hex back to HSL). Returns the lines a
 * designer's Figma export would paste back into globals.css.
 */
export function globalsCssVarsFromTokens(doc: FigmaTokenDocument): string[] {
  return Object.entries(doc.color).map(([name, token]) => {
    const triplet = hexToHslTriplet(token.$value);
    return `  --${name}: ${triplet};`;
  });
}

/** Convert `#rrggbb` to an `"H S% L%"` triplet (inverse of hslTripletToHex). */
export function hexToHslTriplet(hex: string): string {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) throw new Error(`invalid_hex:${hex}`);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
