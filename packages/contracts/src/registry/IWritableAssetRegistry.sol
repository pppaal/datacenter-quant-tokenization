// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";

/// @notice Mutating surface of DataCenterAssetRegistry that the namespaced
///         adapter calls as a privileged REGISTRAR_ROLE holder. Kept separate
///         from the read-only `IAssetRegistry` so downstream indexers and
///         oracles are not forced to learn about write methods they must never
///         call.
interface IWritableAssetRegistry {
    function registerAsset(bytes32 assetId, string calldata metadataRef) external;
    function updateAssetMetadata(bytes32 assetId, string calldata metadataRef) external;
    function setAssetStatus(bytes32 assetId, IAssetRegistry.AssetStatus newStatus) external;
}
