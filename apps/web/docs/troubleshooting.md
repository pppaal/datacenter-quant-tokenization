# Troubleshooting

자주 겪는 문제 + 해결법. dev / IM / valuation / db 별로 정리.

---

## Postgres

### `connection refused at localhost:5432`

대부분 cluster가 멈춤. 재시작:
```bash
sudo pg_ctlcluster 16 main start
```

stale pid 메시지 뜨면:
```bash
sudo pg_ctlcluster 16 main start    # auto-removes stale pid
```

### Migration drift

스키마 바꿨는데 migration 안 만든 경우:
```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
# drift 있으면 새 migration 생성
npx prisma migrate dev --name <descriptive_name>
```

CI는 `web-ci.static-checks` job이 drift 잡아냄.

### Reset 데이터베이스

⚠️ 데이터 다 날아감:
```bash
npx prisma migrate reset
npm run prisma:seed
```

### `Unknown field <name> for include`

스키마 바꾼 뒤 `prisma generate` 안 한 상태로 dev server 재시작 안 함:
```bash
npx prisma generate
pkill -f "next dev"
npm run dev
```

---

## Dev server

### 자꾸 죽음 (idle disconnect)

Next.js dev 서버가 postgres idle timeout으로 disconnect. 재시작:
```bash
pkill -f "next dev"
(nohup npm run dev > /tmp/nextdev.log 2>&1 &)
```

### `Cannot use different slug names for the same dynamic path`

`app/api/.../[id]/` 와 `[assetId]/` 처럼 같은 레벨에서 다른 slug name. 둘 다 같은 이름으로 통일.

### Hot reload 안 됨

`.next` 캐시 정리:
```bash
rm -rf .next
npm run dev
```

### Port 3000 already in use

기존 process kill:
```bash
lsof -ti:3000 | xargs kill -9
```

---

## IM 페이지 (`/sample-report`)

### 카드가 안 보임

대부분 conditional gate 때문. `data?.length > 0 ? ... : null` 패턴이라 데이터 없으면 자동 hide.

확인:
```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d migrate_check -At -c \
  "SELECT count(*) FROM \"<TableName>\" WHERE \"assetId\"='<asset-id>';"
```

0이면 시드 추가 또는 SQL insert.

### 모든 숫자가 `—`

`latestRun`이 null이거나 `proForma` 추출 실패. 확인:
```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d migrate_check -At -c \
  "SELECT id, \"runLabel\", \"createdAt\" FROM \"ValuationRun\" \
   WHERE \"assetId\"='<asset-id>' ORDER BY \"createdAt\" DESC LIMIT 1;"
```

없으면 valuation 새로 실행.

### 카드 순서 / TOC 잘못됨

`tocItems` 배열 (page.tsx 상단)과 실제 `<section id="im-X">` 순서가 안 맞음. 페이지 위→아래 순서로 정렬.

### Provenance pill 비어있음

`provenance-map.ts`의 regex가 새 field를 못 잡아서. 패턴 추가:
```ts
const CARD_FIELDS: Record<string, RegExp[]> = {
  newCard: [/^myField$/i, /^macro\.my_field$/i],
};
```

### Print 모드 깨짐

새 카드가 `print-hidden` 잘못 사용. CSS 확인:
```css
@media print {
  main section { break-inside: avoid-page; }
}
```

`?print=1` URL로 테스트 — `ImPrintMode` 컴포넌트가 `<html>`에 `.im-print` 클래스 추가.

---

## Tests

### 테스트 fail "expected X got Y"

밴드 컷오프나 가정 변경 후 expected value 갱신 필요. 예: peer benchmark median 바꾸면 `tests/im-tier3.test.ts`의 `assert.equal(... 'top')` 도 같이 바꿔야.

### `tsx --test` runtime error

대부분 import path. `@/lib/...` 형식 사용 (tsconfig path alias).

### Decimal 오차 (1e-9 등)

JS float: `assert.ok(Math.abs(actual - expected) < 0.01)` 패턴.

---

## Helpers / Calculations

### CFADS DSCR 너무 낮음

`buildCashFlowSlice`의 default assumption 확인:
- D&A 6% / capex 2.5% / WC -0.5% / tax 24.2%
- 하나만 바꿔도 DSCR이 30%+ 변동

자산별 override는 `taxAssumption.corporateTaxPct` 우선.

### Leverage가 음수 / 무한대

`safeDiv(a, b)` 가 b=0이면 null 반환 — 분모 확인:
- EBITDA 0이면 leverage = null
- Total debt 0이면 D/E = null

페이지에서 `value === null ? '—' : ...` 패턴.

### Sensitivity grid 빈 cells

`SensitivityRun.points.shockLabel` 형식이 `"row / col"` 이어야 매칭됨. engine writer 출력 확인.

### Multi-year YoY 안 보임

`cp.financialStatements?.length >= 2` 조건. 2개 미만이면 hide. 시드에 prior FY 추가 필요.

---

## Auth / Admin

### `Invalid operator credentials`

API 본문 키 확인 — `user` (not `username`):
```bash
curl -X POST http://localhost:3000/api/admin/session \
  -H "Content-Type: application/json" \
  -d '{"user":"admin","password":"admin"}' \
  -c /tmp/admin.cookies
```

### `Browser sessions require active seat`

`.env`에 `ADMIN_ALLOW_UNBOUND_BROWSER_SESSION=true` 설정 (dev only). 프로덕션은 SSO + 시드 operator 사용.

### `IP not on allowlist`

`ADMIN_IP_ALLOWLIST` 환경변수 확인. dev면 `0.0.0.0/0` 또는 빈 값으로 disable.

---

## Migrations

### 충돌

같은 timestamp prefix로 두 migration 만들면 안 됨. 항상 새 timestamp:
```bash
ls prisma/migrations/   # 현재 last migration 확인
mkdir prisma/migrations/$(date +%Y%m%d%H%M%S)_<name>
```

### `IF NOT EXISTS` 안 쓰면 reconcile drift 깨짐

CLAUDE.md convention: 모든 `CREATE TABLE` / `CREATE INDEX`에 `IF NOT EXISTS`. 모델은 `20260428080000_reconcile_schema_drift`.

---

## Storage

### `local FS not allowed in production`

`createDocumentStorageFromEnv()`가 `DOCUMENT_STORAGE_BUCKET` 없을 때 prod에서 hard-block. S3-compatible bucket 설정 필요.

### Asset media upload fail

`uploadRateLimiter` per-user limit. 5분에 5회 제한. 또는 `validateDocumentUpload()`가 type / size 거부.

이미지는 `image/png` / `image/jpeg` / `image/webp` / `image/gif` / `image/svg+xml` / `application/pdf` 만.

---

## Blockchain

### Mock 모드인데 실제 호출 시도

`BLOCKCHAIN_MOCK_MODE=true` 확인. `isTokenizationMockMode()`가 short-circuit 해야 함.

### Production에서 mock 거부

`getBlockchainConfig` + `isBlockchainMockMode` 가 prod 환경에서 hard-fail. `npm run prod:preflight`로 확인.

---

## Common patterns

### 새 카드 데이터 없음 → 시드 추가

```sql
INSERT INTO "MyTable" (id, "assetId", ...) VALUES (...) ON CONFLICT (id) DO NOTHING;
```

`ON CONFLICT ... DO NOTHING`로 idempotent 보장.

### 빠른 디버깅 — IM 한 카드만 확인

```bash
curl -s http://localhost:3000/sample-report | python3 -c "
import re, sys
html = sys.stdin.read()
m = re.search(r'<section id=\"im-<card>\"[^>]*>(.+?)</section>', html, re.S)
if m:
    text = re.sub(r'<[^>]+>', ' ', m.group(1))
    text = re.sub(r'\s+', ' ', text).strip()
    print(text[:1500])
"
```

### Helper 단위 테스트만 실행

```bash
npm test -- --grep buildXxx
```

---

## 더 읽기

- [im-architecture.md](./im-architecture.md) — IM 시스템 구조
- [im-section-cookbook.md](./im-section-cookbook.md) — 카드 추가 패턴
- [data-model-cheatsheet.md](./data-model-cheatsheet.md) — 모델 reference
- [system-flow.md](./system-flow.md) — 전체 workflow
- 루트 [CLAUDE.md](../../CLAUDE.md) — repo 컨벤션
- [production-runbook.md](./production-runbook.md) — 운영 체크리스트
