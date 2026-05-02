# Investment Memo (IM) Architecture

이 문서는 `/sample-report` 페이지의 IM이 **어떻게 만들어지는지** 처음 보는 사람을 위해 처음부터 끝까지 풀어 쓴 설명입니다. 데이터가 어디서 오는지, 어떤 함수가 무엇을 계산하는지, 각 카드는 어디 코드에 있는지 모두 추적 가능합니다.

---

## 1. 큰 그림 — 3단 레이어

IM은 **3개 레이어**의 데이터를 합쳐서 렌더됩니다:

```
┌─────────────────────────────────────────────────────────┐
│  L1. RAW DATA (PostgreSQL)                              │
│  Asset, Counterparty, Lease, DebtFacility,              │
│  TaxAssumption, EnergySnapshot, FinancialStatement,     │
│  CarbonEmissionRecord, SideLetter, AuditEvent ...       │
└─────────────────────────────────────────────────────────┘
                          ↓ Prisma include (1 query)
┌─────────────────────────────────────────────────────────┐
│  L2. ASSET BUNDLE (lib/services/assets.ts)              │
│  getAssetBySlug(slug) returns the asset + every          │
│  related record needed to render the IM in one shot.    │
└─────────────────────────────────────────────────────────┘
                          ↓ helper functions
┌─────────────────────────────────────────────────────────┐
│  L3. IM HELPERS (lib/services/im/*.ts)                  │
│  Pure functions that shape the bundle into card-       │
│  ready data: ratios, projections, sensitivities,        │
│  emissions estimate, waterfall, etc.                    │
└─────────────────────────────────────────────────────────┘
                          ↓ React server component
┌─────────────────────────────────────────────────────────┐
│  L4. PAGE (app/sample-report/page.tsx)                  │
│  ~36 conditional sections rendered top-to-bottom.       │
│  Each card calls one or more L3 helpers and pulls       │
│  its data from the L2 bundle.                           │
└─────────────────────────────────────────────────────────┘
```

**왜 이 구조인가:**
- L2 bundle: 한 번의 DB 쿼리로 모든 데이터를 끌고 와서 N+1 문제 방지
- L3 helpers: 순수 함수 — 입력 → 출력만 있고 DB / IO 없음 → 단위 테스트 쉬움
- L4 page: 렌더링만 담당. 로직은 L3에 있음

---

## 2. IM 페이지 구조 (위→아래)

페이지가 약 36개 conditional 섹션으로 나뉘어있습니다. 데이터가 없는 섹션은 자동 hide.

| # | 섹션 | 카드 ID (anchor) | 주된 helper |
|---|---|---|---|
| 1 | Cover (recommendation, value, confidence, KPI strip) | `im-cover` | `getRecommendation`, KPI strip은 inline |
| 2 | Site media gallery | (cover 안) | bundle.media |
| 3 | Macro backdrop | `im-macro` | `pickMacroBackdrop`, `formatMacroValue` |
| 4 | Macro regime overlay | `im-macro-guidance` | `readMacroGuidance` |
| 5 | Returns / Cap stack / Tenancy 3-card | `im-returns` | `computeReturnsSnapshot`, `computeCapitalStructure`, `computeLeaseRollSummary` |
| 6 | Underwriting assumptions (rates / tax / SPV) | `im-underwriting` | `readUnderwritingAssumptions` |
| 7 | Site hazard scores | `im-hazard` | `describeHazard` |
| 8 | ESG + Scope 1/2/3 emissions | `im-esg` | `buildEsgSummary`, `buildEmissionsBreakdown`, bundle.carbonRecords |
| 9 | Insurance register | `im-insurance` | `buildInsuranceSummary` |
| 10 | Tax leakage walk | `im-tax-walk` | `buildTaxWalk` |
| 11 | FX exposure | `im-fx` | `buildFxExposure` |
| 12 | Title / parcel / planning diligence | `im-title` | bundle.ownershipRecords / parcels / encumbranceRecords |
| 13 | Sources & Uses | `im-sources-uses` | `readStoredBaseCaseProForma`, `readCapexBreakdown` |
| 14 | Capital call schedule | `im-capital-calls` | `buildCapitalCallSchedule` |
| 15 | Capex schedule (line items) | `im-capex` | bundle.capexLineItems |
| 16 | Year-by-year P&L (10y) | `im-pnl` | proForma.years |
| 17 | Scenario diff (Bull / Base / Bear) | `im-scenario` | `buildScenarioDiff` |
| 18 | Comparable transactions + rent comps | `im-comps` | bundle.transactionComps + market fallback |
| 19 | Research desk + Coverage queue + AI insights | `im-research` | bundle.researchSnapshots / coverageTasks / aiInsights |
| 20 | Realized outcomes + Competitive pipeline | `im-realized` | bundle.realizedOutcomes / pipelineProjects |
| 21 | Sensitivity matrices (engine MATRIX runs) | `im-sensitivity` | `pickMatrixRuns`, `buildSensitivityGrid` |
| 22 | Confidence score breakdown | `im-confidence` | `buildConfidenceBreakdown` |
| 23 | Sponsor track record | `im-sponsor` | `getSponsorTrackByName` |
| 24 | Key risks + DD checklist | `im-risks` | latestRun.keyRisks / ddChecklist |
| 25 | **Counterparty financials** (가장 큰 섹션) | `im-counterparty` | (아래 별도 sub-section) |
| 26 | Document evidence | `im-documents` | bundle.documents |
| 27 | IC packets | `im-ic-packet` | bundle.committeePackets |
| 28 | Side-letter terms | `im-side-letters` | bundle.sideLetters |
| 29 | Feature snapshots | `im-features` | bundle.featureSnapshots |
| 30 | Tokenization & on-chain | `im-tokenization` | bundle.tokenization |
| 31 | Audit trail | `im-audit` | `buildAuditTrail` |
| 32 | Investment memo prose | `im-memo` | latestRun.underwritingMemo |
| 33 | Source provenance matrix | (memo 안) | latestRun.provenance |

---

## 3. Counterparty financials — 가장 복잡한 섹션

자산의 모든 counterparties (sponsor + tenants) 별로 다음 11개 sub-card 렌더:

```
Per-counterparty render flow:

  [Header] role · period · currency · source-quality badge
       ↓
  [Multi-year trend table]   FY-1 → FY-2 → FY-3 with YoY ▲/▼
       ↓
  [Income statement]   Revenue → EBITDA → margin → D&A → EBIT → Net income
       ↓
  [Balance sheet]   Total assets, cash, debt, net debt, equity, equity ratio
       ↓
  [Cash flow]   OCF → maint capex → FCF → CFADS → debt service
       ↓
  [CFADS DSCR]   lender-grade single number (1.34x for seed)
       ↓
  [Covenant alerts banner]   critical / warning / watch
       ↓
  [Covenant headroom]   leverage / interest-coverage 2 cards
       ↓
  [Liquidity ladder]   facility maturity vs liquid resources (sponsor only)
       ↓
  [Distribution waterfall]   4-tier (capital return → preferred → catch-up → carry)
       ↓
  [Credit ratios]   8-row table with benchmark + interpretation
       ↓
  [Peer benchmarks]   vs KR sector median (top / mid / bottom quartile)
       ↓
  [10-year projection]   Revenue / EBITDA / Debt / Leverage / Coverage / CFADS DSCR
       ↓
  [4×4 Sensitivity matrix]   EBITDA shock × Rate shock with covenant pass/fail
       ↓
  [Credit assessment summary line]
```

위 + Sponsor / Tenant **2개 rollup strip** (page-level, 카운터파티 카드 위쪽).

---

## 4. 데이터 흐름 — 한 가지 예시

**"Cap rate가 왜 6.58%인가?"** 라는 LP 질문이 IM에서 어떻게 답해지는지:

```
1. Macro adapter (lib/sources/adapters/) 가 KOSIS / BOK ECOS에서
   rent_growth_pct, cap_rate_pct 등을 fetch → SourceCache에 저장
                          ↓
2. ValuationRun 실행 시 engine이 macro 시리즈를 읽어 base scenario
   capRatePct = 6.58%로 설정 → assumptions JSON blob에 저장
                          ↓
3. IM 페이지가 latestRun.assumptions 읽음 →
   readUnderwritingAssumptions() 가 metrics.capRatePct 추출
                          ↓
4. <UnderwritingAssumptions> 카드가 "Cap rate 6.58%" 렌더
                          ↓
5. 같은 cap rate가 macro-regime-engine 의 overlay에 의해
   shifted → readMacroGuidance() 가 +0.48 pts 표시
                          ↓
6. ProvenancePill 컴포넌트가 latestRun.provenance에서
   field === 'capRatePct' 찾아 sourceSystem
   "korea-macro-rates" 표시 (provenance-map.ts)
```

LP가 IM에서 보는 모든 숫자는 이런 **trace chain**을 따라가면 원천에 도달 가능합니다.

---

## 5. Helper 함수 카테고리

`lib/services/im/` 하위 helper들이 카테고리별:

### Credit / 재무 분석
- `credit-analysis.ts` — IS / BS / 비율 / projection / 2D sensitivity
- `cash-flow.ts` — FCF / CFADS / Net income (D&A 반영) / CFADS forward path
- `covenant.ts` — headroom + first-breach + alerts
- `liquidity.ts` — facility maturity ladder
- `waterfall.ts` — 4-tier 분배 waterfall
- `counterparty-rollup.ts` — sponsor / tenant 분리 가중평균
- `peer-benchmarks.ts` — KR DC / Office / Industrial / Retail 4 sector median

### 가치평가 input
- `assumptions.ts` — base scenario rate / tax / SPV
- `projection-inputs.ts` — macro에서 growth / amort / rate derive
- `scenario-diff.ts` — Bull/Base/Bear 변화량
- `sensitivity.ts` — MATRIX run grid 매핑
- `macro-guidance.ts` — engine overlay JSON 파싱

### IM 부가 카드
- `sections.ts` — Macro / Returns / CapStack / Tenancy / TenantCredit
- `confidence.ts` — coverage signal breakdown
- `hazard.ts` — flood/wildfire/seismic 5-band
- `esg.ts` — PUE/renewable/backup + Scope 1/2/3 derive
- `insurance.ts` — coverage tile + expiring flag
- `tax-walk.ts` — 6-line tax leakage walk
- `fx-exposure.ts` — KRW / 외화 sensitivity
- `capital-calls.ts` — call schedule (indicative)
- `audit-trail.ts` — AuditEvent 쿼리
- `freshness.ts` — 0-7d / 7-30d / 30d+ 색상 dot
- `provenance-map.ts` — field → card 매핑
- `sponsor.ts` — sponsorName 매칭 track record

각 helper 옆에 `tests/im-*.test.ts` 단위 테스트 있음 (총 ~50개 IM 테스트).

---

## 6. 코드 읽는 순서 (학습용)

처음 보면 어디부터 봐야 할지 모르므로 권장 순서:

1. **schema.prisma** — 데이터 모델 전체 그림 (Asset 중심, 약 60 model)
2. **lib/services/assets.ts** `assetBundleInclude` — IM이 무슨 데이터를 가져가는지
3. **app/sample-report/page.tsx** 상단 ~300줄 — IM의 모든 derivation
4. **lib/services/im/credit-analysis.ts** — 재무 분석 로직 (가장 informative)
5. **lib/services/im/cash-flow.ts** — CFADS 같은 lender-grade 메트릭
6. **lib/services/im/peer-benchmarks.ts** — KR 데이터센터 sector median 데이터
7. **lib/services/im/waterfall.ts** — promote / hurdle / catch-up tier
8. **tests/im-*.test.ts** — 각 helper의 의도된 동작 (가장 빠른 reference)

---

## 7. 주요 실수 / 피해야 할 함정

IM 작성하면서 audit으로 발견한 흔한 misleading 패턴:

1. **Per-counterparty 카드에서 자산 facility 표시** — 카운터파티 BS는 자산 부채와 관련 없음. 현재 liquidity ladder는 sponsor에만 표시
2. **Sponsor + Tenant rollup 합치기** — 다른 risk type을 평균내면 sponsor 약점이 가려짐. 현재 2 strips로 분리
3. **purchase price 없을 때 capex로 fallback하면서 라벨 그대로** — "Investment basis (capex)"로 분명히 구분 + caveat 박스
4. **GHG Protocol Scope 2 LB+MB 합산** — primary는 MB, LB는 alternate footnote
5. **Tax effective rate 분모가 flow+stock 혼합** — pre-tax gross profit (NOI + exit gain)으로 통일
6. **Capital call placeholder를 실제 LPA처럼 표시** — INDICATIVE 뱃지 + LPA per-vehicle 차이 명시

---

## 8. 새 카드 추가 가이드

새 IM 카드를 추가할 때 표준 패턴:

1. **데이터 모델 확인**: 이미 schema에 있는가? 없으면 migration 추가.
2. **Bundle include 확장**: `lib/services/assets.ts` `assetBundleInclude`에 새 relation 추가.
3. **Helper 작성**: `lib/services/im/<feature>.ts` — 순수 함수, 입력 type → 출력 type.
4. **Test**: `tests/im-<feature>.test.ts` — happy path + missing input + edge cases.
5. **Page render**: `app/sample-report/page.tsx` 에 conditional `<section id="im-...">` 블록.
6. **TOC 추가**: 같은 페이지의 `tocItems` 배열에 `{id, label, show}` 추가.
7. **Live verify**: `curl http://localhost:3000/sample-report | grep <new section text>`.
8. **Commit + push**.

---

## 9. 테스트 / 빌드

```bash
# 컴파일 확인
npm run typecheck

# 단위 테스트 (현재 ~693)
npm test

# 특정 helper만 테스트
npm test -- --grep "buildCashFlowSlice"

# 개발 서버
npm run dev

# IM 라이브 확인
curl http://localhost:3000/sample-report > /tmp/im.html
```

---

## 10. 더 읽을 자료

- 루트 [README.md](../../README.md) — operational commands / env / deploy
- [architecture.md](../../architecture.md) — adapter / source / provenance 시스템
- [docs/valuation-variables.md](./valuation-variables.md) — engine input 변수 정의
- [docs/production-runbook.md](./production-runbook.md) — 운영 체크리스트
- [CLAUDE.md](../../CLAUDE.md) — repo 컨벤션 / 가드레일
