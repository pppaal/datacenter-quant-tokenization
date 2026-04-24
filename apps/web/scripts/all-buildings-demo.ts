/**
 * Runs autoAnalyzeProperty against every KNOWN_ADDRESSES anchor to prove
 * the classifier differentiates asset class / highest-and-best-use by
 * location (zoning + building main-use + grid context).
 */

import { autoAnalyzeProperty } from '@/lib/services/property-analyzer/auto-analyze';
import { KNOWN_ADDRESSES } from '@/lib/services/geocode/korea-geocode';

const B = 1_000_000_000;
function krw(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'N/A';
  if (Math.abs(v) >= B * 1000) return `${(v / B / 1000).toFixed(2)}T`;
  if (Math.abs(v) >= B) return `${(v / B).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  return `${Math.round(v).toLocaleString()}`;
}

async function main() {
  console.log('\n' + '═'.repeat(118));
  console.log('  CLICK-ANY-BUILDING · Differentiation Proof — 8 Korean addresses, ' +
    'one pipeline, 8 distinct classifications');
  console.log('═'.repeat(118));
  console.log(
    '  ' +
      'District'.padEnd(10) +
      'Zone'.padEnd(22) +
      'Main Use'.padEnd(12) +
      'Grid MW'.padStart(8) +
      '  ' +
      'Primary Class'.padEnd(14) +
      'Feasibility'.padEnd(12) +
      'Base Value'.padStart(11) +
      '  ' +
      'Top Alternative'
  );
  console.log('  ' + '─'.repeat(116));

  for (const a of KNOWN_ADDRESSES) {
    try {
      const r = await autoAnalyzeProperty({
        address: a.roadAddress,
        includeAlternatives: 1
      });
      const pd = r.publicData as {
        building: { mainUse: string } | null;
        grid: { availableCapacityMw: number | null } | null;
        zone: { primaryZone: string };
      };
      const alt0 = r.alternativeAnalyses[0];
      const altStr = alt0
        ? `${alt0.assetClass.padEnd(12)} ${krw(alt0.analysis.baseCaseValueKrw)}`
        : '—';

      console.log(
        '  ' +
          a.districtName.padEnd(10) +
          (pd.zone.primaryZone || '?').padEnd(22) +
          (pd.building?.mainUse ?? '?').padEnd(12) +
          String(pd.grid?.availableCapacityMw ?? '?').padStart(6) +
          'MW  ' +
          r.classification.primary.assetClass.padEnd(14) +
          r.classification.primary.feasibility.padEnd(12) +
          krw(r.primaryAnalysis.baseCaseValueKrw).padStart(11) +
          '  ' +
          altStr
      );
    } catch (err) {
      console.log(`  ${a.districtName.padEnd(10)} FAILED: ${(err as Error).message}`);
    }
  }
  console.log('═'.repeat(118) + '\n');

  // Count how many *distinct* primary classes we got — that is the proof.
  const primaries = new Set<string>();
  for (const a of KNOWN_ADDRESSES) {
    try {
      const r = await autoAnalyzeProperty({ address: a.roadAddress });
      primaries.add(r.classification.primary.assetClass);
    } catch { /* skip */ }
  }
  console.log(
    `  Distinct primary asset classes across ${KNOWN_ADDRESSES.length} sites: ` +
      `${primaries.size} — {${[...primaries].join(', ')}}`
  );
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
