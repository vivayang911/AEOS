# PolicyRegistry testnet deployment runbook

Deploy only to Creditcoin testnet chain ID `102031`. `governance` must be the reviewed DAO Safe or Timelock; AEOS never receives its key or signatures. Deploy PolicyRegistry before TreasuryGuard because the Guard freezes its address.

## Prepare an unsigned deployment

```powershell
$env:POLICY_REGISTRY_DEPLOY_CHAIN_ID='102031'
$env:POLICY_REGISTRY_GOVERNANCE_ADDRESS='DAO_SAFE_OR_TIMELOCK_ADDRESS'
npm run prepare:policy-registry
```

Archive `planHash`, `initCodeHash`, `runtimeBytecodeHash`, governance and exact transaction data. Require `to=null`, `value="0"`, `signed=false`, `submitted=false`, `containsPrivateKey=false`, `aeosSigningCapability=false`, `aeosBroadcastCapability=false` and `assetExecutionAuthorized=false`. Submit only through the user-controlled wallet/Safe.

## Verify deployment read-only

```powershell
$env:POLICY_REGISTRY_DEPLOY_RPC_URL='CREDITCOIN_TESTNET_RPC_URL'
$env:POLICY_REGISTRY_DEPLOYED_ADDRESS='DEPLOYED_POLICY_REGISTRY_ADDRESS'
$env:POLICY_REGISTRY_DEPLOYMENT_TX_HASH='DEPLOYMENT_TRANSACTION_HASH'
$env:POLICY_REGISTRY_MIN_CONFIRMATIONS='2'
npm run verify:policy-registry-deployment
```

The verifier reconstructs the artifact-bound plan and checks exact init code, contract creation, zero value, successful receipt, deployed address, confirmations, runtime bytecode hash, immutable governance and clean `latestVersion=0`. The zero-version assertion applies to deployment readback; later governed activations advance it. Use the verified address as `POLICY_REGISTRY_ADDRESS` in the [TreasuryGuard runbook](treasury-guard-testnet-deployment.md). A mismatch must remain unused and be superseded.
