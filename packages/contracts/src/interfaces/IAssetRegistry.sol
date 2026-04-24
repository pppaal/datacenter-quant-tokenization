// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAssetRegistry
/// @notice External surface for the datacenter asset registry. Consumers (indexers, the
///         web app, oracle adapters) should depend on this interface, not the concrete contract.
interface IAssetRegistry {
    enum AssetStatus {
        Unregistered,
        Active,
        Suspended,
        Retired
    }

    struct AssetRecord {
        bytes32 assetId;
        string metadataRef;
        AssetStatus status;
        uint64 registeredAt;
        uint64 lastUpdatedAt;
        /// @dev Number of CURRENTLY anchored (not revoked) documents. Decreases on revoke,
        ///      increases on (first or re-) anchor. Not a monotonic lifetime counter.
        uint32 documentCount;
    }

    struct DocumentRecord {
        bytes32 documentHash;
        uint64 anchoredAt;
        uint64 revokedAt;
        address anchoredBy;
    }

    event AssetRegistered(bytes32 indexed assetId, string metadataRef, address indexed registrar);
    event AssetMetadataUpdated(
        bytes32 indexed assetId,
        string previousMetadataRef,
        string newMetadataRef,
        address indexed registrar
    );
    event AssetStatusChanged(bytes32 indexed assetId, AssetStatus previousStatus, AssetStatus newStatus);
    event DocumentAnchored(
        bytes32 indexed assetId,
        bytes32 indexed documentHash,
        address indexed anchoredBy
    );
    event DocumentRevoked(
        bytes32 indexed assetId,
        bytes32 indexed documentHash,
        address indexed revokedBy,
        string reason
    );

    function getAsset(bytes32 assetId) external view returns (AssetRecord memory);

    function getDocument(bytes32 assetId, bytes32 documentHash)
        external
        view
        returns (DocumentRecord memory);

    function isDocumentAnchored(bytes32 assetId, bytes32 documentHash) external view returns (bool);
}
