# Live Attestcoin / USC and DAO finality runbook

Status: `LIVE SOURCE DISCOVERY VERIFIED / TRANSACTION AND DAO FINALITY EXTERNAL_PENDING` (2026-08-21).

## Facts verified from primary sources and read-only chain observation

- Creditcoin Testnet uses EVM chain ID `102031`, RPC `https://rpc.cc3-testnet.creditcoin.network/`, symbol `CTC` and Blockscout `https://creditcoin-testnet.blockscout.com/`.
- The official USC SDK documents `https://prover.cc3-testnet.creditcoin.network/` as the testnet Proof Builder and exposes the ChainInfo precompile at `0x0000000000000000000000000000000000000fd3` plus BlockProver at `0x0000000000000000000000000000000000000fd2`.
- A read-only ChainInfo call on 2026-08-21 observed two supported sources: Ethereum Mainnet (`chainId=1`, `chainKey=3`) and Ethereum Sepolia (`chainId=11155111`, `chainKey=1`). This is an observation, not a permanent allowlist; AEOS re-reads ChainInfo instead of trusting this document.
- Both published Proof Builder hostnames answered and redirected to `/api/swagger`. AEOS now defaults to the hostname used by the current official SDK documentation.

Primary references:

- https://docs.creditcoin.org/environments/testnet
- https://docs.creditcoin.org/smart-contract-guides/creditcoin-endpoints
- https://docs.creditcoin.org/usc
- https://docs.creditcoin.org/usc/creditcoin-oracle-subsystems/attestation
- https://github.com/gluwa/cc-next-query-builder

## Live USC configuration

Configure secrets only in the local environment or deployment secret manager. Do not commit a provider key.

```dotenv
ATTESTCOIN_ADAPTER=usc
SEPOLIA_RPC_URL=<your authenticated or independently approved Sepolia RPC>
CREDITCOIN_RPC_URL=https://rpc.cc3-testnet.creditcoin.network/
ATTESTCOIN_PROOF_BUILDER_URL=https://prover.cc3-testnet.creditcoin.network/
```

`GET /api/v1/attestcoin/source-chains` is authenticated and organization scoped. In USC mode it performs a bounded, circuit-breaker-protected ChainInfo read, records the provider observation and returns the selected source plus latest attested height/hash. In Mock mode it returns `observedOnChain=false`, an empty live list and `sourceSupported=false`; it never copies the measured values above into a fake response.

Before accepting a source transaction, the adapter now requires the configured Sepolia identity to be present in current ChainInfo readback. Before building a proof, the latest attested height must cover the transaction block. These checks are read-only and create no signing or broadcast capability.

## Real DAO finality sample

AEOS already has an `oz-readonly` Governor adapter, but a real sample cannot be configured from a wallet address alone. It requires:

1. a deployed OpenZeppelin-compatible Governor contract;
2. a real proposal created on that Governor;
3. the exact numeric `proposalId` bound into the same-organization AEOS Proposal;
4. a read-only RPC for that Governor's chain;
5. enough canonical confirmations for the configured lag;
6. a terminal on-chain state such as `SUCCEEDED` or `EXECUTED` when that state is required by the consuming workflow.

Configuration after those public values exist:

```dotenv
GOVERNANCE_ADAPTER=oz-readonly
GOVERNANCE_RPC_URL=<read-only RPC for the Governor chain>
GOVERNANCE_CHAIN_ID=<Governor chain ID>
GOVERNOR_ADDRESS=<deployed Governor contract address>
GOVERNANCE_CONFIRMATION_LAG=2
GOVERNANCE_MIN_CONFIRMATIONS=2
```

Then create/bind the AEOS Proposal with `content.governor.proposalId`, and an authorized human operator calls `POST /api/v1/proposals/{id}/sync-governor` with CSRF and idempotency headers. AEOS reads `state`, `proposalSnapshot`, `proposalDeadline`, `quorum`, `proposalVotes`, `clock` and `CLOCK_MODE` at one confirmed block and stores an immutable organization-scoped observation.

No live AEOS Governor address or proposal ID currently exists in the workspace. An unrelated project's proposal, a Mock observation or a manually typed terminal state must not be used as the positive sample. Contract deployment/proposal creation/voting remains a human-wallet action; AEOS only prepares or observes and cannot sign, vote, queue, execute or move assets.
