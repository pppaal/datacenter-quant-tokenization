// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";

/// @notice Test-only malicious registry. Implements the subset of the
///         writable-registry surface that NamespacedRegistrar calls, and
///         re-enters the adapter on callback to prove the adapter's
///         ReentrancyGuard intercepts a hostile registry.
///
/// @dev Not intended for deployment; lives in src/mocks/ so hardhat can
///      compile it alongside production contracts.
interface IReentrantTarget {
    function registerAsset(bytes8 namespace, bytes32 assetId, string calldata metadataRef) external;
    function updateAssetMetadata(bytes32 assetId, string calldata metadataRef) external;
    function setAssetStatus(bytes32 assetId, IAssetRegistry.AssetStatus newStatus) external;
}

contract ReentrantRegistry {
    IReentrantTarget public target;
    bytes8 public reentryNamespace;
    bytes32 public reentryAssetId;
    string public reentryMetadata;
    uint8 public reentryMode; // 0 = off, 1 = register, 2 = update, 3 = setStatus

    function arm(
        IReentrantTarget target_,
        bytes8 namespace,
        bytes32 assetId,
        string calldata metadataRef,
        uint8 mode
    ) external {
        target = target_;
        reentryNamespace = namespace;
        reentryAssetId = assetId;
        reentryMetadata = metadataRef;
        reentryMode = mode;
    }

    function registerAsset(bytes32, string calldata) external {
        if (reentryMode == 1) {
            target.registerAsset(reentryNamespace, reentryAssetId, reentryMetadata);
        } else if (reentryMode == 2) {
            target.updateAssetMetadata(reentryAssetId, reentryMetadata);
        } else if (reentryMode == 3) {
            target.setAssetStatus(reentryAssetId, IAssetRegistry.AssetStatus.Suspended);
        }
    }

    function updateAssetMetadata(bytes32, string calldata) external {
        if (reentryMode == 1) {
            target.registerAsset(reentryNamespace, reentryAssetId, reentryMetadata);
        } else if (reentryMode == 2) {
            target.updateAssetMetadata(reentryAssetId, reentryMetadata);
        }
    }

    function setAssetStatus(bytes32, IAssetRegistry.AssetStatus) external {
        if (reentryMode == 3) {
            target.setAssetStatus(reentryAssetId, IAssetRegistry.AssetStatus.Retired);
        }
    }
}
