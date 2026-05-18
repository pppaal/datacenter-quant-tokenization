/**
 * Demo: "click any building in Korea → full valuation + macro + sensitivity."
 *
 * Runs autoAnalyzeProperty for 3 real Korean addresses spanning different
 * asset classes and submarkets, prints the full chain end-to-end.
 *
 * Usage: npx tsx scripts/map-click-demo.ts
 */

import {
  autoAnalyzeProperty,
  type AutoAnalyzeResult
} from '@/lib/services/property-analyzer/auto-analyze';
import { AssetClass } from '@prisma/client';

const B = 1_000_000_000;

function hr(char = '─', width = 78) {
  return char.repeat(width);
}
function section(title: string) {
  console.log('\n' + hr('═'));
  console.log('  ' + title);
  console.log(hr('═'));
}
function sub(title: string) {
  console.log('\n' + hr('─'));
  console.log('  ' + title);
  console.log(hr('─'));
}
function krw(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return 'N/A';
  if (Math.abs(v) >= B * 1000) return `${(v / B / 1000).toFixed(d)}T KRW`;
  if (Math.abs(v) >= B) return `${(v / B).toFixed(d)}B KRW`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(d)}M KRW`;
  return `${Math.round(v).toLocaleString()} KRW`;
}
function pct(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return 'N/A';
  return `${v.toFixed(d)}%`;
}
function num(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return 'N/A';
  return v.toFixed(d);
}

function printResult(label: string, result: AutoAnalyzeResult) {
  section(`${label}`);

  sub('1. Resolved Address');
  console.log(`  Road address    : ${result.resolvedAddress.roadAddress}`);
  console.log(`  Jibun address   : ${result.resolvedAddress.jibunAddress}`);
  console.log(`  PNU             : ${result.resolvedAddress.pnu}`);
  console.log(
    `  Coordinates     : ${result.resolvedAddress.latitude.toFixed(5)}, ${result.resolvedAddress.longitude.toFixed(5)}`
  );
  console.log(`  District        : ${result.resolvedAddress.districtName}`);

  sub('2. Public-Data Hydration');
  const pd = result.publicData as {
    building: {
      mainUse: string;
      grossFloorAreaSqm: number | null;
      landAreaSqm: number | null;
      approvalYear: number | null;
      floorsAboveGround: number | null;
    } | null;
    zone: { primaryZone: string; zoningCode: string };
    landPricing: {
      officialLandPriceKrwPerSqm: number;
      recentTransactionKrwPerSqm: number | null;
    } | null;
    grid: {
      nearestSubstationName: string;
      availableCapacityMw: number | null;
      tariffKrwPerKwh: number;
    } | null;
    macroMicro: {
      metroRegion: string;
      submarketVacancyPct: number | null;
      submarketCapRatePct: number | null;
      notes: string;
    };
  };
  console.log(
    `  Building        : ${pd.building?.mainUse ?? 'unknown'} · GFA ${pd.building?.grossFloorAreaSqm?.toLocaleString() ?? '?'} sqm · ${pd.building?.floorsAboveGround ?? '?'}F · 승인 ${pd.building?.approvalYear ?? '?'}`
  );
  console.log(`  Land area       : ${pd.building?.landAreaSqm?.toLocaleString() ?? '?'} sqm`);
  console.log(`  Zone            : ${pd.zone.primaryZone} (${pd.zone.zoningCode})`);
  console.log(
    `  Land price      : 공시 ${(pd.landPricing?.officialLandPriceKrwPerSqm ?? 0).toLocaleString()} /sqm · 실거래 ${(pd.landPricing?.recentTransactionKrwPerSqm ?? 0).toLocaleString()} /sqm`
  );
  console.log(
    `  Grid            : ${pd.grid?.nearestSubstationName ?? '?'} · ${pd.grid?.availableCapacityMw ?? 0}MW avail · ${pd.grid?.tariffKrwPerKwh ?? 0} KRW/kWh`
  );
  console.log(
    `  Macro (${pd.macroMicro.metroRegion}): vacancy ${pct(pd.macroMicro.submarketVacancyPct)} · cap ${pct(pd.macroMicro.submarketCapRatePct)}`
  );
  console.log(`  Notes           : ${pd.macroMicro.notes}`);
  console.log(`  Rent comps      : ${result.publicData.rentComps.length} pulled`);

  sub('3. Classification (Highest-and-Best Use)');
  console.log(
    `  Primary   : ${result.classification.primary.assetClass.padEnd(12)} · ${result.classification.primary.feasibility} · conf ${num(result.classification.primary.confidence, 2)}`
  );
  console.log(`              → ${result.classification.primary.rationale}`);
  console.log(`  Alternatives:`);
  for (const alt of result.classification.alternatives.slice(0, 4)) {
    console.log(
      `    ${alt.assetClass.padEnd(12)} · ${alt.feasibility.padEnd(22)} · conf ${num(alt.confidence, 2)}`
    );
  }

  sub('4. Primary Valuation');
  const a = result.primaryAnalysis;
  console.log(`  Asset class        : ${a.asset.assetClass}`);
  console.log(`  Base case value    : ${krw(a.baseCaseValueKrw)}`);
  console.log(`  Confidence score   : ${num(a.confidenceScore, 2)}`);
  console.log(`  Scenarios:`);
  for (const sc of a.scenarios) {
    console.log(
      `    ${sc.name.padEnd(5)} · ${krw(sc.valuationKrw).padStart(14)} · yield ${pct(sc.impliedYieldPct).padStart(7)} · exit cap ${pct(sc.exitCapRatePct).padStart(7)} · DSCR ${num(sc.debtServiceCoverage)}x`
    );
  }
  console.log(`  Key risks:`);
  for (const r of a.keyRisks.slice(0, 4)) {
    console.log(`    · ${r}`);
  }

  if (result.alternativeAnalyses.length > 0) {
    sub('5. Alternative-Use Valuations (for comparison)');
    console.log(`  Class         | Base Value        | Bull     | Bear     | Confidence`);
    console.log(`  ${hr('─', 72)}`);
    console.log(
      `  ${result.primaryAnalysis.asset.assetClass.padEnd(12)}* | ${krw(a.baseCaseValueKrw).padEnd(16)} | ${krw(a.scenarios.find((s) => s.name === 'Bull')?.valuationKrw ?? 0).padEnd(8)} | ${krw(a.scenarios.find((s) => s.name === 'Bear')?.valuationKrw ?? 0).padEnd(8)} | ${num(a.confidenceScore, 2)}`
    );
    for (const alt of result.alternativeAnalyses) {
      const x = alt.analysis;
      console.log(
        `  ${alt.assetClass.padEnd(13)} | ${krw(x.baseCaseValueKrw).padEnd(16)} | ${krw(x.scenarios.find((s) => s.name === 'Bull')?.valuationKrw ?? 0).padEnd(8)} | ${krw(x.scenarios.find((s) => s.name === 'Bear')?.valuationKrw ?? 0).padEnd(8)} | ${num(x.confidenceScore, 2)}`
      );
    }
    console.log(`  (* = primary highest-and-best-use per classifier)`);
  }

  sub('6. Underwriting Memo Preview');
  const memo = result.primaryAnalysis.underwritingMemo ?? '';
  console.log(
    memo
      .split('\n')
      .slice(0, 10)
      .map((l) => '  ' + l)
      .join('\n')
  );
  if (memo.split('\n').length > 10) {
    console.log(`  … (${memo.length} chars total)`);
  }
}

async function main() {
  const targets = [
    {
      label: '압구정 — Gangnam premium retail/office corridor',
      address: '서울특별시 강남구 압구정로 340',
      includeAlternatives: 2
    },
    {
      label: '성수 — IT/준공업 cluster, DC feasibility check',
      address: '서울특별시 성동구 성수이로 118',
      includeAlternatives: 2
    },
    {
      label: '평택 고덕 — logistics + DC belt',
      address: '경기도 평택시 고덕면 삼성로 114',
      includeAlternatives: 2
    }
  ];

  for (const t of targets) {
    try {
      const result = await autoAnalyzeProperty({
        address: t.address,
        includeAlternatives: t.includeAlternatives
      });
      printResult(t.label, result);
    } catch (err) {
      console.error(`\n[FAILED] ${t.label}:`, err);
    }
  }

  // One extra: force Data Center on Apgujeong (to show classifier says "EXCLUDED")
  section('FORCED OVERRIDE · 압구정 as Data Center (sanity check — classifier said EXCLUDED)');
  try {
    const result = await autoAnalyzeProperty({
      address: '서울특별시 강남구 압구정로 340',
      overrideAssetClass: AssetClass.DATA_CENTER
    });
    console.log(`  Primary class (forced) : ${result.primaryAnalysis.asset.assetClass}`);
    console.log(`  Base case value        : ${krw(result.primaryAnalysis.baseCaseValueKrw)}`);
    console.log(
      `  Classifier said        : ${result.classification.primary.assetClass} (${result.classification.primary.feasibility})`
    );
    const dcCandidate = result.classification.alternatives.find(
      (a) => a.assetClass === AssetClass.DATA_CENTER
    );
    console.log(
      `  DC feasibility        : ${dcCandidate?.feasibility ?? 'not in candidates'} — ${dcCandidate?.rationale ?? ''}`
    );
  } catch (err) {
    console.error('[FAILED]', err);
  }

  console.log('\n' + hr('═'));
  console.log('  DEMO COMPLETE');
  console.log(hr('═') + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
