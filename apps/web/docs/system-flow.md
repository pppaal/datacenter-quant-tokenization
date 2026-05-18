# End-to-End System Flow

자산 등록 → 데이터 수집 → 평가 → IM 생성 → IC 패킷 까지 전체 workflow. 각 단계가 어떤 모델 / 어떤 화면 / 어떤 actor가 관여하는지 정리.

---

## 5단계 라이프사이클

```
1. INTAKE         (operator 새 자산 입력)
        ↓
2. ENRICHMENT     (외부 source 데이터 적재)
        ↓
3. REVIEW         (PENDING evidence 승인)
        ↓
4. VALUATION      (engine 실행 → run 저장)
        ↓
5. IM / IC        (sample-report 렌더 → committee packet)
```

---

## Stage 1 — Intake

**화면**: `/admin/assets/new`

**입력**:
- assetCode / name / description / sponsorName
- 주소 (Address) — Juso adapter로 자동 normalize 가능
- 기본 underwriting 가정 (occupancy / capex / 금융 LTV / hold years)

**저장**: `Asset` row 생성 + `Address`. `status = INTAKE`, `stage = SCREENING`.

**API**: `app/api/assets/route.ts` POST.

---

## Stage 2 — Enrichment

**화면**: `/admin/assets/[id]` "Enrich" 버튼 + per-section forms.

**Workflow**:
- Manual entry: SiteProfile / EnergySnapshot / MarketSnapshot 입력 → `reviewStatus = PENDING`
- Adapter pull: 외부 source에서 `SourceCache`에 저장
- Document upload: `Document` row + `DocumentVersion`. AI summary는 OPENAI_API_KEY 있을 때만.

**Adapters** (`lib/sources/adapters/`):
- juso (주소 normalize)
- kosis (macro 시계열)
- nasa-power (기후 climatology)
- nasa-firms (위성 hotspot)
- 기타 KR-specific adapters

**Provenance**: 각 adapter 응답이 `SourceCache`에 cache + freshness label. 수동 override는 `SourceOverride`.

---

## Stage 3 — Review

**화면**: `/admin/review` + 자산 상세 페이지의 review 패널.

**규칙** ([CLAUDE.md](../../CLAUDE.md) 참조):
- Manual micro / legal / lease 행은 `PENDING`으로 저장
- ANALYST+ 권한이 APPROVED / REJECTED 결정
- **`APPROVED` 행만** 다음 단계의 curated feature snapshot에 promoted
- 미승인 행은 valuation에 들어가도 `synthetic ramp` / `fallback`으로 라벨

**모델**:
- `ReviewStatus` enum: PENDING / APPROVED / REJECTED
- 적용 모델: Lease, PlanningConstraint, OwnershipRecord, EncumbranceRecord 등

---

## Stage 4 — Valuation

**Trigger**: `/admin/valuations` "Run new valuation" 또는 자산 상세에서 직접.

**Engine** (`lib/services/valuation-engine.ts`):

```
prepareUnderwritingInputs(asset bundle)
        ↓
strategy 선택 (data-center / office / industrial / retail / land)
        ↓
3 scenarios 생성 (Bull / Base / Bear)
  ├── Lease DCF
  ├── Income approach (cap rate × NOI)
  ├── Cost / replacement floor
  └── Comparable calibration (있으면 weighted)
        ↓
Macro regime engine overlay (discount/exit cap/debt cost shifts)
        ↓
Credit overlay (sponsor / tenant credit score → confidence delta)
        ↓
Year-by-year proforma 생성 → assumptions JSON에 저장
        ↓
Sensitivity runs (one-way + matrix)
        ↓
Persist: ValuationRun + ValuationScenario + SensitivityRun + SensitivityPoint
```

**저장**:
- `ValuationRun.assumptions` — metrics / taxes / spv / debt / capex / proForma 등 (data-model-cheatsheet 참조)
- `ValuationRun.provenance` — field별 출처 trace array
- `approvalStatus` 처음엔 `PENDING_REVIEW`

---

## Stage 5 — IM / IC

### 5a. IM 렌더 — `/sample-report`

`getSampleReport()` → `getAssetBySlug()` 한 쿼리로 bundle 끌고와서 33개 conditional 카드 렌더.

자세한 카드별 흐름은 [im-architecture.md](./im-architecture.md) 섹션 2.

### 5b. IC packet 준비

**화면**: `/admin/ic` 또는 `/admin/portfolio` 의 Committee 탭.

**Workflow**:
- ANALYST가 ValuationRun을 pick → IC packet 생성 (`InvestmentCommitteePacket`)
- packetCode 자동 부여 (예: `ICPKT-SEOUL-GANGSEO-2026Q2`)
- `status = DRAFT` → `LOCKED` (수정 금지) → `RELEASED`
- packet에 ValuationRun + Asset + Deal 연결
- `decisionSummary` / `followUpSummary` committee 결정 후 작성

**가드**: packet `LOCKED` 되려면 ValuationRun `APPROVED` + diligence deliverable 충족 (audit 시스템에 의해 enforced).

---

## 데이터가 IM 한 카드에 도달하는 전체 경로

예시: **"Cap rate 6.58%"가 어디서 왔는지**

```
[KOSIS API] kr.cap_rate_pct
        ↓ (lib/sources/adapters/kosis-cap-rate)
[SourceCache] cacheKey="kr_cap_rate" / freshness=fresh
        ↓ (engine prepareUnderwritingInputs)
[ValuationRun.assumptions.metrics.capRatePct] = 6.58
        ↓ (page-level: readUnderwritingAssumptions)
[Underwriting card] 렌더 "Cap rate 6.58%"
        ↓ (page-level: pickProvenanceForCard)
[ProvenancePill] "Source: korea-macro-rates · seed-manual"
```

LP가 IM에서 보는 모든 숫자는 비슷한 6단계를 따라가면 원천 도달 가능.

---

## 운영 / Cron

`scripts/run-ops-worker.ts` — 백그라운드 워커:
- ResearchSnapshot stale 감지 (`stale_drafts.scan`)
- TransactionComp 자동 tier 분류 (`tier-classifier.backfill`)
- AI cache TTL 만료 (`ai-cache.evict.scheduled`)

`OPS_CYCLE` — `npm run ops:cycle` 으로 source refresh + research sync 한꺼번에.

---

## Onchain (선택적)

`/admin/registry` 또는 자산 readiness 페이지에서:
- `RwaProject` 생성 → 등록 준비
- `OnchainRecord` 로 document hash 앵커링
- `TokenizedAsset` 으로 ERC-3643 호환 토큰 (IdentityRegistry / Compliance)

기본 `BLOCKCHAIN_MOCK_MODE=true` → 실제 chain 없이 mock txHash 생성 (audit 일관성).

---

## Observability

- 모든 admin 작업: `recordAuditEvent` → `AuditEvent` (actor / action / entity / status)
- 요청별 logger: `withRequestContext({ requestId }, fn)` (`lib/observability/logger.ts`)
- 외부 webhook: `ERROR_REPORT_WEBHOOK_URL` (선택)
- Notification: `Notification` 모델 + UI bell

---

## 요약 다이어그램

```
                       ┌──────────────┐
operator (browser)─────┤ /admin/login │
                       └──────┬───────┘
                              ↓
          ┌────────────────── Stage 1: INTAKE ──────────────────┐
          │  /admin/assets/new → Asset + Address                │
          └─────────────────────┬───────────────────────────────┘
                                ↓
          ┌────────────────── Stage 2: ENRICHMENT ──────────────┐
          │  /admin/assets/[id]                                 │
          │    ├ adapters → SourceCache                         │
          │    ├ manual entry (PENDING)                         │
          │    └ document upload                                │
          └─────────────────────┬───────────────────────────────┘
                                ↓
          ┌────────────────── Stage 3: REVIEW ──────────────────┐
          │  /admin/review                                      │
          │    PENDING → APPROVED → curated features            │
          └─────────────────────┬───────────────────────────────┘
                                ↓
          ┌────────────────── Stage 4: VALUATION ───────────────┐
          │  engine: 3 scenarios + sensitivity + provenance     │
          │  → ValuationRun + ValuationScenario                 │
          └─────────────────────┬───────────────────────────────┘
                                ↓
          ┌────────────────── Stage 5a: IM ─────────────────────┐
          │  /sample-report                                     │
          │  33 conditional cards = bundle + helpers            │
          └─────────────────────┬───────────────────────────────┘
                                ↓
          ┌────────────────── Stage 5b: IC ─────────────────────┐
          │  /admin/ic → InvestmentCommitteePacket              │
          │  DRAFT → LOCKED → RELEASED                          │
          └─────────────────────────────────────────────────────┘
                                ↓
                        committee decision
                                ↓
                       (optional) onchain anchor
```

---

## 더 읽기

- [im-architecture.md](./im-architecture.md) — Stage 5a 카드별 깊이
- [data-model-cheatsheet.md](./data-model-cheatsheet.md) — Stage 1-4 모델
- [seed-data.md](./seed-data.md) — Stage 4 출력 예시 (시드 valuation run)
- [im-section-cookbook.md](./im-section-cookbook.md) — Stage 5a 새 카드 추가
