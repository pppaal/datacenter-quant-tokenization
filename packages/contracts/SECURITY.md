# Smart-contract security posture

Audit-readiness and threat-model summary for the on-chain stack in
`packages/contracts` (registry + ERC-3643-style tokenization). This is a
**posture/handoff doc** — the source of truth is the code, the CI workflow
(`.github/workflows/contracts-ci.yml`), and the npm scripts in `package.json`.

## Scope

- **Registry**: `registry/DataCenterAssetRegistry.sol`, `registry/NamespacedRegistrar.sol`
  (registry-only on-chain; documents/valuations stay off-chain, only hashes are anchored).
- **Tokenization (ERC-3643 / T-REX style)**: `tokenization/token/AssetToken.sol`,
  `tokenization/identity/IdentityRegistry.sol`, `tokenization/compliance/ModularCompliance.sol`
  + modules (`LockupModule`, `MaxHoldersModule`, `CountryRestrictModule`, `KrHoldingLimitModule`),
  `tokenization/trading/TransferAgent.sol`.
- **Oracle / attestation**: `tokenization/oracle/NavOracle.sol`, `tokenization/oracle/NavAttestor.sol`
  (EIP-712 NAV attestations; off-chain signer in `apps/web/lib/blockchain/attestation.ts`).
- **Distribution**: `tokenization/distribution/DividendDistributor.sol`,
  `tokenization/distribution/Waterfall.sol` *(deploy-gated — see Open items)*.
- **Governance**: `governance/EmergencyCouncil.sol` (+ `interfaces/IPausableTarget.sol`).

## Automated analysis pipeline (all gating in CI)

Every contract change runs, as blocking CI jobs:

| Layer | Tool | Job |
|-------|------|-----|
| Lint | **solhint** | `npm run lint` |
| Static analysis | **Slither** (Trail of Bits) → SARIF uploaded to GitHub code scanning | `slither` |
| Static analysis | **Aderyn** (Cyfrin) | `aderyn` |
| Formal / SMT | **SMTChecker** (CHC engine + Z3) | `SMT=1 hardhat compile` |
| Symbolic execution | **Mythril** | on the tokenization contracts |
| Property fuzzing | **fast-check** property suite | `npm run test:fuzz` |
| Invariant campaign | invariant suite | `npm run test:invariant` |
| Gas regression | gas baseline / drift | `npm run test:gas-baseline` |
| ABI parity | tokenization ABI drift guard | `npm run check:tokenization-abi` |
| Tests | unit / integration / script (deploy-verifier) | `npm run test:unit` … |

`npm run check:all` bundles the lint→compile→test→fuzz→invariant→gas path for
local pre-push; the analyzer jobs (Slither/Aderyn/SMT/Mythril) run in CI.

## Security patterns in use

- **Access control**: OpenZeppelin `AccessControl` / two-step ownable patterns across
  registrar, registry, IdentityRegistry, ModularCompliance, TransferAgent, AssetToken,
  NavOracle, NavAttestor, DividendDistributor, Waterfall, EmergencyCouncil. Irreversible
  on-chain value movements (mint / burn / forceTransfer) and the KYC→chain bridge are
  ADMIN-gated (mirrored off-chain in `getRequiredAdminRoleForPath`).
- **Reentrancy**: `ReentrancyGuard` on the distribution paths; Waterfall uses
  **pull-payments** (`distribute` pulls via `safeTransferFrom`; LPs `withdraw`), so the
  held balance is always ≥ recorded claims.
- **Oracle integrity**: `NavOracle.publish` enforces a **monotonic `navTimestamp`**
  (`NavStale` reverts back-dated / replayed NAVs) and rejects `navPerShare == 0`
  (`InvalidNav`); the off-chain signer refuses to sign a zero/dust NAV before broadcast.
- **Attestation**: EIP-712 typed data + **nonce** + EIP-712 domain (chainId-bound) for
  cross-chain replay protection.
- **Compliance (ERC-3643)**: modular, per-rule compliance (lockup, max holders, country
  restriction, KR holding limit) gating every transfer through `ModularCompliance`.
- **Circuit breaker**: `EmergencyCouncil` + `IPausableTarget` to pause sensitive targets.

## Threat model highlights

- **Waterfall fund-loss classes** (funding invariant, commitment freeze, reentrancy) are
  addressed in-contract and covered by the invariant campaign — but the contract remains
  **deploy-gated behind `DEPLOY_WATERFALL` pending an external audit** (see Open items).
- **AssetToken `forceTransfer` / mint / burn**: ADMIN-only; a regulator-style forced move
  is intentional for ERC-3643 but is the highest-consequence surface — primary audit focus.
- **NavOracle / NavAttestor**: signature forgery / stale-NAV / epoch-replay — mitigated by
  EIP-712 + nonce + monotonic timestamp + zero-NAV rejection.
- **Registry**: namespaced writes are access-controlled; document anchoring is hash-only.

## Open items / deploy gates (honest)

1. **Waterfall.sol — external audit required.** In-contract fund-loss fixes shipped, but
   it stays behind `DEPLOY_WATERFALL` until an external audit (ideally with **formal
   verification** of the distribution invariants) signs off.
2. **Waterfall LP roster → Merkle-claim.** The O(n) `_lpList` allocation should move to a
   Merkle-claim distributor (OZ `MerkleProof`) before scaling LP rosters — a gas-griefing /
   DoS and scale fix.
3. **Post-deploy runtime monitoring** (set up at deploy, not pre-deploy): OpenZeppelin
   Defender Sentinels / Forta detection bots for mint spikes, ownership changes, anomalous
   transfers; admin behind a TimelockController.
4. **KYC webhook (off-chain) HMAC alignment** with the real Sumsub scheme at integration
   time (see `apps/web/lib/services/kyc/sumsub-provider.ts`).

## Recommended next-tier OSS (with / after the external audit)

- **EVM-level coverage fuzzing**: Echidna or Medusa (Trail of Bits) to complement the
  JS-level fast-check campaign on the Waterfall / AssetToken invariants.
- **Formal verification**: Certora Prover (CVL specs) or Halmos / Kontrol for the Waterfall
  money-conservation invariants — pairs with the funded external audit.
- **Runtime**: Defender + Forta (item 3 above).

> Maintenance: when adding a contract, keep it under the CI analyzer matrix above and add an
> invariant/property test. Update this doc when a deploy gate (1–4) is closed.
