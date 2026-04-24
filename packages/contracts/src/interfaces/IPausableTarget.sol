// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal surface an EmergencyCouncil needs from a protected contract.
///         Matches OpenZeppelin's `Pausable` external API.
interface IPausableTarget {
    function pause() external;
    function unpause() external;
    function paused() external view returns (bool);
}
