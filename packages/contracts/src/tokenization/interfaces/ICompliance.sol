// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICompliance
/// @notice Pluggable compliance facade attached to an `IAssetToken`. The token
///         calls `canTransfer` before every state change (mint / transfer / burn)
///         and forwards the resulting hook (`created` / `transferred` /
///         `destroyed`) so modules can update internal accounting. A separate
///         `IComplianceModule` is the unit of policy — `ICompliance`
///         implementations aggregate modules and short-circuit on first failure.
interface ICompliance {
    /// @notice Address of the token that is bound to this compliance instance.
    ///         A compliance instance is single-tenant; rebinding requires a fresh
    ///         deployment so module state does not bleed across tokens.
    function token() external view returns (address);

    /// @notice Pure-view check whether `amount` may move from `from` to `to`.
    ///         Mints are encoded as `from = address(0)`; burns as `to = address(0)`.
    function canTransfer(address from, address to, uint256 amount) external view returns (bool);

    /// @notice Hook fired by the token after a successful transfer.
    function transferred(address from, address to, uint256 amount) external;

    /// @notice Hook fired by the token after a successful mint.
    function created(address to, uint256 amount) external;

    /// @notice Hook fired by the token after a successful burn.
    function destroyed(address from, uint256 amount) external;
}
