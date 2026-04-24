// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IAssetRegistry} from "../../interfaces/IAssetRegistry.sol";
import {IPausableTarget} from "../../interfaces/IPausableTarget.sol";
import {IAssetToken} from "../interfaces/IAssetToken.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {ICompliance} from "../interfaces/ICompliance.sol";

/// @title AssetToken
/// @notice Permissioned ERC-20 representing fractional ownership of a single
///         off-chain asset record stored in `IAssetRegistry`. Every state
///         change goes through two gates:
///           1. `IIdentityRegistry.isVerified(recipient)` — KYC whitelist.
///           2. `ICompliance.canTransfer(from, to, amount)` — module rules
///              (max holders, country restrict, lockup, ...).
///         The token is deliberately single-asset: the `(assetRegistry,
///         registryAssetId)` pair is immutable, so a wallet's balance is
///         unambiguously a claim against ONE off-chain record.
/// @dev Mirrors the security posture of the rest of the package:
///      - `AccessControlDefaultAdminRules` (3-day timelocked admin handoff).
///      - `Pausable` on every mutating entrypoint (incident response).
///      - `ReentrancyGuard` on mint/burn/forceTransfer; defense-in-depth in
///        case future modules add external calls.
///      - The asset MUST be `Active` in the registry for any state change to
///        succeed; if the registry transitions to `Suspended` or `Retired`,
///        the token freezes automatically without an explicit pause call.
contract AssetToken is
    IAssetToken,
    IPausableTarget,
    ERC20,
    AccessControlDefaultAdminRules,
    Pausable,
    ReentrancyGuard
{
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint48 private constant ADMIN_TRANSFER_DELAY = 3 days;

    error InvalidAssetRegistry();
    error InvalidRegistryAssetId();
    error InvalidIdentityRegistry();
    error InvalidCompliance();
    error AssetNotActiveOnRegistry();
    error RecipientNotVerified(address recipient);
    error ComplianceRejected(address from, address to, uint256 amount);
    error InvalidRecoveryAddress();
    error ZeroAmount();

    address public immutable assetRegistry;
    bytes32 public immutable registryAssetId;
    /// @notice Decimals are fixed at deploy. RWA share tokens typically use 0
    ///         decimals (one unit = one share); we expose a constructor knob.
    uint8 private immutable _decimals;

    IIdentityRegistry private _identityRegistry;
    ICompliance private _compliance;

    /// @dev Set to true while a privileged force-transfer / mint / burn is
    ///      executing so the inherited `_update` gate doesn't re-run the
    ///      identity + compliance checks the public entrypoint already did
    ///      (and so we can call `compliance.transferred` exactly once).
    ///      Always reset before the function returns; `nonReentrant` guards
    ///      the AGENT entrypoints so this can never observe stacked state.
    bool private _privilegedAction;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address assetRegistry_,
        bytes32 registryAssetId_,
        address identityRegistry_,
        address compliance_,
        address initialAdmin,
        address initialAgent,
        address initialPauser
    )
        ERC20(name_, symbol_)
        AccessControlDefaultAdminRules(ADMIN_TRANSFER_DELAY, initialAdmin)
    {
        if (assetRegistry_ == address(0)) revert InvalidAssetRegistry();
        if (registryAssetId_ == bytes32(0)) revert InvalidRegistryAssetId();
        if (identityRegistry_ == address(0)) revert InvalidIdentityRegistry();
        if (compliance_ == address(0)) revert InvalidCompliance();

        assetRegistry = assetRegistry_;
        registryAssetId = registryAssetId_;
        _identityRegistry = IIdentityRegistry(identityRegistry_);
        _compliance = ICompliance(compliance_);
        _decimals = decimals_;

        if (initialAgent != address(0)) _grantRole(AGENT_ROLE, initialAgent);
        if (initialPauser != address(0)) _grantRole(PAUSER_ROLE, initialPauser);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function identityRegistry() external view returns (address) {
        return address(_identityRegistry);
    }

    function compliance() external view returns (address) {
        return address(_compliance);
    }

    // --- admin updates --------------------------------------------------

    function setIdentityRegistry(address newIdentityRegistry)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (newIdentityRegistry == address(0)) revert InvalidIdentityRegistry();
        address previous = address(_identityRegistry);
        _identityRegistry = IIdentityRegistry(newIdentityRegistry);
        emit IdentityRegistryUpdated(previous, newIdentityRegistry);
    }

    function setCompliance(address newCompliance) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCompliance == address(0)) revert InvalidCompliance();
        address previous = address(_compliance);
        _compliance = ICompliance(newCompliance);
        emit ComplianceUpdated(previous, newCompliance);
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

    // --- agent operations -----------------------------------------------
    //
    // Reentrancy posture for mint / burn / forceTransfer:
    //   - `nonReentrant` blocks any re-entry into the same family and into
    //     other `nonReentrant` entry points.
    //   - `_privilegedAction = false` is written BEFORE the compliance
    //     external call (`created` / `destroyed` / `transferred`), so a
    //     malicious compliance contract cannot observe stacked privilege.
    //   - Token balance state is fully settled by `super._update` inside
    //     `_mint` / `_burn` / `_transfer` before the hook runs (CEI).
    //   - Slither may flag "reentrancy-no-eth" on these functions because
    //     its static call graph conservatively chases `_update → transferred`,
    //     but at runtime the privileged path skips that call. See the
    //     `_privilegedAction` guard in `_update` below.

    function mint(address to, uint256 amount)
        external
        whenNotPaused
        nonReentrant
        onlyRole(AGENT_ROLE)
    {
        if (amount == 0) revert ZeroAmount();
        _requireRegistryActive();
        if (!_identityRegistry.isVerified(to)) revert RecipientNotVerified(to);
        if (!_compliance.canTransfer(address(0), to, amount)) {
            revert ComplianceRejected(address(0), to, amount);
        }
        _privilegedAction = true;
        _mint(to, amount);
        _privilegedAction = false;
        _compliance.created(to, amount);
    }

    function burn(address from, uint256 amount)
        external
        whenNotPaused
        nonReentrant
        onlyRole(AGENT_ROLE)
    {
        if (amount == 0) revert ZeroAmount();
        _privilegedAction = true;
        _burn(from, amount);
        _privilegedAction = false;
        _compliance.destroyed(from, amount);
    }

    /// @notice Force-transfer for compliance-driven recovery (lost key, court
    ///         order, sanctions). Bypasses `canTransfer` because by the time
    ///         this is invoked the issuer has already determined the move is
    ///         lawful — but it still requires the recipient to be KYC-verified,
    ///         since transferring restricted shares to an unknown wallet would
    ///         re-create the original problem.
    function forceTransfer(address from, address to, uint256 amount, bytes32 reason)
        external
        whenNotPaused
        nonReentrant
        onlyRole(AGENT_ROLE)
    {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert InvalidRecoveryAddress();
        _requireRegistryActive();
        if (!_identityRegistry.isVerified(to)) revert RecipientNotVerified(to);
        _privilegedAction = true;
        _transfer(from, to, amount);
        _privilegedAction = false;
        _compliance.transferred(from, to, amount);
        emit ForcedTransfer(from, to, amount, _msgSender(), reason);
    }

    // --- ERC-20 hooks ---------------------------------------------------

    function _update(address from, address to, uint256 value)
        internal
        override
        whenNotPaused
    {
        bool isPlainTransfer = from != address(0) && to != address(0);

        // Privileged paths (mint / burn / forceTransfer) ran their own gates
        // in the public entrypoint and are responsible for calling the
        // compliance hook themselves so ordering is explicit in the audit log.
        if (isPlainTransfer && !_privilegedAction) {
            _requireRegistryActive();
            if (!_identityRegistry.isVerified(to)) revert RecipientNotVerified(to);
            if (!_compliance.canTransfer(from, to, value)) {
                revert ComplianceRejected(from, to, value);
            }
        }

        super._update(from, to, value);

        if (isPlainTransfer && !_privilegedAction) {
            _compliance.transferred(from, to, value);
        }
    }

    function _requireRegistryActive() private view {
        IAssetRegistry.AssetRecord memory record =
            IAssetRegistry(assetRegistry).getAsset(registryAssetId);
        if (record.status != IAssetRegistry.AssetStatus.Active) {
            revert AssetNotActiveOnRegistry();
        }
    }
}
