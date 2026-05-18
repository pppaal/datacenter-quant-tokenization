# Seed Data Reference

`prisma/seed.ts` (+ 후속 SQL inserts)에 들어있는 가상 데이터 — IM에서 보이는 모든 숫자의 출처.

---

## Asset

| Field | Value |
|---|---|
| assetCode | `SEOUL-GANGSEO-01` |
| name | Seoul Hyperscale Campus I |
| slug | `seoul-gangseo-01-seoul-hyperscale-campus` |
| assetClass | DATA_CENTER |
| status / stage | INTAKE / SCREENING |
| market | KR |
| description | "Seeded underwriting case ... west Seoul hyperscale development with strong metro demand, dense fiber routes, and a still-active power allocation workstream." |
| sponsorName | Nexus Infrastructure Advisory |
| powerCapacityMw | 32 |
| capexAssumptionKrw | ₩246B |
| holdingPeriodYears | 10 |
| address | 148 Gonghang-daero, Gangseo-gu, Seoul |

---

## Site / Building / Energy / Permit

| Snapshot | Key fields |
|---|---|
| **SiteProfile** | flood 1.8 / wildfire 0.8 / seismic 1.1 |
| **BuildingSnapshot** | (basic structure / floors / GFA) |
| **PermitSnapshot** | (permit stage / env review) |
| **EnergySnapshot** | utility KEPCO West Seoul · substation 1.2km · tariff 143 KRW/kWh · PUE 1.31 · renewable 32% · backup 48hr |
| **MarketSnapshot** | submarket Gangseo macros |

---

## Sponsor / Counterparties

3 counterparties 모두 같은 자산에 연결:

| Name | Role | Score | Risk | Periods on file |
|---|---|---|---|---|
| **Nexus Infrastructure Advisory** | SPONSOR | 71 | MODERATE | 3 (FY 2023 → 2025) |
| **Domestic Cloud Anchor A** (DCA-A) | TENANT | 88 | LOW | 2 (FY 2024-25) |
| **AI Training Pod** (AITP) | TENANT | 62 | MODERATE | 2 (FY 2024-25) |

### Nexus FS (sponsor)

| | FY 2023 | FY 2024 | FY 2025 |
|---|---|---|---|
| Revenue | ₩20.1B | ₩23.8B | ₩27.06B |
| EBITDA | ₩6.3B | ₩7.6B | ₩8.86B |
| Total debt | ₩38.5B | ₩36.8B | ₩34.44B |
| Total equity | ₩25.2B | ₩27.3B | ₩29.52B |
| Cash | — | ₩2.1B | ₩2.95B |
| Interest expense | ₩1.755B | ₩1.82B | ₩1.97B |

→ Multi-year YoY: Revenue ▲13.7% (24→25), EBITDA ▲16.5%

### DCA-A FS (anchor tenant)

| | FY 2024 | FY 2025 |
|---|---|---|
| Revenue | ₩3.68조 | ₩4.20조 |
| EBITDA | ₩1.08조 | ₩1.26조 |
| Total debt | ₩1.92조 | ₩1.85조 |
| Total equity | ₩4.18조 | ₩4.50조 |

대형 KOSPI-listed 기업 proxy. Leverage 1.47x, IC 13.7x → 거의 IG-급.

### AITP FS (growth tenant)

| | FY 2024 | FY 2025 |
|---|---|---|
| Revenue | ₩92B | ₩180B (+96% YoY) |
| EBITDA | ₩14B | ₩32B (+129% YoY) |

고성장 / 중간 규모. Leverage 2.97x, IC 6.7x.

---

## Lease (per asset)

| Tenant | leasedKw | startYear | termYears | baseRate | escalation | status |
|---|---|---|---|---|---|---|
| Domestic Cloud Anchor A | 12,000 | 2 | 7 | ₩226k/kW/mo | 2.5% | SIGNED |
| AI Training Pod | 6,000 | 3 | 5 | ₩242k/kW/mo | 2.8% | PIPELINE |

→ Total 18,000 kW · WALT 6.3년 · weighted in-place ₩231,333

---

## Debt facility

| facilityType | lender | commitment | drawn | rate | term | balloon |
|---|---|---|---|---|---|---|
| CONSTRUCTION | Korea Infra Construction Bank | ₩98B | ₩98B | 5.40% | 84 months | 15% |

→ amortization rate ≈ 12.1%/yr, balloon year 2033

---

## Insurance (5 policies)

| policyType | insurer | coverage | premium | expiresOn |
|---|---|---|---|---|
| PROPERTY | Samsung Fire & Marine | ₩280B | ₩980M | 2027-01-01 |
| BI | Samsung Fire & Marine | ₩60B | ₩320M | 2027-01-01 |
| LIABILITY | AIG Korea | ₩20B | ₩145M | 2027-01-01 |
| CYBER | Lloyd's via Hanwha General | ₩10B | ₩88M | 2027-01-01 |
| CONSTRUCTION | KB Insurance | ₩200B | ₩720M | 2027-09-01 |

→ Total coverage ₩570B / annual premium ₩2.25B

---

## Carbon emissions (4 records)

| scope | category | vintage | tCO2e | methodology | verifier |
|---|---|---|---|---|---|
| 1 | FUEL_COMBUSTION | 2025 | 31 | GHG_PROTOCOL_LB | (internal) |
| 2 | PURCHASED_ELECTRICITY | 2025 | 41,200 | GHG_PROTOCOL_LB | EY ClimateChange (Korea) |
| 2 | PURCHASED_ELECTRICITY | 2025 | 32,400 | GHG_PROTOCOL_MB | EY ClimateChange (Korea) |
| 3 | EMBODIED | 2025 | 2,950 | ISO_14064 | KCC Carbon Verification |

IM은 MB를 primary, LB를 alternate footnote.

---

## Side letters (5 entries)

| LP | Category | Term |
|---|---|---|
| National Pension Service | MFN | MFN at ≤ USD 100M commitment threshold |
| National Pension Service | FEE_DISCOUNT | 0.25% mgmt fee discount > ₩100B commitment |
| KIC | COINVESTMENT | Pro-rata co-invest, no fee/no carry |
| Norges Bank IM | ESG | Coal threshold opt-out |
| Future Fund (AUS) | REPORTING | Quarterly ESG dashboard, GRESB annual |

---

## Sponsor track record

Nexus prior deals (3):

| Deal | Vintage | Exit | Class | Multiple | IRR | Status |
|---|---|---|---|---|---|---|
| Yeouido Office Tower I | 2018 | 2024 | OFFICE | 1.85x | 14.5% | EXITED |
| Pangyo Logistics Hub | 2020 | 2024 | INDUSTRIAL | 1.62x | 12.8% | EXITED |
| Gangnam Core Office II | 2023 | — | OFFICE | — | — | LIVE |

→ Avg multiple 1.74x, avg IRR 13.7% (EXITED only)

---

## Capex line items (7 entries)

| Category | Label | Year | Amount |
|---|---|---|---|
| LAND | Land and assembly | Y0 | ₩36.9B |
| SOFT_COST | Professional fees | Y0 | ₩22.1B |
| SHELL_CORE | Shell and core | Y1 | ₩54.1B |
| ELECTRICAL | Electrical | Y1 | ₩59.0B |
| MECHANICAL | Cooling | Y1 | ₩39.4B |
| IT_FIT_OUT | White space | Y2 | ₩24.6B |
| CONTINGENCY | Contingency | Y2 | ₩9.8B |

→ Total ₩246B, all marked additional (non-embedded)

---

## Tax assumption

| Field | Value |
|---|---|
| acquisitionTaxPct | 4.6% |
| propertyTaxPct | 0.34% |
| corporateTaxPct | 24.2% |
| exitTaxPct | 1.2% |
| vatRecoveryPct | 92% |
| withholdingTaxPct | 15.4% |
| insurancePct | 0.11% |

---

## SPV structure

| Field | Value |
|---|---|
| legalStructure | SPC |
| managementFeePct | 1.25% |
| performanceFeePct | 8% |
| promoteThresholdPct | 10% |
| promoteSharePct | 15% |
| reserveTargetMonths | 6 |

---

## Macro series (per asset, FRESH @ 2026-04-01)

| seriesKey | value | unit |
|---|---|---|
| policy_rate_pct | 3.5 | % |
| cap_rate_pct | 6.10 | % |
| debt_cost_pct | 5.20 | % |
| discount_rate_pct | 9.40 | % |
| inflation_pct | 2.30 | % |
| rent_growth_pct | 2.10 | % |
| vacancy_pct | 6.10 | % |
| credit_spread_bps | 180 | bps |
| construction_cost_index | 108 | idx |
| transaction_volume_index | 98 | idx |

---

## Latest ValuationRun

- runLabel: kdc-kr-v1 valuation
- engineVersion: kdc-kr-v1
- baseCaseValueKrw: ₩259,936,015,008 (~₩260B)
- bullValue: ₩339B / bearValue: ₩174B
- confidenceScore: 8.1
- approvalStatus: PENDING_REVIEW
- 6 keyRisks, 6 ddChecklist items
- assumptions blob carries proForma 10y, sensitivity points, macro guidance overlay

---

## Other seeded entities

| Type | Count | Notes |
|---|---|---|
| Document | 2 | Power Allocation Review Memo (POWER_STUDY) + IC Draft Model (MODEL) |
| ResearchSnapshot | 4 | Q1 2026 macro / Seoul Metro brief / Underwriting Memo / asset dossier |
| CoverageTask | 1 | OPEN HIGH-priority |
| InvestmentCommitteePacket | 1 | ICPKT-SEOUL-GANGSEO-2026Q2 · CONDITIONAL |
| AssetFeatureSnapshot | 8 | site / power / revenue / legal / permit / market / readiness / satellite |
| OwnershipRecord | 1 | Seoul Infra Development SPC · 100% |
| AuditEvent | 34+ | sponsor + media + research + ops cron events |

기타 (시드 0):
- AiInsight, RealizedOutcome, GeoFeature, MarketIndicatorSeries, TokenizedAsset 등은 빈 상태로 conditional hide

---

## 시드 다시 로드

```bash
cd apps/web
npm run prisma:seed   # 기본 시드만
# Tier 5 데이터 (insurance, carbon, side letters, multi-year FS)는 README의 SQL 인서트로 추가
```

자세한 SQL은 git history (`git log --grep "seed"`).

---

## 더 읽기

- [data-model-cheatsheet.md](./data-model-cheatsheet.md) — schema 그래프
- [im-architecture.md](./im-architecture.md) — 시드가 IM 어디로 들어가는지
