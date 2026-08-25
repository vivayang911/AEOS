# Sepolia Balance Observer runbook

Status: `WALLET_HANDOFF_READY / EXTERNAL_PENDING`.

## Truth boundary

Attestcoin USC verifies source-transaction inclusion. A number supplied directly in calldata would therefore prove only that someone submitted that number. `AEOSBalanceObserver` instead executes the ERC-20 `balanceOf(account)` read inside the included Sepolia transaction and emits the returned integer. AEOS then requires exact calldata, canonical receipt/finality, token runtime identity, event fields and storage readback before the observation may become Evidence.

This establishes: “the identified token contract returned this base-unit balance for this account during the included source transaction at this block.” It does not establish token price, liquidity, redemption, real-world value or investment performance.

## Fixed safety properties

- Sepolia only (`11155111`).
- Configured human reporter only.
- Zero native value; no payable surface.
- Only token `STATICCALL`; no asset-moving `CALL`, `DELEGATECALL`, deployment or self-destruct.
- Token address and runtime code hash frozen before wallet confirmation.
- Observation ID is tenant/Treasury domain-separated and cannot be replayed.
- AEOS never receives a private key, signs or broadcasts.
- `assetExecutionAuthorized=false` throughout.

## Local preparation

```powershell
npm run test:contracts
$env:AEOS_BALANCE_OBSERVER_REPORTER_ADDRESS = "0x444D510728FB8072351cB5d0E88432e6a8501DFA"
npm run prepare:balance-observer
npm run security:balance-observer
```

The deployment command prints a zero-value, unsigned and unsubmitted plan. It does not open a wallet or send a transaction.

## Two-step wallet handoff

```powershell
npm run prepare:balance-observer-wallet-plan
npm run test:balance-observer-wallet-handoff
npm run start:balance-observer-wallet-handoff
```

Open `http://127.0.0.1:4191/`. The current frozen plan is `0xf3d531...2b031`, uses reporter pending nonces `2..3`, and predicts observer `0xb8c8...6da8e`. Step 1 deploys the exact compiled init code. Step 2 remains locked until the Step 1 wallet receipt is recorded, then independently checks the deployed observer runtime and USDC runtime before simulating `observeBalance`. Each step requires a separate button click and MetaMask confirmation; no batch, automatic continuation, private key, AEOS signer or server broadcaster exists. Wallet-RPC receipts are operational handoff records only and do not count as independent canonical finality.

The compiler's deployed-bytecode artifact contains two reporter `immutableReferences`. Therefore `0x7a5a...be26` is only the unfilled runtime template hash; the reporter-bound expected Sepolia runtime hash is `0x159989...06bb`. The handoff derives the latter from the exact artifact, constructor reporter and immutable offsets, and also proves the frozen deployment init code equals the artifact plus ABI constructor arguments. Never bypass this distinction by accepting arbitrary code observed after deployment.

## External acceptance sequence

1. Review the compiled surface and deployment plan hashes.
2. Human wallet deploys the exact zero-value observer request on Sepolia.
3. Independently verify canonical deployment receipt, runtime hash and immutable reporter.
4. Read the configured USDC runtime bytecode and freeze its hash with token/account and tenant/Treasury identity.
5. Human wallet confirms the exact zero-value `observeBalance` call.
6. Independently verify receipt, `BalanceObserved`, source block timestamp, stored balance and commitment.
7. Build and statically verify the Attestcoin USC proof for that observation transaction.
8. Human wallet confirms the exact zero-value Creditcoin `verifyAndEmit` request.
9. Independently verify canonical `TransactionVerified` finality.
10. Import immutable organization-scoped `asset.balance` Evidence with an explicit freshness window.
11. Freeze a new child Snapshot/Decision; never mutate the prior inflow Decision.

Any mismatch, stale observation, unsupported proof, missing event, changed runtime, wrong tenant or failed finality leaves the request rejected and produces no verified Evidence.
