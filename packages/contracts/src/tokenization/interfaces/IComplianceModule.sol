// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IComplianceModule
/// @notice One unit of transfer policy (e.g. max-holder cap, country block,
///         lockup window). Modules are stateful and bound to a single
///         compliance contract so accounting cannot bleed across tokens.
interface IComplianceModule {
    /// @notice Short, human-readable name (used in revert reasons + tooling).
    function name() external view returns (string memory);

    /// @notice True iff the module would allow `amount` to move from `from` to
    ///         `to`. Mints are encoded as `from = address(0)`; burns as
    ///         `to = address(0)`. Must be a pure view — never reverts on the
    ///         normal "no" answer; reverts only on programmer error
    ///         (e.g. wrong caller).
    function moduleCheck(
        address token,
        address from,
        address to,
        uint256 amount
    ) external view returns (bool);

    /// @notice Post-transfer hook. The compliance contract MUST call this after
    ///         a successful transfer so the module can update internal counters
    ///         (e.g. holder set, lockup release timers).
    function moduleTransferAction(
        address token,
        address from,
        address to,
        uint256 amount
    ) external;

    function moduleMintAction(address token, address to, uint256 amount) external;

    function moduleBurnAction(address token, address from, uint256 amount) external;
}
