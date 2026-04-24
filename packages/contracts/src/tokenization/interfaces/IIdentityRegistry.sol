// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IIdentityRegistry
/// @notice On-chain whitelist of KYC/AML-verified wallets together with the
///         country claim used by jurisdictional compliance rules. Off-chain KYC
///         providers (e.g. Sumsub, Jumio) are bridged in by an authorized
///         identity manager that calls `registerIdentity` after attesting the
///         wallet has cleared diligence. The registry itself is intentionally
///         dumb: it stores claims, it does not verify them.
interface IIdentityRegistry {
    event IdentityRegistered(address indexed wallet, uint16 countryCode, address indexed registeredBy);
    event IdentityRemoved(address indexed wallet, address indexed removedBy);
    event CountryUpdated(address indexed wallet, uint16 previousCountry, uint16 newCountry);

    /// @notice True iff the wallet has an active identity record.
    function isVerified(address wallet) external view returns (bool);

    /// @notice ISO 3166-1 numeric country code claimed for the wallet.
    ///         Returns 0 when the wallet is not registered.
    function countryOf(address wallet) external view returns (uint16);
}
