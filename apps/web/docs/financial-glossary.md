# Financial Glossary (한국어)

IM에 등장하는 재무 / 투자 용어. LP가 보는 모든 헤드라인 숫자를 이 사전 안에서 정의 가능하도록 구성.

---

## 손익 / 가치평가

### EBITDA (이비타)
Earnings Before Interest, Taxes, Depreciation, Amortization. 영업이익 + 감가상각. 자본구조 중립적인 영업현금흐름 proxy. **PE / REPE의 첫 번째 metric**.

### EBIT
EBITDA − D&A. 본격적 영업이익. 부채비용(이자) 차감 전.

### Net income (post-tax)
EBIT × (1 − tax rate) − interest × (1 − tax rate). 진짜 순이익. **EBITDA − interest는 Net income 아님** (D&A 빠짐).

### NOI (Net Operating Income)
부동산-specific. 임대수입 − 운영비. EBITDA의 부동산 버전. 자본 비용은 차감 안 함.

### Going-in yield
매입 cap rate. NOI / 매입가. 진입 시점의 실효 수익률.

### Exit cap rate
매각 시점 가정 cap rate. NOI(Year-N) / 매각가. terminal value 산정.

### Cap rate
Capitalization rate = NOI / Value. 부동산 valuation의 가장 기본 비율. 낮을수록 비싸게 거래됨.

### IRR (Internal Rate of Return)
연환산 수익률. 모든 cash flow의 NPV = 0 되게 하는 할인율. **Equity IRR vs Unlevered IRR**:
- Unlevered: 부채 없는 가정의 IRR
- Equity: 실제 LP 입장의 levered IRR

### Equity multiple (MOIC)
Multiple of Invested Capital. 총 distributions / initial equity. **2.5x = 투자한 1원이 2.5원으로 회수**.

---

## Capital Structure / Debt

### Leverage (Debt / EBITDA)
부채 배수. 4.0x = EBITDA의 4년치만큼 부채. **PE 일반적 covenant 4.0-4.5x**.

### Net leverage = (Debt − Cash) / EBITDA
현금 차감한 순부채 배수. 회사가 보유한 현금은 부채 변제 가능하니까.

### DSCR (Debt Service Coverage Ratio)
부채상환계수. CFADS / (이자 + 원금). **1.0 = 겨우 cover, 1.2-1.5 = lender 일반 minimum**.
- **EBITDA-based coverage** = EBITDA / interest only — loose definition
- **CFADS DSCR** = (FCF + interest) / (interest + principal) — lender-grade tight

### CFADS (Cash Flow Available for Debt Service)
부채상환 가능 현금흐름. EBITDA − cash tax − maintenance capex − ΔWC. 진짜 lender가 보는 지표.

### LTV (Loan-to-Value)
대출/가치 비율. 60-70% 일반적. 부동산 underwriting의 가장 기본.

### Interest coverage
EBITDA / interest expense. 이자 cover 배수. **2.0x 이하 = lender minimum**, 3.0x 이상 = comfortable.

### Balloon payment
만기 일시상환액. 7년 amortization, 15% balloon → 7년간 85% 분할상환 + 15% 만기 일시상환.

### Sculpted amortization
DSCR 일정하게 유지되도록 원금상환 스케줄을 cash flow에 맞춰 조정. project finance 표준.

---

## Cash Flow

### FCF (Free Cash Flow)
EBITDA − cash tax − maintenance capex − ΔWC. 부채 / 주주에 분배 가능한 현금.

### OCF (Operating Cash Flow)
영업활동 현금흐름. 회계기준 = EBITDA − cash tax − ΔWC. (FCF는 capex까지 차감)

### CFADS
위 [DSCR 항목] 참조.

### Working capital (WC)
Current assets − current liabilities. 영업운전자본. 매출채권 / 재고 / 매입채무 합산.

### D&A (감가상각)
Depreciation & Amortization. 비현금 비용. EBITDA에서 빼면 EBIT.

---

## Equity / 분배

### Hurdle rate (preferred return)
LP에게 우선 배당하는 수익률 threshold. 8-10% 일반적. **이거 넘기 전엔 GP 한 푼도 못 받음**.

### Promote / Carried interest
Hurdle 초과 부분에 대한 GP 몫. 15-20% 일반적. **"2 and 20"의 20**.

### Catch-up
LP가 hurdle 받는 동안 GP 못 받은 거 따라잡는 단계. catch-up 후 carry split 도달.

### Waterfall
Capital return → Preferred → Catch-up → Carry. 4-tier 표준 분배 구조. American (deal-by-deal) vs European (whole-fund) 두 종류.

### MFN (Most-Favored-Nation)
LP 측 보호조항. 다른 LP에 부여한 더 좋은 economic term이 자동 적용됨. **side letter의 핵심 항목**.

### TVPI / DPI / RVPI
- TVPI = Total Value to Paid-In = (현재 NAV + 분배) / 투자
- DPI = Distributions to Paid-In = 실현된 분배 / 투자
- RVPI = Residual Value to Paid-In = 남은 NAV / 투자

---

## Tenancy / 임대

### WALT (Weighted Average Lease Term)
잔존 임대기간 가중평균. **Σ(termYears × leasedKw) / Σ(leasedKw)**. 6년 이상 = 안정적.

### Mark-to-Market (MTM) gap
계약 임대료 vs 시장 임대료 차이. (블렌디드 시장 / 블렌디드 계약 − 1). 양수 = 재계약 시 rent up 가능.

### Triple net (NNN) lease
임차인이 부동산세 + 보험 + 운영비 다 부담. landlord NOI = gross rent.

### Recoverable opex
임차인에게 청구 가능한 운영비. NNN/CAM 구조에 따라 달라짐.

### TI / LC (Tenant Improvement / Leasing Commission)
신규/갱신 임차 시 landlord가 지출하는 fit-out 비용 + 중개수수료.

---

## Risk / Covenant

### Covenant
대출 약정 조건. 깨면 default 또는 cash sweep / spring covenant 발동.
- **Maintenance covenant**: 분기마다 test (예: leverage ≤ 4.0x)
- **Incurrence covenant**: 추가 차입 시점에만 test
- **Springing covenant**: revolver 일정 비율 이상 사용 시에만 발동

### Headroom
covenant까지의 거리. 3.89x leverage / 4.0x covenant = 2.7% headroom.

### CFADS DSCR covenant
일반적으로 lender는 1.20-1.30x minimum 요구. project finance는 1.40x 이상.

### Cash sweep
covenant 깨질 위험 시 잉여 cash를 강제로 부채상환에 투입.

---

## Sensitivity / Scenario

### Bull / Base / Bear
시나리오 3분할. cap rate / occupancy / rent growth 가정 변화.

### Sensitivity matrix
2축 shock (예: EBITDA -20% × Rate +200bps) 결과 grid. PE / project finance 표준.

### Stress test
극단 시나리오에서 covenant 깨지는지 확인.

---

## ESG / 탄소

### Scope 1
직접 배출. 자가 발전기 / 차량 / 가스 보일러 등.

### Scope 2 (location-based vs market-based)
구매 전기. **LB**: 지역 grid 평균 emission factor. **MB**: 실제 PPA / I-REC 반영. **GHG Protocol은 둘 다 보고 권장 (dual reporting)**.

### Scope 3
구매 자재의 embodied carbon, 이용자 이동, downstream 등. 가장 어렵고 보통 제일 큼.

### PUE (Power Usage Effectiveness)
데이터센터 효율 = 전체 facility 전력 / IT 전력. **1.0이 이론적 최대**, 1.2 = 우수, 1.5+ = 비효율.

### Renewable share
구매 전력 중 PPA / 재생에너지 cert 비율.

### tCO2e
이산화탄소 환산 톤. CH4 / N2O 등도 CO2 영향력으로 환산.

---

## 한국 시장 특화

### KOSIS / BOK ECOS
한국 통계청 / 한은 경제통계시스템. 거시 시계열 official source.

### DART
금융감독원 전자공시. 상장사 filing의 1차 출처.

### KEPCO
한국전력. industrial tariff schedule 출처.

### REIT (KR REIT)
부동산투자회사. KOSPI 상장 가능. 90% 이상 분배 의무.

### SPV / SPC
Special Purpose Vehicle / Company. 펀드의 자산보유 vehicle.

### Acquisition tax (취득세)
KR 한정 4.6% (부동산). 매입 가격 기준. 펀드 / SPV 구조에 따라 share-purchase 시 다른 base.

### Transfer tax (양도세)
exit 시 1.2% (corporate). 양도가 기준.

---

## 더 읽기

- [im-architecture.md](./im-architecture.md) — IM 시스템 구조
- [financial-helpers.md](./financial-helpers.md) — helper 함수 reference
- [valuation-variables.md](./valuation-variables.md) — engine input 변수 정의
