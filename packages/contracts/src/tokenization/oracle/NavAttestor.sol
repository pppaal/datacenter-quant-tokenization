// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IPausableTarget} from "../../interfaces/IPausableTarget.sol";
import {NavOracle} from "./NavOracle.sol";

/// @title NavAttestor
/// @notice Verifies an EIP-712 signed `NavAttestation` from an authorized
///         off-chain signer (typically a server-side key holding the role
///         on apps/web) and forwards the verified reading to the bound
///         `NavOracle`.
///
/// @dev    Why two contracts:
///           - NavOracle is the canonical on-chain readable surface
///             ("what is the latest NAV?")
///           - NavAttestor is the authorization gate ("who can write?")
///           Splitting them lets us swap the auth scheme (ECDSA today,
///           ZK / SNARK in the future) without re-deploying the oracle
///           or re-pointing every consumer.
///
///         The struct fields mirror lib/blockchain/attestation.ts
///         buildNavAttestation(). The typehash is recomputed here so the
///         off-chain hash and on-chain hash are guaranteed to match.
///
///         Replay protection:
///           - chainId in the EIP-712 domain (cross-chain replay)
///           - nonce per signer in the contract (within-chain replay)
///           - navTimestamp monotonicity at the NavOracle level
///             (cannot overwrite a newer reading with an older one)
contract NavAttestor is IPausableTarget, AccessControlDefaultAdminRules, Pausable, EIP712 {
    bytes32 public constant SIGNER_ADMIN_ROLE = keccak256("SIGNER_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @dev Must match the off-chain `NAV_ATTESTATION_TYPEHASH` in
    ///      lib/blockchain/attestation.ts. Update both sides together.
    bytes32 public constant NAV_ATTESTATION_TYPEHASH = keccak256(
        "NavAttestation(bytes32 assetId,bytes32 quoteSymbol,uint256 navPerShare,uint256 navTimestamp,uint256 nonce,bytes32 runRef)"
    );

    error InvalidOracle();
    error InvalidSigner();
    error UnauthorizedSigner(address recovered);
    error AssetMismatch(bytes32 expected, bytes32 actual);
    error NonceUsed(address signer, uint256 nonce);
    error InvalidNav();

    event SignerAuthorized(address indexed signer, bool authorized);
    event AttestationPublished(
        address indexed signer,
        bytes32 indexed assetId,
        uint256 navPerShare,
        uint256 navTimestamp,
        uint256 nonce,
        bytes32 runRef
    );

    /// @dev Bound oracle the verified attestation forwards to. Immutable
    ///      because re-binding would let an admin silently switch the
    ///      asset whose NAV gets written.
    NavOracle public immutable oracle;

    /// @dev Expected assetId for inbound attestations. Mismatched
    ///      attestations are rejected at the contract level even if the
    ///      signature is valid (defence-in-depth).
    bytes32 public immutable assetId;

    /// @dev Authorized off-chain signer set. Multiple signers permitted
    ///      so a primary + standby key arrangement is straightforward.
    mapping(address => bool) public authorizedSigners;

    /// @dev Used-nonces per signer. Prevents replay of a captured
    ///      signed message within the same chain.
    mapping(address => mapping(uint256 => bool)) public usedNonce;

    constructor(
        NavOracle oracle_,
        bytes32 assetId_,
        address admin_,
        address signer_,
        address pauser_
    ) AccessControlDefaultAdminRules(3 days, admin_) EIP712("NavAttestor", "1") {
        if (address(oracle_) == address(0)) revert InvalidOracle();
        if (signer_ == address(0)) revert InvalidSigner();
        oracle = oracle_;
        assetId = assetId_;
        authorizedSigners[signer_] = true;
        _grantRole(SIGNER_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, pauser_);
        emit SignerAuthorized(signer_, true);
    }

    /// @notice Add or remove an authorized off-chain signer.
    function setSignerAuthorization(address signer, bool authorized)
        external
        onlyRole(SIGNER_ADMIN_ROLE)
    {
        if (signer == address(0)) revert InvalidSigner();
        authorizedSigners[signer] = authorized;
        emit SignerAuthorized(signer, authorized);
    }

    /// @notice Verify an EIP-712 attestation and forward to the oracle.
    ///         The caller can be anyone — the signature is the auth.
    ///         Reverts on:
    ///           - asset id mismatch
    ///           - signature recovery failing
    ///           - signer not in the authorized set
    ///           - nonce already used by this signer
    ///           - underlying NavOracle revert (e.g. stale timestamp)
    function publish(
        bytes32 attAssetId,
        bytes32 quoteSymbol,
        uint256 navPerShare,
        uint256 navTimestamp,
        uint256 nonce,
        bytes32 runRef,
        bytes calldata signature
    ) external whenNotPaused {
        if (attAssetId != assetId) revert AssetMismatch(assetId, attAssetId);
        if (navPerShare == 0) revert InvalidNav();

        bytes32 structHash = keccak256(
            abi.encode(
                NAV_ATTESTATION_TYPEHASH,
                attAssetId,
                quoteSymbol,
                navPerShare,
                navTimestamp,
                nonce,
                runRef
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, signature);
        if (!authorizedSigners[recovered]) revert UnauthorizedSigner(recovered);
        if (usedNonce[recovered][nonce]) revert NonceUsed(recovered, nonce);
        usedNonce[recovered][nonce] = true;

        // Forward to NavOracle. We pass the attestation's own timestamp so
        // back-dated quarter-end NAVs go through as long as they're newer
        // than what's already stored.
        oracle.publish(navPerShare, uint64(navTimestamp));

        emit AttestationPublished(
            recovered, attAssetId, navPerShare, navTimestamp, nonce, runRef
        );
    }

    /// @notice EIP-712 domain separator — useful for off-chain code that
    ///         wants to verify a digest matches the on-chain version.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
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
