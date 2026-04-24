// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AbstractComplianceModule} from "./AbstractComplianceModule.sol";
import {IIdentityRegistry} from "../../interfaces/IIdentityRegistry.sol";

/// @title CountryRestrictModule
/// @notice Blocks transfers/mints to wallets whose `IIdentityRegistry`
///         country claim is on the configured blocklist (e.g. OFAC sanctioned
///         jurisdictions). The blocklist is mutable by the compliance admin so
///         policy can react to sanction updates without redeploying the token.
/// @dev Burns (`to == address(0)`) are unrestricted — sanctioned holders can
///      still be force-divested by the issuer.
contract CountryRestrictModule is AbstractComplianceModule {
    error InvalidIdentityRegistry();
    error InvalidCountryCode();
    error CountryAlreadyBlocked(uint16 countryCode);
    error CountryNotBlocked(uint16 countryCode);

    event CountryBlocked(uint16 countryCode);
    event CountryUnblocked(uint16 countryCode);

    IIdentityRegistry public immutable identityRegistry;
    mapping(uint16 countryCode => bool blocked) private _blocked;

    /// @dev Admin role on this module is the same caller authority as the
    ///      compliance contract — to keep the surface tiny we authorize via
    ///      `compliance` directly. The compliance admin grants roles on the
    ///      compliance contract and proxies module updates through their EOA.
    address public immutable admin;

    error CallerNotAdmin(address caller);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert CallerNotAdmin(msg.sender);
        _;
    }

    constructor(address compliance_, address identityRegistry_, address admin_)
        AbstractComplianceModule(compliance_)
    {
        if (identityRegistry_ == address(0)) revert InvalidIdentityRegistry();
        if (admin_ == address(0)) revert CallerNotAdmin(admin_);
        identityRegistry = IIdentityRegistry(identityRegistry_);
        admin = admin_;
    }

    function name() external pure returns (string memory) {
        return "CountryRestrict";
    }

    function blockCountry(uint16 countryCode) external onlyAdmin {
        if (countryCode == 0) revert InvalidCountryCode();
        if (_blocked[countryCode]) revert CountryAlreadyBlocked(countryCode);
        _blocked[countryCode] = true;
        emit CountryBlocked(countryCode);
    }

    function unblockCountry(uint16 countryCode) external onlyAdmin {
        if (!_blocked[countryCode]) revert CountryNotBlocked(countryCode);
        _blocked[countryCode] = false;
        emit CountryUnblocked(countryCode);
    }

    function isCountryBlocked(uint16 countryCode) external view returns (bool) {
        return _blocked[countryCode];
    }

    function moduleCheck(address, /* token */ address, /* from */ address to, uint256 amount)
        external
        view
        returns (bool)
    {
        if (amount == 0) return true;
        if (to == address(0)) return true; // allow burn
        uint16 country = identityRegistry.countryOf(to);
        // Unverified wallets are blocked by AssetToken's identity check, so the
        // module only needs to gate verified-but-sanctioned countries.
        return !_blocked[country];
    }

    function moduleTransferAction(address, address, address, uint256) external onlyCompliance {}
    function moduleMintAction(address, address, uint256) external onlyCompliance {}
    function moduleBurnAction(address, address, uint256) external onlyCompliance {}
}
