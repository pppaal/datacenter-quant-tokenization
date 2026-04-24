// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IAssetToken} from "../interfaces/IAssetToken.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {ICompliance} from "../interfaces/ICompliance.sol";
import {IPausableTarget} from "../../interfaces/IPausableTarget.sol";

interface IAssetTokenForceTransfer {
    function forceTransfer(address from, address to, uint256 amount, bytes32 reason) external;
}

/// @title TransferAgent
/// @notice Off-order-book pre-clearance layer for OTC transfers of an
///         `AssetToken`. Broker-dealers open a ticket on behalf of a seller +
///         buyer, the issuer reviews KYC / accreditation / sanctions /
///         lockup exceptions, and then either rejects or approves. Once
///         approved and funded via `fundWithAllowance` (seller has already
///         approved this contract for the share amount), anyone can call
///         `settle()` which pulls the shares via `forceTransfer` on the
///         underlying token.
/// @dev The agent must hold `AGENT_ROLE` on the target `AssetToken` for
///      settlement to succeed. This is intentional — settlement bypasses the
///      standard compliance gate because the issuer has already pre-cleared
///      the trade off-chain (the whole point of an RFQ flow). We still run
///      `identityRegistry.isVerified(buyer)` at approval time to prevent
///      misuse, mirroring `AssetToken.forceTransfer`.
contract TransferAgent is IPausableTarget, AccessControlDefaultAdminRules, Pausable, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint48 private constant ADMIN_TRANSFER_DELAY = 3 days;

    enum TicketStatus {
        Pending,   // opened by operator, awaiting issuer decision
        Approved,  // issuer approved; settlement allowed until expiresAt
        Rejected,  // issuer rejected; terminal
        Settled,   // settlement executed; terminal
        Expired,   // past expiresAt; terminal (lazy-set on settle attempt)
        Cancelled  // withdrawn by operator before issuer decision; terminal
    }

    struct Ticket {
        address token;             // AssetToken address this ticket binds to
        address seller;            // current holder
        address buyer;             // verified recipient
        uint256 shareAmount;       // in token base units
        uint256 quotePrice;        // informational — price * shares, in quote asset units
        bytes32 quoteAsset;        // informational — symbol (e.g. bytes32("KRW"))
        uint64 expiresAt;          // unix seconds; 0 = never
        bytes32 rfqRef;            // off-chain RFQ identifier for audit join
        TicketStatus status;
        address openedBy;          // operator who opened
        address decidedBy;         // issuer who approved/rejected (0 if pending)
    }

    uint256 public ticketCount;
    mapping(uint256 => Ticket) private _tickets;

    error InvalidToken();
    error InvalidParty();
    error InvalidAmount();
    error InvalidExpiry();
    error TicketNotFound(uint256 ticketId);
    error TicketNotPending(uint256 ticketId);
    error TicketNotApproved(uint256 ticketId);
    error TicketExpired(uint256 ticketId);
    error BuyerNotVerified(address buyer);
    error NotAuthorized(address caller);

    event TicketOpened(
        uint256 indexed ticketId,
        address indexed token,
        address indexed seller,
        address buyer,
        uint256 shareAmount,
        bytes32 rfqRef,
        address openedBy
    );
    event TicketApproved(uint256 indexed ticketId, address indexed decidedBy, uint64 expiresAt);
    event TicketRejected(uint256 indexed ticketId, address indexed decidedBy, bytes32 reason);
    event TicketCancelled(uint256 indexed ticketId, address indexed cancelledBy, bytes32 reason);
    event TicketSettled(uint256 indexed ticketId, address indexed settledBy);
    event TicketExpiredExplicit(uint256 indexed ticketId, address indexed caller);

    constructor(address initialAdmin)
        AccessControlDefaultAdminRules(ADMIN_TRANSFER_DELAY, initialAdmin)
    {}

    function pause() external override onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external override onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function paused() public view override(Pausable, IPausableTarget) returns (bool) {
        return Pausable.paused();
    }

    // --- ticket lifecycle -----------------------------------------------

    function openTicket(
        address token,
        address seller,
        address buyer,
        uint256 shareAmount,
        uint256 quotePrice,
        bytes32 quoteAsset,
        uint64 expiresAt,
        bytes32 rfqRef
    ) external whenNotPaused onlyRole(OPERATOR_ROLE) returns (uint256 ticketId) {
        if (token == address(0)) revert InvalidToken();
        if (seller == address(0) || buyer == address(0) || seller == buyer) revert InvalidParty();
        if (shareAmount == 0) revert InvalidAmount();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiry();

        ticketId = ++ticketCount;
        _tickets[ticketId] = Ticket({
            token: token,
            seller: seller,
            buyer: buyer,
            shareAmount: shareAmount,
            quotePrice: quotePrice,
            quoteAsset: quoteAsset,
            expiresAt: expiresAt,
            rfqRef: rfqRef,
            status: TicketStatus.Pending,
            openedBy: _msgSender(),
            decidedBy: address(0)
        });

        emit TicketOpened(ticketId, token, seller, buyer, shareAmount, rfqRef, _msgSender());
    }

    function approveTicket(uint256 ticketId)
        external
        whenNotPaused
        onlyRole(ISSUER_ROLE)
    {
        Ticket storage t = _requireTicket(ticketId);
        if (t.status != TicketStatus.Pending) revert TicketNotPending(ticketId);
        if (t.expiresAt != 0 && t.expiresAt <= block.timestamp) {
            // State mutation would be rolled back on revert, so we just fail
            // fast and let callers use `expireTicket()` to persist the new
            // terminal state (or let the ticket stay Pending until then).
            revert TicketExpired(ticketId);
        }

        // Verify buyer against the token's live identity registry so we fail
        // fast instead of at settlement. The compliance modules (max holders,
        // lockup, country) are intentionally bypassed — the issuer is
        // signalling an exception by approving.
        address idReg = IAssetToken(t.token).identityRegistry();
        if (!IIdentityRegistry(idReg).isVerified(t.buyer)) revert BuyerNotVerified(t.buyer);

        t.status = TicketStatus.Approved;
        t.decidedBy = _msgSender();
        emit TicketApproved(ticketId, _msgSender(), t.expiresAt);
    }

    function rejectTicket(uint256 ticketId, bytes32 reason)
        external
        whenNotPaused
        onlyRole(ISSUER_ROLE)
    {
        Ticket storage t = _requireTicket(ticketId);
        if (t.status != TicketStatus.Pending) revert TicketNotPending(ticketId);
        t.status = TicketStatus.Rejected;
        t.decidedBy = _msgSender();
        emit TicketRejected(ticketId, _msgSender(), reason);
    }

    /// @notice Anyone may call to persist the Expired terminal state for a
    ///         ticket whose `expiresAt` has passed. This lets admins cleanly
    ///         close out abandoned tickets in analytics / UIs without a
    ///         privileged role.
    function expireTicket(uint256 ticketId) external whenNotPaused {
        Ticket storage t = _requireTicket(ticketId);
        if (t.status != TicketStatus.Pending && t.status != TicketStatus.Approved) {
            revert TicketNotPending(ticketId);
        }
        if (t.expiresAt == 0 || t.expiresAt > block.timestamp) {
            revert InvalidExpiry();
        }
        t.status = TicketStatus.Expired;
        emit TicketExpiredExplicit(ticketId, _msgSender());
    }

    function cancelTicket(uint256 ticketId, bytes32 reason)
        external
        whenNotPaused
    {
        Ticket storage t = _requireTicket(ticketId);
        if (t.status != TicketStatus.Pending) revert TicketNotPending(ticketId);
        // Only the operator who opened, or an ISSUER_ROLE holder, can cancel.
        if (_msgSender() != t.openedBy && !hasRole(ISSUER_ROLE, _msgSender())) {
            revert NotAuthorized(_msgSender());
        }
        t.status = TicketStatus.Cancelled;
        emit TicketCancelled(ticketId, _msgSender(), reason);
    }

    /// @notice Execute a pre-approved ticket. Anyone may call once the ticket
    ///         is in `Approved` state; the force-transfer on the underlying
    ///         token is what actually moves shares. The agent must hold
    ///         `AGENT_ROLE` on the token, otherwise the external call reverts.
    function settle(uint256 ticketId)
        external
        whenNotPaused
        nonReentrant
    {
        Ticket storage t = _requireTicket(ticketId);
        if (t.status != TicketStatus.Approved) revert TicketNotApproved(ticketId);
        if (t.expiresAt != 0 && t.expiresAt <= block.timestamp) {
            revert TicketExpired(ticketId);
        }

        t.status = TicketStatus.Settled;
        IAssetTokenForceTransfer(t.token).forceTransfer(
            t.seller,
            t.buyer,
            t.shareAmount,
            keccak256(abi.encode("TransferAgent.settle", ticketId))
        );
        emit TicketSettled(ticketId, _msgSender());
    }

    // --- reads ----------------------------------------------------------

    function getTicket(uint256 ticketId) external view returns (Ticket memory) {
        return _requireTicketView(ticketId);
    }

    /// @notice Preflight the same checks settlement would run, without
    ///         mutating state. Useful for web UIs that want to surface why a
    ///         ticket would fail.
    function canSettle(uint256 ticketId)
        external
        view
        returns (bool ok, bytes32 reason)
    {
        Ticket storage t = _tickets[ticketId];
        if (t.token == address(0)) return (false, "TICKET_NOT_FOUND");
        if (t.status != TicketStatus.Approved) return (false, "NOT_APPROVED");
        if (t.expiresAt != 0 && t.expiresAt <= block.timestamp) return (false, "EXPIRED");
        address idReg = IAssetToken(t.token).identityRegistry();
        if (!IIdentityRegistry(idReg).isVerified(t.buyer)) return (false, "BUYER_NOT_VERIFIED");
        return (true, bytes32(0));
    }

    // --- internals ------------------------------------------------------

    function _requireTicket(uint256 ticketId) private view returns (Ticket storage t) {
        t = _tickets[ticketId];
        if (t.token == address(0)) revert TicketNotFound(ticketId);
    }

    function _requireTicketView(uint256 ticketId) private view returns (Ticket memory) {
        Ticket memory t = _tickets[ticketId];
        if (t.token == address(0)) revert TicketNotFound(ticketId);
        return t;
    }
}
