// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Source-chain registry for immutable, hash-only AEOS treasury observations.
/// The contract cannot receive assets, call external contracts, or execute treasury actions.
contract AEOSTreasuryEvidenceSource {
    address public immutable reporter;
    mapping(bytes32 observationId => bytes32 commitment) public observationCommitment;

    error Unauthorized();
    error InvalidConfiguration();
    error InvalidObservation();
    error ObservationAlreadyCommitted();

    event TreasuryObservationCommitted(
        bytes32 indexed observationId,
        bytes32 indexed organizationCommitment,
        bytes32 indexed treasuryCommitment,
        bytes32 evidencePayloadHash,
        uint64 observedAt,
        address reporter,
        uint256 sourceChainId,
        bytes32 commitment
    );

    constructor(address reporter_) {
        if (reporter_ == address(0)) revert InvalidConfiguration();
        reporter = reporter_;
    }

    function commitObservation(
        bytes32 observationId,
        bytes32 organizationCommitment,
        bytes32 treasuryCommitment,
        bytes32 evidencePayloadHash,
        uint64 observedAt
    ) external returns (bytes32 commitment) {
        if (msg.sender != reporter) revert Unauthorized();
        if (
            observationId == bytes32(0) || organizationCommitment == bytes32(0) || treasuryCommitment == bytes32(0)
                || evidencePayloadHash == bytes32(0) || observedAt == 0 || observedAt > block.timestamp
        ) revert InvalidObservation();
        if (observationCommitment[observationId] != bytes32(0)) revert ObservationAlreadyCommitted();

        commitment = commitmentFor(
            observationId, organizationCommitment, treasuryCommitment, evidencePayloadHash, observedAt, msg.sender
        );
        observationCommitment[observationId] = commitment;

        emit TreasuryObservationCommitted(
            observationId,
            organizationCommitment,
            treasuryCommitment,
            evidencePayloadHash,
            observedAt,
            msg.sender,
            block.chainid,
            commitment
        );
    }

    function commitmentFor(
        bytes32 observationId,
        bytes32 organizationCommitment,
        bytes32 treasuryCommitment,
        bytes32 evidencePayloadHash,
        uint64 observedAt,
        address observationReporter
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                address(this),
                observationId,
                organizationCommitment,
                treasuryCommitment,
                evidencePayloadHash,
                observedAt,
                observationReporter
            )
        );
    }
}
