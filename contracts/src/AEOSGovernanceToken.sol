// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/// @notice Fixed-supply testnet governance token used only for voting checkpoints.
/// @dev It has no minting, treasury execution, privileged transfer, or AI authority surface.
contract AEOSGovernanceToken is ERC20, ERC20Permit, ERC20Votes {
    error InvalidInitialHolder();
    error InvalidInitialSupply();

    constructor(address initialHolder, uint256 initialSupply)
        ERC20("AEOS Governance Test Token", "AEOS-GOV")
        ERC20Permit("AEOS Governance Test Token")
    {
        if (initialHolder == address(0)) revert InvalidInitialHolder();
        if (initialSupply == 0 || initialSupply > type(uint208).max) revert InvalidInitialSupply();
        _mint(initialHolder, initialSupply);
        _delegate(initialHolder, initialHolder);
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
