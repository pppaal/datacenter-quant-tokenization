// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAssetToken
/// @notice Surface exposed by the security token issued against an off-chain
///         asset record in `IAssetRegistry`. The token is intentionally minimal
///         and registry-anchored: every instance is bound at construction to
///         exactly one `(assetRegistry, registryAssetId)` pair. Compliance and
///         identity verification are delegated to swappable modules.
interface IAssetToken {
    event IdentityRegistryUpdated(address indexed previous, address indexed current);
    event ComplianceUpdated(address indexed previous, address indexed current);
    event RecoveryAddressUpdated(address indexed previous, address indexed current);
    event ForcedTransfer(
        address indexed from,
        address indexed to,
        uint256 amount,
        address indexed agent,
        bytes32 reason
    );

    /// @notice Address of the off-chain asset registry this token is anchored to.
    function assetRegistry() external view returns (address);

    /// @notice Registry asset id (bytes32) this token represents 1:1.
    function registryAssetId() external view returns (bytes32);

    /// @notice Active identity (KYC) registry.
    function identityRegistry() external view returns (address);

    /// @notice Active compliance module aggregator.
    function compliance() external view returns (address);
}
