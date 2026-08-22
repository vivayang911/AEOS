// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TreasuryGuard} from "../src/TreasuryGuard.sol";

contract Caller {
    function setPaused(TreasuryGuard guard, bool value) external {
        guard.setPaused(value);
    }

    function authorize(
        TreasuryGuard guard,
        bytes32 actionId,
        address target,
        bytes calldata data,
        bytes32 policyHash,
        uint64 version
    ) external {
        guard.authorizeAction(actionId, target, 0, data, policyHash, version, type(uint64).max);
    }
}

contract Receiver {
    bool public touched;

    fallback() external payable {
        touched = true;
    }

    receive() external payable {
        touched = true;
    }
}

contract TreasuryGuardTest {
    bytes32 private constant POLICY = keccak256("policy-v1");
    bytes4 private constant TRANSFER = 0xa9059cbb;
    address private constant TARGET = address(0x1111);

    function configuredGuard() private returns (TreasuryGuard guard, Caller guardian) {
        guardian = new Caller();
        guard = new TreasuryGuard(address(this), address(guardian), address(0x3333));
        guard.configurePolicy(POLICY, 1, 0, type(uint64).max, 0);
        guard.setTargetAllowed(TARGET, true);
        guard.setSelectorAllowed(TRANSFER, true);
    }

    function transferData() private pure returns (bytes memory) {
        return abi.encodeWithSelector(TRANSFER, address(0x2222), uint256(1));
    }

    function expectFailure(address target, bytes memory callData) private {
        (bool ok,) = target.call(callData);
        require(!ok, "expected revert");
    }

    function testStartsPausedAndHasNoAssetExecutionSurface() public {
        (TreasuryGuard guard,) = configuredGuard();
        require(guard.paused(), "must start paused");
        expectFailure(
            address(guard),
            abi.encodeCall(
                guard.validateAction, (keccak256("a"), TARGET, 0, transferData(), POLICY, 1, type(uint64).max)
            )
        );
    }

    function testGuardianCanPauseButCannotUnpause() public {
        (TreasuryGuard guard, Caller guardian) = configuredGuard();
        guard.setPaused(false);
        guardian.setPaused(guard, true);
        require(guard.paused(), "guardian pause failed");
        expectFailure(address(guardian), abi.encodeCall(guardian.setPaused, (guard, false)));
    }

    function testPolicyCanOnlyChangeWhilePaused() public {
        (TreasuryGuard guard,) = configuredGuard();
        guard.setPaused(false);
        expectFailure(
            address(guard), abi.encodeCall(guard.configurePolicy, (keccak256("v2"), 2, 0, type(uint64).max, 0))
        );
    }

    function testPolicyRegistryBindingVersionAndValidityAreHardLimits() public {
        (TreasuryGuard guard,) = configuredGuard();
        require(guard.policyRegistry() == address(0x3333), "registry binding mismatch");
        expectFailure(
            address(guard),
            abi.encodeCall(guard.configurePolicy, (keccak256("same-version"), 1, 0, type(uint64).max, 0))
        );
        expectFailure(
            address(guard),
            abi.encodeCall(guard.configurePolicy, (keccak256("skipped-version"), 3, 0, type(uint64).max, 0))
        );
        guard.configurePolicy(keccak256("future"), 2, type(uint64).max - 1, type(uint64).max, 0);
        guard.setPaused(false);
        expectFailure(
            address(guard),
            abi.encodeCall(
                guard.validateAction,
                (keccak256("not-active"), TARGET, 0, transferData(), keccak256("future"), 2, type(uint64).max)
            )
        );
    }

    function testConstructorRequiresThreeSeparatedNonzeroControlAddresses() public {
        expectFailure(
            address(this),
            abi.encodeWithSelector(this.deployGuard.selector, address(this), address(this), address(0x3333))
        );
        expectFailure(
            address(this),
            abi.encodeWithSelector(this.deployGuard.selector, address(this), address(0x2222), address(this))
        );
    }

    function deployGuard(address governance, address guardian, address registry) external returns (TreasuryGuard) {
        return new TreasuryGuard(governance, guardian, registry);
    }

    function testPolicyRotationDoesNotInheritOldAllowlists() public {
        (TreasuryGuard guard,) = configuredGuard();
        bytes32 nextPolicy = keccak256("policy-v2");
        guard.configurePolicy(nextPolicy, 2, 0, type(uint64).max, 0);
        guard.setPaused(false);
        expectFailure(
            address(guard),
            abi.encodeCall(
                guard.validateAction,
                (keccak256("new-policy"), TARGET, 0, transferData(), nextPolicy, 2, type(uint64).max)
            )
        );
    }

    function testAllowlistPolicyDeadlineAndValueAreHardLimits() public {
        (TreasuryGuard guard,) = configuredGuard();
        guard.setPaused(false);
        require(
            guard.validateAction(keccak256("valid"), TARGET, 0, transferData(), POLICY, 1, type(uint64).max)
                == TRANSFER,
            "valid action rejected"
        );
        expectFailure(
            address(guard),
            abi.encodeCall(
                guard.validateAction,
                (keccak256("target"), address(0x9999), 0, transferData(), POLICY, 1, type(uint64).max)
            )
        );
        expectFailure(
            address(guard),
            abi.encodeCall(
                guard.validateAction, (keccak256("selector"), TARGET, 0, hex"deadbeef", POLICY, 1, type(uint64).max)
            )
        );
        expectFailure(
            address(guard),
            abi.encodeCall(
                guard.validateAction,
                (keccak256("policy"), TARGET, 0, transferData(), keccak256("wrong"), 1, type(uint64).max)
            )
        );
        expectFailure(
            address(guard),
            abi.encodeCall(
                guard.validateAction, (keccak256("value"), TARGET, 1, transferData(), POLICY, 1, type(uint64).max)
            )
        );
        expectFailure(
            address(guard),
            abi.encodeCall(guard.validateAction, (keccak256("expired"), TARGET, 0, transferData(), POLICY, 1, 0))
        );
    }

    function testOnlyGovernanceCanAuthorizeAndActionIdCannotReplay() public {
        (TreasuryGuard guard,) = configuredGuard();
        Caller outsider = new Caller();
        guard.setPaused(false);
        bytes32 actionId = keccak256("once");
        expectFailure(
            address(outsider), abi.encodeCall(outsider.authorize, (guard, actionId, TARGET, transferData(), POLICY, 1))
        );
        guard.authorizeAction(actionId, TARGET, 0, transferData(), POLICY, 1, type(uint64).max);
        require(guard.consumedAction(actionId), "action not consumed");
        expectFailure(
            address(guard),
            abi.encodeCall(guard.authorizeAction, (actionId, TARGET, 0, transferData(), POLICY, 1, type(uint64).max))
        );
    }

    function testAuthorizationNeverCallsTheTarget() public {
        (, Caller guardian) = configuredGuard();
        TreasuryGuard guard = new TreasuryGuard(address(this), address(guardian), address(0x3333));
        Receiver receiver = new Receiver();
        guard.configurePolicy(POLICY, 1, 0, type(uint64).max, 0);
        guard.setTargetAllowed(address(receiver), true);
        guard.setSelectorAllowed(TRANSFER, true);
        guard.setPaused(false);
        guard.authorizeAction(keccak256("no-call"), address(receiver), 0, transferData(), POLICY, 1, type(uint64).max);
        require(!receiver.touched(), "guard performed an external call");
    }

    function testFuzzNativeValueLimitCannotBeBypassed(uint256 value) public {
        (TreasuryGuard guard,) = configuredGuard();
        guard.setPaused(false);
        if (value == 0) {
            require(
                guard.validateAction(keccak256("zero"), TARGET, value, transferData(), POLICY, 1, type(uint64).max)
                    == TRANSFER,
                "zero value rejected"
            );
        } else {
            expectFailure(
                address(guard),
                abi.encodeCall(
                    guard.validateAction,
                    (keccak256(abi.encode(value)), TARGET, value, transferData(), POLICY, 1, type(uint64).max)
                )
            );
        }
    }

    function testFuzzUnlistedTargetsNeverValidate(address target) public {
        if (target == TARGET) return;
        (TreasuryGuard guard,) = configuredGuard();
        guard.setPaused(false);
        expectFailure(
            address(guard),
            abi.encodeCall(
                guard.validateAction,
                (keccak256(abi.encode(target)), target, 0, transferData(), POLICY, 1, type(uint64).max)
            )
        );
    }
}
