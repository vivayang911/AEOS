// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AEOSBalanceObserver} from "../src/AEOSBalanceObserver.sol";

contract BalanceTokenFixture {
    mapping(address => uint256) public balanceOf;
    function setBalance(address account, uint256 amount) external { balanceOf[account] = amount; }
}

contract BrokenBalanceTokenFixture {
    fallback() external { assembly { return(0, 0) } }
}

contract BalanceObserverCaller {
    function observe(AEOSBalanceObserver observer, bytes calldata payload) external returns (bool, bytes memory) {
        return address(observer).call(payload);
    }
}

contract BalanceObserverFactory {
    function deploy(address reporter) external returns (AEOSBalanceObserver) { return new AEOSBalanceObserver(reporter); }
}

contract AEOSBalanceObserverTest {
    bytes32 private constant OBSERVATION = keccak256("balance-observation-1");
    bytes32 private constant ORGANIZATION = keccak256("organization-1");
    bytes32 private constant TREASURY = keccak256("treasury-1");
    address private constant ACCOUNT = address(0xA11CE);

    function expectFailure(address target, bytes memory data) private {
        (bool ok,) = target.call(data);
        require(!ok, "expected revert");
    }

    function testReadsAndFreezesExactBalanceWithoutMovingAssets() public {
        BalanceTokenFixture token = new BalanceTokenFixture();
        token.setBalance(ACCOUNT, 20_000_000);
        AEOSBalanceObserver observer = new AEOSBalanceObserver(address(this));
        bytes32 tokenCodeHash = address(token).codehash;

        bytes32 commitment = observer.observeBalance(
            OBSERVATION, ORGANIZATION, TREASURY, address(token), ACCOUNT, tokenCodeHash
        );

        require(observer.observedBalance(OBSERVATION) == 20_000_000, "wrong balance");
        require(observer.observationCommitment(OBSERVATION) == commitment, "missing commitment");
        require(address(observer).balance == 0, "observer received assets");
        require(token.balanceOf(ACCOUNT) == 20_000_000, "observer changed token balance");
    }

    function testOnlyReporterCanObserveAndObservationCannotReplay() public {
        BalanceTokenFixture token = new BalanceTokenFixture();
        AEOSBalanceObserver observer = new AEOSBalanceObserver(address(this));
        bytes memory payload = abi.encodeCall(
            observer.observeBalance,
            (OBSERVATION, ORGANIZATION, TREASURY, address(token), ACCOUNT, address(token).codehash)
        );
        BalanceObserverCaller outsider = new BalanceObserverCaller();
        (bool outsiderOk,) = outsider.observe(observer, payload);
        require(!outsiderOk, "outsider observed");
        (bool first,) = address(observer).call(payload);
        require(first, "first observation failed");
        expectFailure(address(observer), payload);
    }

    function testInvalidIdentityAndMalformedBalanceReadFailClosed() public {
        BalanceObserverFactory factory = new BalanceObserverFactory();
        expectFailure(address(factory), abi.encodeCall(factory.deploy, (address(0))));
        BalanceTokenFixture token = new BalanceTokenFixture();
        AEOSBalanceObserver observer = new AEOSBalanceObserver(address(this));
        expectFailure(
            address(observer),
            abi.encodeCall(
                observer.observeBalance,
                (OBSERVATION, ORGANIZATION, TREASURY, address(token), ACCOUNT, bytes32(uint256(1)))
            )
        );
        BrokenBalanceTokenFixture broken = new BrokenBalanceTokenFixture();
        expectFailure(
            address(observer),
            abi.encodeCall(
                observer.observeBalance,
                (OBSERVATION, ORGANIZATION, TREASURY, address(broken), ACCOUNT, address(broken).codehash)
            )
        );
    }

    function testRejectsNativeValueAndZeroFields() public {
        BalanceTokenFixture token = new BalanceTokenFixture();
        AEOSBalanceObserver observer = new AEOSBalanceObserver(address(this));
        (bool paid,) = address(observer).call{value: 1}("");
        require(!paid, "observer accepted assets");
        expectFailure(
            address(observer),
            abi.encodeCall(
                observer.observeBalance,
                (bytes32(0), ORGANIZATION, TREASURY, address(token), ACCOUNT, address(token).codehash)
            )
        );
    }
}
