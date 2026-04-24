# Tokenization Stack

This document covers the RWA tokenization layer that sits on top of the
registry-only base from `blockchain-integration.md`. If you only care about
the off-chain registry, that other doc is enough. This one is for the
permissioned-share / distribution / OTC pre-clearance stack.

## Contract Inventory

All contracts live under `packages/contracts/src/tokenization/`.

| Contract                  | Purpose                                                                 | Roles                                                                 |
| ------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `IdentityRegistry`        | KYC whitelist keyed by wallet → (verified, countryCode)                 | `DEFAULT_ADMIN_ROLE`, `IDENTITY_MANAGER_ROLE`, `PAUSER_ROLE`         |
| `ModularCompliance`       | Aggregator that ANDs module decisions                                   | `DEFAULT_ADMIN_ROLE`, `COMPLIANCE_ADMIN_ROLE`                         |
| `MaxHoldersModule`        | Caps distinct holders (Reg D 99-holder style)                           | `DEFAULT_ADMIN_ROLE`                                                  |
| `CountryRestrictModule`   | Blocks ISO-3166 numeric country codes                                   | `DEFAULT_ADMIN_ROLE`                                                  |
| `LockupModule`            | Enforces holding period after acquisition                               | `DEFAULT_ADMIN_ROLE`                                                  |
| `AssetToken`              | ERC-20 permissioned share bound to a single registry asset              | `DEFAULT_ADMIN_ROLE` (3-day delay), `AGENT_ROLE`, `PAUSER_ROLE`       |
| `NavOracle`               | Monotonic NAV-per-share publisher with epoch counter                    | `DEFAULT_ADMIN_ROLE`, `ORACLE_WRITER_ROLE`, `PAUSER_ROLE`             |
| `DividendDistributor`     | Pull-based Merkle distribution (dividends / coupons)                    | `DEFAULT_ADMIN_ROLE`, `DISTRIBUTOR_ROLE`, `PAUSER_ROLE`               |
| `TransferAgent`           | OTC pre-clearance ticket manager; settles via `AssetToken.forceTransfer`| `DEFAULT_ADMIN_ROLE`, `OPERATOR_ROLE`, `ISSUER_ROLE`, `PAUSER_ROLE`   |

### Security posture (repeated across the stack)

- `AccessControlDefaultAdminRules` with a 3-day delay on `DEFAULT_ADMIN_ROLE`
  transfers. No path to single-tx admin handoff.
- `Pausable` on every mutating entrypoint so incident response can freeze the
  token or the distribution without redeploying.
- `ReentrancyGuard` on mint/burn/forceTransfer/claim/settle — defense-in-depth
  for future modules that may call back.
- The token's `_update` hook re-runs identity + compliance for plain
  transfers. Privileged paths (mint/burn/forceTransfer) set an internal
  `_privilegedAction` flag so gates don't run twice and `transferred`/
  `created`/`destroyed` hooks fire exactly once.

## Off-chain Mirror (Prisma)

Three models mirror the on-chain state so the operator console doesn't need
to log-scrape:

- `TokenizedAsset` — deployment addresses + chain id for a given `Asset`
- `KycRecord` — KYC status + provider + country code; bridged into the
  on-chain `IdentityRegistry` by `/api/kyc/bridge`
- `TokenDistribution` + `TokenDistributionAllocation` — Merkle root + raw
  per-holder allocations; the web app serves `claim()` proofs from
  `/api/tokenization/distributions/<id>/proofs/<holder>`
- `TransferTicket` — TransferAgent ticket mirror, indexed by status and
  counterparty for the RFQ admin UI

Prisma is the side that can drift. Reconciliation strategy:
1. On-chain events are authoritative.
2. The service layer writes to Prisma only after `waitForTransactionReceipt`.
3. Chain-id mismatch (`BLOCKCHAIN_CHAIN_ID` vs a row's `chainId`) throws at
   service boundary so operators can never silently mutate the wrong chain.

## API Surface

Admin-only. All require `resolveVerifiedAdminActorFromHeaders` + an asset
scope guard; all success and failure paths emit `AuditEvent`.

| Route                                                       | Actions                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `/api/tokenization/deployments`                             | GET list · POST upsert                                           |
| `/api/tokenization/identity`                                | GET wallet · POST register / updateCountry / remove              |
| `/api/tokenization/issuance`                                | GET supply · POST mint / burn / forceTransfer / pause / unpause  |
| `/api/tokenization/compliance`                              | GET modules · POST addModule / removeModule / block / unblock    |
| `/api/tokenization/distributions`                           | GET list · POST draft / fund                                     |
| `/api/tokenization/distributions/<id>/proofs/<holder>`      | Public proof endpoint for claimants                              |
| `/api/tokenization/transfers`                               | GET list · POST open / approve / reject / settle / cancel / expire |
| `/api/kyc/webhook/<provider>`                               | Provider-agnostic KYC webhook ingress                            |
| `/api/kyc/bridge`                                           | Bridge a `KycRecord` to the on-chain identity registry           |
| `/api/kyc/records`                                          | List KYC records                                                 |
| `/api/admin/data-providers`                                 | Read-only: live vs mock mode for each public-data connector      |

## Environment

Required for the tokenization layer (in addition to the registry vars):

- `BLOCKCHAIN_CHAIN_ID` — the chain the deployment lives on; tokenization
  services throw if this mismatches a row's `chainId`
- `BLOCKCHAIN_PRIVATE_KEY` — the agent EOA; expected to hold `AGENT_ROLE`,
  `IDENTITY_MANAGER_ROLE`, `COMPLIANCE_ADMIN_ROLE`, `DISTRIBUTOR_ROLE`,
  `ORACLE_WRITER_ROLE`, `OPERATOR_ROLE` and `ISSUER_ROLE`. In production
  split these across separate signer services.
- `KYC_PROVIDER` — `mock` or `sumsub`
- `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_WEBHOOK_SECRET`
- Public-data live switches (optional; mock fallback always available):
  - `MOLIT_BUILDING_API_KEY`
  - `KEPCO_SUBSTATION_DATA_PATH` OR `KEPCO_SUBSTATION_DATA_URL`
  - `RTMS_SERVICE_KEY`

## Deployment Manifest

Recommended deploy order (see `packages/contracts/scripts/deploy-tokenization.ts`):

1. `DataCenterAssetRegistry` (from the base registry layer) and register the
   asset id you're tokenizing.
2. `IdentityRegistry`
3. `ModularCompliance`, then `bindToken` later once the token exists
4. Compliance modules (`MaxHolders`, `CountryRestrict`, `Lockup`), then
   `addModule` on the compliance aggregator
5. `AssetToken` — bound immutably to `(registry, assetId)`
6. `ModularCompliance.bindToken(token)` — this is the step that activates
   gating; until called the compliance check is open
7. `NavOracle`
8. `DividendDistributor`
9. `TransferAgent` — grant it `AGENT_ROLE` on the AssetToken before the
   first ticket is settled

Post-deploy checklist:
- Write the 4 deployment addresses into a `TokenizedAsset` row via
  `POST /api/tokenization/deployments`
- Run `npm run contracts:export-abi` to regenerate the bundled ABI for the
  web app (9 ABIs, currently ~128 KB)
- Verify `resolveConnectorMode()` at `GET /api/admin/data-providers` matches
  the public-data keys you expect to be live

## Release Gate

CI (`.github/workflows/contracts-ci.yml`) runs on every `packages/contracts`
change:
- solhint lint
- Hardhat compile
- `test:unit` (now includes NavOracle, DividendDistributor, TransferAgent)
- `test:integration`, `test:scripts`, `test:fuzz`, `test:invariant`
- Gas baseline regression
- Slither (fails on medium+)
- Aderyn (report artifact)
- SMTChecker (CHC + Z3)

Do not merge a tokenization-layer change without a green `contracts-ci` run.
For ABI/web drift, also run `npm run contracts:export-abi` locally and
commit the regenerated `apps/web/lib/blockchain/tokenization-abi.json`.
