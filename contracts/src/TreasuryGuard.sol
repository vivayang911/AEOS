// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Deterministic authorization guard. It deliberately performs no external call or asset transfer.
contract TreasuryGuard {
    bool public paused = true;
    address public immutable governance;
    address public immutable guardian;
    address public immutable policyRegistry;
    bytes32 public policyHash;
    uint64 public policyVersion;
    uint64 public policyValidFrom;
    uint64 public policyValidUntil;
    uint256 public maxNativeValue;

    mapping(bytes32 => mapping(address => bool)) private _allowedTarget;
    mapping(bytes32 => mapping(bytes4 => bool)) private _allowedSelector;
    mapping(bytes32 => bool) public consumedAction;

    error Unauthorized();
    error InvalidConfiguration();
    error NotPaused();
    error Paused();
    error PolicyMismatch();
    error PolicyNotActive();
    error TargetNotAllowed();
    error SelectorNotAllowed();
    error ValueLimitExceeded();
    error InvalidCalldata();
    error InvalidAction();
    error ActionAlreadyConsumed();
    error ActionExpired();

    event PauseChanged(bool paused, address indexed actor);
    event PolicyConfigured(
        bytes32 indexed policyHash,
        uint64 indexed policyVersion,
        uint64 validFrom,
        uint64 validUntil,
        uint256 maxNativeValue
    );
    event TargetPermissionChanged(address indexed target, bool allowed);
    event SelectorPermissionChanged(bytes4 indexed selector, bool allowed);
    event ActionAuthorized(
        bytes32 indexed actionId,
        address indexed target,
        bytes4 indexed selector,
        bytes32 policyHash,
        uint64 policyVersion
    );

    constructor(address governance_, address guardian_, address policyRegistry_) {
        if (
            governance_ == address(0) || guardian_ == address(0) || policyRegistry_ == address(0)
                || governance_ == guardian_ || policyRegistry_ == governance_ || policyRegistry_ == guardian_
        ) revert InvalidConfiguration();
        governance = governance_;
        guardian = guardian_;
        policyRegistry = policyRegistry_;
    }

    modifier onlyGovernance() {
        if (msg.sender != governance) revert Unauthorized();
        _;
    }
    modifier onlyWhilePaused() {
        if (!paused) revert NotPaused();
        _;
    }

    /// @dev Guardian can only tighten safety by pausing. Only governance can resume.
    function setPaused(bool value) external {
        if (value) {
            if (msg.sender != governance && msg.sender != guardian) revert Unauthorized();
        } else if (msg.sender != governance) {
            revert Unauthorized();
        }
        paused = value;
        emit PauseChanged(value, msg.sender);
    }

    function configurePolicy(
        bytes32 policyHash_,
        uint64 policyVersion_,
        uint64 validFrom_,
        uint64 validUntil_,
        uint256 maxNativeValue_
    ) external onlyGovernance onlyWhilePaused {
        if (
            policyHash_ == bytes32(0) || policyVersion_ == 0 || policyVersion_ != policyVersion + 1
                || validFrom_ >= validUntil_
        ) revert InvalidConfiguration();
        policyHash = policyHash_;
        policyVersion = policyVersion_;
        policyValidFrom = validFrom_;
        policyValidUntil = validUntil_;
        maxNativeValue = maxNativeValue_;
        emit PolicyConfigured(policyHash_, policyVersion_, validFrom_, validUntil_, maxNativeValue_);
    }

    function setTargetAllowed(address target, bool allowed) external onlyGovernance onlyWhilePaused {
        if (target == address(0) || policyHash == bytes32(0)) revert InvalidConfiguration();
        _allowedTarget[policyHash][target] = allowed;
        emit TargetPermissionChanged(target, allowed);
    }

    function setSelectorAllowed(bytes4 selector, bool allowed) external onlyGovernance onlyWhilePaused {
        if (selector == bytes4(0) || policyHash == bytes32(0)) revert InvalidConfiguration();
        _allowedSelector[policyHash][selector] = allowed;
        emit SelectorPermissionChanged(selector, allowed);
    }

    function validateAction(
        bytes32 actionId,
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 expectedPolicyHash,
        uint64 expectedPolicyVersion,
        uint64 deadline
    ) public view returns (bytes4 selector) {
        if (paused) revert Paused();
        if (actionId == bytes32(0) || target == address(0)) revert InvalidAction();
        if (consumedAction[actionId]) revert ActionAlreadyConsumed();
        if (deadline < block.timestamp) revert ActionExpired();
        if (expectedPolicyHash != policyHash || expectedPolicyVersion != policyVersion) revert PolicyMismatch();
        if (block.timestamp < policyValidFrom || block.timestamp > policyValidUntil) revert PolicyNotActive();
        if (!_allowedTarget[policyHash][target]) revert TargetNotAllowed();
        if (value > maxNativeValue) revert ValueLimitExceeded();
        if (data.length < 4) revert InvalidCalldata();
        assembly { selector := calldataload(data.offset) }
        if (!_allowedSelector[policyHash][selector]) revert SelectorNotAllowed();
    }

    function allowedTarget(address target) external view returns (bool) {
        return _allowedTarget[policyHash][target];
    }

    function allowedSelector(bytes4 selector) external view returns (bool) {
        return _allowedSelector[policyHash][selector];
    }

    /// @notice Records one governance-authorized action after validation. No external call is performed.
    function authorizeAction(
        bytes32 actionId,
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 expectedPolicyHash,
        uint64 expectedPolicyVersion,
        uint64 deadline
    ) external onlyGovernance returns (bytes4 selector) {
        selector = validateAction(actionId, target, value, data, expectedPolicyHash, expectedPolicyVersion, deadline);
        consumedAction[actionId] = true;
        emit ActionAuthorized(actionId, target, selector, expectedPolicyHash, expectedPolicyVersion);
    }
}
