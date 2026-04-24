// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";
import {IPausableTarget} from "../interfaces/IPausableTarget.sol";

/// @title DataCenterAssetRegistry
/// @notice Institutional-grade on-chain anchor for off-chain datacenter asset records and
///         auditable document hashes. This contract is intentionally registry-only: it does
///         NOT issue tokens, custody funds, or settle transfers.
/// @dev Security design:
///      - OpenZeppelin `AccessControlDefaultAdminRules` adds a timelocked two-step admin
///        handoff (default 3 days) and enforced renounce delay, preventing hot-key takeover.
///      - Roles partition authority: REGISTRAR manages asset lifecycle, AUDITOR anchors and
///        revokes document hashes, PAUSER can halt state-changing entrypoints.
///      - `Pausable` gates every mutating entrypoint for circuit-breaker incidents.
///      - `ReentrancyGuard` is applied on mutating paths; while no external calls are made
///        today, this provides defense in depth if hooks or callbacks are added later.
///      - Metadata strings are length-capped to bound gas and prevent griefing via
///        unbounded calldata.
contract DataCenterAssetRegistry is
    IAssetRegistry,
    IPausableTarget,
    AccessControlDefaultAdminRules,
    Pausable,
    ReentrancyGuard
{
    // ---------------------------------------------------------------------
    // Roles
    // ---------------------------------------------------------------------

    /// @notice Role permitted to register, update, and change status of assets.
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    /// @notice Role permitted to anchor and revoke document hashes.
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    /// @notice Role permitted to pause and unpause the registry.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Max byte length of `metadataRef` strings (URIs / content refs).
    uint256 public constant MAX_METADATA_LENGTH = 512;

    /// @notice Max byte length of a revocation `reason` string.
    uint256 public constant MAX_REASON_LENGTH = 256;

    /// @notice Minimum delay enforced on admin role transfer handoffs.
    uint48 private constant ADMIN_TRANSFER_DELAY = 3 days;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidAssetId();
    error InvalidDocumentHash();
    error InvalidMetadata();
    error MetadataTooLong(uint256 length, uint256 maxLength);
    error ReasonTooLong(uint256 length, uint256 maxLength);
    error AssetAlreadyRegistered(bytes32 assetId);
    error AssetNotRegistered(bytes32 assetId);
    error AssetNotActive(bytes32 assetId, AssetStatus currentStatus);
    error DocumentAlreadyAnchored(bytes32 assetId, bytes32 documentHash);
    error DocumentNotAnchored(bytes32 assetId, bytes32 documentHash);
    error DocumentAlreadyRevoked(bytes32 assetId, bytes32 documentHash);
    error SameStatus(AssetStatus status);

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    mapping(bytes32 assetId => AssetRecord) private _assets;
    mapping(bytes32 assetId => mapping(bytes32 documentHash => DocumentRecord)) private _documents;

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /// @param initialAdmin  Address that will receive DEFAULT_ADMIN_ROLE (should be a multisig).
    /// @param initialRegistrar  Address granted REGISTRAR_ROLE at deploy time.
    /// @param initialAuditor  Address granted AUDITOR_ROLE at deploy time.
    /// @param initialPauser  Address granted PAUSER_ROLE at deploy time.
    constructor(
        address initialAdmin,
        address initialRegistrar,
        address initialAuditor,
        address initialPauser
    ) AccessControlDefaultAdminRules(ADMIN_TRANSFER_DELAY, initialAdmin) {
        if (initialRegistrar != address(0)) _grantRole(REGISTRAR_ROLE, initialRegistrar);
        if (initialAuditor != address(0)) _grantRole(AUDITOR_ROLE, initialAuditor);
        if (initialPauser != address(0)) _grantRole(PAUSER_ROLE, initialPauser);
    }

    // ---------------------------------------------------------------------
    // Pause controls
    // ---------------------------------------------------------------------

    function pause() external override onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external override onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function paused() public view override(Pausable, IPausableTarget) returns (bool) {
        return Pausable.paused();
    }

    // ---------------------------------------------------------------------
    // Asset lifecycle (REGISTRAR_ROLE)
    // ---------------------------------------------------------------------

    function registerAsset(bytes32 assetId, string calldata metadataRef)
        external
        whenNotPaused
        nonReentrant
        onlyRole(REGISTRAR_ROLE)
    {
        if (assetId == bytes32(0)) revert InvalidAssetId();
        _validateMetadata(metadataRef);
        if (_assets[assetId].status != AssetStatus.Unregistered) {
            revert AssetAlreadyRegistered(assetId);
        }

        _assets[assetId] = AssetRecord({
            assetId: assetId,
            metadataRef: metadataRef,
            status: AssetStatus.Active,
            registeredAt: uint64(block.timestamp),
            lastUpdatedAt: uint64(block.timestamp),
            documentCount: 0
        });

        emit AssetRegistered(assetId, metadataRef, _msgSender());
    }

    function updateAssetMetadata(bytes32 assetId, string calldata metadataRef)
        external
        whenNotPaused
        nonReentrant
        onlyRole(REGISTRAR_ROLE)
    {
        AssetRecord storage record = _assets[assetId];
        if (record.status == AssetStatus.Unregistered) revert AssetNotRegistered(assetId);
        _validateMetadata(metadataRef);

        string memory previous = record.metadataRef;
        record.metadataRef = metadataRef;
        record.lastUpdatedAt = uint64(block.timestamp);

        emit AssetMetadataUpdated(assetId, previous, metadataRef, _msgSender());
    }

    function setAssetStatus(bytes32 assetId, AssetStatus newStatus)
        external
        whenNotPaused
        nonReentrant
        onlyRole(REGISTRAR_ROLE)
    {
        if (newStatus == AssetStatus.Unregistered) revert InvalidAssetId();
        AssetRecord storage record = _assets[assetId];
        if (record.status == AssetStatus.Unregistered) revert AssetNotRegistered(assetId);
        if (record.status == newStatus) revert SameStatus(newStatus);

        AssetStatus previous = record.status;
        record.status = newStatus;
        record.lastUpdatedAt = uint64(block.timestamp);

        emit AssetStatusChanged(assetId, previous, newStatus);
    }

    // ---------------------------------------------------------------------
    // Document anchoring (AUDITOR_ROLE)
    // ---------------------------------------------------------------------

    function anchorDocumentHash(bytes32 assetId, bytes32 documentHash)
        external
        whenNotPaused
        nonReentrant
        onlyRole(AUDITOR_ROLE)
    {
        AssetRecord storage record = _assets[assetId];
        if (record.status == AssetStatus.Unregistered) revert AssetNotRegistered(assetId);
        if (record.status != AssetStatus.Active) revert AssetNotActive(assetId, record.status);
        if (documentHash == bytes32(0)) revert InvalidDocumentHash();

        DocumentRecord storage doc = _documents[assetId][documentHash];
        if (doc.anchoredAt != 0 && doc.revokedAt == 0) {
            revert DocumentAlreadyAnchored(assetId, documentHash);
        }

        _documents[assetId][documentHash] = DocumentRecord({
            documentHash: documentHash,
            anchoredAt: uint64(block.timestamp),
            revokedAt: 0,
            anchoredBy: _msgSender()
        });
        record.documentCount += 1;
        record.lastUpdatedAt = uint64(block.timestamp);

        emit DocumentAnchored(assetId, documentHash, _msgSender());
    }

    function revokeDocumentHash(bytes32 assetId, bytes32 documentHash, string calldata reason)
        external
        whenNotPaused
        nonReentrant
        onlyRole(AUDITOR_ROLE)
    {
        if (bytes(reason).length > MAX_REASON_LENGTH) {
            revert ReasonTooLong(bytes(reason).length, MAX_REASON_LENGTH);
        }
        DocumentRecord storage doc = _documents[assetId][documentHash];
        if (doc.anchoredAt == 0) revert DocumentNotAnchored(assetId, documentHash);
        if (doc.revokedAt != 0) revert DocumentAlreadyRevoked(assetId, documentHash);

        doc.revokedAt = uint64(block.timestamp);
        AssetRecord storage record = _assets[assetId];
        record.documentCount -= 1;
        record.lastUpdatedAt = uint64(block.timestamp);

        emit DocumentRevoked(assetId, documentHash, _msgSender(), reason);
    }

    // ---------------------------------------------------------------------
    // View helpers
    // ---------------------------------------------------------------------

    function getAsset(bytes32 assetId) external view returns (AssetRecord memory) {
        return _assets[assetId];
    }

    function getDocument(bytes32 assetId, bytes32 documentHash)
        external
        view
        returns (DocumentRecord memory)
    {
        return _documents[assetId][documentHash];
    }

    function isDocumentAnchored(bytes32 assetId, bytes32 documentHash) external view returns (bool) {
        DocumentRecord storage doc = _documents[assetId][documentHash];
        return doc.anchoredAt != 0 && doc.revokedAt == 0;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _validateMetadata(string calldata metadataRef) internal pure {
        uint256 len = bytes(metadataRef).length;
        if (len == 0) revert InvalidMetadata();
        if (len > MAX_METADATA_LENGTH) revert MetadataTooLong(len, MAX_METADATA_LENGTH);
    }
}
