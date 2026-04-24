// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Narrow surface that settlement adapters (e.g. `TransferAgent`)
///         need from an `AssetToken`. Kept standalone so those adapters do
///         not pull in the full `IAssetToken` event / admin surface.
interface IAssetTokenForceTransfer {
    function forceTransfer(address from, address to, uint256 amount, bytes32 reason) external;
}
