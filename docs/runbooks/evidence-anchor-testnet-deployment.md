# EvidenceAnchorASC Creditcoin testnet deployment

## Fixed trust roots

- Target chain: Creditcoin testnet, chain ID `102031`.
- Native Query Verifier: `0x0000000000000000000000000000000000000FD2` from the installed `@gluwa/usc-sdk`.
- Allowed source chain key: `1` for the current Ethereum Sepolia proof path.
- These values are deterministic guardrails. The preparation tool rejects substitutes rather than accepting arbitrary constructor configuration.

AEOS does not deploy, sign or broadcast. The output is an unsigned zero-value contract-creation transaction for explicit user-wallet review.

## 1. Build and verify locally

```powershell
$env:FORGE_BIN='PATH_TO_STABLE_FORGE'
npm run typecheck
npm test
Push-Location contracts
& $env:FORGE_BIN build
& $env:FORGE_BIN test -vv
Pop-Location
npm run security:evidence-anchor
```

## 2. Prepare the exact unsigned deployment

```powershell
npm run prepare:evidence-anchor
```

Archive and independently review `planHash`, both artifact bytecode hashes, `initCodeHash`, constructor values and exact transaction data. Acceptance requires `to=null`, `value="0"`, `signed=false`, `submitted=false`, `containsPrivateKey=false`, `aeosSigningCapability=false`, `aeosBroadcastCapability=false` and `assetExecutionAuthorized=false`.

Optional environment overrides exist only to make mismatches fail visibly. Values other than chain `102031`, verifier `0x...0FD2` and source key `1` are rejected.

## 3. User-controlled wallet deployment

Switch the wallet to Creditcoin testnet and submit the exact reviewed contract-creation data with zero value. Do not paste a private key or mnemonic into AEOS. Record the wallet-returned deployment transaction hash and contract address. A different calldata, constructor, chain, value or sender is a different deployment and requires a new review.

## 4. Verify the deployed contract read-only

```powershell
$env:EVIDENCE_ANCHOR_DEPLOY_RPC_URL='CREDITCOIN_TESTNET_RPC'
$env:EVIDENCE_ANCHOR_DEPLOYED_ADDRESS='DEPLOYED_ASC_ADDRESS'
$env:EVIDENCE_ANCHOR_DEPLOYMENT_TX_HASH='DEPLOYMENT_TX_HASH'
$env:EVIDENCE_ANCHOR_MIN_CONFIRMATIONS='2'
npm run verify:evidence-anchor-deployment
```

The verifier rebuilds the frozen plan from the local compiled artifact, reads the deployment transaction and receipt from RPC, and checks the exact init-code hash, `to=null`, zero value, target chain, non-empty deployed code, immutable verifier/key getters, successful contract-creation receipt, returned contract address and confirmation depth. It has no signer or send method. A deployment produced from different bytecode or constructor data is rejected even if its getters look correct.

## 5. Enable AEOS read-only handoff confirmation

Only after readback reports `VERIFIED`:

```powershell
$env:EVIDENCE_ANCHOR_ASC_ADDRESS='DEPLOYED_ASC_ADDRESS'
$env:EVIDENCE_ANCHOR_RECEIPT_ADAPTER='rpc-readonly'
$env:CREDITCOIN_RPC_URL='CREDITCOIN_TESTNET_RPC'
```

Prepare a handoff, submit it in the user wallet, then give AEOS only the returned transaction hash for read-only confirmation.

## Failure and replacement

- Wrong init code, non-zero value, non-creation transaction, wrong verifier, source key, chain, receipt, address or finality is rejected.
- Do not repair or relabel an incorrect immutable deployment. Record it as invalid and deploy a reviewed replacement.
- A reorg never mutates the prior confirmation; append a failed reconciliation attempt and repeat read-only verification after finality.
