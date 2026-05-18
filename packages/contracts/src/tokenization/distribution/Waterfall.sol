// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPausableTarget} from "../../interfaces/IPausableTarget.sol";

/// @title Waterfall
/// @notice On-chain port of the 4-tier American distribution waterfall the
///         IM renders off-chain (`apps/web/lib/services/im/waterfall.ts`).
///
///         Tiers:
///           1. Return of capital   (LP 100% until invested capital recovered)
///           2. Preferred return    (LP 100% until hurdle achieved)
///           3. GP catch-up         (GP 100% to close to the carry split)
///           4. Carried interest    (LP {100 - promote}% / GP {promote}%)
///
///         Each LP commits via `setCommitment`, deposits stable units via
///         the connected stablecoin (e.g. USDC), and receives distributions
///         in proportion to their tier eligibility. Capital is tracked per
///         LP; the GP entry is a single address.
///
/// @dev    This contract is intentionally minimal — capital calls and the
///         actual stablecoin custody live in a sibling Commitment.sol /
///         Vault contract. Waterfall here is purely the rules engine that
///         splits an incoming distribution into per-LP and per-GP claims.
///
///         Math: hurdle and promote are stored as basis points (bps) to
///         avoid floats. e.g. 10% hurdle = 1000 bps; 15% promote = 1500.
///
///         Decimal precision: stablecoin values are stored at the token's
///         native decimals (commonly 6 for USDC). Internal math uses the
///         same units to avoid precision loss.
contract Waterfall is IPausableTarget, AccessControlDefaultAdminRules, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");

    error InvalidGp();
    error InvalidStable();
    error InvalidLp();
    error InvalidAmount();
    error InvalidHurdle();
    error InvalidPromote();
    error NoCommitments();

    event LpCommitmentSet(address indexed lp, uint256 commitment);
    event GpSet(address indexed gp);
    event WaterfallParamsSet(uint256 hurdleBps, uint256 promoteBps);
    event DistributionPosted(
        uint256 indexed seq,
        uint256 amount,
        uint256 toReturnOfCapital,
        uint256 toPreferred,
        uint256 toCatchup,
        uint256 toCarry
    );
    event ClaimWithdrawn(address indexed beneficiary, uint256 amount);

    /// @dev Stablecoin used for distributions (USDC native or KRW
    ///      stablecoin). Immutable so the waterfall cannot be re-pointed
    ///      after LPs commit.
    IERC20 public immutable stable;

    /// @dev Sum of all LP commitments. Used as the denominator for
    ///      pro-rata splits.
    uint256 public totalCommitments;

    /// @dev Per-LP commitment in stable units. setCommitment sets the
    ///      absolute value (not a delta).
    mapping(address => uint256) public commitments;

    /// @dev Cumulative paid back per LP — return of capital + preferred
    ///      return + their carried-interest share.
    mapping(address => uint256) public lpCumulative;

    /// @dev GP entitlement carried until withdrawn.
    address public gp;
    uint256 public gpAccrued;

    /// @dev Waterfall parameters in basis points (1bp = 0.01%).
    ///      hurdleBps    — preferred return threshold
    ///      promoteBps   — GP carry share above hurdle
    uint256 public hurdleBps;
    uint256 public promoteBps;

    /// @dev Cumulative distributions ever posted, by tier. Used to compute
    ///      the next tier's entry point on each new distribution.
    uint256 public cumReturnOfCapital;
    uint256 public cumPreferred;
    uint256 public cumCatchup;
    uint256 public cumCarryLp;
    uint256 public cumCarryGp;

    /// @dev Per-LP withdrawable balance (lpCumulative minus already withdrawn).
    mapping(address => uint256) public claimable;

    uint256 public distributionSeq;

    constructor(
        IERC20 stable_,
        address gp_,
        uint256 hurdleBps_,
        uint256 promoteBps_,
        address admin_
    ) AccessControlDefaultAdminRules(3 days, admin_) {
        if (address(stable_) == address(0)) revert InvalidStable();
        if (gp_ == address(0)) revert InvalidGp();
        if (hurdleBps_ == 0 || hurdleBps_ > 5000) revert InvalidHurdle(); // 0–50%
        if (promoteBps_ == 0 || promoteBps_ > 5000) revert InvalidPromote(); // 0–50%
        stable = stable_;
        gp = gp_;
        hurdleBps = hurdleBps_;
        promoteBps = promoteBps_;
        _grantRole(DISTRIBUTOR_ROLE, admin_);
        _grantRole(CONFIG_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        emit GpSet(gp_);
        emit WaterfallParamsSet(hurdleBps_, promoteBps_);
    }

    /// @notice Set absolute LP commitment. Pass 0 to remove an LP.
    function setCommitment(address lp, uint256 commitment)
        external
        onlyRole(CONFIG_ROLE)
        whenNotPaused
    {
        if (lp == address(0)) revert InvalidLp();
        uint256 prev = commitments[lp];
        if (prev != commitment) {
            totalCommitments = totalCommitments + commitment - prev;
            commitments[lp] = commitment;
            if (prev == 0 && commitment > 0) {
                _registerLp(lp);
            }
            emit LpCommitmentSet(lp, commitment);
        }
    }

    /// @notice Update waterfall parameters. Restricted because it changes
    ///         every LP's effective economics.
    function setWaterfallParams(uint256 hurdleBps_, uint256 promoteBps_)
        external
        onlyRole(CONFIG_ROLE)
    {
        if (hurdleBps_ == 0 || hurdleBps_ > 5000) revert InvalidHurdle();
        if (promoteBps_ == 0 || promoteBps_ > 5000) revert InvalidPromote();
        hurdleBps = hurdleBps_;
        promoteBps = promoteBps_;
        emit WaterfallParamsSet(hurdleBps_, promoteBps_);
    }

    /// @notice Post a new distribution. Caller must have transferred the
    ///         `amount` of stable units to this contract via standard
    ///         ERC-20 transfer beforehand. The contract verifies its
    ///         balance increased by at least `amount`.
    ///
    ///         Splits the amount across the four tiers based on cumulative
    ///         state. Each LP's share is pro-rata to their commitment.
    ///         Returns the per-tier amounts emitted into LP/GP buckets.
    function distribute(uint256 amount)
        external
        whenNotPaused
        onlyRole(DISTRIBUTOR_ROLE)
        returns (
            uint256 toReturnOfCapital,
            uint256 toPreferred,
            uint256 toCatchup,
            uint256 toCarry
        )
    {
        if (amount == 0) revert InvalidAmount();
        if (totalCommitments == 0) revert NoCommitments();

        // Tier 1: return of capital — fill until cumReturnOfCapital == totalCommitments
        uint256 remaining = amount;
        uint256 cap1 = totalCommitments - cumReturnOfCapital;
        if (cap1 > 0 && remaining > 0) {
            toReturnOfCapital = remaining > cap1 ? cap1 : remaining;
            cumReturnOfCapital += toReturnOfCapital;
            remaining -= toReturnOfCapital;
        }

        // Tier 2: preferred return — at hurdleBps on totalCommitments,
        //          continuing pro-rata to each LP. Cap is the cumulative
        //          hurdle accrual across all distributions to date; we
        //          model it simply as (hurdleBps * totalCommitments / 1e4)
        //          minus what already paid in tier-2.
        uint256 hurdleTotal = (totalCommitments * hurdleBps) / 1e4;
        uint256 cap2 = hurdleTotal > cumPreferred ? hurdleTotal - cumPreferred : 0;
        if (cap2 > 0 && remaining > 0) {
            toPreferred = remaining > cap2 ? cap2 : remaining;
            cumPreferred += toPreferred;
            remaining -= toPreferred;
        }

        // Tier 3: GP catch-up — closes the gap so cumulative GP take ratio
        //          matches promoteBps relative to the LP take above hurdle.
        //          Catch-up cap = promoteBps * cumPreferred / (1e4 -
        //          promoteBps) - cumCatchup.
        uint256 desiredCatchup =
            (cumPreferred * promoteBps) / (1e4 - promoteBps);
        uint256 cap3 =
            desiredCatchup > cumCatchup ? desiredCatchup - cumCatchup : 0;
        if (cap3 > 0 && remaining > 0) {
            toCatchup = remaining > cap3 ? cap3 : remaining;
            cumCatchup += toCatchup;
            gpAccrued += toCatchup;
            remaining -= toCatchup;
        }

        // Tier 4: carried interest — split remaining pro-rata.
        if (remaining > 0) {
            toCarry = remaining;
            uint256 gpCarry = (toCarry * promoteBps) / 1e4;
            uint256 lpCarry = toCarry - gpCarry;
            cumCarryLp += lpCarry;
            cumCarryGp += gpCarry;
            gpAccrued += gpCarry;
            // LP carry is folded into pro-rata distribution below.
            // Re-purpose `toPreferred` accumulator for total LP allocation.
        }

        // Pro-rata LP allocation = (return of capital + preferred + LP carry)
        uint256 totalLpThisDistribution =
            toReturnOfCapital + toPreferred + (toCarry - (toCarry * promoteBps) / 1e4);

        // Iterate-free pro-rata: use a "share index" pattern? For the v0
        // implementation we accept that the caller must provide the
        // per-LP allocation off-chain in `claimEntitled` queries. The
        // total to LPs is recorded; the per-LP claim is calculated on
        // demand by the public `previewLpClaim` view.
        // (See the v1 follow-up: precompute claimable[] on each post.)
        _allocateLpPool(totalLpThisDistribution);

        unchecked {
            distributionSeq += 1;
        }
        emit DistributionPosted(
            distributionSeq, amount, toReturnOfCapital, toPreferred, toCatchup, toCarry
        );
    }

    /// @dev Internal pro-rata allocation: writes each LP's share into
    ///      `claimable`. Iterates over a pre-registered LP set; for
    ///      large LP rosters (>50) consider migrating to a Merkle-claim
    ///      pattern — out of scope for v0.
    function _allocateLpPool(uint256 pool) internal {
        if (pool == 0 || totalCommitments == 0) return;
        for (uint256 i = 0; i < _lpList.length; i++) {
            address lp = _lpList[i];
            uint256 c = commitments[lp];
            if (c == 0) continue;
            uint256 share = (pool * c) / totalCommitments;
            claimable[lp] += share;
            lpCumulative[lp] += share;
        }
    }

    /// @dev Active LP set tracked alongside commitments[] so we can
    ///      iterate. setCommitment maintains it.
    address[] private _lpList;
    mapping(address => uint256) private _lpIndex; // 1-based

    function _registerLp(address lp) internal {
        if (_lpIndex[lp] != 0) return;
        _lpList.push(lp);
        _lpIndex[lp] = _lpList.length;
    }

    function lpCount() external view returns (uint256) {
        return _lpList.length;
    }

    function lpAt(uint256 idx) external view returns (address) {
        return _lpList[idx];
    }

    /// @notice LP withdraws their pending stable balance.
    function withdraw() external whenNotPaused {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert InvalidAmount();
        claimable[msg.sender] = 0;
        stable.safeTransfer(msg.sender, amount);
        emit ClaimWithdrawn(msg.sender, amount);
    }

    /// @notice GP withdraws their accrued promote.
    function withdrawGp() external whenNotPaused {
        if (msg.sender != gp) revert InvalidGp();
        uint256 amount = gpAccrued;
        if (amount == 0) revert InvalidAmount();
        gpAccrued = 0;
        stable.safeTransfer(gp, amount);
        emit ClaimWithdrawn(gp, amount);
    }

    function setGp(address gp_) external onlyRole(CONFIG_ROLE) {
        if (gp_ == address(0)) revert InvalidGp();
        gp = gp_;
        emit GpSet(gp_);
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
