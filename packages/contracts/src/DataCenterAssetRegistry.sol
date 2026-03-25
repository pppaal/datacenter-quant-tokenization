// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DataCenterAssetRegistry {
    error NotOwner();
    error InvalidAssetId();
    error InvalidDocumentHash();
    error AssetAlreadyRegistered();
    error AssetNotRegistered();

    struct AssetRecord {
        bytes32 assetId;
        string metadataRef;
        bool active;
        uint256 registeredAt;
    }

    address public immutable owner;

    event AssetRegistered(bytes32 indexed assetId, string metadataRef);
    event AssetMetadataUpdated(bytes32 indexed assetId, string metadataRef);
    event DocumentHashAnchored(bytes32 indexed assetId, bytes32 indexed documentHash);

    mapping(bytes32 => AssetRecord) public assets;
    mapping(bytes32 => mapping(bytes32 => bool)) public anchoredDocumentHashes;

    constructor(address initialOwner) {
        owner = initialOwner == address(0) ? msg.sender : initialOwner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function registerAsset(bytes32 assetId, string calldata metadataRef) external onlyOwner {
        if (assetId == bytes32(0)) revert InvalidAssetId();
        if (assets[assetId].active) revert AssetAlreadyRegistered();

        assets[assetId] = AssetRecord({
            assetId: assetId,
            metadataRef: metadataRef,
            active: true,
            registeredAt: block.timestamp
        });
        emit AssetRegistered(assetId, metadataRef);
    }

    function updateAssetMetadata(bytes32 assetId, string calldata metadataRef) external onlyOwner {
        if (!assets[assetId].active) revert AssetNotRegistered();

        assets[assetId].metadataRef = metadataRef;
        emit AssetMetadataUpdated(assetId, metadataRef);
    }

    function anchorDocumentHash(bytes32 assetId, bytes32 documentHash) external onlyOwner {
        if (!assets[assetId].active) revert AssetNotRegistered();
        if (documentHash == bytes32(0)) revert InvalidDocumentHash();

        anchoredDocumentHashes[assetId][documentHash] = true;
        emit DocumentHashAnchored(assetId, documentHash);
    }
}
