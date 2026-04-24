// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IComplianceModule} from "../../interfaces/IComplianceModule.sol";

/// @title AbstractComplianceModule
/// @notice Shared boilerplate for all stateful compliance modules. Each module
///         is permanently bound at construction to the `ICompliance` aggregator
///         that may call its write hooks (`moduleTransferAction` etc.). View
///         hooks are open so any caller (e.g. the front-end pre-flight check)
///         can read the policy answer without a tx.
/// @dev Single-tenant by design — one module instance per (compliance, token)
///      pair. To attach the same policy to a second token, deploy a new module.
abstract contract AbstractComplianceModule is IComplianceModule {
    error InvalidCompliance();
    error CallerNotCompliance(address caller);

    address public immutable compliance;

    constructor(address compliance_) {
        if (compliance_ == address(0)) revert InvalidCompliance();
        compliance = compliance_;
    }

    modifier onlyCompliance() {
        if (msg.sender != compliance) revert CallerNotCompliance(msg.sender);
        _;
    }
}
