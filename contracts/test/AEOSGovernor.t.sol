// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {AEOSGovernanceToken} from "../src/AEOSGovernanceToken.sol";
import {AEOSGovernor} from "../src/AEOSGovernor.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {TreasuryGuard} from "../src/TreasuryGuard.sol";

interface Vm {
    function roll(uint256 newHeight) external;
    function warp(uint256 newTimestamp) external;
}

contract AEOSGovernorTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant SUPPLY = 1_000_000 ether;
    uint48 private constant VOTING_DELAY = 1;
    uint32 private constant VOTING_PERIOD = 8;
    uint256 private constant TIMELOCK_DELAY = 60;
    bytes32 private constant POLICY_HASH = keccak256("aeos-policy-v1");
    bytes4 private constant OBSERVED_SELECTOR = bytes4(keccak256("isPolicyActive(bytes32,uint64,uint64)"));

    AEOSGovernanceToken private token;
    TimelockController private timelock;
    AEOSGovernor private governor;
    PolicyRegistry private registry;
    TreasuryGuard private guard;

    function setUp() public {
        token = new AEOSGovernanceToken(address(this), SUPPLY);
        address[] memory empty = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        timelock = new TimelockController(TIMELOCK_DELAY, empty, executors, address(this));
        governor = new AEOSGovernor(token, timelock, VOTING_DELAY, VOTING_PERIOD, 0, 4);

        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), address(this));

        registry = new PolicyRegistry(address(timelock));
        guard = new TreasuryGuard(address(timelock), address(0xBEEF), address(registry));
        vm.roll(block.number + 1);
    }

    function testDeploymentRolesAreSeparatedAndAdminIsRemoved() public view {
        require(address(governor.timelock()) == address(timelock), "governor timelock mismatch");
        require(timelock.getMinDelay() == TIMELOCK_DELAY, "timelock delay mismatch");
        require(timelock.hasRole(timelock.PROPOSER_ROLE(), address(governor)), "governor proposer missing");
        require(timelock.hasRole(timelock.CANCELLER_ROLE(), address(governor)), "governor canceller missing");
        require(timelock.hasRole(timelock.EXECUTOR_ROLE(), address(0)), "executor not open");
        require(!timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(this)), "temporary admin retained");
        require(registry.governance() == address(timelock), "registry not timelock governed");
        require(guard.governance() == address(timelock), "guard not timelock governed");
        require(guard.guardian() != address(timelock), "guardian not separated");
    }

    function testDecisionBoundProposalVotesQueuesAndExecutesThroughTimelock() public {
        bytes memory observedCall = abi.encodeCall(registry.isPolicyActive, (POLICY_HASH, 1, uint64(block.timestamp)));
        bytes32 actionId = keccak256("decision_a9a37c5bd3ff43c68f5b0af32a13b8ed:action-1");
        uint64 validFrom = uint64(block.timestamp);
        uint64 validUntil = validFrom + 1 days;
        uint64 deadline = validUntil;

        address[] memory targets = new address[](6);
        uint256[] memory values = new uint256[](6);
        bytes[] memory calldatas = new bytes[](6);
        targets[0] = address(registry);
        calldatas[0] = abi.encodeCall(registry.activatePolicy, (POLICY_HASH, 1, validFrom, validUntil));
        targets[1] = address(guard);
        calldatas[1] = abi.encodeCall(guard.configurePolicy, (POLICY_HASH, 1, validFrom, validUntil, 0));
        targets[2] = address(guard);
        calldatas[2] = abi.encodeCall(guard.setTargetAllowed, (address(registry), true));
        targets[3] = address(guard);
        calldatas[3] = abi.encodeCall(guard.setSelectorAllowed, (OBSERVED_SELECTOR, true));
        targets[4] = address(guard);
        calldatas[4] = abi.encodeCall(guard.setPaused, (false));
        targets[5] = address(guard);
        calldatas[5] = abi.encodeCall(
            guard.authorizeAction, (actionId, address(registry), 0, observedCall, POLICY_HASH, 1, deadline)
        );

        string memory description = string.concat(
            "AEOS Decision decision_a9a37c5bd3ff43c68f5b0af32a13b8ed / ",
            "Snapshot snap_5f3081a8dffc4e0b9f281e0095dc231f / zero-value authorization only"
        );
        uint256 proposalId = governor.propose(targets, values, calldatas, description);
        require(governor.state(proposalId) == IGovernor.ProposalState.Pending, "proposal not pending");

        vm.roll(block.number + VOTING_DELAY + 1);
        require(governor.state(proposalId) == IGovernor.ProposalState.Active, "proposal not active");
        governor.castVoteWithReason(proposalId, 1, "single testnet voter approves bounded zero-value action");
        {
            (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes) = governor.proposalVotes(proposalId);
            require(againstVotes == 0 && forVotes == SUPPLY && abstainVotes == 0, "vote totals mismatch");
        }
        require(governor.quorum(governor.proposalSnapshot(proposalId)) == (SUPPLY * 4) / 100, "quorum mismatch");

        vm.roll(block.number + VOTING_PERIOD + 1);
        require(governor.state(proposalId) == IGovernor.ProposalState.Succeeded, "proposal did not succeed");
        bytes32 descriptionHash = keccak256(bytes(description));
        governor.queue(targets, values, calldatas, descriptionHash);
        require(governor.state(proposalId) == IGovernor.ProposalState.Queued, "proposal not queued");

        {
            (bool earlyExecution,) =
                address(governor).call(abi.encodeCall(governor.execute, (targets, values, calldatas, descriptionHash)));
            require(!earlyExecution, "timelock delay bypassed");
        }

        vm.warp(block.timestamp + TIMELOCK_DELAY + 1);
        governor.execute(targets, values, calldatas, descriptionHash);
        _assertExecutedOutcome(proposalId, actionId);
    }

    function _assertExecutedOutcome(uint256 proposalId, bytes32 actionId) private view {
        require(governor.state(proposalId) == IGovernor.ProposalState.Executed, "proposal not executed");
        require(registry.latestVersion() == 1, "policy not activated");
        require(!guard.paused(), "guard not unpaused by governance");
        require(guard.consumedAction(actionId), "guard authorization not recorded");
        require(guard.allowedTarget(address(registry)), "target not allowed");
        require(guard.allowedSelector(OBSERVED_SELECTOR), "selector not allowed");
    }

    function testUnauthorizedDirectConfigurationFailsClosed() public {
        (bool policyOk,) = address(registry)
            .call(
                abi.encodeCall(
                    registry.activatePolicy, (POLICY_HASH, 1, uint64(block.timestamp), uint64(block.timestamp + 1))
                )
            );
        require(!policyOk, "EOA bypassed registry governance");
        (bool guardOk,) = address(guard).call(abi.encodeCall(guard.setPaused, (false)));
        require(!guardOk, "EOA bypassed guard governance");
    }
}
