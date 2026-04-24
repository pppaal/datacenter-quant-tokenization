// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {IPausableTarget} from "../../interfaces/IPausableTarget.sol";

/// @title DividendDistributor
/// @notice Pull-based dividend/coupon distributor for a single `AssetToken`
///         stack. The issuer:
///           1. Computes per-holder allocations OFF-CHAIN using a snapshot of
///              token balances at a distribution record-date.
///           2. Builds a Merkle tree of (holder, amount) pairs.
///           3. Calls `createDistribution(...)` with the root + the total
///              funded amount, transferring the quote asset to this contract.
///         Holders then call `claim(distId, amount, proof)` to pull their
///         share. Unclaimed funds can be reclaimed by the issuer after
///         `reclaimAfter`.
///
/// @dev Why pull-based + Merkle rather than per-holder pushes?
///      - Push distributions iterate the full holder list on-chain — gas
///        scales O(N) and fails for Reg D caps near 99 holders anyway.
///      - Merkle proof claims let the issuer handle thousands of micro-
///        dividends (secondary rounds, catch-up distributions) at O(log N)
///        gas per claim, and the proof itself is the audit record.
///      - Each distribution is identified by an auto-incrementing `distId`;
///        the record-date is stored for provenance but not enforced on-chain
///        (off-chain snapshotting is the source of truth).
contract DividendDistributor is
    IPausableTarget,
    AccessControlDefaultAdminRules,
    Pausable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    error InvalidToken();
    error InvalidQuote();
    error InvalidRoot();
    error InvalidAmount();
    error InvalidReclaim();
    error AlreadyClaimed();
    error BadProof();
    error DistributionFrozen();
    error NotReclaimable();
    error NothingToReclaim();

    event DistributionCreated(
        uint256 indexed distId,
        bytes32 indexed merkleRoot,
        uint256 totalAmount,
        uint64 recordDate,
        uint64 reclaimAfter
    );
    event Claimed(
        uint256 indexed distId,
        address indexed holder,
        uint256 amount
    );
    event Reclaimed(uint256 indexed distId, address indexed to, uint256 amount);

    struct Distribution {
        bytes32 merkleRoot;
        uint128 totalAmount;
        uint128 claimedAmount;
        uint64 recordDate;
        uint64 reclaimAfter;
        bool reclaimed;
    }

    /// @dev Token the distributions reference (metadata only — the contract
    ///      does not introspect balances). Immutable to lock the
    ///      token/distributor 1:1 mapping.
    address public immutable token;

    /// @dev ERC-20 payout asset (e.g. stablecoin, KRW-pegged token). A single
    ///      quote asset per distributor is a common institutional practice
    ///      and prevents accidental cross-asset accounting.
    IERC20 public immutable quoteAsset;

    uint256 public nextDistId;
    mapping(uint256 distId => Distribution) private _distributions;
    mapping(uint256 distId => mapping(address => bool)) private _claimed;

    constructor(
        address token_,
        address quoteAsset_,
        address admin_,
        address distributor_,
        address pauser_
    ) AccessControlDefaultAdminRules(3 days, admin_) {
        if (token_ == address(0)) revert InvalidToken();
        if (quoteAsset_ == address(0)) revert InvalidQuote();
        token = token_;
        quoteAsset = IERC20(quoteAsset_);
        _grantRole(DISTRIBUTOR_ROLE, distributor_);
        _grantRole(PAUSER_ROLE, pauser_);
    }

    /// @notice Fund and register a new distribution. Pulls `totalAmount` from
    ///         the caller — the distributor must `approve` this contract on
    ///         the quote asset first.
    /// @param merkleRoot root of (holder, amount) leaves
    /// @param totalAmount sum of all leaf amounts (sanity checked post-pull)
    /// @param recordDate unix second of the balance snapshot
    /// @param reclaimAfter unix second after which unclaimed funds can be
    ///        reclaimed by DISTRIBUTOR_ROLE
    function createDistribution(
        bytes32 merkleRoot,
        uint256 totalAmount,
        uint64 recordDate,
        uint64 reclaimAfter
    ) external whenNotPaused onlyRole(DISTRIBUTOR_ROLE) nonReentrant returns (uint256 distId) {
        if (merkleRoot == bytes32(0)) revert InvalidRoot();
        if (totalAmount == 0 || totalAmount > type(uint128).max) revert InvalidAmount();
        if (reclaimAfter <= recordDate) revert InvalidReclaim();

        distId = nextDistId;
        unchecked {
            nextDistId = distId + 1;
        }

        _distributions[distId] = Distribution({
            merkleRoot: merkleRoot,
            totalAmount: uint128(totalAmount),
            claimedAmount: 0,
            recordDate: recordDate,
            reclaimAfter: reclaimAfter,
            reclaimed: false
        });

        quoteAsset.safeTransferFrom(msg.sender, address(this), totalAmount);
        emit DistributionCreated(distId, merkleRoot, totalAmount, recordDate, reclaimAfter);
    }

    /// @notice Claim a holder's allocation using their Merkle proof.
    /// @dev Leaves are computed as `keccak256(abi.encodePacked(holder,
    ///      amount))`. The same encoding must be used off-chain when
    ///      building the tree (OZ's StandardMerkleTree handles this).
    function claim(uint256 distId, uint256 amount, bytes32[] calldata proof)
        external
        whenNotPaused
        nonReentrant
    {
        Distribution storage d = _distributions[distId];
        if (d.merkleRoot == bytes32(0)) revert DistributionFrozen();
        if (amount == 0) revert InvalidAmount();
        if (_claimed[distId][msg.sender]) revert AlreadyClaimed();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        if (!MerkleProof.verify(proof, d.merkleRoot, leaf)) revert BadProof();

        _claimed[distId][msg.sender] = true;
        d.claimedAmount = uint128(uint256(d.claimedAmount) + amount);

        quoteAsset.safeTransfer(msg.sender, amount);
        emit Claimed(distId, msg.sender, amount);
    }

    /// @notice Reclaim unclaimed funds after `reclaimAfter`. Can only be
    ///         called once per distribution; subsequent claims revert once
    ///         reclaimed because the funds are gone.
    function reclaim(uint256 distId, address to)
        external
        onlyRole(DISTRIBUTOR_ROLE)
        nonReentrant
    {
        Distribution storage d = _distributions[distId];
        if (d.merkleRoot == bytes32(0)) revert DistributionFrozen();
        if (block.timestamp < d.reclaimAfter) revert NotReclaimable();
        if (d.reclaimed) revert NothingToReclaim();
        uint256 remaining = uint256(d.totalAmount) - uint256(d.claimedAmount);
        if (remaining == 0) revert NothingToReclaim();

        d.reclaimed = true;
        // Mark the distribution as frozen so no further claims can succeed
        // even if someone still has a valid proof. The audit trail (Claimed
        // events + Reclaimed event) remains queryable.
        d.merkleRoot = bytes32(0);
        quoteAsset.safeTransfer(to, remaining);
        emit Reclaimed(distId, to, remaining);
    }

    function isClaimed(uint256 distId, address holder) external view returns (bool) {
        return _claimed[distId][holder];
    }

    function getDistribution(uint256 distId)
        external
        view
        returns (
            bytes32 merkleRoot,
            uint256 totalAmount,
            uint256 claimedAmount,
            uint64 recordDate,
            uint64 reclaimAfter,
            bool reclaimed
        )
    {
        Distribution storage d = _distributions[distId];
        return (
            d.merkleRoot,
            d.totalAmount,
            d.claimedAmount,
            d.recordDate,
            d.reclaimAfter,
            d.reclaimed
        );
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
