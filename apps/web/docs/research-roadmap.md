# Research Roadmap (KR Real Estate, Top-tier reach)

CBRE / JLL / Cushman / Savills 한국 리서치 수준에 도달하기 위한 4-pillar 계획. 6개월 incremental 로드맵 + KR DC niche 특화 전략.

---

## 현재 vs 목표

| 영역 | 우리 현재 | 최고급 (CBRE Korea / JLL / Cushman) |
|---|---|---|
| **Cap rate DB** | TransactionComp schema + 시드 2건 | 30+ 년 by submarket × tier × class |
| **Quant** | Macro overlay × scenario shift | Hedonic regression / VAR / state-space / Monte Carlo |
| **Publication** | ResearchSnapshot 거버넌스만 | Quarterly + monthly + deep-dive 분리 cadence |
| **Submarket hierarchy** | 평면 (market = "KR") | Country → Market → Submarket → Cluster |
| **Tenant data** | TenantDemand / FinancialStatement | Industry breakdown / RFP volume / migration model |
| **Supply pipeline** | PipelineProject (assetId-tied) | Stage transition probability / sponsor track 통합 |

→ **Gap = 데이터 depth + quant rigor + publication cadence**. Schema 인프라는 70%.

---

## 4 Pillar

### Pillar 1 — 데이터 수집 확장

**Tier A (즉시 / 무료 KR 정부 source)**
- MOLIT 국토부 — 월간 실거래가 공시
- KOSIS 확장 — 광역시도 GRDP / 전력소비 / 건설투자
- KAMCO — 부실 / 압류 부동산 공매 (distressed comp)
- 한국감정원 R-ONE — 분기 cap rate index
- DART 강화 — REIT / SPC 자산별 NAV / 매각이익
- KEPCO — 변전소 잔여용량 (DC 핵심)
- 기상청 KMA / KIGAM — flood / seismic 정밀화

**Tier B (paid / 관계 6-12개월)**
- CBRE Korea / JLL Korea cobranded research
- RCA / MSCI APAC 거래 DB
- Costar / Origis 글로벌 RE intelligence
- Cushman 한국 leasing 보고서

**Tier C (proprietary 큐레이션)**
- Tenant 신용 시계열 — DART에서 임차 후보 분기 EBITDA 자동 추적
- Sponsor track record — KR PE / REIT 매각 IRR 큐레이션
- Brokerage flow — DealFlowEntry 강화

### Pillar 2 — Quant 분석층

| 모델 | 목적 | 결과 |
|---|---|---|
| **Cap rate decomposition** | RFR + premium + growth + obsolescence 분해 | engine cap rate prior |
| **Hedonic regression** | size / vintage / submarket / tier 통제 | 신규 자산 비교군 fitted price |
| **VAR / state-space** | rent ↔ vacancy ↔ pipeline ↔ macro | rent / occupancy 12개월 forecast |
| **Supply-demand 균형 (DC)** | demand vs pipeline weighted by stage | submarket vacancy / rent path |
| **Tenant credit migration** | rating × sector × term → P(default) | NOI risk-adjustment |
| **Monte Carlo stress** | macro shock 결합 5000 path | VaR / ES distribution |
| **Sentiment scoring** | 한국 RE 뉴스 LLM 점수 | lead indicator |
| **Cross-asset correlation** | REIT × direct × CMBS × equity | portfolio risk attribution |

### Pillar 3 — Research Production

| 산출물 | 주기 | 자동화 vs 큐레이션 |
|---|---|---|
| **KR DC Quarterly** (대표) | 분기 | 데이터 자동 + LLM 초안 + analyst 승인 |
| **Seoul Office Pulse** | 월간 | 거의 자동 (dashboard) |
| **Submarket Deep-dive** | 반기 | 큐레이션 중심 |
| **Special Reports** | 이벤트 기반 | 큐레이션 |

기존 `ResearchSnapshot` 모델 (SOURCE vs HOUSE + approval 거버넌스) 그대로 활용.

### Pillar 4 — KR DC Niche Specialization (Moat)

CBRE / JLL이 못 따라올 영역:
1. **AI training capacity 모델** — 글로벌 5위권 AI 인프라, KR 고유 전력 / 토지 제약
2. **KEPCO 접속 큐 분석** — 변전소 capacity = supply의 진짜 제약
3. **Hyperscaler 자체 capacity vs 임대 비율** — 삼성 / 네이버 / 카카오 / NHN
4. **반도체 산단 인접 DC** — 파운드리 클러스터 확장과 DC 수요 연결
5. **지역 risk premium** — 북한 안보 → 인천 vs 수도권 cap rate 차이

---

## 6개월 실행 계획

| Week | 작업 | 산출물 |
|---|---|---|
| 1 | research-roadmap.md + data-sources-catalog.md | 학습 + plan 정렬 |
| 2 | `lib/services/research/hedonic.ts` + 단위 테스트 | TransactionComp → fitted price |
| 3 | `lib/services/research/cap-rate-decomposition.ts` | RFR + premium + growth 분해 |
| 4 | Pipeline stage transition / supply-demand | PipelineProject 확장 |
| 5 | Quarterly publication framework | 자동 차트 + LLM 초안 + analyst 승인 |
| 6 | News sentiment LLM batch + KEPCO ingest | DC niche moat 본격화 |

---

## 우선순위

**가장 ROI 높은 첫 작업**:
1. **MOLIT 실거래가 adapter** — TransactionComp 데이터를 1만+ row로 채우면 다른 모든 quant 모델의 input
2. **Hedonic regression** — 학술적이고 실무가치 큰 helper. 새 자산 every IM에 fitted-price 비교군 자동 표시 가능
3. **Cap rate decomposition** — engine prior로 직접 들어가서 valuation quality 즉시 향상

**다음 우선순위**:
- Submarket hierarchy 정규화 (현재 평면)
- Pipeline stage transition probability
- Tenant credit migration

**나중에**:
- Cross-asset correlation
- Sentiment scoring

---

## 측정 지표

리서치 quality KPI:

| 지표 | 현재 | 6개월 목표 |
|---|---|---|
| TransactionComp 행 수 | ~10 | 5,000+ |
| RentComp 행 수 | ~2 | 2,000+ |
| Submarket 수 (계층화) | 평면 | 50+ tagged |
| Quant model 수 | 1 (overlay) | 8 |
| Quarterly publication | 0 | 1 발간 |
| Helper 단위 테스트 | 0 | 30+ |

---

## 더 읽기

- [data-sources-catalog.md](./data-sources-catalog.md) — KR 데이터 source 전체 카탈로그
- [im-architecture.md](./im-architecture.md) — IM 시스템 (research output consumer)
- [data-model-cheatsheet.md](./data-model-cheatsheet.md) — TransactionComp / RentComp / ResearchSnapshot
- [valuation-variables.md](./valuation-variables.md) — engine input 변수 정의
