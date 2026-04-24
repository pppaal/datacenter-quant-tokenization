// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IPausableTarget} from "../../interfaces/IPausableTarget.sol";

/// @title IdentityRegistry
/// @notice Role-gated whitelist of KYC-cleared wallets and their ISO country
///         code. The off-chain KYC vendor (Sumsub / Jumio / etc.) is bridged in
///         by an `IDENTITY_MANAGER_ROLE` holder that calls `registerIdentity`
///         after the wallet clears diligence. The contract stores claims; it
///         does not verify them.
/// @dev Security design (mirrors `DataCenterAssetRegistry`):
///      - `AccessControlDefaultAdminRules` enforces a 3-day timelocked admin
///        handoff (mitigates hot-key takeover).
///      - `Pausable` gates every mutating entrypoint for incident response.
///      - Role separation: IDENTITY_MANAGER_ROLE adds/removes wallets,
///        PAUSER_ROLE pauses, DEFAULT_ADMIN_ROLE manages role grants only.
///      - Country code zero is reserved for "unset" / "not registered".
contract IdentityRegistry is
    IIdentityRegistry,
    IPausableTarget,
    AccessControlDefaultAdminRules,
    Pausable
{
    bytes32 public constant IDENTITY_MANAGER_ROLE = keccak256("IDENTITY_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint48 private constant ADMIN_TRANSFER_DELAY = 3 days;

    error InvalidWallet();
    error InvalidCountryCode();
    error IdentityAlreadyRegistered(address wallet);
    error IdentityNotRegistered(address wallet);
    error SameCountry(uint16 countryCode);

    struct IdentityRecord {
        bool registered;
        uint16 countryCode;
        uint64 registeredAt;
    }

    mapping(address wallet => IdentityRecord) private _identities;

    constructor(
        address initialAdmin,
        address initialIdentityManager,
        address initialPauser
    ) AccessControlDefaultAdminRules(ADMIN_TRANSFER_DELAY, initialAdmin) {
        if (initialIdentityManager != address(0)) {
            _grantRole(IDENTITY_MANAGER_ROLE, initialIdentityManager);
        }
        if (initialPauser != address(0)) {
            _grantRole(PAUSER_ROLE, initialPauser);
        }
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

    function registerIdentity(address wallet, uint16 countryCode)
        external
        whenNotPaused
        onlyRole(IDENTITY_MANAGER_ROLE)
    {
        if (wallet == address(0)) revert InvalidWallet();
        if (countryCode == 0) revert InvalidCountryCode();
        if (_identities[wallet].registered) revert IdentityAlreadyRegistered(wallet);

        _identities[wallet] = IdentityRecord({
            registered: true,
            countryCode: countryCode,
            registeredAt: uint64(block.timestamp)
        });

        emit IdentityRegistered(wallet, countryCode, _msgSender());
    }

    function removeIdentity(address wallet)
        external
        whenNotPaused
        onlyRole(IDENTITY_MANAGER_ROLE)
    {
        if (!_identities[wallet].registered) revert IdentityNotRegistered(wallet);
        delete _identities[wallet];
        emit IdentityRemoved(wallet, _msgSender());
    }

    function updateCountry(address wallet, uint16 newCountry)
        external
        whenNotPaused
        onlyRole(IDENTITY_MANAGER_ROLE)
    {
        if (newCountry == 0) revert InvalidCountryCode();
        IdentityRecord storage record = _identities[wallet];
        if (!record.registered) revert IdentityNotRegistered(wallet);
        if (record.countryCode == newCountry) revert SameCountry(newCountry);

        uint16 previous = record.countryCode;
        record.countryCode = newCountry;
        emit CountryUpdated(wallet, previous, newCountry);
    }

    function isVerified(address wallet) external view returns (bool) {
        return _identities[wallet].registered;
    }

    function countryOf(address wallet) external view returns (uint16) {
        return _identities[wallet].countryCode;
    }

    function getIdentity(address wallet) external view returns (IdentityRecord memory) {
        return _identities[wallet];
    }
}
