# Sepolia AEOS Treasury Evidence Source runbook

Status: `LOCAL_VERIFIED / WALLET DEPLOYMENT EXTERNAL_PENDING`.

This runbook creates the project-owned source transaction that Attestcoin/USC will prove. It does not give AEOS a private key, signer, broadcaster or asset-execution authority.

## Contract boundary

`AEOSTreasuryEvidenceSource` is non-upgradeable, nonpayable and has no external-call opcode. Only the immutable `reporter` may call `commitObservation`. The call stores one commitment per observation ID and emits hash-only organization, Treasury and Evidence lineage. It cannot custody or move assets.

The commitment domain includes the source chain ID, source contract, observation ID, organization commitment, Treasury commitment, Evidence payload hash, observation time and reporter. Replays, zero fields, future observations and unauthorized reporters fail closed.

## Prepare deployment

Build the artifact and create the exact unsigned Sepolia deployment transaction:

```powershell
cd <AEOS_REPOSITORY_PATH>
cd contracts
forge build
cd ..
$env:AEOS_EVIDENCE_SOURCE_REPORTER_ADDRESS='0x444D510728FB8072351cB5d0E88432e6a8501DFA'
npm run prepare:aeos-evidence-source
```

For the guarded MetaMask handoff, prepare fresh read-only nonce, balance and gas observations, then start the same zero-authority local handoff server used by the Creditcoin deployment:

```powershell
$env:AEOS_EVIDENCE_SOURCE_REPORTER_ADDRESS='0x444D510728FB8072351cB5d0E88432e6a8501DFA'
$env:AEOS_WALLET_HANDOFF_PATH='<AEOS_REPOSITORY_PATH>\reports\deployment\aeos-evidence-source-wallet-handoff.json'
$env:AEOS_WALLET_SUBMISSION_PATH='<AEOS_REPOSITORY_PATH>\reports\deployment\aeos-evidence-source-wallet-submission.json'
npm run prepare:aeos-evidence-source-wallet-handoff
npm run start:evidence-anchor-wallet-handoff
```

The page derives the target chain from the frozen handoff and repeats the wallet, chain, pending nonce and init-code hash checks immediately before enabling the MetaMask request.

Expected chain ID is `11155111`, transaction value is `0`, and `to` is `null`. The current plan hash is `0x6b677bc038e87fff819b49126a9c6a6f2b0dc9dc606dccf43ba8009501ec13c6`; regenerate and re-review it after any source change.

The user wallet must hold enough Sepolia ETH for deployment gas. Do not proceed when the read-only balance probe reports insufficient gas funds.

## Verify a wallet deployment

After the user signs and submits the contract creation, configure only public transaction identifiers and a read-only RPC:

```powershell
$env:AEOS_EVIDENCE_SOURCE_REPORTER_ADDRESS='0x444D510728FB8072351cB5d0E88432e6a8501DFA'
$env:AEOS_EVIDENCE_SOURCE_DEPLOYED_ADDRESS='<DEPLOYED_CONTRACT>'
$env:AEOS_EVIDENCE_SOURCE_DEPLOYMENT_TX_HASH='<DEPLOYMENT_TX_HASH>'
$env:AEOS_EVIDENCE_SOURCE_DEPLOY_RPC_URL='<READ_ONLY_SEPOLIA_RPC>'
npm run verify:aeos-evidence-source-deployment
```

The verifier checks chain, code presence, immutable reporter, exact init-code hash, zero value, contract-creation receipt and minimum confirmation depth. Failure produces no completion claim.

## Prepare the source observation transaction

Use an immutable Evidence Snapshot/content hash and server-owned tenant/Treasury identity. The command hashes organization and Treasury IDs before placing them on chain:

```powershell
$env:AEOS_EVIDENCE_SOURCE_ADDRESS='<DEPLOYED_CONTRACT>'
$env:AEOS_EVIDENCE_SOURCE_REPORTER_ADDRESS='0x444D510728FB8072351cB5d0E88432e6a8501DFA'
$env:AEOS_OBSERVATION_ORGANIZATION_ID='<SERVER_SELECTED_ORGANIZATION_ID>'
$env:AEOS_OBSERVATION_TREASURY_ID='<CURRENT_TREASURY_REGISTRY_ID>'
$env:AEOS_OBSERVATION_KEY='<IMMUTABLE_EVIDENCE_SNAPSHOT_ID>'
$env:AEOS_OBSERVATION_PAYLOAD_HASH='<0x_32_BYTE_EVIDENCE_HASH>'
$env:AEOS_OBSERVATION_OBSERVED_AT='<UNIX_SECONDS>'
npm run prepare:treasury-observation-commit
```

The output is an unsigned, zero-value `commitObservation` request. The user wallet alone may sign it. After finality, its transaction hash becomes the input to the existing USC proof job; the later Creditcoin `verifyAndAnchor` step remains a separate user-confirmed transaction.

## Required acceptance sequence

1. Wallet deploys this source on Sepolia; readback returns `VERIFIED`.
2. Wallet submits the exact prepared observation call; receipt/event/calldata are validated.
3. ChainInfo covers the source block and Proof Builder returns a proof.
4. The native Creditcoin verifier accepts it through deployed `EvidenceAnchorASC`.
5. The user confirms `verifyAndAnchor`; AEOS verifies finality and `EvidenceAnchored`.
6. Only then may immutable Evidence, RAG retrieval and a cited eight-Agent Decision claim a live Attestcoin round trip.
