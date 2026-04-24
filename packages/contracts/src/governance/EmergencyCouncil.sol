// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPausableTarget} from "../interfaces/IPausableTarget.sol";

/// @title EmergencyCouncil
/// @notice Governance contract that holds PAUSER_ROLE on a target contract
///         (e.g. DataCenterAssetRegistry) and enforces asymmetric authority:
///
///         - Any single MEMBER can trigger `pause()` immediately (fast circuit
///           breaker for ongoing incidents — delay would be harmful).
///         - `unpause()` requires an M-of-N approval from MEMBERs via
///           time-boxed proposals (slow, reversible by attacker pressure
///           requires collusion, not a single key).
///
///         This asymmetric design is deliberate: pausing a registry has a
///         bounded blast radius (writes stop, reads still work), so a single
///         compromised key causing a DoS is tolerable. Unpausing into an
///         unsafe state is what we *must* prevent, hence the threshold.
///
/// @dev Deployment pattern:
///         1. Deploy registry with its own admin Safe.
///         2. Deploy council with admin = Safe, target = registry.
///         3. Registry admin grants PAUSER_ROLE on the registry to the council address.
///         4. (Optional) Registry admin revokes PAUSER_ROLE from EOA pausers.
contract EmergencyCouncil is AccessControlDefaultAdminRules, ReentrancyGuard {
    bytes32 public constant MEMBER_ROLE = keccak256("COUNCIL_MEMBER_ROLE");

    uint48 private constant ADMIN_TRANSFER_DELAY = 2 days;
    uint64 public constant MIN_PROPOSAL_TTL = 1 hours;
    uint64 public constant MAX_PROPOSAL_TTL = 30 days;

    IPausableTarget public immutable protectedContract;

    uint32 public unpauseThreshold;

    struct UnpauseProposal {
        uint64 createdAt;
        uint64 expiresAt;
        bool executed;
        uint32 approvals;
    }

    uint256 public nextProposalId;
    mapping(uint256 proposalId => UnpauseProposal) private _proposals;
    mapping(uint256 proposalId => mapping(address member => bool)) private _approved;

    error InvalidTarget();
    error InvalidThreshold();
    error InvalidTtl(uint64 ttl);
    error ProposalNotFound(uint256 proposalId);
    error ProposalExpired(uint256 proposalId);
    error ProposalAlreadyExecuted(uint256 proposalId);
    error AlreadyApproved(uint256 proposalId, address member);

    event EmergencyPause(address indexed member);
    event UnpauseProposed(uint256 indexed proposalId, address indexed proposer, uint64 expiresAt);
    event UnpauseApproved(uint256 indexed proposalId, address indexed approver, uint32 approvals);
    event UnpauseExecuted(uint256 indexed proposalId, uint32 approvals, uint32 threshold);
    event UnpauseThresholdChanged(uint32 previousThreshold, uint32 newThreshold);

    constructor(address initialAdmin, IPausableTarget pausableTarget, uint32 initialThreshold)
        AccessControlDefaultAdminRules(ADMIN_TRANSFER_DELAY, initialAdmin)
    {
        if (address(pausableTarget) == address(0)) revert InvalidTarget();
        if (initialThreshold == 0) revert InvalidThreshold();
        protectedContract = pausableTarget;
        unpauseThreshold = initialThreshold;
        emit UnpauseThresholdChanged(0, initialThreshold);
    }

    // ---------------------------------------------------------------------
    // Pause (single-key, instant)
    // ---------------------------------------------------------------------

    /// @notice Any single MEMBER can halt the target. Idempotent: silent no-op
    ///         if already paused, so a race between two members does not revert.
    function emergencyPause() external onlyRole(MEMBER_ROLE) nonReentrant {
        if (!protectedContract.paused()) {
            protectedContract.pause();
        }
        emit EmergencyPause(_msgSender());
    }

    // ---------------------------------------------------------------------
    // Unpause (threshold-gated proposal flow)
    // ---------------------------------------------------------------------

    function proposeUnpause(uint64 ttl) external onlyRole(MEMBER_ROLE) nonReentrant returns (uint256 id) {
        if (ttl < MIN_PROPOSAL_TTL || ttl > MAX_PROPOSAL_TTL) revert InvalidTtl(ttl);
        id = nextProposalId++;
        uint64 expiresAt = uint64(block.timestamp + ttl);
        _proposals[id] = UnpauseProposal({
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            executed: false,
            approvals: 1
        });
        _approved[id][_msgSender()] = true;
        emit UnpauseProposed(id, _msgSender(), expiresAt);
        emit UnpauseApproved(id, _msgSender(), 1);
        _maybeExecute(id);
    }

    function approveUnpause(uint256 proposalId) external onlyRole(MEMBER_ROLE) nonReentrant {
        UnpauseProposal storage p = _proposals[proposalId];
        if (p.createdAt == 0) revert ProposalNotFound(proposalId);
        if (p.executed) revert ProposalAlreadyExecuted(proposalId);
        if (block.timestamp > p.expiresAt) revert ProposalExpired(proposalId);
        if (_approved[proposalId][_msgSender()]) revert AlreadyApproved(proposalId, _msgSender());

        _approved[proposalId][_msgSender()] = true;
        p.approvals += 1;
        emit UnpauseApproved(proposalId, _msgSender(), p.approvals);
        _maybeExecute(proposalId);
    }

    function _maybeExecute(uint256 proposalId) private {
        UnpauseProposal storage p = _proposals[proposalId];
        if (p.approvals < unpauseThreshold) return;
        p.executed = true;
        if (protectedContract.paused()) {
            protectedContract.unpause();
        }
        emit UnpauseExecuted(proposalId, p.approvals, unpauseThreshold);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setUnpauseThreshold(uint32 newThreshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newThreshold == 0) revert InvalidThreshold();
        uint32 previous = unpauseThreshold;
        unpauseThreshold = newThreshold;
        emit UnpauseThresholdChanged(previous, newThreshold);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getProposal(uint256 proposalId)
        external
        view
        returns (uint64 createdAt, uint64 expiresAt, bool executed, uint32 approvals)
    {
        UnpauseProposal storage p = _proposals[proposalId];
        return (p.createdAt, p.expiresAt, p.executed, p.approvals);
    }

    function hasApproved(uint256 proposalId, address member) external view returns (bool) {
        return _approved[proposalId][member];
    }
}
