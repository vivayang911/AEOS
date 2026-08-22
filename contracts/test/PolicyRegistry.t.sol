// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {PolicyRegistry} from "../src/PolicyRegistry.sol";

contract PolicyRegistryCaller {
    function activate(PolicyRegistry registry, bytes32 hash, uint64 version, uint64 validFrom, uint64 validUntil)
        external
    {
        registry.activatePolicy(hash, version, validFrom, validUntil);
    }
}

contract PolicyRegistryTest {
    bytes32 private constant POLICY_ONE = keccak256("policy-v1");
    bytes32 private constant POLICY_TWO = keccak256("policy-v2");

    function expectFailure(address target, bytes memory data) private {
        (bool ok,) = target.call(data);
        require(!ok, "expected revert");
    }

    function testOnlyGovernanceCanActivateAndRegistryHasNoAssetSurface() public {
        PolicyRegistry registry = new PolicyRegistry(address(this));
        PolicyRegistryCaller outsider = new PolicyRegistryCaller();
        expectFailure(address(outsider), abi.encodeCall(outsider.activate, (registry, POLICY_ONE, 1, 10, 20)));
        (bool paid,) = address(registry).call{value: 1}("");
        require(!paid, "registry accepted assets");
    }

    function testPoliciesAreSequentialImmutableAndValidityBounded() public {
        PolicyRegistry registry = new PolicyRegistry(address(this));
        registry.activatePolicy(POLICY_ONE, 1, 10, 20);
        registry.activatePolicy(POLICY_TWO, 2, 21, 30);
        PolicyRegistry.PolicyRecord memory record = registry.policy(1);
        require(record.policyHash == POLICY_ONE && record.validFrom == 10 && record.validUntil == 20, "policy mutated");
        require(registry.latestVersion() == 2, "latest version mismatch");
        require(registry.isPolicyActive(POLICY_ONE, 1, 10), "start must be inclusive");
        require(registry.isPolicyActive(POLICY_ONE, 1, 20), "end must be inclusive");
        require(!registry.isPolicyActive(POLICY_ONE, 1, 9), "early policy active");
        require(!registry.isPolicyActive(POLICY_ONE, 1, 21), "expired policy active");
        require(!registry.isPolicyActive(POLICY_TWO, 1, 15), "wrong hash active");
    }

    function testInvalidHashWindowAndVersionFailClosed() public {
        PolicyRegistry registry = new PolicyRegistry(address(this));
        expectFailure(address(registry), abi.encodeCall(registry.activatePolicy, (bytes32(0), 1, 10, 20)));
        expectFailure(address(registry), abi.encodeCall(registry.activatePolicy, (POLICY_ONE, 1, 20, 20)));
        expectFailure(address(registry), abi.encodeCall(registry.activatePolicy, (POLICY_ONE, 2, 10, 20)));
        registry.activatePolicy(POLICY_ONE, 1, 10, 20);
        expectFailure(address(registry), abi.encodeCall(registry.activatePolicy, (POLICY_TWO, 1, 21, 30)));
        expectFailure(address(registry), abi.encodeCall(registry.activatePolicy, (POLICY_TWO, 3, 21, 30)));
    }

    function testFuzzOnlyExactNextVersionCanActivate(uint64 version) public {
        PolicyRegistry registry = new PolicyRegistry(address(this));
        if (version == 1) {
            registry.activatePolicy(POLICY_ONE, version, 1, type(uint64).max);
            require(registry.latestVersion() == 1, "valid version rejected");
        } else {
            expectFailure(
                address(registry), abi.encodeCall(registry.activatePolicy, (POLICY_ONE, version, 1, type(uint64).max))
            );
        }
    }
}
