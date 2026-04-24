// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IAssetRegistry} from "../interfaces/IAssetRegistry.sol";

/// @notice Mutating surface of DataCenterAssetRegistry that this adapter calls
///         as a privileged REGISTRAR_ROLE holder. Kept separate from the
///         read-only IAssetRegistry so downstream indexers/oracles are not
///         forced to learn about write methods they must never call.
interface IWritableAssetRegistry {
    function registerAsset(bytes32 assetId, string calldata metadataRef) external;
    function updateAssetMetadata(bytes32 assetId, string calldata metadataRef) external;
    function setAssetStatus(bytes32 assetId, IAssetRegistry.AssetStatus newStatus) external;
}

/// @title NamespacedRegistrar
/// @notice Forwarding adapter that holds REGISTRAR_ROLE on the main registry
///         and enforces bytes8-namespace permissions on every mutating call.
///         Compromise of a single operator key bounds the blast radius to one
///         namespace instead of the entire asset set.
///
/// @dev Deployment pattern (mirrors EmergencyCouncil handoff):
///         1. Deploy registry with admin Safe + bootstrap REGISTRAR EOA.
///         2. Deploy this adapter with admin = same Safe, registry = registry.
///         3. Registry admin grants REGISTRAR_ROLE on registry to this adapter.
///         4. Registry admin revokes REGISTRAR_ROLE from bootstrap EOA (handoff).
///         5. Admin grants NAMESPACE_ADMIN_ROLE on this adapter to the ops lead.
///         6. Ops lead grants per-(namespace, operator) permissions via
///            `grantNamespaceOperator`.
///
///      The adapter records the (assetId → namespace) binding at registration
///      time so subsequent `updateAssetMetadata` / `setAssetStatus` calls must
///      come from an operator with the same namespace. This prevents a
///      compromised "seoul" operator from mutating "tokyo" assets even if
///      they know a tokyo assetId.
///
///      Document anchoring (AUDITOR_ROLE) is NOT mediated by this adapter;
///      auditor namespacing belongs in a parallel adapter if/when required.
contract NamespacedRegistrar is AccessControlDefaultAdminRules, ReentrancyGuard {
    bytes32 public constant NAMESPACE_ADMIN_ROLE = keccak256("NAMESPACE_ADMIN_ROLE");

    uint48 private constant ADMIN_TRANSFER_DELAY = 2 days;

    IWritableAssetRegistry public immutable registry;

    mapping(bytes8 namespace => mapping(address operator => bool)) private _canOperate;
    mapping(bytes32 assetId => bytes8 namespace) private _assetNamespace;

    error InvalidRegistry();
    error InvalidNamespace();
    error AlreadyBound(bytes32 assetId, bytes8 namespace);
    error NotBound(bytes32 assetId);
    error UnauthorizedNamespace(bytes8 namespace, address caller);

    event NamespaceOperatorGranted(bytes8 indexed namespace, address indexed operator);
    event NamespaceOperatorRevoked(bytes8 indexed namespace, address indexed operator);
    event AssetBound(bytes32 indexed assetId, bytes8 indexed namespace, address indexed operator);

    constructor(address initialAdmin, IWritableAssetRegistry targetRegistry)
        AccessControlDefaultAdminRules(ADMIN_TRANSFER_DELAY, initialAdmin)
    {
        if (address(targetRegistry) == address(0)) revert InvalidRegistry();
        registry = targetRegistry;
    }

    // ---------------------------------------------------------------------
    // Namespace permission management (admin side)
    // ---------------------------------------------------------------------

    function grantNamespaceOperator(bytes8 namespace, address operator)
        external
        onlyRole(NAMESPACE_ADMIN_ROLE)
    {
        if (namespace == bytes8(0)) revert InvalidNamespace();
        _canOperate[namespace][operator] = true;
        emit NamespaceOperatorGranted(namespace, operator);
    }

    function revokeNamespaceOperator(bytes8 namespace, address operator)
        external
        onlyRole(NAMESPACE_ADMIN_ROLE)
    {
        _canOperate[namespace][operator] = false;
        emit NamespaceOperatorRevoked(namespace, operator);
    }

    // ---------------------------------------------------------------------
    // Operator side — forwarding with namespace checks
    // ---------------------------------------------------------------------

    function registerAsset(bytes8 namespace, bytes32 assetId, string calldata metadataRef)
        external
        nonReentrant
    {
        if (namespace == bytes8(0)) revert InvalidNamespace();
        if (!_canOperate[namespace][_msgSender()]) revert UnauthorizedNamespace(namespace, _msgSender());
        bytes8 existing = _assetNamespace[assetId];
        if (existing != bytes8(0)) revert AlreadyBound(assetId, existing);
        _assetNamespace[assetId] = namespace;
        emit AssetBound(assetId, namespace, _msgSender());
        registry.registerAsset(assetId, metadataRef);
    }

    function updateAssetMetadata(bytes32 assetId, string calldata metadataRef) external nonReentrant {
        bytes8 ns = _assetNamespace[assetId];
        if (ns == bytes8(0)) revert NotBound(assetId);
        if (!_canOperate[ns][_msgSender()]) revert UnauthorizedNamespace(ns, _msgSender());
        registry.updateAssetMetadata(assetId, metadataRef);
    }

    function setAssetStatus(bytes32 assetId, IAssetRegistry.AssetStatus newStatus) external nonReentrant {
        bytes8 ns = _assetNamespace[assetId];
        if (ns == bytes8(0)) revert NotBound(assetId);
        if (!_canOperate[ns][_msgSender()]) revert UnauthorizedNamespace(ns, _msgSender());
        registry.setAssetStatus(assetId, newStatus);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function canOperate(bytes8 namespace, address operator) external view returns (bool) {
        return _canOperate[namespace][operator];
    }

    function assetNamespace(bytes32 assetId) external view returns (bytes8) {
        return _assetNamespace[assetId];
    }
}
