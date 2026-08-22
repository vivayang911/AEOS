# TreasuryGuard testnet deployment runbook

## Authority design

- `governance` must be a DAO-controlled Safe or Timelock contract, not the AEOS backend and not a long-term personal EOA.
- `guardian` must be a separate incident-response address. It may pause but cannot resume, change policy, authorize an action, upgrade, or move assets.
- `policyRegistry` must be the independently deployed immutable DAO-controlled PolicyRegistry, distinct from governance, Guardian and TreasuryGuard.
- Never place a private key, mnemonic, Safe signature, or wallet session in AEOS environment variables. The preparation and verification tools have no signer or broadcast method.

## 1. Build and test

```powershell
npm run typecheck
npm test
npm run build
npm run test:contracts
```

## 2. Prepare an unsigned deployment plan

```powershell
$env:TREASURY_GUARD_DEPLOY_CHAIN_ID='102031'
$env:TREASURY_GUARD_GOVERNANCE_ADDRESS='SAFE_OR_TIMELOCK_ADDRESS'
$env:TREASURY_GUARD_GUARDIAN_ADDRESS='SEPARATE_GUARDIAN_ADDRESS'
$env:POLICY_REGISTRY_ADDRESS='DEPLOYED_POLICY_REGISTRY_ADDRESS'
npm run prepare:treasury-guard
```

Review and archive `planHash`, `creationBytecodeHash`, `initCodeHash`, constructor roles, chain ID, and the exact unsigned transaction data. The output must state:

- `to: null`, `value: "0"`
- `requiresUserWalletConfirmation: true`
- `signed: false`, `submitted: false`
- `containsPrivateKey: false`
- `assetExecutionAuthorized: false`

The command only prepares contract-creation calldata. It cannot deploy. Submit the reviewed deployment through the selected user-controlled Safe/wallet workflow and record its transaction hash separately.

## 2a. Prepare an externally signable immutable manifest

After reviewing the same chain and role inputs, generate the canonical manifest and signing request:

```powershell
npm run prepare:treasury-guard-manifest
```

Archive the returned `manifest` and send only `signingRequest.payloadBase64` plus its `manifestHash` to the approved user-controlled Ed25519 signing workflow or KMS. AEOS has no `sign` operation and must never receive the private key. The manifest binds the plan hash, chain, artifact bytecode hash, constructor roles, init-code/data hashes, and the zero-authority flags.

The external signer should return:

- an Ed25519 signature encoded as base64;
- the public Ed25519 key encoded as base64 DER/SPKI;
- a stable, non-secret signer/key identifier.

Verify the returned signature read-only:

```powershell
$env:TREASURY_GUARD_MANIFEST_PATH='REVIEWED_MANIFEST_JSON_PATH'
$env:TREASURY_GUARD_MANIFEST_SIGNER_ID='APPROVED_KEY_ID'
$env:TREASURY_GUARD_MANIFEST_PUBLIC_KEY_SPKI_BASE64='PUBLIC_KEY_ONLY'
$env:TREASURY_GUARD_MANIFEST_SIGNATURE_BASE64='EXTERNAL_SIGNATURE'
npm run verify:treasury-guard-manifest
```

Acceptance requires `status=VERIFIED`, `externalSignatureVerified=true`, and the reviewed manifest hash. `aeosSigned`, `submitted`, and `assetExecutionAuthorized` must remain false. A manifest change invalidates the signature and requires a new review/signing ceremony. Signature verification authenticates the reviewed deployment intent; it does not deploy the contract or authorize assets.

## 3. Verify deployment read-only

```powershell
$env:TREASURY_GUARD_DEPLOY_RPC_URL='NETWORK_RPC_URL'
$env:TREASURY_GUARD_DEPLOYED_ADDRESS='DEPLOYED_GUARD_ADDRESS'
$env:TREASURY_GUARD_DEPLOYMENT_TX_HASH='DEPLOYMENT_TRANSACTION_HASH'
$env:TREASURY_GUARD_MIN_CONFIRMATIONS='2'
npm run verify:treasury-guard
```

Acceptance requires exact artifact-bound init/runtime code, a successful contract-creation receipt at the supplied address, confirmation depth, configured chain, exact governance, Guardian and PolicyRegistry addresses, separated roles, and `paused=true`. An address without its deployment transaction hash is insufficient evidence.

## 4. Configure policy while paused

Policy activation/configuration must be an explicit DAO Safe/Timelock atomic batch while the Guard is paused:

Generate the ordered unsigned calls with `npm run prepare:policy-activation-batch`. Required inputs are `TREASURY_POLICY_CHAIN_ID`, governance/Registry/Guard addresses, current Registry and Guard versions, exact next policy hash/version/window/value, and comma-separated target/selector allowlists. The generator rejects version drift, invalid windows, an unpaused Guard, duplicate/control-contract targets and duplicate/zero selectors. It deliberately excludes `setPaused(false)`.

1. `PolicyRegistry.activatePolicy(policyHash, nextVersion, validFrom, validUntil)`.
2. `TreasuryGuard.configurePolicy(policyHash, nextVersion, validFrom, validUntil, maxNativeValue)` with the exact same hash/version/window.
3. Configure the policy-bound target and selector allowlists.

AEOS must not sign or broadcast this batch. Before unpause, verify the Guard and Registry from the same confirmed block:

```powershell
$env:TREASURY_GUARD_CHAIN_ID='102031'
$env:TREASURY_GUARD_ADDRESS='DEPLOYED_GUARD_ADDRESS'
$env:POLICY_REGISTRY_ADDRESS='DEPLOYED_POLICY_REGISTRY_ADDRESS'
$env:TREASURY_GUARD_RPC_URL='NETWORK_RPC_URL'
npm run verify:treasury-policy-binding
```

The basic binding command proves the paused Guard and Registry hash/version/window match. For the stronger stage-two handoff, repeat the exact stage-one inputs and run the complete confirmed-block readback:

```powershell
$env:POLICY_REGISTRY_PREVIOUS_VERSION='VERSION_BEFORE_STAGE_ONE'
$env:TREASURY_GUARD_PREVIOUS_POLICY_VERSION='VERSION_BEFORE_STAGE_ONE'
$env:TREASURY_POLICY_CHAIN_ID='102031'
$env:TREASURY_POLICY_GOVERNANCE_ADDRESS='SAFE_OR_TIMELOCK_ADDRESS'
$env:POLICY_REGISTRY_ADDRESS='DEPLOYED_POLICY_REGISTRY_ADDRESS'
$env:TREASURY_GUARD_ADDRESS='DEPLOYED_GUARD_ADDRESS'
$env:TREASURY_POLICY_HASH='FROZEN_POLICY_HASH'
$env:TREASURY_POLICY_VERSION='NEW_VERSION'
$env:TREASURY_POLICY_VALID_FROM='UTC_UNIX_SECONDS'
$env:TREASURY_POLICY_VALID_UNTIL='UTC_UNIX_SECONDS'
$env:TREASURY_POLICY_MAX_NATIVE_VALUE='INTEGER_WEI'
$env:TREASURY_POLICY_ALLOWED_TARGETS='COMMA_SEPARATED_ADDRESSES'
$env:TREASURY_POLICY_ALLOWED_SELECTORS='COMMA_SEPARATED_BYTES4'
$env:TREASURY_GUARD_RPC_URL='NETWORK_RPC_URL'
npm run verify:policy-activation-readback
```

This rebuilds and binds the exact stage-one `activationBatchHash`, then checks chain/finality, both contract addresses, pause state, Registry latest version, hash/version/window, active time, max native value, and every expected target/selector at one confirmed block. Because the Guard exposes membership getters rather than enumerable sets, `allowlistReadbackScope=EXPECTED_BATCH_ENTRIES` honestly proves the frozen batch entries are enabled; the immutable batch calldata is the evidence that no extra calls were intended.

Only `status=VERIFIED` returns a separate `unpauseHandoff` for DAO review. Any mismatch returns `unpauseHandoff=null`. The handoff is zero-value, unsigned and unsubmitted; AEOS still cannot sign or broadcast it. Keeping unpause outside the configuration batch leaves any invalid configuration safely paused.

## 5. Configure AEOS read boundaries

Set `TREASURY_GUARD_ADAPTER=evm-readonly` and the verified chain/RPC/address. Configure Safe observation independently. Restart AEOS and inspect both adapter configuration endpoints before creating a Preflight.

## Rollback and incident handling

- An incorrect deployment is never repaired in place: keep it paused, deploy a corrected immutable contract, and document supersession.
- A role mismatch, unpaused initial state, empty bytecode, wrong chain, or plan-hash mismatch is a failed deployment.
- A manifest-hash mismatch, unapproved signer fingerprint, invalid signature, or non-Ed25519 public key is a failed release artifact.
- Suspected key compromise requires Guardian pause and Safe-owner incident response. AEOS cannot rotate keys or resume execution.
