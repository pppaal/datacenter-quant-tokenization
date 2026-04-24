// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";

import {ICompliance} from "../interfaces/ICompliance.sol";
import {IComplianceModule} from "../interfaces/IComplianceModule.sol";

/// @title ModularCompliance
/// @notice Aggregates a small, ordered list of compliance modules. The bound
///         `IAssetToken` calls `canTransfer` once per state change; the
///         compliance contract iterates the modules and returns false on the
///         first failure. Hooks (`transferred` / `created` / `destroyed`) are
///         forwarded to every module so module-internal accounting stays in sync.
/// @dev Single-tenant by construction: the bound token is set once and never
///      changes. Modules can be added/removed by COMPLIANCE_ADMIN_ROLE up to
///      `MAX_MODULES` to keep gas bounded. The bound token is the only address
///      allowed to call write hooks.
contract ModularCompliance is ICompliance, AccessControlDefaultAdminRules {
    bytes32 public constant COMPLIANCE_ADMIN_ROLE = keccak256("COMPLIANCE_ADMIN_ROLE");

    uint48 private constant ADMIN_TRANSFER_DELAY = 3 days;

    /// @notice Hard cap on attached modules to bound canTransfer gas.
    uint256 public constant MAX_MODULES = 16;

    error TokenAlreadyBound();
    error TokenNotBound();
    error InvalidToken();
    error InvalidModule();
    error ModuleAlreadyAttached(address module);
    error ModuleNotAttached(address module);
    error TooManyModules();
    error CallerNotToken(address caller);

    event TokenBound(address indexed token);
    event ModuleAdded(address indexed module);
    event ModuleRemoved(address indexed module);

    address private _token;
    address[] private _modules;
    mapping(address module => bool attached) private _attached;

    constructor(address initialAdmin, address initialComplianceAdmin)
        AccessControlDefaultAdminRules(ADMIN_TRANSFER_DELAY, initialAdmin)
    {
        if (initialComplianceAdmin != address(0)) {
            _grantRole(COMPLIANCE_ADMIN_ROLE, initialComplianceAdmin);
        }
    }

    /// @notice One-time binding by COMPLIANCE_ADMIN_ROLE. Idempotency is
    ///         intentionally NOT supported: a fresh deployment is required to
    ///         rebind so module accounting cannot bleed across tokens.
    function bindToken(address tokenAddress) external onlyRole(COMPLIANCE_ADMIN_ROLE) {
        if (tokenAddress == address(0)) revert InvalidToken();
        if (_token != address(0)) revert TokenAlreadyBound();
        _token = tokenAddress;
        emit TokenBound(tokenAddress);
    }

    function addModule(address module) external onlyRole(COMPLIANCE_ADMIN_ROLE) {
        if (module == address(0)) revert InvalidModule();
        if (_attached[module]) revert ModuleAlreadyAttached(module);
        if (_modules.length >= MAX_MODULES) revert TooManyModules();
        _attached[module] = true;
        _modules.push(module);
        emit ModuleAdded(module);
    }

    function removeModule(address module) external onlyRole(COMPLIANCE_ADMIN_ROLE) {
        if (!_attached[module]) revert ModuleNotAttached(module);
        _attached[module] = false;
        uint256 len = _modules.length;
        for (uint256 i = 0; i < len; ++i) {
            if (_modules[i] == module) {
                _modules[i] = _modules[len - 1];
                _modules.pop();
                break;
            }
        }
        emit ModuleRemoved(module);
    }

    // --- ICompliance ----------------------------------------------------

    function token() external view returns (address) {
        return _token;
    }

    /// @dev The three hook loops and this `canTransfer` loop make external
    ///      calls to every attached module. Gas is bounded because
    ///      `addModule` enforces `_modules.length <= MAX_MODULES (= 16)`,
    ///      and modules are audited before attachment (admin-gated).
    ///      Each module's `moduleCheck` / action hook is trusted code
    ///      authored alongside this contract; there is no user-supplied
    ///      external call in this loop.
    function canTransfer(address from, address to, uint256 amount) external view returns (bool) {
        address tokenAddress = _token;
        if (tokenAddress == address(0)) return false;
        uint256 len = _modules.length;
        for (uint256 i = 0; i < len; ++i) {
            if (!IComplianceModule(_modules[i]).moduleCheck(tokenAddress, from, to, amount)) {
                return false;
            }
        }
        return true;
    }

    function transferred(address from, address to, uint256 amount) external onlyToken {
        uint256 len = _modules.length;
        for (uint256 i = 0; i < len; ++i) {
            IComplianceModule(_modules[i]).moduleTransferAction(_token, from, to, amount);
        }
    }

    function created(address to, uint256 amount) external onlyToken {
        uint256 len = _modules.length;
        for (uint256 i = 0; i < len; ++i) {
            IComplianceModule(_modules[i]).moduleMintAction(_token, to, amount);
        }
    }

    function destroyed(address from, uint256 amount) external onlyToken {
        uint256 len = _modules.length;
        for (uint256 i = 0; i < len; ++i) {
            IComplianceModule(_modules[i]).moduleBurnAction(_token, from, amount);
        }
    }

    // --- helpers --------------------------------------------------------

    function modules() external view returns (address[] memory) {
        return _modules;
    }

    function isModuleAttached(address module) external view returns (bool) {
        return _attached[module];
    }

    modifier onlyToken() {
        if (_token == address(0)) revert TokenNotBound();
        if (msg.sender != _token) revert CallerNotToken(msg.sender);
        _;
    }
}
