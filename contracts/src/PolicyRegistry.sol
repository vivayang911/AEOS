// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Immutable, governance-controlled registry of versioned AEOS policy commitments.
/// It stores no assets, performs no external calls, and grants no execution authority.
contract PolicyRegistry {
    struct PolicyRecord {
        bytes32 policyHash;
        uint64 validFrom;
        uint64 validUntil;
    }
    address public immutable governance;
    uint64 public latestVersion;
    mapping(uint64 => PolicyRecord) private _policies;
    error Unauthorized();
    error InvalidConfiguration();
    error InvalidPolicy();
    error InvalidVersion();
    error PolicyAlreadyExists();
    event PolicyActivated(bytes32 indexed policyHash, uint64 indexed version, uint64 validFrom, uint64 validUntil);

    constructor(address governance_) {
        if (governance_ == address(0)) revert InvalidConfiguration();
        governance = governance_;
    }

    function activatePolicy(bytes32 policyHash, uint64 version, uint64 validFrom, uint64 validUntil) external {
        if (msg.sender != governance) revert Unauthorized();
        if (policyHash == bytes32(0) || validFrom >= validUntil) revert InvalidPolicy();
        if (version == 0 || version != latestVersion + 1) revert InvalidVersion();
        if (_policies[version].policyHash != bytes32(0)) revert PolicyAlreadyExists();
        _policies[version] = PolicyRecord(policyHash, validFrom, validUntil);
        latestVersion = version;
        emit PolicyActivated(policyHash, version, validFrom, validUntil);
    }

    function policy(uint64 version) external view returns (PolicyRecord memory) {
        return _policies[version];
    }

    function isPolicyActive(bytes32 expectedHash, uint64 version, uint64 timestamp) external view returns (bool) {
        PolicyRecord memory record = _policies[version];
        return record.policyHash != bytes32(0) && record.policyHash == expectedHash && timestamp >= record.validFrom
            && timestamp <= record.validUntil;
    }

    function currentPolicy() external view returns (PolicyRecord memory record, uint64 version, bool active) {
        version = latestVersion;
        record = _policies[version];
        active = record.policyHash != bytes32(0) && block.timestamp >= record.validFrom
            && block.timestamp <= record.validUntil;
    }
}
