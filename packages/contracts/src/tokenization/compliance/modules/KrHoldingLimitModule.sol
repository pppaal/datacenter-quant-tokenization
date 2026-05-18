// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AbstractComplianceModule} from "./AbstractComplianceModule.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title KrHoldingLimitModule
/// @notice Enforces a per-investor holding cap expressed as basis points of
///         total supply, the way KR 자본시장법 / 자본시장법 시행령 frame
///         single-investor concentration limits for KR-licensed tokenized
///         securities. Distinct from `MaxHoldersModule` (which caps holder
///         count) — this caps how MUCH any one wallet can hold.
///
/// @dev Two band tiers:
///        - retail wallets: `retailLimitBps` (default 100bps = 1%)
///        - qualified-investor wallets: `qualifiedLimitBps` (default 1000bps = 10%)
///      A wallet's tier is set by `setQualifiedInvestor`. KR FSC qualified
///      investor screening is off-chain; the IdentityRegistry attestation
///      flow gates which addresses get the tier set.
///
///      Total supply is read from the bound `IERC20` token at check time so
///      the cap auto-scales as new shares are issued.
contract KrHoldingLimitModule is AbstractComplianceModule {
    error InvalidLimits();
    error LimitExceeded(address holder, uint256 wouldHold, uint256 cap);

    event QualifiedInvestorSet(address indexed wallet, bool qualified);
    event LimitsUpdated(uint256 retailLimitBps, uint256 qualifiedLimitBps);

    uint256 public retailLimitBps;
    uint256 public qualifiedLimitBps;
    mapping(address => bool) public qualifiedInvestor;

    /// @dev Owner is the deployer — kept simple; in production wire to the
    ///      same multisig that owns the ModularCompliance contract.
    address public immutable owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "KrHoldingLimitModule: not owner");
        _;
    }

    constructor(
        address compliance_,
        uint256 retailLimitBps_,
        uint256 qualifiedLimitBps_,
        address owner_
    ) AbstractComplianceModule(compliance_) {
        if (retailLimitBps_ == 0 || retailLimitBps_ > 10_000) revert InvalidLimits();
        if (qualifiedLimitBps_ == 0 || qualifiedLimitBps_ > 10_000) revert InvalidLimits();
        if (qualifiedLimitBps_ < retailLimitBps_) revert InvalidLimits();
        retailLimitBps = retailLimitBps_;
        qualifiedLimitBps = qualifiedLimitBps_;
        owner = owner_;
    }

    /// @notice Update the holding limit bands. Restricted to owner.
    function setLimits(uint256 retailLimitBps_, uint256 qualifiedLimitBps_)
        external
        onlyOwner
    {
        if (retailLimitBps_ == 0 || retailLimitBps_ > 10_000) revert InvalidLimits();
        if (qualifiedLimitBps_ == 0 || qualifiedLimitBps_ > 10_000) revert InvalidLimits();
        if (qualifiedLimitBps_ < retailLimitBps_) revert InvalidLimits();
        retailLimitBps = retailLimitBps_;
        qualifiedLimitBps = qualifiedLimitBps_;
        emit LimitsUpdated(retailLimitBps_, qualifiedLimitBps_);
    }

    /// @notice Mark or unmark a wallet as a qualified investor (전문투자자).
    ///         The IdentityRegistry's KYC attestation flow is the source of
    ///         truth for the off-chain qualification — this just mirrors it.
    function setQualifiedInvestor(address wallet, bool qualified) external onlyOwner {
        qualifiedInvestor[wallet] = qualified;
        emit QualifiedInvestorSet(wallet, qualified);
    }

    function name() external pure override returns (string memory) {
        return "KrHoldingLimitModule";
    }

    /// @notice Check whether a transfer / mint would push the recipient
    ///         over their tier's holding cap. Burns and transfers TO the
    ///         zero address are always allowed.
    function moduleCheck(
        address token,
        address /*from*/,
        address to,
        uint256 amount
    ) external view override returns (bool) {
        if (to == address(0)) return true;
        uint256 supply = IERC20(token).totalSupply();
        if (supply == 0) return true;
        uint256 cap = qualifiedInvestor[to]
            ? (supply * qualifiedLimitBps) / 10_000
            : (supply * retailLimitBps) / 10_000;
        uint256 wouldHold = IERC20(token).balanceOf(to) + amount;
        return wouldHold <= cap;
    }

    /// @dev Post-action hooks are no-ops — the module is stateless w.r.t.
    ///      individual transfers (totalSupply + balanceOf give us live
    ///      truth at moduleCheck time). The qualified-investor mapping is
    ///      the only state we maintain.
    function moduleTransferAction(
        address /*token*/,
        address /*from*/,
        address /*to*/,
        uint256 /*amount*/
    ) external view override onlyCompliance {}

    function moduleMintAction(
        address /*token*/,
        address /*to*/,
        uint256 /*amount*/
    ) external view override onlyCompliance {}

    function moduleBurnAction(
        address /*token*/,
        address /*from*/,
        uint256 /*amount*/
    ) external view override onlyCompliance {}
}
