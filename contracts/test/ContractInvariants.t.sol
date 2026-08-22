// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EvidenceAnchorASC, INativeQueryVerifier} from "../src/EvidenceAnchorASC.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {TreasuryGuard} from "../src/TreasuryGuard.sol";

contract InvariantVerifier is INativeQueryVerifier {
    function verify(uint64, uint64, bytes calldata, MerkleProof calldata, ContinuityProof calldata)
        external
        pure
        returns (bool)
    {
        return true;
    }
}

contract PolicyRegistryHandler {
    PolicyRegistry public immutable registry;
    mapping(uint64 => bytes32) public recordedHash;
    mapping(uint64 => uint64) public recordedFrom;
    mapping(uint64 => uint64) public recordedUntil;

    constructor() {
        registry = new PolicyRegistry(address(this));
    }

    function activate(bytes32 policyHash, uint64 validFrom, uint64 validUntil) external {
        uint64 version = registry.latestVersion() + 1;
        try registry.activatePolicy(policyHash, version, validFrom, validUntil) {
            recordedHash[version] = policyHash;
            recordedFrom[version] = validFrom;
            recordedUntil[version] = validUntil;
        } catch {
            return;
        }
    }
}

contract TreasuryGuardHandler {
    TreasuryGuard public immutable guard;
    bytes32[] private _consumed;
    bytes4 private constant SELECTOR = 0xa9059cbb;
    address private constant TARGET = address(0x1111);

    constructor() {
        guard = new TreasuryGuard(address(this), address(0xBEEF), address(0xCAFE));
        guard.configurePolicy(keccak256("invariant-policy"), 1, 0, type(uint64).max, 0);
        guard.setTargetAllowed(TARGET, true);
        guard.setSelectorAllowed(SELECTOR, true);
    }

    function setPaused(bool paused) external {
        guard.setPaused(paused);
    }

    function authorize(bytes32 actionId) external {
        bytes memory data = abi.encodeWithSelector(SELECTOR, address(0x2222), uint256(1));
        try guard.authorizeAction(
            actionId, TARGET, 0, data, guard.policyHash(), guard.policyVersion(), type(uint64).max
        ) {
            _consumed.push(actionId);
        } catch {}
    }

    function consumedCount() external view returns (uint256) {
        return _consumed.length;
    }

    function consumedAt(uint256 index) external view returns (bytes32) {
        return _consumed[index];
    }
}

contract EvidenceAnchorHandler {
    EvidenceAnchorASC public immutable anchor;
    bytes32[] private _consumed;
    uint64 private constant SOURCE_CHAIN = 1;

    constructor() {
        anchor = new EvidenceAnchorASC(address(new InvariantVerifier()), SOURCE_CHAIN);
    }

    function anchorEvidence(bytes32 decisionId, bytes32 snapshotHash, uint64 height, bytes calldata transactionBytes)
        external
    {
        INativeQueryVerifier.MerkleProof memory merkle;
        INativeQueryVerifier.ContinuityProof memory continuity;
        try anchor.verifyAndAnchor(
            decisionId, snapshotHash, SOURCE_CHAIN, height, transactionBytes, merkle, continuity
        ) returns (
            bytes32 commitment
        ) {
            _consumed.push(commitment);
        } catch {}
    }

    function consumedCount() external view returns (uint256) {
        return _consumed.length;
    }

    function consumedAt(uint256 index) external view returns (bytes32) {
        return _consumed[index];
    }
}

contract ContractInvariants {
    PolicyRegistryHandler private registryHandler;
    TreasuryGuardHandler private guardHandler;
    EvidenceAnchorHandler private anchorHandler;
    address[] private _targets;

    function setUp() public {
        registryHandler = new PolicyRegistryHandler();
        guardHandler = new TreasuryGuardHandler();
        anchorHandler = new EvidenceAnchorHandler();
        _targets.push(address(registryHandler));
        _targets.push(address(guardHandler));
        _targets.push(address(anchorHandler));
    }

    function targetContracts() external view returns (address[] memory) {
        return _targets;
    }

    function invariant_policyVersionsNeverMutateOrSkip() public view {
        PolicyRegistry registry = registryHandler.registry();
        uint64 latest = registry.latestVersion();
        for (uint64 version = 1; version <= latest; version++) {
            PolicyRegistry.PolicyRecord memory record = registry.policy(version);
            require(record.policyHash == registryHandler.recordedHash(version), "policy hash mutated");
            require(record.validFrom == registryHandler.recordedFrom(version), "validFrom mutated");
            require(record.validUntil == registryHandler.recordedUntil(version), "validUntil mutated");
        }
    }

    function invariant_consumedActionsRemainConsumed() public view {
        TreasuryGuard guard = guardHandler.guard();
        uint256 count = guardHandler.consumedCount();
        for (uint256 index; index < count; index++) {
            require(guard.consumedAction(guardHandler.consumedAt(index)), "action replay state cleared");
        }
    }

    function invariant_pauseAlwaysBlocksValidation() public view {
        TreasuryGuard guard = guardHandler.guard();
        if (!guard.paused()) return;
        bytes memory data = abi.encodeWithSelector(bytes4(0xa9059cbb), address(0x2222), uint256(1));
        (bool ok,) = address(guard)
            .staticcall(
                abi.encodeCall(
                    guard.validateAction,
                    (
                        keccak256("paused-invariant"),
                        address(0x1111),
                        0,
                        data,
                        guard.policyHash(),
                        guard.policyVersion(),
                        type(uint64).max
                    )
                )
            );
        require(!ok, "paused guard validated action");
    }

    function invariant_anchorCommitmentsRemainConsumed() public view {
        EvidenceAnchorASC anchor = anchorHandler.anchor();
        uint256 count = anchorHandler.consumedCount();
        for (uint256 index; index < count; index++) {
            require(anchor.consumedCommitment(anchorHandler.consumedAt(index)), "anchor replay state cleared");
        }
    }

    function invariant_controlContractsNeverHoldNativeAssets() public view {
        require(address(registryHandler.registry()).balance == 0, "registry holds assets");
        require(address(guardHandler.guard()).balance == 0, "guard holds assets");
        require(address(anchorHandler.anchor()).balance == 0, "anchor holds assets");
    }
}
