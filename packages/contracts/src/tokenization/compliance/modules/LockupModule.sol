// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AbstractComplianceModule} from "./AbstractComplianceModule.sol";

/// @title LockupModule
/// @notice Implements a global outbound-transfer lockup: every wallet that
///         receives tokens (mint or transfer) is barred from transferring out
///         until `lockupSeconds` have elapsed since the LATEST inbound action.
///         Reg D 506(c) issuances commonly use 6- or 12-month lockups; setting
///         `lockupSeconds = 0` makes the module a no-op (useful as a
///         keep-the-slot placeholder ahead of a future change).
/// @dev Burns are always allowed — the issuer can force a redemption even
///      while the holder is locked.
contract LockupModule is AbstractComplianceModule {
    event LockReleaseUpdated(address indexed token, address indexed wallet, uint64 releaseAt);

    uint64 public immutable lockupSeconds;

    /// @dev token => wallet => unix timestamp at which outbound transfers are
    ///      allowed again. 0 means "never received any tokens".
    mapping(address token => mapping(address wallet => uint64 releaseAt)) private _releaseAt;

    constructor(address compliance_, uint64 lockupSeconds_) AbstractComplianceModule(compliance_) {
        lockupSeconds = lockupSeconds_;
    }

    function name() external pure returns (string memory) {
        return "Lockup";
    }

    function moduleCheck(address token, address from, address to, uint256 amount)
        external
        view
        returns (bool)
    {
        if (amount == 0) return true;
        if (from == address(0)) return true; // mint always allowed
        if (to == address(0)) return true; // burn always allowed
        if (lockupSeconds == 0) return true;
        uint64 storedRelease = _releaseAt[token][from];
        // 0 means the wallet has no recorded inbound history — disallow
        // outbound until they receive at least once (defense in depth: nothing
        // legitimate sends from a never-credited wallet).
        if (storedRelease == 0) return false;
        return block.timestamp >= storedRelease;
    }

    function moduleTransferAction(address token, address, /* from */ address to, uint256 amount)
        external
        onlyCompliance
    {
        _onIn(token, to, amount);
    }

    function moduleMintAction(address token, address to, uint256 amount) external onlyCompliance {
        _onIn(token, to, amount);
    }

    function moduleBurnAction(address, address, uint256) external onlyCompliance {}

    function releaseAt(address token, address wallet) external view returns (uint64) {
        return _releaseAt[token][wallet];
    }

    function _onIn(address token, address to, uint256 amount) private {
        if (amount == 0 || to == address(0)) return;
        uint64 newRelease = uint64(block.timestamp) + lockupSeconds;
        _releaseAt[token][to] = newRelease;
        emit LockReleaseUpdated(token, to, newRelease);
    }
}
