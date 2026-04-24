// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AbstractComplianceModule} from "./AbstractComplianceModule.sol";

/// @title MaxHoldersModule
/// @notice Enforces a hard ceiling on the number of distinct token holders.
///         Reg D 506(c) and various private-placement frameworks cap holder
///         count; this module rejects any transfer / mint that would push the
///         distinct-holder set above `cap`.
/// @dev "Holder" = address with non-zero balance after the action. The module
///      tracks the set incrementally via `moduleTransferAction` /
///      `moduleMintAction` / `moduleBurnAction`, so it must be attached BEFORE
///      any tokens are minted; attaching to an already-non-empty token would
///      desync `_holderCount` from on-chain reality.
contract MaxHoldersModule is AbstractComplianceModule {
    error InvalidCap();

    event HolderAdded(address indexed token, address indexed holder, uint256 newCount);
    event HolderRemoved(address indexed token, address indexed holder, uint256 newCount);

    uint256 public immutable cap;
    mapping(address token => uint256) private _holderCount;
    mapping(address token => mapping(address holder => bool)) private _isHolder;

    constructor(address compliance_, uint256 cap_) AbstractComplianceModule(compliance_) {
        if (cap_ == 0) revert InvalidCap();
        cap = cap_;
    }

    function name() external pure returns (string memory) {
        return "MaxHolders";
    }

    function moduleCheck(address token, address /* from */, address to, uint256 amount)
        external
        view
        returns (bool)
    {
        if (amount == 0) return true;
        if (to == address(0)) return true; // burn never increases holder count
        if (_isHolder[token][to]) return true; // already a holder
        // would add a new holder
        return _holderCount[token] < cap;
    }

    function moduleTransferAction(address token, address from, address to, uint256 amount)
        external
        onlyCompliance
    {
        _onIn(token, to, amount);
        _onOut(token, from, amount);
    }

    function moduleMintAction(address token, address to, uint256 amount) external onlyCompliance {
        _onIn(token, to, amount);
    }

    function moduleBurnAction(address token, address from, uint256 amount) external onlyCompliance {
        _onOut(token, from, amount);
    }

    function holderCount(address token) external view returns (uint256) {
        return _holderCount[token];
    }

    function isHolder(address token, address wallet) external view returns (bool) {
        return _isHolder[token][wallet];
    }

    function _onIn(address token, address to, uint256 amount) private {
        if (amount == 0 || to == address(0)) return;
        if (!_isHolder[token][to]) {
            _isHolder[token][to] = true;
            uint256 newCount = ++_holderCount[token];
            emit HolderAdded(token, to, newCount);
        }
    }

    function _onOut(address token, address from, uint256 amount) private {
        if (amount == 0 || from == address(0)) return;
        // Holder accounting requires reading the post-action balance from the
        // token. The token contract is the caller (via compliance), and balance
        // changes are already reflected by the time the hook fires.
        if (_isHolder[token][from] && _balanceOf(token, from) == 0) {
            _isHolder[token][from] = false;
            uint256 newCount = --_holderCount[token];
            emit HolderRemoved(token, from, newCount);
        }
    }

    function _balanceOf(address token, address account) private view returns (uint256) {
        // Minimal ERC20 balanceOf staticcall to avoid pulling the full IERC20.
        (bool ok, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address)", account)
        );
        if (!ok || data.length < 32) return 0;
        return abi.decode(data, (uint256));
    }
}
