// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {IPausableTarget} from "../../interfaces/IPausableTarget.sol";

/// @title NavOracle
/// @notice Tracks the most recent Net Asset Value per-share for a single
///         `AssetToken`. Two off-chain feeds commonly write here: the
///         quarterly NAV strike (from the underwriter) and ad-hoc mark
///         updates during distribution events. The oracle itself performs no
///         averaging or smoothing — downstream consumers (dividend
///         distributor, secondary-market quote engine) are responsible for
///         their own staleness policy.
///
///         Design posture:
///           - Single-asset instance (one oracle per `AssetToken`), which
///             makes authorization simple and prevents cross-asset spoofing.
///           - Monotonic epoch counter so subscribers can detect missed
///             updates, not just timestamp regressions.
///           - Pausable as an incident-response lever; the last-good value
///             remains readable while new writes are blocked.
///
/// @dev NAV values are stored as a fixed-precision integer in "quote units"
///      per base unit — e.g. KRW×10^18 per share. The quote symbol is
///      immutable so downstream consumers can avoid an extra view call.
contract NavOracle is IPausableTarget, AccessControlDefaultAdminRules, Pausable {
    bytes32 public constant ORACLE_WRITER_ROLE = keccak256("ORACLE_WRITER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    error InvalidToken();
    error InvalidQuoteSymbol();
    error InvalidNav();
    error NavStale(uint64 lastTimestamp, uint64 incomingTimestamp);

    event NavPublished(
        uint64 indexed epoch,
        uint256 navPerShare,
        uint64 navTimestamp,
        address indexed writer
    );

    /// @dev Token the oracle is bound to. Immutable to simplify consumer
    ///      verification (one oracle per token).
    address public immutable token;
    bytes32 public immutable quoteSymbol;

    uint64 private _epoch;
    uint256 private _navPerShare;
    uint64 private _navTimestamp;

    constructor(
        address token_,
        bytes32 quoteSymbol_,
        address admin_,
        address writer_,
        address pauser_
    ) AccessControlDefaultAdminRules(3 days, admin_) {
        if (token_ == address(0)) revert InvalidToken();
        if (quoteSymbol_ == bytes32(0)) revert InvalidQuoteSymbol();
        token = token_;
        quoteSymbol = quoteSymbol_;
        _grantRole(ORACLE_WRITER_ROLE, writer_);
        _grantRole(PAUSER_ROLE, pauser_);
    }

    /// @notice Publish a new NAV reading. Enforces strict monotonic
    ///         timestamps so an out-of-order update cannot overwrite a newer
    ///         reading; the timestamp check is on the reading's own
    ///         `navTimestamp`, not `block.timestamp`, so back-dated NAVs
    ///         (e.g. quarter-end) still go through as long as they're newer
    ///         than the previous one.
    function publish(uint256 navPerShare_, uint64 navTimestamp_)
        external
        whenNotPaused
        onlyRole(ORACLE_WRITER_ROLE)
    {
        if (navPerShare_ == 0) revert InvalidNav();
        if (navTimestamp_ <= _navTimestamp) {
            revert NavStale(_navTimestamp, navTimestamp_);
        }

        unchecked {
            _epoch += 1;
        }
        _navPerShare = navPerShare_;
        _navTimestamp = navTimestamp_;
        emit NavPublished(_epoch, navPerShare_, navTimestamp_, msg.sender);
    }

    function latest()
        external
        view
        returns (uint64 epoch, uint256 navPerShare, uint64 navTimestamp)
    {
        return (_epoch, _navPerShare, _navTimestamp);
    }

    function pause() external override onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external override onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function paused() public view override(Pausable, IPausableTarget) returns (bool) {
        return Pausable.paused();
    }
}
