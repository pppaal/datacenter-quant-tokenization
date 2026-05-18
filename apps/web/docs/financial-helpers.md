# Financial / IM Helper Reference

`lib/services/im/*.ts` 파일별 짧은 설명 + 입력 / 출력 / 테스트 위치. 각 helper는 순수 함수로 DB / IO 없음.

---

## Credit / 재무 분석

### `credit-analysis.ts`
- `buildIncomeStatement(stmt)` → `{revenue, ebitda, ebitdaMargin, interest, preTaxIncomeProxy}`
- `buildBalanceSheet(stmt)` → `{totalAssets, cash, totalDebt, netDebt, equity, equityRatio, otherLiabilities}`
- `buildCreditRatios(stmt)` → 8 ratios (leverage, netLeverage, IC, D/E, cash/debt, EBITDA margin, ROE, ROA) with benchmark + tone + interpretation
- `projectFinancials(stmt, {growth%, amort%, horizonYears})` → N+1 rows
- `buildSensitivityMatrix(stmt, {ebitdaShocks, rateShocks})` → 2D grid {coverage, leverage, passesCovenant}
- 테스트: `tests/im-credit-analysis.test.ts`

### `cash-flow.ts`
- `buildCashFlowSlice(inputs)` → `{ebitda, OCF, maintCapex, FCF, CFADS, debtService, cfadsDscr, EBIT, netIncome, taxRate, daKrw}`
- `projectCfadsDscr(base, options)` → CFADS DSCR forward path
- `DEFAULT_CASH_FLOW_ASSUMPTIONS` constant: D&A 6%, capex 2.5%, WC -0.5%, tax 24.2%
- 테스트: `tests/im-credit-tier.test.ts`, `tests/im-tier3.test.ts`

### `covenant.ts`
- `buildCovenantHeadroom(projection)` → per-ratio `{benchmark, headroomPct, firstBreachYear, worstValue, worstYear}`
- `buildCovenantAlerts(headroom)` → alerts with severity (critical / warning / watch)
- 테스트: `tests/im-credit-tier.test.ts`, `tests/im-tier5.test.ts`

### `liquidity.ts`
- `buildLiquidityLadder(facilities, {cashKrw, estimatedAnnualCashFlowKrw})` → `{rows, twelveMonthDebtService, liquidityCoverage, peakAnnualPrincipal, peakYear}`
- 테스트: `tests/im-credit-tier.test.ts`

### `waterfall.ts`
- `readSpvFromAssumptions(assumptions)` → `{managementFee, performanceFee, hurdle, promote, reserveMonths}`
- `buildWaterfall(spv, projectedIrrPct)` → 4-tier waterfall + LP/GP take split
- 테스트: `tests/im-credit-tier.test.ts`

### `counterparty-rollup.ts`
- `buildCounterpartyRollup(counterparties)` → EBITDA-weighted score, leverage, IC + risk mix
- 페이지에서 sponsor / tenant 분리해서 호출
- 테스트: `tests/im-tier3.test.ts`

### `peer-benchmarks.ts`
- `pickSectorKey(assetClass, market)` → `KR_DATA_CENTER` / `KR_OFFICE` / `KR_INDUSTRIAL` / `KR_RETAIL`
- `buildPeerComparison(observed, sectorKey)` → top / mid / bottom quartile band per ratio
- 테스트: `tests/im-tier3.test.ts`, `tests/im-tier4.test.ts`

---

## 가치평가 input / 시나리오

### `assumptions.ts`
- `readUnderwritingAssumptions(assumptions)` → metrics (cap rate, discount, occupancy 등) + tax + SPV
- `readCapexBreakdown(assumptions)` → land/shell/electrical/mechanical/IT/soft/contingency

### `projection-inputs.ts`
- `pickRevenueGrowthPct(macroSeries)` → macro `rent_growth_pct` or sector fallback (3%)
- `pickDebtAmortizationPct(facilities)` → `(1 - balloon%) / termYears`
- `pickInterestRatePct(facilities, macroSeries)` → commitment-weighted facility rate
- 각 함수가 `{value, provenance}` 리턴 — IM 표시용
- 테스트: `tests/im-projection-inputs.test.ts`

### `scenario-diff.ts`
- `buildScenarioDiff(scenarios)` → Bull/Base/Bear vs base (Δ value%, Δ yield bps, Δ exit cap bps, Δ DSCR)
- 테스트: `tests/im-detail-helpers.test.ts`

### `sensitivity.ts`
- `pickMatrixRuns(sensitivityRuns)` → MATRIX 타입만 추출
- `buildSensitivityGrid(run)` → `{rowLabels, colLabels, cells}` 2D 그리드
- 테스트: `tests/im-detail-helpers.test.ts`

### `macro-guidance.ts`
- `readMacroGuidance(provenance)` → engine overlay shifts (discount, exit cap, debt cost, occupancy, growth, replacement cost)
- 테스트: `tests/im-confidence-macro.test.ts`

---

## IM 부가 카드

### `sections.ts`
- `pickMacroBackdrop(series)` / `formatMacroValue(point)`
- `computeLeaseRollSummary(leases)` → WALT / weighted rent / MTM gap
- `computeCapitalStructure(facilities)` → blended rate / drawn pct
- `computeReturnsSnapshot(scenarios)` / `rollupTenantCredit(rows)`
- 테스트: `tests/im-sections.test.ts`

### `confidence.ts`
- `buildConfidenceBreakdown(bundle, finalScore)` → 14 signals (5 external + 6 structured + 3 anchors) + 2 risk penalties

### `hazard.ts`
- `classifyHazardScore(score)` / `describeHazard(score)` — 5-band (minimal/low/moderate/elevated/high)
- 테스트: `tests/im-hazard.test.ts`

### `esg.ts`
- `buildEsgSummary(snapshot)` → PUE / renewable / backup band + composite
- `buildEmissionsBreakdown(options)` → derived Scope 1/2/3 from power capacity + capex + KR grid factor

### `insurance.ts`
- `buildInsuranceSummary(policies)` → tile per policy + total coverage / premium / 90-day expiring count

### `tax-walk.ts`
- `buildTaxWalk(taxes, inputs)` → 6-line tax leakage (acquisition / property / insurance / corporate / exit / withholding) + drag on pre-tax gross profit
- 테스트: `tests/im-tier3.test.ts`

### `fx-exposure.ts`
- `buildFxExposure(valueKrw, {assetCurrency, lpBaseCurrency, spotRate})` → 5-row sensitivity (-20% to +20%) + exposure band
- 테스트: `tests/im-tier3.test.ts`

### `capital-calls.ts`
- `buildCapitalCallSchedule(proFormaYears, options)` → 3-tranche call schedule (60% close + 30% build + reserve top-up)
- INDICATIVE — actual schedule per LPA
- 테스트: `tests/im-tier5.test.ts`

### `audit-trail.ts`
- `buildAuditTrail(prisma, {assetId, additionalEntityIds, limit})` → recent AuditEvent rows + actor stats

### `freshness.ts`
- `classifyFreshness(date)` → `{band, ageDays, label}` (fresh < 7d / recent < 30d / stale ≥ 30d)
- 테스트: `tests/im-freshness.test.ts`

### `provenance-map.ts`
- `pickProvenanceForCard(provenance, cardKey)` → field 패턴으로 필터
- `summarizeProvenance(entries)` → "src1 · src2" dedupe

### `sponsor.ts`
- `getSponsorTrackByName(sponsorName, db)` → case-insensitive 매칭으로 prior deal track + 평균 IRR / multiple

---

## 빠른 grep cheatsheet

```bash
# 특정 helper의 호출 위치
grep -rn "buildCfadsDscr" apps/web/

# 모든 IM 카드의 conditional 게이트
grep -n "section id=\"im-" apps/web/app/sample-report/page.tsx

# 특정 ratio benchmark 변경
grep -n "median: 4.2" apps/web/lib/services/im/peer-benchmarks.ts

# Helper의 단위 테스트
ls apps/web/tests/im-*.test.ts
```

---

## 더 읽기

- [im-architecture.md](./im-architecture.md) — IM 전체 구조 / 데이터 흐름 / 학습 순서
