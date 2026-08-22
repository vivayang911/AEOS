// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EvidenceAnchorASC, INativeQueryVerifier} from "../src/EvidenceAnchorASC.sol";

contract MockNativeQueryVerifier is INativeQueryVerifier {
    bool public result = true;

    function setResult(bool value) external {
        result = value;
    }

    function verify(uint64, uint64, bytes calldata, MerkleProof calldata, ContinuityProof calldata)
        external
        view
        returns (bool)
    {
        return result;
    }
}

contract AnchorCaller {
    function anchor(
        EvidenceAnchorASC anchorContract,
        bytes32 decisionId,
        bytes32 snapshotHash,
        uint64 chainKey,
        uint64 height,
        bytes calldata txBytes,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external returns (bytes32) {
        return anchorContract.verifyAndAnchor(
            decisionId, snapshotHash, chainKey, height, txBytes, merkleProof, continuityProof
        );
    }
}

contract EvidenceAnchorASCTest {
    uint64 private constant SEPOLIA_CHAIN_KEY = 2;
    bytes32 private constant DECISION = keccak256("decision");
    bytes32 private constant SNAPSHOT = keccak256("snapshot");
    bytes private constant TX_BYTES = hex"01020304";

    function proof()
        private
        pure
        returns (INativeQueryVerifier.MerkleProof memory merkle, INativeQueryVerifier.ContinuityProof memory continuity)
    {
        merkle.root = keccak256("root");
        merkle.siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        continuity.lowerEndpointDigest = keccak256("lower");
        continuity.roots = new bytes32[](1);
        continuity.roots[0] = keccak256("upper");
    }

    function expectFailure(address target, bytes memory data) private {
        (bool ok,) = target.call(data);
        require(!ok, "expected revert");
    }

    function testVerifiedProofAnchorsExactCommitmentOnce() public {
        MockNativeQueryVerifier verifier = new MockNativeQueryVerifier();
        EvidenceAnchorASC anchorContract = new EvidenceAnchorASC(address(verifier), SEPOLIA_CHAIN_KEY);
        (INativeQueryVerifier.MerkleProof memory merkle, INativeQueryVerifier.ContinuityProof memory continuity) =
            proof();
        bytes32 expected =
            anchorContract.commitmentFor(DECISION, SNAPSHOT, SEPOLIA_CHAIN_KEY, 100, TX_BYTES, address(this));
        bytes32 actual =
            anchorContract.verifyAndAnchor(DECISION, SNAPSHOT, SEPOLIA_CHAIN_KEY, 100, TX_BYTES, merkle, continuity);
        require(actual == expected && anchorContract.consumedCommitment(expected), "commitment not anchored");
        expectFailure(
            address(anchorContract),
            abi.encodeCall(
                anchorContract.verifyAndAnchor,
                (DECISION, SNAPSHOT, SEPOLIA_CHAIN_KEY, 100, TX_BYTES, merkle, continuity)
            )
        );
    }

    function testRejectedProofWrongChainAndMalformedAnchorFailClosed() public {
        MockNativeQueryVerifier verifier = new MockNativeQueryVerifier();
        EvidenceAnchorASC anchorContract = new EvidenceAnchorASC(address(verifier), SEPOLIA_CHAIN_KEY);
        (INativeQueryVerifier.MerkleProof memory merkle, INativeQueryVerifier.ContinuityProof memory continuity) =
            proof();
        verifier.setResult(false);
        expectFailure(
            address(anchorContract),
            abi.encodeCall(
                anchorContract.verifyAndAnchor,
                (DECISION, SNAPSHOT, SEPOLIA_CHAIN_KEY, 100, TX_BYTES, merkle, continuity)
            )
        );
        verifier.setResult(true);
        expectFailure(
            address(anchorContract),
            abi.encodeCall(anchorContract.verifyAndAnchor, (DECISION, SNAPSHOT, 9, 100, TX_BYTES, merkle, continuity))
        );
        expectFailure(
            address(anchorContract),
            abi.encodeCall(
                anchorContract.verifyAndAnchor,
                (bytes32(0), SNAPSHOT, SEPOLIA_CHAIN_KEY, 100, TX_BYTES, merkle, continuity)
            )
        );
    }

    function testRequesterIsBoundAndContractCannotReceiveAssets() public {
        MockNativeQueryVerifier verifier = new MockNativeQueryVerifier();
        EvidenceAnchorASC anchorContract = new EvidenceAnchorASC(address(verifier), SEPOLIA_CHAIN_KEY);
        AnchorCaller caller = new AnchorCaller();
        (INativeQueryVerifier.MerkleProof memory merkle, INativeQueryVerifier.ContinuityProof memory continuity) =
            proof();
        bytes32 expected =
            anchorContract.commitmentFor(DECISION, SNAPSHOT, SEPOLIA_CHAIN_KEY, 100, TX_BYTES, address(caller));
        require(
            caller.anchor(anchorContract, DECISION, SNAPSHOT, SEPOLIA_CHAIN_KEY, 100, TX_BYTES, merkle, continuity)
                == expected,
            "requester binding failed"
        );
        (bool paid,) = address(anchorContract).call{value: 1}("");
        require(!paid, "anchor accepted assets");
    }
}
