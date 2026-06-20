/**
 * Generate design/figma-tokens.json from app/globals.css :root.
 *
 *   npm run design:tokens
 *
 * Import the result into Figma via the Tokens Studio plugin (Import → existing
 * tokens). The JSON is committed so designers can pull it without running the
 * app; re-run after editing globals.css colors.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigmaTokens } from '../lib/design/figma-tokens';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cssPath = join(root, 'app', 'globals.css');
const outPath = join(root, 'design', 'figma-tokens.json');

const css = readFileSync(cssPath, 'utf8');
const doc = buildFigmaTokens(css);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);

const counts = {
  color: Object.keys(doc.color).length,
  fontFamily: Object.keys(doc.fontFamily).length,
  shadow: Object.keys(doc.shadow).length
};
console.log(`✓ Wrote ${outPath}`);
console.log(
  `  ${counts.color} colors · ${counts.fontFamily} font families · ${counts.shadow} shadows`
);
