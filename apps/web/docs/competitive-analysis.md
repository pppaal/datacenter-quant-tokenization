# Competitive analysis & benchmark backlog

Source: a 12-category, **60-competitor** web-verified research sweep (multi-agent),
synthesized into a gap analysis vs our platform. Feeds the business plan's
**경쟁사 / 차별성 (Why-us)** section and the product backlog. Treat the backlog
`value`/`effort` as estimates; the single source of product truth stays the code.

## Positioning (honest)

We are the **only** player fusing Korea-localized institutional CRE/data-center
intelligence (RTMS/DART/BOK connectors, KRW-native comparative `.xlsx`), an AI
**address→report** underwriting engine (DCF / Monte Carlo / GP-LP waterfall), and
an **ERC-3643-style on-chain RWA registry** (EIP-712 NAV attestation + hash-chain
audit). That combination is **uncontested** in the competitor set.

Our honest position is an **origination + underwriting + IC-governance + compliance
OS** — NOT a retail token-sale app or a secondary-trading venue. We are
**complementary** to the FSC-licensed KDX/NXT exchanges that captured the
distribution layer (where the retail incumbents Kasa/Funble/Lucent over-reached).
We win on depth and Korea+chain defensibility; we lose on the **LP-facing surface**
and on licensed transfer-agent / secondary-liquidity credibility.

## Where we win

- **Korea-native data + KRW financials** (RTMS/MOLIT, DART, BOK/World Bank, ThinkHazard,
  PeeringDB → KRW comparative `.xlsx`). Every US (Juniper Square, Agora, Covercy,
  Dealpath, Archer, Blooma, CoStar, MSCI RCA) and even MAS/Singapore (ADDX) and the
  standard-author (Tokeny) lack this.
- **Full address→report AI underwriting** (geocode→connectors→DCF/Monte Carlo/GP-LP
  waterfall→report). Dealpath/Juniper Square/Agora rely on external models (ARGUS/Excel);
  Archer/Blooma/Clik are US multifamily/lending-only. We own the engine end-to-end.
- **On-chain RWA layer no fund-ops competitor has** (registry + doc-hash anchoring +
  EIP-712 NAV attestation + ERC-3643 modular compliance). Juniper Square/Allvue/Agora/
  Covercy/Anduin are purely off-chain ledgers.
- **Pre-issuance origination + IC governance + hash-chain audit.** Securitize/Tokeny/
  RedSwan/ADDX assume the deal is already done; we own the diligence→IC→execution lifecycle.
- **Data-center underwriting vertical** (PeeringDB grid/connectivity) — a structural gap
  for RSquare, RedSwan, Archer and the field.
- **Single-firm operator OS** with SSO/SCIM/scoped-RBAC, ops queue, deterministic
  mock-mode audit reproducibility — heavier governance than the retail STO incumbents built.

## Where we lose (real gaps)

- **No LP-facing portal** — everything is operator/admin-facing. Juniper Square (650k+ LPs),
  Allvue, Agora, Covercy ship white-label LP portals (capital-account statements, NAV
  history, notices, document vault). **The single biggest table-stakes gap.**
- **No digital subscription / LP onboarding UX** — Anduin's adaptive sub-docs + Investor
  Passport are best-in-class; we have on-chain ERC-3643 identity but no off-chain onboarding front-end.
- **No money-movement / treasury layer** — Covercy (embedded banking) and Juniper Square
  Treasury actually move call/distribution cash; we compute the math but settle nowhere.
- **No licensed transfer-agent / secondary venue** — Securitize's issuance→TA→ATS loop is
  its moat; in Korea KDX/NXT captured regulated distribution. We are registry-only.
- **Valuation credibility not surfaced** — HouseCanary/Cape externally benchmark accuracy
  with confidence bands; our engine has confidence infra (`im/confidence.ts`, realized-outcome
  backtest) not yet surfaced as a stated band on `/property-analyze`.
- **ERC-3643/ONCHAINID interop not proven** — we emulate the standard; need a documented
  adapter so our tokens plug into the dominant custody/ATS rails (avoid being a closed island).
- **No confidential position reporting** — Polymesh Confidential Assets (ZK) answers the
  institutional objection to public on-chain balances; our anchoring is public-chain.

## Competitor landscape (by category — 60 surveyed)

- **RWA / security-token infra**: Securitize (SEC TA+broker+ATS; BlackRock BUIDL), **Tokeny /
  ERC-3643 (the standard we emulate)**, Polymesh (L1, Confidential Assets), Ondo, Centrifuge,
  RedSwan (CRE tokenization), ADDX (MAS, APAC accredited).
- **Korea RE STO (most direct)**: 카사(Kasa, → 대신), 펀블/펀드블록, 소유(루센트블록), 비브릭(세종텔레콤),
  and the **FSC-licensed 유통 exchanges KDX(KRX) / NXT** — the distribution layer we feed, not fight.
- **Fund ops / LP portal (table-stakes benchmark)**: Juniper Square, Agora, Covercy (embedded
  banking), Anduin (subscriptions), Allvue (enterprise GL+portal).
- **CRE deal / underwriting**: Dealpath (pipeline), Archer (1-click UW), Blooma (lending+stress
  test), Rockport VAL (ARGUS alternative), Northspyre (development).
- **AI valuation**: HouseCanary, Cape Analytics (Moody's), Enodo (W&D), Bowery, Clik.ai.
- **CRE data moats**: CoStar, MSCI RCA, Cherre (data fabric), Moody's CRE, Reonomy (Altus).
- **Korea RE data**: 알스퀘어(RSquare RA), 디스코, 밸류맵, 부동산플래닛, 한국부동산원 R-ONE / KB 데이터허브.
- **Data-center intel**: datacenterHawk, DC Byte, Cloudscene, Baxtel, Structure Research.
- **Doc AI / lease abstraction**: Evisort(Workday), Kira(Litera), LEVERTON(MRI), Prophia, LeaseLens.
- **Private-markets infra**: iCapital, Moonfare, Republic, Yieldstreet.
- **AI finance agents**: Hebbia, Rogo, AlphaSense, Brightwave, **Apers (CRE-specific copilot)**.
- **RWA oracle / compliance**: Chainlink (Proof-of-Reserve/CCIP), Chronicle, Tokeny/ONCHAINID.

## Benchmark backlog (prioritized; `NOW` = buildable in our codebase today)

| #   | value | effort | where   | item                                                                                                                                                                                                 |
| --- | ----- | ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P0    | L      | NOW     | **White-label LP portal** (capital accounts, NAV history, notices, doc vault) — add an external investor-auth scope beside the admin gate; render existing capital-account/NAV/report data read-only |
| 2   | P0    | M      | NOW     | **Single-data-model fund ledger** — call/distribution notices + NAV derive from one source (no reconciliation gap)                                                                                   |
| 3   | P0    | M      | NOW     | **Surface valuation confidence band + comp-quality score** on every `/property-analyze` report (wire `im/confidence.ts` + realized-outcome backtest)                                                 |
| 4   | P1    | L      | NOW     | **Digital subscription docs + reusable LP onboarding profile** feeding ERC-3643 identity (Anduin-style)                                                                                              |
| 5   | P1    | L      | NOW     | **AI document ingestion** (rent rolls, T-12s, OMs, DART filings) auto-populating underwriting inputs + NL evidence search                                                                            |
| 6   | P1    | M      | NOW     | **Korean regulatory capital & feasibility calculator** (Capital Markets Act tiers, ASA 5% retention) — a wedge no competitor models                                                                  |
| 7   | P1    | M      | NOW     | **Portfolio-level stress testing** (flex rev/exp/cap-rate/vacancy/rate → DSCR/debt-yield/LTV/DCF across assets+portfolio)                                                                            |
| 8   | P1    | M      | NOW     | **Compounding Korea comps/benchmark DB** surfaced back into underwriting assumptions + IC memos (productize RTMS/DART)                                                                               |
| 9   | P2    | M      | NOW     | **Configurable waterfall library + per-investor distribution allocation** (close underwriting→capital-ops loop)                                                                                      |
| 10  | P2    | M      | NOW     | **AI cross-module "co-GP" agent** (draft IC memos, prep notices, LP Q&A from the data room)                                                                                                          |
| 11  | P2    | S      | NOW     | **ILPA-style PCAP / capital-account-statement export** alongside the KRW `.xlsx`                                                                                                                     |
| 12  | P1    | L      | roadmap | **ERC-3643 / ONCHAINID canonical interop** (adapter) so tokens plug into institutional rails                                                                                                         |
| 13  | P1    | L      | roadmap | **Path-to-liquidity / KDX-NXT feeder** GTM positioning (pre-listing origination pipe)                                                                                                                |
| 14  | P2    | L      | roadmap | **KSD / 전자증권 reconciliation bridge + 신탁사 connectors**                                                                                                                                         |
| 15  | P2    | L      | roadmap | **Money-movement / treasury rails** (Korean firm-banking/virtual accounts + optional stablecoin settlement)                                                                                          |

## Recommended next builds (focused PRs, in order)

1. **#3 confidence band (P0/M)** — highest credibility-per-effort; infra exists; demo-relevant.
   (Note: Monte-Carlo IRR distribution + a `data-quality-panel` already ship — scope this to
   the _value_ uncertainty band + `buildConfidenceBreakdown` signals, avoid duplicating those.)
2. **#2 single-data-model fund ledger (P0/M)** — unlocks #1 portal and #9/#11.
3. **#1 LP-facing read portal (P0/L)** — the biggest table-stakes gap; needs an external-investor
   auth scope (design first).
4. **#6 Korea regulatory capital calculator (P1/M)** — a defensible wedge + strong review narrative.

Roadmap items (#12–#15) pair with the **funded external audit + chain deploy + KDX/NXT
partnership** — not bolted on pre-deploy.

## Mapping to the business plan

- **차별성 (Why-us)** ← "Where we win" + the uncontested-combination positioning line.
- **경쟁 구도** ← the landscape table; lead with the Korea RE STO row + "we feed KDX/NXT, not fight them."
- **시장/고객** ← the institutional fund-ops + Korea RE-STO + RWA categories define the SAM.
- Honest weaknesses ("Where we lose") double as the **자금사용계획** justification (LP portal,
  onboarding, treasury, liquidity, audit).
