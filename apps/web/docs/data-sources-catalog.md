# KR Real Estate Data Sources Catalog

리서치 / 평가 input source 전체 카탈로그. 각 source 별 endpoint / 라이선스 / refresh 주기 / 우리 코드 통합 위치.

---

## Tier A — 무료 KR 정부 / 공공 source

### MOLIT 국토교통부 — 실거래가 공시
- **endpoint**: https://rt.molit.go.kr/ (조회), 공공데이터포털 API
- **데이터**: 매월 공시되는 부동산 실거래가 (주거 / 상업 / 토지)
- **라이선스**: 무료 / 공공데이터포털 인증키 필요
- **refresh**: 월 1회 (당월 자료는 익월 공개)
- **field**: 거래가격 / 면적 / 위치 / 거래일 / 건축연도
- **통합 위치**: `lib/sources/adapters/molit-real-transaction.ts` (TODO 신규)
- **저장**: `TransactionComp` (assetId NULL = market-wide)
- **용도**: hedonic regression / cap rate calibration / submarket benchmark

### KOSIS 통계청 OpenAPI
- **endpoint**: https://kosis.kr/openapi/
- **데이터**: 광역시도 GRDP / 인구 / 산업 / 전력소비 / 건설투자 / 물가
- **라이선스**: 무료 / 사용자 등록 (`userStatsId` 발급)
- **refresh**: 시계열 종류별 다름 (월간 / 분기 / 연간)
- **통합 위치**: `lib/sources/adapters/kosis*.ts` (이미 일부 구현)
- **저장**: `MacroSeries` / `MarketIndicatorSeries`
- **용도**: macro overlay engine input

### BOK ECOS 한국은행 경제통계시스템
- **endpoint**: https://ecos.bok.or.kr/api/
- **데이터**: 정책금리 / 국채금리 / 환율 / M2 / 산업별 대출 / 부동산 PF 잔액
- **라이선스**: 무료 / API 키
- **refresh**: 일간 / 월간
- **통합 위치**: `lib/sources/adapters/bok-ecos*.ts` (일부 구현)
- **저장**: `MacroSeries`
- **용도**: cap rate prior / discount rate prior / debt cost forecast

### KAMCO 한국자산관리공사 — 공매 가격
- **endpoint**: https://www.onbid.co.kr/ (오픈비드)
- **데이터**: 부실채권 / 압류 부동산 공매 가격 (distressed comp)
- **라이선스**: 사이트 크롤링 필요 (공식 API 없음 → 별도 ingest)
- **refresh**: 주간
- **통합 위치**: `lib/sources/adapters/kamco-public-sale.ts` (TODO)
- **저장**: `TransactionComp` (sourceSystem = 'kamco-public-sale')
- **용도**: stress / downside scenario calibration

### 한국부동산원 R-ONE
- **endpoint**: https://www.reb.or.kr/r-one/
- **데이터**: 분기 cap rate index (sector × region), 임대가격지수
- **라이선스**: 무료 / 일부 paid
- **refresh**: 분기
- **통합 위치**: `lib/sources/adapters/reb-r-one.ts` (TODO)
- **저장**: `MarketIndicatorSeries`
- **용도**: cap rate decomposition baseline

### DART 금융감독원 전자공시
- **endpoint**: https://opendart.fss.or.kr/
- **데이터**: 상장사 분기/사업보고서 + REIT / SPC 자산별 NAV / 매각이익 / 임대료
- **라이선스**: 무료 / API 키
- **refresh**: 분기 (3-6개월 lag)
- **통합 위치**: `lib/sources/adapters/dart*.ts` (강화 필요)
- **저장**: `FinancialStatement` / `SponsorPriorDeal` / `RealizedOutcome`
- **용도**: tenant credit / sponsor track record / sponsor financials

### KEPCO 한국전력
- **endpoint**: 일부 데이터 (전력거래소 KPX), 변전소 capacity는 한전 직접 문의 / 계통운영자료
- **데이터**: 변전소별 잔여용량 (DC 핵심), 산업용 tariff schedule
- **라이선스**: 일부 무료 (KPX) / 일부 비공개
- **refresh**: 분기 (capacity), 월 (tariff)
- **통합 위치**: `lib/sources/adapters/kepco-substation.ts` (TODO — DC niche moat)
- **저장**: `EnergySnapshot` 확장 필드 + 신규 `SubstationCapacity` 모델
- **용도**: DC supply 공급 제약 모델 (uniquely KR)

### 국토부 빌딩정보시스템 (BIS)
- **endpoint**: 건축물대장 API (공공데이터포털)
- **데이터**: 건축물 면적 / 용도 / 준공년도 / 구조 / 주차장 / 정화조
- **라이선스**: 무료 / 인증키
- **refresh**: 변동 시 (건축물대장 갱신)
- **통합 위치**: `lib/sources/adapters/molit-building-record.ts` (일부 구현)
- **저장**: `BuildingRecord`
- **용도**: hedonic regression vintage / 면적 통제

### 기상청 KMA
- **endpoint**: 기상자료개방포털
- **데이터**: 일강수량 / 풍속 / 온도 / 호우 경보 이력
- **라이선스**: 무료 / 인증키
- **refresh**: 일간
- **통합 위치**: `lib/sources/adapters/kma-weather.ts` (TODO)
- **저장**: `HazardObservation` (hazardType = 'FLOOD' / 'STORM')
- **용도**: SiteProfile flood risk score 정밀화

### KIGAM 한국지질자원연구원 — 활성단층 / 지진위험
- **endpoint**: 단층 GIS 데이터 (별도 다운로드)
- **데이터**: 활성단층 위치, 지진 위험도 grid
- **라이선스**: 학술 / 비영리 무료
- **refresh**: 비정기 (연구 갱신 시)
- **통합 위치**: `lib/sources/adapters/kigam-fault.ts` (TODO)
- **저장**: `HazardObservation` (hazardType = 'SEISMIC')
- **용도**: SiteProfile seismic risk score 정밀화

### NASA POWER / FIRMS (이미 구현)
- **endpoint**: https://power.larc.nasa.gov/, https://firms.modaps.eosdis.nasa.gov/
- **데이터**: 기후 climatology (POWER), 산불 hotspot (FIRMS)
- **라이선스**: 무료
- **refresh**: 일간
- **통합 위치**: `lib/sources/adapters/nasa-*.ts` (구현 완료)
- **용도**: SiteProfile flood / wildfire score

### 국세청 — 공시지가
- **endpoint**: 공공데이터포털, 부동산 종합공부시스템
- **데이터**: 표준지 / 개별공시지가
- **라이선스**: 무료
- **refresh**: 연 1회 (5월)
- **통합 위치**: `lib/sources/adapters/nts-public-land-value.ts` (TODO)
- **저장**: `Parcel.officialLandValueKrw`
- **용도**: 토지 가치 비교군

---

## Tier B — Paid / Partnership (6-12개월)

### CBRE Korea Research
- **데이터**: 분기 Seoul Office / KR DC / Logistics 보고서, 거래 DB
- **라이선스**: subscription 또는 cobranded research
- **refresh**: 분기
- **추정 비용**: $30-100K/yr 또는 cobranded 협의
- **integration**: 보고서 manual ingest → 우리 ResearchSnapshot

### JLL Korea / Cushman Korea / Savills Korea / Colliers
- **데이터**: 동일 (각 firm view)
- **라이선스**: 동일
- **추정 비용**: $20-80K/yr per firm

### Real Capital Analytics (RCA / MSCI Real Estate)
- **endpoint**: API + dashboard
- **데이터**: APAC 거래 DB, 5,000+ KR 거래 trace
- **라이선스**: enterprise subscription
- **refresh**: 월간
- **추정 비용**: $50-150K/yr
- **integration**: API → `TransactionComp` bulk ingest

### Costar / Origis
- **데이터**: 글로벌 RE intelligence (US-strong, KR-thin)
- **라이선스**: enterprise
- **추정 비용**: $40-100K/yr
- **우선순위**: 낮음 (KR coverage 약함)

### Cushman Asia Logistics Quarterly
- **데이터**: APAC industrial / logistics rent index
- **라이선스**: paid subscription
- **추정 비용**: $10-30K/yr

---

## Tier C — Proprietary 큐레이션

### Tenant 신용 시계열
- **소스**: DART 분기보고서 자동 추출 + LLM normalize
- **schema**: `FinancialStatement` 시계열 (이미 가능, 큐레이션 부족)
- **작업**: DART scraper + KR 임차 후보 100+ 기업 watch list
- **refresh**: 분기

### Sponsor track record
- **소스**: DART + 보도자료 + LP 공시 (NPS / KIC 분기보고)
- **schema**: `Sponsor` / `SponsorPriorDeal` (이미 있음)
- **작업**: 매뉴얼 큐레이션 + LLM 초안

### Brokerage flow (private)
- **소스**: brokerage 관계 (operator 직접 입력)
- **schema**: `DealFlowEntry` (이미 있음)
- **작업**: 운영 프로세스 — 매주 broker call → DealFlowEntry 입력

### Sentiment / news
- **소스**: 한국경제 / 매일경제 / 빌딩정보 / 한국주택신문 RSS
- **작업**: LLM batch job → daily sentiment scoring per submarket
- **schema**: 신규 `MarketSentiment` 모델 (TODO)
- **refresh**: 일간

---

## Adapter 작성 표준 패턴

`lib/sources/adapters/<source>.ts` 표준 구조:

```ts
export type FetchOptions = {
  market?: string;
  asOf?: Date;
  bypassCache?: boolean;
};

export async function fetch<X>(opts: FetchOptions): Promise<NormalizedRow[]> {
  // 1. SourceCache 조회 (cacheKey, freshness)
  // 2. cache miss / stale → 실제 endpoint 호출
  // 3. retry / rate-limit / circuit-breaker
  // 4. 응답 parse → 우리 schema 표준 형태로 normalize
  // 5. SourceCache 갱신 + freshness label 설정
  // 6. SourceOverride 병합 (manual 수정 우선)
  // 7. 반환
}
```

각 adapter는 `getDocumentStorageFromEnv()` 처럼 env-aware factory.

---

## refresh cadence 운영

| Cadence | source | 자동 / 수동 |
|---|---|---|
| 일간 | KMA / NASA POWER / FIRMS | 자동 cron |
| 주간 | KAMCO / news sentiment | 자동 cron |
| 월간 | MOLIT 실거래가 / KEPCO tariff | 자동 cron |
| 분기 | KOSIS / BOK / R-ONE / DART | 자동 cron |
| 연간 | 공시지가 / KIGAM 단층 | 수동 trigger |
| 이벤트 | CBRE / JLL 보고서 / Special | 수동 ingest |

`scripts/run-ops-cycle.ts` 가 source refresh 통합 entrypoint.

---

## 우선순위 — 첫 3개월

| # | source | 이유 |
|---|---|---|
| 1 | **MOLIT 실거래가** | 모든 quant 모델의 raw input. 1만+ comp 한 번에 |
| 2 | **R-ONE cap rate index** | cap rate decomposition baseline |
| 3 | **DART REIT 자료** | sponsor track + tenant credit 동시 |
| 4 | **KEPCO 변전소** | DC niche moat 시작 |
| 5 | **KMA / KIGAM** | hazard score 정밀화 |

---

## 더 읽기

- [research-roadmap.md](./research-roadmap.md) — 4 pillar 큰 그림
- [data-model-cheatsheet.md](./data-model-cheatsheet.md) — TransactionComp / MacroSeries 등 schema
- [system-flow.md](./system-flow.md) — Stage 2 enrichment에서 adapter 동작
- 루트 [architecture.md](../../architecture.md) — adapter / SourceCache / SourceOverride 시스템
