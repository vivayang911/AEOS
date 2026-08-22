// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool);
}

/// @notice Non-asset-moving USC that anchors an AEOS Decision/Evidence Snapshot only after
/// Creditcoin's native query verifier accepts the bound source-chain transaction bytes.
contract EvidenceAnchorASC {
    address public immutable nativeQueryVerifier;
    uint64 public immutable allowedSourceChainKey;
    mapping(bytes32 => bool) public consumedCommitment;

    error InvalidConfiguration();
    error InvalidAnchor();
    error UnsupportedSourceChain();
    error CommitmentAlreadyConsumed();
    error SourceTransactionProofRejected();

    event EvidenceAnchored(
        bytes32 indexed commitmentId,
        bytes32 indexed decisionId,
        bytes32 indexed snapshotHash,
        bytes32 encodedTransactionHash,
        uint64 sourceChainKey,
        uint64 sourceBlockHeight,
        address requester
    );

    constructor(address nativeQueryVerifier_, uint64 allowedSourceChainKey_) {
        if (nativeQueryVerifier_ == address(0) || allowedSourceChainKey_ == 0) revert InvalidConfiguration();
        nativeQueryVerifier = nativeQueryVerifier_;
        allowedSourceChainKey = allowedSourceChainKey_;
    }

    function commitmentFor(
        bytes32 decisionId,
        bytes32 snapshotHash,
        uint64 sourceChainKey,
        uint64 sourceBlockHeight,
        bytes calldata encodedTransaction,
        address requester
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                decisionId, snapshotHash, sourceChainKey, sourceBlockHeight, keccak256(encodedTransaction), requester
            )
        );
    }

    function verifyAndAnchor(
        bytes32 decisionId,
        bytes32 snapshotHash,
        uint64 sourceChainKey,
        uint64 sourceBlockHeight,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external returns (bytes32 commitmentId) {
        if (
            decisionId == bytes32(0) || snapshotHash == bytes32(0) || sourceBlockHeight == 0
                || encodedTransaction.length == 0
        ) revert InvalidAnchor();
        if (sourceChainKey != allowedSourceChainKey) revert UnsupportedSourceChain();
        commitmentId =
            commitmentFor(decisionId, snapshotHash, sourceChainKey, sourceBlockHeight, encodedTransaction, msg.sender);
        if (consumedCommitment[commitmentId]) revert CommitmentAlreadyConsumed();
        consumedCommitment[commitmentId] = true;
        bool verified = INativeQueryVerifier(nativeQueryVerifier)
            .verify(sourceChainKey, sourceBlockHeight, encodedTransaction, merkleProof, continuityProof);
        if (!verified) revert SourceTransactionProofRejected();
        emit EvidenceAnchored(
            commitmentId,
            decisionId,
            snapshotHash,
            keccak256(encodedTransaction),
            sourceChainKey,
            sourceBlockHeight,
            msg.sender
        );
    }
}
