# Data Model Cheatsheet

`schema.prisma`에 60+ 모델이 있습니다. **Asset 중심**의 관계 그림을 작은 그래프로 쪼개 정리.

---

## 1. Core: Asset 중심

```
                   Asset
                  /  |  \
       Address ──┘   |   └── SiteProfile
                     |
        BuildingSnapshot / PermitSnapshot / EnergySnapshot / MarketSnapshot
                     |
                 ValuationRun ─── ValuationScenario
                     |       \
                     |        SensitivityRun ─── SensitivityPoint
                     |
       Document ─────┤
                     |
               CapexLineItem
                     |
                  Lease ─── LeaseStep
                     |
              DebtFacility ─── DebtDraw / CovenantTest
                     |
                TaxAssumption / SpvStructure
                     |
              Counterparty ─── FinancialStatement ─── CreditAssessment
                                       |
                              FinancialLineItem
```

매 IM은 Asset id 하나로 위 트리 전체를 한 쿼리로 끌고 옴 (`assetBundleInclude`).

---

## 2. ValuationRun JSON blob 구조

`ValuationRun.assumptions` JSON에 다음 sub-blob:

```
assumptions: {
  metrics:    { capRatePct, discountRatePct, occupancyPct, monthlyRatePerKwKrw, ... },
  taxes:      { acquisitionTaxPct, propertyTaxPct, corporateTaxPct, exitTaxPct, ... },
  spv:        { managementFeePct, performanceFeePct, promoteThresholdPct, promoteSharePct, ... },
  capex:      { landValueKrw, shellCoreKrw, electricalKrw, mechanicalKrw, ... },
  debt:       { initialDebtFundingKrw, weightedInterestRatePct, reserveRequirementKrw, ... },
  proForma:   { baseCase: { summary: {...}, years: [...] } },     ← 10년 stored proforma
  macroRegime:{ asOf, market, series: [...] },                     ← macro snapshot
  comparables:{ setName, weightedCapRatePct, ... },
  approaches: { incomeApproach, leaseDcf, replacementFloor, ... },
  credit:     { averageScore, riskMix, adjustedConfidence, ... }
}
```

`ValuationRun.provenance` JSON Array — 입력별 출처 trace:

```json
[
  { "field": "capRatePct", "value": 6.58, "sourceSystem": "korea-macro-rates",
    "mode": "fallback", "freshnessLabel": "fresh", "fetchedAt": "..." },
  { "field": "macro.guidance", "sourceSystem": "macro-regime-engine",
    "value": "{...stringified JSON of shifts...}", ... }
]
```

---

## 3. Research / Coverage 그룹

```
MarketUniverse ─── Submarket
    |               |
    |               └── (assets in market)
    |
    ResearchSnapshot     ResearchSnapshot.supersedes ─── (chain)
    |
    CoverageTask
```

`AiInsight` — model commentary linked to asset / valuationRun / documentVersion.

---

## 4. Macro / Comp / Realized

```
MacroSeries / MacroFactor       ─── per-asset 가까운 macro
MarketIndicatorSeries           ─── 시장 지표 시계열
TransactionComp / RentComp      ─── comparable trades / rent
RealizedOutcome                 ─── 실제 occupancy / NOI 실적
PipelineProject                 ─── 경쟁 supply pipeline
```

각각 `assetId` nullable. `assetId NULL` = market-wide row (asset 없을 때 fallback).

---

## 5. Geo / 위성 / 위해

```
GeoFeature               ─── 일반 지리 feature
SatelliteScene ─── SatelliteObservation
                ─── HazardObservation
                ─── ConstructionProgressObservation
```

---

## 6. Title / 법무 (per-asset)

```
Asset
  ├── Parcel              ─── 지번 / 용도지역 / 공시지가
  ├── BuildingRecord      ─── 건축물대장
  ├── PlanningConstraint  ─── 도시계획 제약
  ├── OwnershipRecord     ─── 소유권 chain
  └── EncumbranceRecord   ─── 근저당 / 가압류
```

---

## 7. Deal / IC / Portfolio

```
Deal ─── Counterparty (with dealId)
     ─── BidRevision / LenderQuote / DocumentRequest / NegotiationEvent
     ─── DiligenceWorkstream ─── Deliverable / Document

InvestmentCommitteeMeeting
  └── InvestmentCommitteePacket ─── InvestmentCommitteeDecision

PortfolioAsset (Asset ↔ Portfolio many-to-many)
```

---

## 8. Capital Formation Shell

```
Fund ─── Vehicle ─── Mandate
                  ─── Investor ─── Commitment ─── CapitalCall / Distribution
                                              ─── DdqResponse
                                              ─── InvestorReport
```

---

## 9. New Tier 1-5 모델 (최근 추가)

| Model | 추가 시점 | 용도 |
|---|---|---|
| `Sponsor` / `SponsorPriorDeal` | T0 | sponsor track record |
| `AssetMedia` | T0 | 자산 사진 / 도면 |
| `DealFlowEntry` | T0 | proprietary deal flow |
| `TenantDemand` | T0 | tenant-in-the-market |
| `InsurancePolicy` | T4 | 보험 register |
| `CarbonEmissionRecord` | T5 | Scope 1/2/3 측정값 |
| `SideLetter` | T5 | LP 별 carve-out |

---

## 10. Onchain / Tokenization

```
Asset (1) ─── (0..1) TokenizedAsset ─── (0..1) RwaProject
                                    └── OnchainRecord
KycRecord
```

문서 hash 앵커링 + ERC-3643 호환 registry.

---

## 11. 메타 / 운영

- `AuditEvent` — 모든 admin 작업 로깅 (actor, action, entity, status)
- `SourceCache` / `SourceOverride` — 외부 adapter 응답 캐시 + 수동 override
- `OpsAlertDelivery` — 운영 알림 배달 로그
- `Notification` — UI 알림
- `ResearchSnapshot.viewType` — `SOURCE` (raw) vs `HOUSE` (approved view)

---

## 12. Bundle include 빠른 참조

`lib/services/assets.ts` 의 `assetBundleInclude` — IM 페이지가 한 쿼리로 가져가는 모든 relation:

- address, siteProfile, buildingSnapshot, permitSnapshot, energySnapshot, marketSnapshot
- macroSeries (24), macroFactors (24)
- realizedOutcomes (12), pipelineProjects (6)
- counterparties → financialStatements (5) → creditAssessments (1)
- creditAssessments (6), ownershipRecords (3), encumbranceRecords (3), planningConstraints (3)
- capexLineItems, leases → steps, taxAssumption, spvStructure, debtFacilities → draws
- featureSnapshots (8), researchSnapshots (6), coverageTasks (12), aiInsights (6)
- buildingRecords (4), parcels (6)
- transactionComps (6), rentComps (6), marketIndicatorSeries (12)
- documents → versions, valuations (6) → scenarios + sensitivityRuns → points
- readinessProject → onchainRecords
- media, committeePackets (4), tokenization
- insurancePolicies, carbonRecords, sideLetters

(괄호 = `take` limit)

---

## 더 읽기

- [im-architecture.md](./im-architecture.md) — IM이 위 bundle을 어떻게 쓰는지
- [financial-helpers.md](./financial-helpers.md) — helper 함수 input → output
- [valuation-variables.md](./valuation-variables.md) — engine 변수 정의
