# Go-Live Checklist — 프로덕션 + 실데이터 전환

> "지금 필요한 거" 전체 리스트. 코드가 실제로 요구하는 env/인프라(`lib/env.ts`,
> `scripts/run-production-preflight.ts` 기준) + 각 외부 데이터 소스의 조달 경로
> (등록 URL / 비용 / 승인시간 / 쿼터 / 함정)를 한 곳에. 최종 게이트는
> `npm run prod:preflight`.

## 빠른 시작

```bash
npm run setup:env   # .env.example → .env, 시크릿 2개 자동 생성 (.env는 gitignore)
# 아래 A~C의 값들을 .env에 붙여넣기
npm run prisma:generate && npm run prisma:migrate:deploy
npm run prod:preflight   # 프로덕션 env 로드 상태에서 — 블로커 A를 강제
```

## 먼저 알아야 할 구조적 사실 2가지

1. **운영 데이터(딜·펀드·투자자·커밋먼트·캐피탈콜·분배·포트폴리오·월별 KPI·
   위원회·토큰화 기록)는 전부 seed이거나 운영자 직접입력입니다.** 이를 대체하는
   라이브 피드는 없습니다 — 라이브 커넥터는 _부동산 분석기 / DC-intel / 매크로
   오버레이_ 표면만 먹입니다. → **프로덕션 DB엔 데모 seed를 절대 넣지 말 것**
   (`prisma migrate deploy`만; `prisma/seed.ts` 금지). 실제 딜은 admin UI 입력
   또는 1회 임포트.
2. 키가 없으면 대부분 mock으로 떨어지지만, **일부 어댑터(`macro.ts`,
   `geospatial.ts`, `korea-public.ts`, `building.ts`, `energy.ts`)는
   fail-closed가 아니라 STALE seed를 "진짜처럼" 보여줍니다** — 가장 속기 쉬운
   갭. (반면 매크로 대시보드 `BOK_ECOS_API_KEY`/`FRED_API_KEY`는 빈 결과+에러로
   정직하게 떨어짐.)

---

## A. 프로덕션 하드 블로커 — `prod:preflight`가 exit 1로 막음

| ✓   | 필요한 것                                    | env 변수                                                                                                   | 어디서 / 비용 / 시간                                                                    |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ☐   | Postgres + **pgvector**                      | `DATABASE_URL` (pooled, `sslmode=require`)                                                                 | Neon / Supabase — 무료티어~$25/mo · 즉시. 마이그레이션이 `CREATE EXTENSION vector` 실행 |
| ☐   | S3 호환 버킷                                 | `DOCUMENT_STORAGE_BUCKET` (+`_REGION`/`_ENDPOINT`/키/`_PREFIX`/`_FORCE_PATH_STYLE`)                        | Cloudflare R2(egress 무료) / AWS S3 / MinIO / Wasabi — ~$1-5/mo · 즉시                  |
| ☐   | Upstash Redis (REST)                         | `UPSTASH_REDIS_REST_URL`, `_TOKEN`                                                                         | upstash.com — 무료티어(1만콜/일) · 즉시                                                 |
| ☐   | 세션 시크릿 (≥32, dev placeholder 금지)      | `ADMIN_SESSION_SECRET`                                                                                     | `openssl rand -base64 48` · 0원                                                         |
| ☐   | 크론 토큰 (≥24)                              | `OPS_CRON_TOKEN`                                                                                           | `openssl rand -base64 32` · 0원                                                         |
| ☐   | 실 도메인                                    | `APP_BASE_URL`                                                                                             | 0원                                                                                     |
| ☐   | 블록체인 RPC                                 | `BLOCKCHAIN_RPC_URL`                                                                                       | Alchemy / Infura 무료티어                                                               |
| ☐   | 블록체인 서명키 (32-byte hex, Vercel secret) | `BLOCKCHAIN_PRIVATE_KEY`                                                                                   | 지갑 생성 · 0원                                                                         |
| ☐   | 레지스트리 컨트랙트 주소                     | `BLOCKCHAIN_REGISTRY_ADDRESS`                                                                              | `packages/contracts` 배포 (L2: Base/Polygon 가스 푼돈)                                  |
| ☐   | 체인 ID / 이름                               | `BLOCKCHAIN_CHAIN_ID`, `BLOCKCHAIN_CHAIN_NAME`                                                             | 0원                                                                                     |
| ☐   | mock 모드 OFF                                | `BLOCKCHAIN_MOCK_MODE` unset/false                                                                         | 프로덕션에서 mock은 런타임 throw                                                        |
| ☐   | 이스케이프 해치 3개 OFF                      | `ADMIN_ALLOW_UNBOUND_BROWSER_SESSION`, `PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS`, `E2E_PRODUCTION_BUILD` = false | 0원                                                                                     |

## B. preflight는 "warn"이지만 사실상 블로커

| ✓   | 필요한 것                                 | env 변수                                        | 메모                                                                                    |
| --- | ----------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| ☐   | **로그인 경로** (OIDC 권장 or basic-auth) | `ADMIN_OIDC_*` 또는 `ADMIN_BASIC_AUTH_*`        | Google Workspace / Okta / Auth0 무료티어. 둘 다 없으면 **아무도 로그인 못 함**          |
| ☐   | **크론 스케줄러**                         | Vercel Cron → `/api/ops/*` (+ `OPS_CRON_TOKEN`) | `vercel.json`에 3개 크론 정의됨(15분 워커/06:00/03:30). 없으면 소스 새로고침·워커 안 돎 |

## (권장) 관측성

| ✓   | env                                                 | 메모                                                 |
| --- | --------------------------------------------------- | ---------------------------------------------------- |
| ☐   | `SENTRY_DSN`                                        | 무료티어. 없으면 Vercel 로그만                       |
| ☐   | `OPS_ALERT_WEBHOOK_URL`, `ERROR_REPORT_WEBHOOK_URL` | Slack/Teams/PagerDuty. 없으면 크론 실패가 무성(無聲) |

---

## C. 무료 데이터 키 — 오늘 1~2시간이면 전부 발급

### C-1. data.go.kr (공공데이터포털) — 한 계정, 데이터셋별 "활용신청"

가입(이메일 인증, 즉시) 1회 → 각 OpenAPI마다 **활용신청** → **인증키의
"디코딩" 형태**를 env에. 자동승인 데이터셋은 키 활성화까지 **1~2시간** 여유.
개발계정 ≈ **1,000콜/일** (운영계정 전환 시 상향).

| ✓   | 데이터셋                        | 활성 ID      | env                       | 메모                                                                                     |
| --- | ------------------------------- | ------------ | ------------------------- | ---------------------------------------------------------------------------------------- |
| ☐   | 상업업무용 실거래가 RTMS        | **15126463** | `RTMS_SERVICE_KEY`        | ⚠️ 기존 `15058038`은 레거시. LAWD_CD(5자리)+DEAL_YMD. 일반건물 지번 일부 마스킹          |
| ☐   | 건축물대장 (건축HUB)            | **15134735** | `MOLIT_BUILDING_API_KEY`  | ⚠️ 레거시 `15044713`에서 **건물 PK 변경**. `&_type=json` 가능                            |
| ☐   | KPX 계통한계가격 SMP            | 15076302     | `KPX_SMP_SERVICE_KEY`     | 자동승인. 시간별 육지/제주 원/kWh                                                        |
| ☐   | 한강홍수통제소 침수심(국가하천) | 15141709     | `HRFCO_FLOOD_SERVICE_KEY` | 자동승인. 유역별 100/200/500/기왕최대, 침수심 5단계. (도시침수=15141717: 30/50/80/100년) |
| ☐   | KEPCO 분산전원 연계정보         | 15031274     | `KEPCO_DG_SERVICE_KEY`    | ⚠️ 승인방식·쿼터 **미확인** — 한전 계통데이터는 심의승인일 수 있음. 신청 시 확인         |

### C-2. 별도 포털 (data.go.kr 아님 — 각자 가입)

| ✓   | 소스                        | 등록                              | env                                                     | 메모                                                                                                                                                                  |
| --- | --------------------------- | --------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ☐   | 한국은행 ECOS               | ecos.bok.or.kr/api/#/AuthKeyApply | `BOK_ECOS_API_KEY` **+** `ECOS_API_KEY`                 | 가입 시 자동 발급, ~1일 내 호출 가능. ⚠️ **두 변수 다** 필요(대시보드/분기). StatisticTableList→StatisticItemList로 통계코드 먼저 조회. XML/JSON, 요청당 최대 ~10만행 |
| ☐   | 통계청 KOSIS                | kosis.kr/openapi                  | `KOSIS_API_KEY` **+** `KOREA_KOSIS_API_KEY`             | ⚠️ 두 변수 다                                                                                                                                                         |
| ☐   | 금감원 OpenDART             | opendart.fss.or.kr                | `DART_API_KEY`                                          | 이메일 인증 후 **40자 키 즉시**. 분기/사업보고서·재무제표                                                                                                             |
| ☐   | 금융투자협회 KOFIA          | openapi.kofia.or.kr               | `KOFIA_API_KEY` (+`KOFIA_API_URL`,`KOFIA_REQUEST_BODY`) | POST XML envelope. 등급×만기 시가평가 수익률                                                                                                                          |
| ☐   | V-World (공시지가/토지이용) | vworld.kr → dev.vworld.kr         | `VWORLD_API_KEY` **+ `VWORLD_API_DOMAIN`**              | ⚠️ 키가 **등록 도메인에 바인딩** — `&domain=` 안 맞으면 실패. PNU로 조회. 일일한도 티어별(2026 수치 미확인)                                                           |
| ☐   | 한국부동산원 R-ONE          | reb.or.kr/r-one → openApiDevPage  | `RONE_API_KEY` (+`RONE_*_STATBL_ID`)                    | 로그인 후 키 발급. 임대동향/지가/실거래지수. (data.go.kr 미러 15134761 있으나 풀시리즈는 R-ONE 포털)                                                                  |
| ☐   | 미국 FRED                   | fred.stlouisfed.org               | `FRED_API_KEY`                                          | 즉시. FEDFUNDS/DGS10/BBB 스프레드                                                                                                                                     |
| ☐   | 기상청 KMA (선택)           | data.kma.go.kr                    | —                                                       | flood/wildfire 보강                                                                                                                                                   |

### C-3. 키 없이 플래그만 (0원)

| ✓   | env                                      | 효과                                                                  |
| --- | ---------------------------------------- | --------------------------------------------------------------------- |
| ☐   | `ENABLE_WORLD_BANK_MACRO=true`           | World Bank 매크로 (keyless)                                           |
| ☐   | `ENABLE_DBNOMICS_MACRO=true`             | DBnomics 매크로 (keyless)                                             |
| ☐   | `ENABLE_THINKHAZARD=true`                | GFDRR 자연재해 등급 (keyless, adminId 필요)                           |
| ☐   | `ENABLE_OSM_GEOCODER=true`               | OSM 지오코더 (keyless)                                                |
| ☐   | `KEPCO_SUBSTATION_DATA_PATH` 또는 `_URL` | KEPCO 변전소 용량은 **공개 API 없음** → 운영자 CSV/JSON 스냅샷 파일로 |

---

## D. 함정 — 같은 데이터인데 키 변수명이 갈림 (솔로 운영자 트랩)

- **ECOS ×2**: `BOK_ECOS_API_KEY`(대시보드) + `ECOS_API_KEY`(분기) — 둘 다.
- **RTMS 엔드포인트 ×3**: `RTMS_SERVICE_KEY` + `MOLIT_API_KEY` + `MOLIT_BUILDING_API_KEY`(대장).
- **KOSIS ×2**: `KOSIS_API_KEY` + `KOREA_KOSIS_API_KEY`.
- **V-World**: KEY + DOMAIN 둘 다 (도메인 불일치 시 조용히 null).
- **인증키 Encoding vs Decoding**: `SERVICE_KEY_IS_NOT_REGISTERED` 에러 1순위.
  대부분 스택은 **Decoding 키**를 일반 파라미터로(클라이언트가 자동 인코딩);
  Encoding 키를 또 인코딩하면 깨짐. Postman 테스트는 Encoding 값.

---

## E. 유료 — 돈/계약 결정 필요 (전부 sales-led, 공개가 없음 → 견적 받기)

| ✓   | 소스                                  | 무엇                                                                 | 비용(추정·미확인)                       | 메모                                                                                                                                                                                           |
| --- | ------------------------------------- | -------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ☐   | **KYC — Sumsub**                      | 투자자 온보딩 실KYC                                                  | 건당 ~$1-2                              | `KYC_SUMSUB_WEBHOOK_SECRET`. 미설정 시 mock provider(프로덕션 throw)                                                                                                                           |
| ☐   | 신용평가 3사 (NICE신평·한기평·한신평) | **등급별 부도율/누적부도율/전이행렬/등급별 금리·스프레드**           | **무료(공시 페이지)** + 풀피드 유료     | 규제상 공시 매트릭스는 웹 무료 — PD 캘리브레이션엔 이걸로 충분할 수 있음. 머신리더블 피드/전체 아카이브만 유료. 공개 REST API 없음(B2B 피드 계약). 한기평 영업 02-368-5391 / NICE 02-2122-3500 |
| ☐   | **KIS-Value** (kisvalue.com)          | ~150만 기업 재무(1996~), PD/밸류 모델용                              | 유료(대학 번들/기업 라이선스)           | ⚠️ **KIS-Value = NICE평가정보** 제품(과거 한국신용평가정보), kisrating.com(한신평/무디스 계열 평가사)과 **무관**. 프로그램 접근은 NICE BizAPI/KISLINE(metered). 상업 재배포 라이선스 확인 필수 |
| ☐   | KODATA / 한국평가데이터               | 기업 재무 CB                                                         | 유료 구독                               | KIS-Value 대안 견적                                                                                                                                                                            |
| ☐   | CBRE / JLL / Cushman / Savills Korea  | 분기 오피스/DC/물류 리서치, 거래DB                                   | $20-100K/yr 또는 cobranded              | 보고서 manual ingest → ResearchSnapshot                                                                                                                                                        |
| ☐   | **MSCI RCA** (rcanalytics.com)        | 거래 DB(가격·매수/도자·파이낸싱·캡레이트), **DC 전용 커버리지** 있음 | low~mid 5자리 USD/seat~, 멀티마켓 6자리 | 딜 comp용. DI API(토큰). ⚠️ Korea/APAC·DC가 라이선스 범위에 포함되는지 계약 전 확인. RCA_Service@msci.com                                                                                      |
| ☐   | MSCI Real Estate (IPD)                | 펀드/자산 **성과 벤치마킹**(연간 Korea Property Index)               | mid 5자리~6자리 USD/yr                  | 본인 자산 데이터 기여+검증 사이클 필요. 거래DB 아님 — 보통 RCA 먼저                                                                                                                            |
| ☐   | AI 기능                               | 문서추출/리서치/내러티브                                             | 종량제                                  | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` (선택)                                                                                                                                                  |

---

## 추천 순서

1. **1일차 (출시 게이트)**: A(인프라) + B(로그인·크론) + 시크릿 → `npm run prod:preflight` 통과.
2. **2일차**: C-1 (data.go.kr 묶음) + C-3 (플래그). 분석기/재해 표면이 mock에서 벗어남.
3. **3일차**: C-2 (ECOS·KOSIS·DART·KOFIA·V-World·R-ONE·FRED). 매크로 STALE fallback 제거.
4. **그 다음**: E 유료 — 무료 신용평가 공시 매트릭스로 PD 캘리브레이션 시작, 필요 시 RCA/KIS-Value 견적.

> 최종 게이트: 프로덕션 env 로드 상태에서 `npm run prod:preflight` 통과(블로커
> A·일부 B 강제). 모든 유료 비용은 추정치 — 반드시 서면 견적.
