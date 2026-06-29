# 창업지원 심사 준비 가이드 (Startup-grant review prep)

> 목적: 내년 창업지원 **심사(서류 + 발표 + 데모)** 통과를 위한 준비 체크리스트.
> 이 문서는 새 내용을 만들지 않고, 이미 레포에 있는 자료를 **심사 관점(PSST)** 으로
> 묶어줍니다. 원본은 각 섹션의 링크 문서를 보세요.

## 0. 핵심 전략 (먼저 읽기)

심사위원은 **코드 품질을 읽지 않습니다.** 보는 건 ① 사업계획서 ② 발표(IR) ③ 데모.
대부분의 지원자는 PPT만 들고 오지만 **우리는 작동하는 플랫폼이 있다** — 이게 최대 무기.
그러니 우선순위는 "버그 더 잡기"가 아니라 **"데모가 안 터지고, 스토리가 설득되게"** 입니다.

가장 강한 포지셔닝 한 줄:
> "엔진(리서치→언더라이팅→딜→포트폴리오→토큰화 레지스트리)은 완성됐고,
> 지금은 seed+mock으로 end-to-end 작동한다. 정부지원금은 **실데이터·체인배포·KYC 연동**에
> 쓴다." → 이게 자금사용계획의 근거가 됨.

⚠️ **절대 하지 말 것:** mock/seed 데이터를 "라이브 실데이터"라고 말하기. 찌르면 신뢰 붕괴.
"엔진 완성, 연동만 남음"이 정직하면서도 가장 강한 메시지.

---

## 1. PSST 매핑 (사업계획서 골격)

한국 창업지원(예비/초기/도약/TIPS)은 보통 **PSST**로 평가합니다. 각 항목에 "할 말"과
"증빙(레포 자산)"을 붙였습니다.

### P — Problem (문제인식)
- 한국 상업용/데이터센터 부동산 투자·운용의 페인포인트: 언더라이팅이 수작업·엑셀 분산,
  실거래/거시/리스크 데이터가 파편화, IC(투자심의) 문서·감사추적이 비표준, RWA 토큰화는
  규제(ERC-3643)·검증 장벽.
- **TODO(직접 채우기):** 시장규모(TAM/SAM/SOM), 타깃 고객(운용사/리츠/LP), 기존 대안의 한계,
  인터뷰/설문 등 고객검증 근거. ← *이 부분이 우리 레포에 없는, 직접 채워야 할 핵심.*

### S — Solution (실현가능성) ← **데모로 압도하는 구간**
이미 작동하는 것 (증빙):
- **AI 언더라이팅 엔진**: 주소 입력 → 지오코딩 → 다수 커넥터 → DCF/몬테카를로/워터폴 →
  기관급 리포트. (`/property-analyze`, `app/property-analyze/_sections/*`)
- **운용사 OS**: 리서치 → 증빙리뷰 → 언더라이팅 → IC 거버넌스 → 딜 실행 → 포트폴리오 →
  캐피탈 셸. (`/admin/*`, 데모 순서는 `demo-script.md`)
- **재무제표 엑셀 출력**: IS/BS/CF 비교표를 진짜 `.xlsx`로 (타입드 숫자·브랜드 서식,
  카운터파티별 분리). (`/api/admin/exports/financials`)
- **온체인 레지스트리 + 문서해시 앵커링 + NAV 어테스테이션** (registry-only, ERC-3643 스택).
- **기관급 운영 기반**: 감사추적(해시체인), 운영자 보안(세션/SSO/SCIM/스코프 권한),
  ops 큐·알림·재처리.
- 참고: `investment-firm-os-overview.md`, `rwa-architecture.md`, `system-flow.md`.

### S — Scale (성장전략)
- 수익모델 후보: SaaS 구독(운용사 시트), 언더라이팅 리포트 건당, 토큰화 발행/관리 수수료,
  데이터·IM 생성 부가.
- 확장 로드맵: 한국 오피스/DC → 전 자산군 → 글로벌. (`global-market-rollout-plan.md`,
  `real-estate-generalization-plan.md`, `rwa-roadmap.md`)
- **TODO:** 가격표, 파이프라인/LOI, 파트너십, 3개년 매출 추정.

### T — Team (팀)
- 기술 증빙 = 이 플랫폼 자체(작동하는 풀스택 + 온체인 + 데이터 파이프라인).
- **TODO:** 창업자/팀 이력, 도메인 전문성(부동산금융·블록체인), 자문단.

---

## 2. 데모 (심사장 발표용)

- 전체 흐름: **`demo-script.md`** (research→review→underwriting→IC→deal→portfolio→
  capital→registry→ops, seed 자산 `SEOUL-YEOUIDO-01`(오피스)/`SEOUL-GANGSEO-01`(DC)).
- **3분 압축 버전(추천):**
  1. `/property-analyze`에 주소 입력 → 몇 초 만에 DCF/IRR/워터폴 리포트가 뜨는 장면(가장 임팩트 큼)
  2. `/admin/deals` → 딜 한 건의 언더라이팅·IC 패킷·감사추적
  3. 재무제표 엑셀 다운로드 → 진짜 Excel로 열리는 것 보여주기
  4. `/admin/registry` → 문서해시 온체인 앵커링(토큰화 차별점)
- **데모 안정성:** 30-에이전트 감사로 발견한 크래시·이상수치 버그를 계속 수정 중
  (로거 크래시, 워터폴 promote 절벽, 재무 엑셀 섞임, ops 중복실행 등 → PR #214~). 데모 직전
  `npm run dev`로 위 4개 흐름을 반드시 리허설.

---

## 3. 데이터·연동 현황 → 지원금 사용처 (가장 중요한 표)

심사위원 단골 질문 "데이터 진짜 있냐?"에 대한 정직한 답 + 자금계획 근거.

| 구분 | 지금 상태 | 필요한 것 | 지원금 사용처 |
|------|-----------|-----------|----------------|
| 거시/하자드/POI 데이터 | **키 없이 라이브 가능**(World Bank/DBnomics/ThinkHazard/PeeringDB/OSM) | 플래그만 on | (무료) |
| 실거래/등기/공시 등 키 필요 데이터 | mock 작동 | 발급키 7종+ | API 비용·계정 |
| 온체인 발행 | mock-mode 작동 | 실 체인 배포 + **Waterfall.sol 외부 감사** | 감사비·가스·인프라 |
| KYC/AML | mock 작동 | 실 KYC 프로바이더 연동 | 프로바이더 계약 |
| 운영 인프라 | 로컬/seed | 프로덕션 시크릿·Upstash·S3 | 클라우드·운영비 |

- 상세 키/플래그: **`DATA_KEYS.md`** (Tier 0 keyless부터 켜는 순서까지). 검증: `npm run data:smoke`.
- 출시 게이트 전체: **`go-live-checklist.md`**, 갭 분석: `institutional-readiness-gap-analysis.md`.
- **메시지:** "엔진은 완성, 위 표의 외부 연동만 남았고 그게 정확히 이번 지원금 용도."

---

## 4. 발표 직전 체크리스트

- [ ] 3분 데모 흐름 리허설(위 §2 4단계), 각 화면 1회씩 실제 클릭
- [ ] seed 데이터가 "스토리"로 읽히는지 확인(여의도 오피스 / 강서 DC 두 케이스)
- [ ] mock/seed라는 점을 정직하게 말할 한 문장 준비(§0)
- [ ] 데이터·자금 표(§3) 한 장으로 출력
- [ ] PSST 빈칸(시장규모·고객검증·수익모델·팀) 채우기 ← 레포 밖, 직접 작성
- [ ] 기술 차별성 1장: 온체인 레지스트리 + AI 언더라이팅 + 데이터 파이프라인 결합

---

## 5. 참고 문서 색인 (이미 레포에 있음)

- 데모: `demo-script.md`
- 데이터 활성화/키: `DATA_KEYS.md` · 데이터 소스 카탈로그: `data-sources-catalog.md`
- 출시 게이트: `go-live-checklist.md` · 운영: `operations-runbook.md` / `production-runbook.md`
- 제품 개요: `investment-firm-os-overview.md` · 시스템 흐름: `system-flow.md`
- 토큰화/RWA: `rwa-architecture.md` · `rwa-roadmap.md` · `tokenization-stack.md`
- 준비도/갭: `institutional-readiness-gap-analysis.md` · `platform-readiness-audit.md`
- 확장: `global-market-rollout-plan.md` · `real-estate-generalization-plan.md`

> 이 문서는 "묶음/색인 + 심사 관점"만 담습니다. 사실(데이터·키·게이트)의 단일 출처는
> 위 원본 문서들이며, 변경 시 원본을 먼저 고치세요.
