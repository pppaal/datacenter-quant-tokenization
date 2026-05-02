# IM Section Cookbook

새 IM 카드를 추가하는 7단계 표준 패턴. 실제 작업한 예시(`InsurancePolicy`)로 따라가며 설명.

---

## 7단계 패턴

### Step 1 — 데이터 출처 결정

**질문**: 데이터가 이미 schema에 있는가?
- **Yes** → Step 3로 (helper 작성).
- **No** → Step 2 (schema 추가).

예시 (Insurance):
- 기존 schema에 `InsurancePolicy` 없음. → schema 추가 필요.

### Step 2 — Schema + migration (필요 시)

`prisma/schema.prisma`에 model 추가:

```prisma
model InsurancePolicy {
  id            String   @id @default(cuid())
  assetId       String
  asset         Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
  policyType    String   // PROPERTY / BI / LIABILITY / ...
  insurer       String
  coverageKrw   Float?
  premiumKrw    Float?
  effectiveFrom DateTime?
  expiresOn     DateTime?
  status        String   @default("ACTIVE")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([assetId, policyType, status])
}
```

`Asset` 모델에 reverse relation 추가:

```prisma
model Asset {
  // ... existing fields ...
  insurancePolicies     InsurancePolicy[]
}
```

Migration:

```bash
mkdir -p prisma/migrations/<timestamp>_add_insurance_policy
# write migration.sql
npx prisma migrate deploy
npx prisma generate
```

`migration.sql`은 `IF NOT EXISTS` 가드 사용 (CLAUDE.md convention):

```sql
CREATE TABLE IF NOT EXISTS "InsurancePolicy" (...);
CREATE INDEX IF NOT EXISTS "InsurancePolicy_..." ON ...;
```

### Step 3 — Bundle include 확장

`lib/services/assets.ts`의 `assetBundleInclude`:

```ts
export const assetBundleInclude = {
  // ... 기존 includes ...
  insurancePolicies: {
    orderBy: [
      { status: 'asc' as const },
      { policyType: 'asc' as const }
    ]
  }
} satisfies Prisma.AssetInclude;
```

이로 인해 IM 페이지의 `getSampleReport()` 호출 1번에 보험 데이터도 함께 옴.

### Step 4 — Helper 작성

`lib/services/im/insurance.ts` — 순수 함수, DB / IO 없음:

```ts
type PolicyLike = {
  policyType: string;
  insurer: string;
  coverageKrw?: number | null;
  premiumKrw?: number | null;
  expiresOn?: Date | null;
  status?: string | null;
};

export type InsuranceSummary = {
  policies: PolicyLike[];
  totalCoverageKrw: number;
  totalPremiumKrw: number;
  expiringSoonCount: number;
  tilesByType: CoverageTile[];
};

export function buildInsuranceSummary(
  policies: PolicyLike[],
  now: Date = new Date()
): InsuranceSummary | null {
  if (policies.length === 0) return null;
  // ... aggregation logic
}
```

**Convention**:
- 입력 타입은 nullable optional fields (Prisma return shape에 충실)
- 빈 입력은 `null` 반환 (카드 자동 hide)
- 시간 의존이면 `now: Date = new Date()` 인자로 받기 (테스트 시 fixed date 주입 가능)

### Step 5 — Test

`tests/im-insurance.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInsuranceSummary } from '@/lib/services/im/insurance';

test('buildInsuranceSummary aggregates coverage + flags expiring', () => {
  const now = new Date('2026-04-30T00:00:00Z');
  const summary = buildInsuranceSummary([
    { policyType: 'PROPERTY', insurer: 'X', coverageKrw: 280_000_000_000,
      premiumKrw: 980_000_000, status: 'ACTIVE',
      expiresOn: new Date('2027-01-01') },
    { policyType: 'BI', insurer: 'X', coverageKrw: 60_000_000_000,
      premiumKrw: 320_000_000, status: 'ACTIVE',
      expiresOn: new Date('2026-06-01') } // 90일 내 만기
  ], now);
  assert.equal(summary!.totalCoverageKrw, 340_000_000_000);
  assert.equal(summary!.expiringSoonCount, 1);
});

test('buildInsuranceSummary returns null on empty', () => {
  assert.equal(buildInsuranceSummary([]), null);
});
```

실행:

```bash
npm test -- --grep buildInsuranceSummary
```

### Step 6 — Page render

`app/sample-report/page.tsx` — 3 곳 수정:

**(a)** Import 추가:

```ts
import { buildInsuranceSummary } from '@/lib/services/im/insurance';
```

**(b)** Data prep (return 직전):

```ts
const insuranceSummary = buildInsuranceSummary(asset.insurancePolicies ?? []);
```

**(c)** Conditional `<section>` 렌더 (다른 카드 사이 적당한 위치):

```tsx
{insuranceSummary ? (
  <section id="im-insurance" className="app-shell py-4">
    <Card>
      <div className="eyebrow">Insurance register</div>
      <p className="mt-2 text-sm text-slate-400">
        Active policies covering property, BI, liability, ...
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {insuranceSummary.tilesByType.map((tile) => (
          <div key={...}>...</div>
        ))}
      </div>
    </Card>
  </section>
) : null}
```

**(d)** TOC 항목 추가 — 같은 page의 `tocItems` 배열:

```ts
const tocItems = [
  // ...
  { id: 'im-insurance', label: 'Insurance', show: !!insuranceSummary },
  // ...
];
```

### Step 7 — Live verify

```bash
npm run typecheck   # 컴파일 OK
npm test            # 단위 테스트 OK
npm run dev         # 개발 서버
curl http://localhost:3000/sample-report > /tmp/im.html
grep -o "Insurance register" /tmp/im.html   # 카드 렌더 확인
```

---

## 카드 종류별 패턴

### Pattern A — bundle 데이터를 단순 표로 표시

예: Document evidence, Sponsor track record, Site media

```tsx
{asset.documents && asset.documents.length > 0 ? (
  <section id="im-documents">
    <table>
      {asset.documents.map(doc => <tr>{...}</tr>)}
    </table>
  </section>
) : null}
```

Helper 불필요. 그냥 bundle 데이터 직접 렌더.

### Pattern B — bundle 데이터 + helper 가공

예: Insurance, Tenant credit rollup, Sponsor track

```tsx
const summary = buildXSummary(asset.xField);
{summary ? <section>{summary.rows.map(...)}</section> : null}
```

### Pattern C — assumptions blob에서 derive

예: Underwriting assumptions, Macro guidance, Capex breakdown

```tsx
const assumptions = readUnderwritingAssumptions(latestRun.assumptions);
<section>{/* 6 tiles from assumptions.metrics */}</section>
```

### Pattern D — proForma 기반 계산

예: Year-by-year P&L, S&U, Equity returns, Capital calls

```tsx
const proForma = readStoredBaseCaseProForma(latestRun.assumptions);
{proForma ? <section>{proForma.years.map(year => <tr>...</tr>)}</section> : null}
```

### Pattern E — 다중 출처 fallback

예: Comparable transactions (asset → market-wide fallback)

```tsx
const marketTxComps = asset.transactionComps?.length
  ? []
  : await prisma.transactionComp.findMany({
      where: { assetId: null, market: asset.market },
      take: 8
    });
const txCompsToShow = asset.transactionComps?.length
  ? asset.transactionComps
  : marketTxComps;
```

---

## 흔한 함정

1. **TypeScript missing field**: Bundle include 빼먹으면 `asset.xField` undefined. → Step 3 확인.
2. **Decimal vs number**: Prisma의 `Decimal` 타입은 `.toNumber()` 호출 필요. helper에서 toNum() util 사용 권장.
3. **Stale Prisma client**: schema 바꾸고 `prisma generate` 안 하면 IDE는 OK인데 runtime 깨짐. dev server 재시작 필요.
4. **Print mode 깨짐**: 새 카드가 `print-hidden` 클래스 잘못 쓰면 PDF에서 안 보임. `@media print` CSS 확인.
5. **Conditional gate 누락**: 데이터 없을 때 `null` 처리 안 하면 빈 카드 렌더. 항상 `data?.length > 0 ? ... : null` 패턴.

---

## 새 카드 PR 체크리스트

- [ ] Schema migration 추가 (필요 시)
- [ ] `assetBundleInclude` 확장
- [ ] Helper 작성 + 단위 테스트
- [ ] Page에 import + data prep + JSX section + TOC
- [ ] `npm run typecheck` 통과
- [ ] `npm test` 통과
- [ ] `npm run dev` + curl로 라이브 verify
- [ ] Print 모드 (`?print=1`) 깨지지 않는지 확인
- [ ] Conditional gate (데이터 없을 때 hide) 동작 확인
- [ ] Commit message에 변경 요약

---

## 더 읽기

- [im-architecture.md](./im-architecture.md) — 시스템 큰그림
- [financial-helpers.md](./financial-helpers.md) — 기존 helper 카탈로그
- [data-model-cheatsheet.md](./data-model-cheatsheet.md) — schema 그래프
