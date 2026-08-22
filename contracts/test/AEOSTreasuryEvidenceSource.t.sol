// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AEOSTreasuryEvidenceSource} from "../src/AEOSTreasuryEvidenceSource.sol";

contract EvidenceSourceCaller {
    function commit(
        AEOSTreasuryEvidenceSource source,
        bytes32 observationId,
        bytes32 organizationCommitment,
        bytes32 treasuryCommitment,
        bytes32 evidencePayloadHash,
        uint64 observedAt
    ) external returns (bytes32) {
        return source.commitObservation(
            observationId, organizationCommitment, treasuryCommitment, evidencePayloadHash, observedAt
        );
    }
}

contract EvidenceSourceFactory {
    function deploy(address reporter) external returns (AEOSTreasuryEvidenceSource) {
        return new AEOSTreasuryEvidenceSource(reporter);
    }
}

contract AEOSTreasuryEvidenceSourceTest {
    bytes32 private constant OBSERVATION_ID = keccak256("observation-1");
    bytes32 private constant ORGANIZATION = keccak256("organization-1");
    bytes32 private constant TREASURY = keccak256("treasury-1");
    bytes32 private constant PAYLOAD = keccak256("evidence-payload-1");

    function expectFailure(address target, bytes memory data) private {
        (bool ok,) = target.call(data);
        require(!ok, "expected revert");
    }

    function testReporterCommitsExactImmutableObservationOnce() public {
        AEOSTreasuryEvidenceSource source = new AEOSTreasuryEvidenceSource(address(this));
        uint64 observedAt = uint64(block.timestamp);
        bytes32 expected =
            source.commitmentFor(OBSERVATION_ID, ORGANIZATION, TREASURY, PAYLOAD, observedAt, address(this));

        bytes32 actual = source.commitObservation(OBSERVATION_ID, ORGANIZATION, TREASURY, PAYLOAD, observedAt);

        require(actual == expected, "commitment mismatch");
        require(source.observationCommitment(OBSERVATION_ID) == expected, "observation not persisted");
        expectFailure(
            address(source),
            abi.encodeCall(source.commitObservation, (OBSERVATION_ID, ORGANIZATION, TREASURY, PAYLOAD, observedAt))
        );
    }

    function testOnlyConfiguredReporterCanCommitAndContractCannotReceiveAssets() public {
        AEOSTreasuryEvidenceSource source = new AEOSTreasuryEvidenceSource(address(this));
        EvidenceSourceCaller outsider = new EvidenceSourceCaller();
        expectFailure(
            address(outsider),
            abi.encodeCall(
                outsider.commit, (source, OBSERVATION_ID, ORGANIZATION, TREASURY, PAYLOAD, uint64(block.timestamp))
            )
        );
        (bool paid,) = address(source).call{value: 1}("");
        require(!paid, "source accepted assets");
    }

    function testInvalidConfigurationAndMalformedObservationsFailClosed() public {
        EvidenceSourceFactory factory = new EvidenceSourceFactory();
        expectFailure(address(factory), abi.encodeCall(factory.deploy, (address(0))));
        AEOSTreasuryEvidenceSource source = new AEOSTreasuryEvidenceSource(address(this));
        uint64 observedAt = uint64(block.timestamp);
        expectFailure(
            address(source),
            abi.encodeCall(source.commitObservation, (bytes32(0), ORGANIZATION, TREASURY, PAYLOAD, observedAt))
        );
        expectFailure(
            address(source),
            abi.encodeCall(source.commitObservation, (OBSERVATION_ID, bytes32(0), TREASURY, PAYLOAD, observedAt))
        );
        expectFailure(
            address(source),
            abi.encodeCall(source.commitObservation, (OBSERVATION_ID, ORGANIZATION, bytes32(0), PAYLOAD, observedAt))
        );
        expectFailure(
            address(source),
            abi.encodeCall(source.commitObservation, (OBSERVATION_ID, ORGANIZATION, TREASURY, bytes32(0), observedAt))
        );
        expectFailure(
            address(source),
            abi.encodeCall(source.commitObservation, (OBSERVATION_ID, ORGANIZATION, TREASURY, PAYLOAD, 0))
        );
    }

    function testFutureObservationFailsClosed() public {
        AEOSTreasuryEvidenceSource source = new AEOSTreasuryEvidenceSource(address(this));
        expectFailure(
            address(source),
            abi.encodeCall(
                source.commitObservation, (OBSERVATION_ID, ORGANIZATION, TREASURY, PAYLOAD, uint64(block.timestamp + 1))
            )
        );
    }

    function testFuzzCommitmentBindsPayload(bytes32 payload) public {
        if (payload == bytes32(0)) return;
        AEOSTreasuryEvidenceSource source = new AEOSTreasuryEvidenceSource(address(this));
        uint64 observedAt = uint64(block.timestamp);
        bytes32 commitment = source.commitObservation(OBSERVATION_ID, ORGANIZATION, TREASURY, payload, observedAt);
        require(
            commitment
                == source.commitmentFor(OBSERVATION_ID, ORGANIZATION, TREASURY, payload, observedAt, address(this)),
            "payload not bound"
        );
        if (payload != PAYLOAD) {
            require(
                commitment
                    != source.commitmentFor(OBSERVATION_ID, ORGANIZATION, TREASURY, PAYLOAD, observedAt, address(this)),
                "distinct payload collision"
            );
        }
    }
}
