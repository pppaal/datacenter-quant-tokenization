# Blockchain Integration

This repository is already structured for a registry-only blockchain layer.

## What Goes Onchain

- Asset registry id derived from `assetCode`
- Metadata pointer served by `GET /api/registry/assets/[id]`
- Latest diligence document hash

Valuation runs, documents, extracted text, and underwriting logic remain offchain.

## Files Added For The Integration

- `packages/contracts/src/DataCenterAssetRegistry.sol`
- `apps/web/lib/blockchain/*`
- `apps/web/app/api/registry/assets/[id]/*`
- `apps/web/lib/services/registry.ts`

## Setup Flow

1. Deploy `packages/contracts/src/DataCenterAssetRegistry.sol` to your EVM network.
2. Set the blockchain variables in `apps/web/.env`.
3. Start the app with `npm run dev`.
4. Open an asset in `/admin/assets/[id]`.
5. Use `Stage Latest Hash`, `Register Asset`, and `Anchor Hash` in order.

## Required Environment Variables

- `APP_BASE_URL`
- `BLOCKCHAIN_METADATA_BASE_URL`
- `BLOCKCHAIN_CHAIN_ID`
- `BLOCKCHAIN_CHAIN_NAME`
- `BLOCKCHAIN_RPC_URL`
- `BLOCKCHAIN_REGISTRY_ADDRESS`
- `BLOCKCHAIN_PRIVATE_KEY`

## Runtime Flow

1. `Stage Latest Hash` marks the newest document hash as ready in Postgres.
2. `Register Asset` sends `registerAsset` or `updateAssetMetadata` to the registry contract.
3. `Anchor Hash` sends `anchorDocumentHash` for the latest uploaded document.

## Practical Local Dev

For fast local iteration, deploy the contract to a local EVM such as Anvil, then point `BLOCKCHAIN_RPC_URL` at that node and use the generated funded private key as `BLOCKCHAIN_PRIVATE_KEY`.
