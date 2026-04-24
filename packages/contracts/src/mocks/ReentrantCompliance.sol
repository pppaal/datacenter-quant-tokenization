// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICompliance} from "../tokenization/interfaces/ICompliance.sol";

interface IReentrantAssetToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function forceTransfer(address from, address to, uint256 amount, bytes32 reason) external;
}

/// @notice Test-only ICompliance implementation that attempts to re-enter the
///         bound AssetToken through mint/burn/forceTransfer during its own
///         hook callbacks. Used to assert that the token's `nonReentrant`
///         guard intercepts a hostile compliance contract.
/// @dev Not intended for deployment; lives in src/mocks/ so hardhat compiles
///      it alongside production contracts.
contract ReentrantCompliance is ICompliance {
    address public _token;
    IReentrantAssetToken public target;
    uint8 public reentryMode; // 0 = off, 1 = mint, 2 = burn, 3 = forceTransfer
    address public reentryWallet;
    uint256 public reentryAmount;

    function arm(
        IReentrantAssetToken target_,
        uint8 mode,
        address wallet,
        uint256 amount
    ) external {
        target = target_;
        reentryMode = mode;
        reentryWallet = wallet;
        reentryAmount = amount;
    }

    function token() external view returns (address) {
        return _token;
    }

    function canTransfer(address, address, uint256) external pure returns (bool) {
        return true;
    }

    function transferred(address, address, uint256) external {
        _maybeReenter();
    }

    function created(address, uint256) external {
        _maybeReenter();
    }

    function destroyed(address, uint256) external {
        _maybeReenter();
    }

    function _maybeReenter() private {
        if (reentryMode == 1) {
            target.mint(reentryWallet, reentryAmount);
        } else if (reentryMode == 2) {
            target.burn(reentryWallet, reentryAmount);
        } else if (reentryMode == 3) {
            target.forceTransfer(reentryWallet, reentryWallet, reentryAmount, bytes32(0));
        }
    }
}
