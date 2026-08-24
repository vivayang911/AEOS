# Creditcoin Testnet governance-stack deployment

This is the public, non-secret record for the user-controlled AEOS governance-stack deployment on Creditcoin Testnet (`chainId 102031`). AEOS prepared exact zero-value requests but never received a private key, signed a transaction, clicked the wallet confirmation or obtained treasury asset authority.

## Deployed contracts

| Contract | Address |
| --- | --- |
| AEOSGovernanceToken | [`0x3c5d...e252`](https://creditcoin-testnet.blockscout.com/address/0x3c5d22d53776ab288d25892e34bda0d9a895e252) |
| TimelockController | [`0x1107...4092`](https://creditcoin-testnet.blockscout.com/address/0x110780c95c487b93037016ea8cfae5552ce44092) |
| AEOSGovernor | [`0xfe90...0268`](https://creditcoin-testnet.blockscout.com/address/0xfe90b087fae789e043514b6ac3dbd7fd2d970268) |
| PolicyRegistry | [`0x628a...c1a0`](https://creditcoin-testnet.blockscout.com/address/0x628a74949ac85ab2429c40f6da88e0379ecdc1a0) |
| TreasuryGuard | [`0x3c0c...c628`](https://creditcoin-testnet.blockscout.com/address/0x3c0cb960f32e6a222149a664a552ffc23e92c628) |

## User-confirmed transaction sequence

| # | Nonce | Operation | Transaction | Block |
| ---: | ---: | --- | --- | ---: |
| 1 | 4 | Deploy AEOSGovernanceToken | [`0xd838...a4fd`](https://creditcoin-testnet.blockscout.com/tx/0xd83838e7a0c995160ac5b2c017b3fb54c65f18f0f4edcd7cf060fc65350aa4fd) | 5359537 |
| 2 | 5 | Deploy TimelockController | [`0xec48...3982`](https://creditcoin-testnet.blockscout.com/tx/0xec487ec4ca1d4b285e1ad32efac1870211583772aa7c37114fc4e889a9353982) | 5359556 |
| 3 | 6 | Deploy AEOSGovernor | [`0xa126...cf8c`](https://creditcoin-testnet.blockscout.com/tx/0xa126405744510da1e104f62c8817a95ff10d817ca244dcb69119770e4c28cf8c) | 5359613 |
| 4 | 7 | Deploy PolicyRegistry | [`0x0938...c349`](https://creditcoin-testnet.blockscout.com/tx/0x09383b84eed8f4a226cc51f0928559e21b087d29c29a00193a90023050d1c349) | 5359830 |
| 5 | 8 | Deploy TreasuryGuard | [`0x40a8...5f9f`](https://creditcoin-testnet.blockscout.com/tx/0x40a8613767bc6fc5703f0889d387878fe6fed0b672d42283a4a1a917f5d75f9f) | 5359847 |
| 6 | 9 | Grant Governor Proposer | [`0x0e58...d139`](https://creditcoin-testnet.blockscout.com/tx/0x0e585a0a73991ffffd5fcc2bc7f41572f7e4c6a847bc060f901fe19f7277d139) | 5359883 |
| 7 | 10 | Grant Governor Canceller | [`0x718a...d9ae`](https://creditcoin-testnet.blockscout.com/tx/0x718ae583d212c669f75602c198800f72eba00a5e545c986b75083159a0a5d9ae) | 5359931 |
| 8 | 11 | Renounce deployer temporary Admin | [`0x3231...71dae`](https://creditcoin-testnet.blockscout.com/tx/0x3231dc7c084df38bc2bceb0039d8ec43ffaca510101a8d82e91f986bae071dae) | 5359998 |

Frozen plan hash: `0xef8b372f4323b0cedcd946f0e38b30e6824cc61c1c4ef6a87363f4aa8aba8ead`.

## Independently verified final state

- Exact sequence-eight sender, nonce, target, zero value, calldata and calldata hash match the frozen request.
- The transaction is included in canonical block `5359998`, hash `0x73548c81a5a16e103857a60925365f24cd87f01fa974261fe003b240bed48b14`.
- `RoleRevoked(DEFAULT_ADMIN_ROLE, deployer, deployer)` was observed.
- Governor is Proposer and Canceller but not Admin.
- Timelock is self-administered, uses a 60-second delay and allows execution only after the delay; the deployer has no Timelock role.
- Governor binds the deployed voting token and Timelock. PolicyRegistry and TreasuryGuard bind Timelock governance. TreasuryGuard binds the deployed PolicyRegistry and starts paused.
- All five deployed addresses contain contract code. The final wallet pending nonce was `12` at verification time.

Every deployment finality check passed using `npm run verify:governance-stack-finality`. A later distinct Attempt 3 also completed the real Decision-bound Proposal, voting/quorum, Queue, elapsed Timelock, zero-value Guard pause and immutable Outcome Evidence path. That accepts the bounded deterministic-withholding slice only. Policy activation/action authorization, Safe integration, asset movement and broader production acceptance remain incomplete.
