# packages/contracts

Optional phase-2 Solidity workspace for an institutional registry-only RWA layer.

This repository does not ship a public token-sale UX. Any future onchain implementation should remain limited to:

- asset registry identifiers
- document-hash anchoring
- optional share-token modules only after separate legal and product review

See [src/registry/DataCenterAssetRegistry.sol](src/registry/DataCenterAssetRegistry.sol) for the production registry (AccessControlDefaultAdminRules + Pausable) and [src/registry/NamespacedRegistrar.sol](src/registry/NamespacedRegistrar.sol) for the namespaced adapter. Tokenization modules (ERC-3643-style) live under [src/tokenization/](src/tokenization/).
