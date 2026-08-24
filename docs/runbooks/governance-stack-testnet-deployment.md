# Governance stack Creditcoin Testnet handoff

## Scope and authority

This runbook prepares five contract creations and three Timelock role-finalization calls. It does not deploy automatically. AEOS receives no private key, cannot sign, cannot broadcast without an explicit browser-wallet request, cannot batch the eight calls and has no treasury asset authority. Safe is outside this deployment batch and must be deployed and verified independently.

The sequence is:

1. `AEOSGovernanceToken`
2. `TimelockController`
3. `AEOSGovernor`
4. `PolicyRegistry`
5. `TreasuryGuard`
6. grant Timelock `PROPOSER_ROLE` to Governor
7. grant Timelock `CANCELLER_ROLE` to Governor
8. deployer renounces Timelock bootstrap `DEFAULT_ADMIN_ROLE`

The Timelock retains self-administration and open execution only after its enforced delay. Governor + Timelock are the final authorization boundary for this batch.

## Generate a fresh local plan

Build contracts/API first. Read the wallet's **pending** nonce from Creditcoin Testnet immediately before plan generation. Set these environment variables only in the current shell:

```powershell
$env:GOVERNANCE_STACK_DEPLOYER='TARGET_PUBLIC_WALLET'
$env:GOVERNANCE_STACK_GUARDIAN='GUARDIAN_PUBLIC_WALLET'
$env:GOVERNANCE_STACK_PENDING_NONCE='CURRENT_PENDING_NONCE'
$env:GOVERNANCE_STACK_PLAN_OUTPUT_PATH='C:\Users\P15v\CodeBuddy\AEOS\reports\deployment\governance-stack-deployment-plan.json'
$env:GOVERNANCE_STACK_PLAN_SUMMARY_ONLY='1'
npm run prepare:governance-stack
```

The output plan and per-step submission/receipt directory are Git-ignored. Generation fails rather than overwrite a different existing plan. Move the old local plan aside only after preserving any relevant public transaction hashes, then regenerate from a newly observed pending nonce.

## Start and review the page

```powershell
$env:AEOS_GOVERNANCE_WALLET_PORT='4184'
npm run start:governance-stack-wallet-handoff
```

Open `http://127.0.0.1:4184/`. The default port is 4183 when the override is absent. Review the full plan hash, predicted addresses, exact order and the `UNSIGNED / UNBROADCAST / ZERO ASSET AUTHORITY` boundary.

For each step:

1. Click **Validate current step**.
2. Confirm PASS for wallet, chain `102031`, exact pending nonce, calldata hash and frozen request hash.
3. Read the target/contract and nonce in the ledger.
4. Click **Request this MetaMask transaction** and independently review MetaMask's zero native value and target.
5. Confirm manually in MetaMask only if the displayed transaction is expected.
6. Wait for the wallet-RPC receipt. The next step remains locked until a successful receipt is recorded.
7. If the page reloads after submission, click **Resume receipt check**. This reads the already-recorded public transaction hash and does not resubmit.

Stop immediately if the account, chain, nonce, calldata, request hash, predicted address or receipt differs. Do not continue after a reverted or replaced transaction; regenerate the entire plan because later CREATE addresses depend on the exact nonce sequence.

## Post-deployment acceptance

Eight wallet-RPC receipts are necessary but not sufficient. A separate read-only verifier must confirm canonical blocks/finality, exact sender/nonce/value/calldata, deployed runtime hashes, constructor getters, Governor/Timelock relationships, final roles, initial paused Guard state and PolicyRegistry governance. That deployment verification and a bounded live Decision-bound Proposal → vote/quorum → queue → Timelock → Guard withholding sample now pass; only this P0-1 slice is accepted. Policy activation/action authorization, Safe, asset execution and production acceptance remain partial.

For the accepted deployment instance, run the immutable-output verifier once:

```powershell
npm run verify:governance-stack-finality -- https://rpc.cc3-testnet.creditcoin.network
```

The verifier accepts only an HTTPS RPC URL, performs read-only calls, consumes the frozen plan plus sequence-eight submission/receipt records, and creates `reports/deployment/governance-stack-finality-verification.json` with exclusive-create semantics. It checks the final `RoleRevoked` event and all final roles/wiring; it has no private-key, signing or broadcast input. The current deployment passed every check. That result accepts deployment/role configuration only; the live governance lifecycle remains pending.
