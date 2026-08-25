// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Records the exact ERC-20 balance returned during a source-chain transaction.
/// @dev This contract cannot receive or transfer assets. The configured reporter must
///      submit every observation, and the token runtime identity is frozen in calldata.
contract AEOSBalanceObserver {
    struct Observation {
        bytes32 observationId;
        bytes32 organizationCommitment;
        bytes32 treasuryCommitment;
        address token;
        address account;
        bytes32 tokenCodeHash;
        uint256 balance;
        uint256 sourceBlockNumber;
        uint64 observedAt;
        address observationReporter;
    }

    address public immutable reporter;

    mapping(bytes32 observationId => bytes32 commitment) public observationCommitment;
    mapping(bytes32 observationId => uint256 balance) public observedBalance;

    error Unauthorized();
    error InvalidConfiguration();
    error InvalidObservation();
    error ObservationAlreadyCommitted();
    error TokenIdentityMismatch();
    error BalanceReadFailed();

    event BalanceObserved(
        bytes32 indexed observationId,
        bytes32 indexed organizationCommitment,
        bytes32 indexed treasuryCommitment,
        address token,
        address account,
        bytes32 tokenCodeHash,
        uint256 balance,
        uint256 sourceBlockNumber,
        uint64 observedAt,
        address reporter,
        uint256 sourceChainId,
        bytes32 commitment
    );

    constructor(address reporter_) {
        if (reporter_ == address(0)) revert InvalidConfiguration();
        reporter = reporter_;
    }

    function observeBalance(
        bytes32 observationId,
        bytes32 organizationCommitment,
        bytes32 treasuryCommitment,
        address token,
        address account,
        bytes32 expectedTokenCodeHash
    ) external returns (bytes32 commitment) {
        if (msg.sender != reporter) revert Unauthorized();
        if (
            observationId == bytes32(0) || organizationCommitment == bytes32(0)
                || treasuryCommitment == bytes32(0) || token == address(0) || account == address(0)
                || expectedTokenCodeHash == bytes32(0)
        ) revert InvalidObservation();
        if (observationCommitment[observationId] != bytes32(0)) revert ObservationAlreadyCommitted();

        bytes32 actualTokenCodeHash = token.codehash;
        if (actualTokenCodeHash != expectedTokenCodeHash) revert TokenIdentityMismatch();

        (bool ok, bytes memory result) = token.staticcall(abi.encodeWithSelector(0x70a08231, account));
        if (!ok || result.length != 32) revert BalanceReadFailed();
        uint256 balance = abi.decode(result, (uint256));
        uint64 observedAt = uint64(block.timestamp);

        Observation memory observation = Observation({
            observationId: observationId,
            organizationCommitment: organizationCommitment,
            treasuryCommitment: treasuryCommitment,
            token: token,
            account: account,
            tokenCodeHash: actualTokenCodeHash,
            balance: balance,
            sourceBlockNumber: block.number,
            observedAt: observedAt,
            observationReporter: msg.sender
        });
        commitment = _commitmentFor(observation);
        observationCommitment[observationId] = commitment;
        observedBalance[observationId] = balance;
        _emitObservation(observation, commitment);
    }

    function _commitmentFor(Observation memory observation) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                address(this),
                observation.observationId,
                observation.organizationCommitment,
                observation.treasuryCommitment,
                observation.token,
                observation.account,
                observation.tokenCodeHash,
                observation.balance,
                observation.sourceBlockNumber,
                observation.observedAt,
                observation.observationReporter
            )
        );
    }

    function _emitObservation(Observation memory observation, bytes32 commitment) private {
        emit BalanceObserved(
            observation.observationId,
            observation.organizationCommitment,
            observation.treasuryCommitment,
            observation.token,
            observation.account,
            observation.tokenCodeHash,
            observation.balance,
            observation.sourceBlockNumber,
            observation.observedAt,
            observation.observationReporter,
            block.chainid,
            commitment
        );
    }
}
