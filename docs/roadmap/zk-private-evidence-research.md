# ZK private Evidence and governance research roadmap

Status: `POST-HACKATHON RESEARCH / NOT IMPLEMENTED / NOT PART OF CURRENT MVP ACCEPTANCE`.

## 1. Product hypothesis

AEOS currently makes verified facts, cited advice and DAO authorization auditable. A future zero-knowledge layer may let an organization prove a narrowly defined policy predicate without disclosing the private witness that satisfies it.

Example future statement:

> A position committed by an approved data issuer is within the DAO-approved exposure limit at a specified observation time.

The public result would reveal the policy, circuit/version, commitment, expiry and Boolean outcome, but not the underlying private position. This is a research hypothesis, not a current AEOS capability.

## 2. Relationship to Attestcoin

Attestcoin and ZK solve different problems and must not be conflated:

- Attestcoin verifies inclusion of a supported source-chain transaction through Merkle and continuity proofs.
- A ZK proof verifies that a specific circuit accepted a private witness for declared public inputs.
- A ZK proof does not make an untrusted input economically true. The private witness still needs an approved origin or a commitment bound to Attestcoin-verified source data.
- The proposed ZK layer supplements immutable Evidence; it does not replace Attestcoin, receipt/log validation, freshness checks or DAO authorization.

A future lineage would be:

```text
approved source or Attestcoin-verified commitment
  → versioned ZK predicate proof
  → deterministic verifier
  → organization-scoped immutable Evidence
  → frozen Snapshot/RAG citations
  → eight-Agent advisory Decision
  → human/DAO governance
```

## 3. Proposed data boundary

A future ZK Evidence record should freeze at least:

- `organization_id` and an organization-domain commitment;
- predicate/policy ID and policy version;
- circuit ID, circuit version and verification-key hash;
- proof-system identifier and trusted-setup identifier when applicable;
- public-input hash and source/issuer commitment;
- observation time, expiry and freshness result;
- nullifier or replay-prevention identifier where the statement is single-use;
- deterministic verification result and verifier implementation hash;
- source Evidence IDs and Attestcoin lineage when the statement depends on source-chain data.

Raw witnesses, identity documents, private positions and proving secrets must not enter Agent prompts, public logs or cross-tenant storage.

## 4. Governance boundary

- Only DAO governance may approve a predicate, circuit version, verification key, issuer/trust root and upgrade.
- Circuit/key changes create new immutable versions; historical Evidence and Decisions are never rewritten.
- Agents may cite a verified predicate result but cannot generate authority from it.
- Proof verification never signs, broadcasts, votes or moves assets.
- A valid proof remains subject to freshness, policy, quorum, Timelock, Guard and human-review requirements.
- `assetExecutionAuthorized=false` remains the default until an independent DAO action authorizes an exact transaction.

## 5. Phased research plan

### ZK-R0 — threat model and statement design

- Select one narrow institutional predicate and define its public/private inputs.
- Identify who vouches for the witness and how its commitment binds to an approved source.
- Model replay, front-running, correlation, selective-disclosure, proving-key, verifier-upgrade and cross-tenant threats.
- Benchmark proof size, proving time, verification cost and operational complexity before selecting a proof system.

Exit criterion: a reviewed circuit specification and trust model exists. No product claim is made.

### ZK-R1 — private Evidence predicate prototype

- Implement one circuit such as committed exposure `<=` a DAO-approved limit.
- Use a deterministic Mock issuer first, clearly labeled `MOCK_ZK_WITNESS`, then replace it only with an approved real commitment source.
- Verify locally and on a testnet verifier contract.
- Import only the verification result and frozen lineage as immutable, organization-scoped Evidence.
- Add negative, malformed, expired, replay and cross-tenant tests.

Exit criterion: one testnet predicate can be independently reproduced and fails closed without revealing the witness. It still grants no asset authority.

### ZK-R2 — governed verifier and circuit registry

- Register approved predicate/circuit/key versions through Governor and Timelock.
- Require exact policy, verifier and source-commitment binding before Evidence import.
- Add circuit retirement, emergency pause and append-only Audit/Outcome feedback.
- Conduct circuit and verifier security review before any production use.

Exit criterion: no administrator or Agent can silently replace a circuit or verification key.

### ZK-R3 — optional confidential governance research

- Evaluate private ballots only after eligibility, delegation, nullifier, coercion resistance, recount/audit and dispute requirements are specified.
- Keep the current transparent Governor path as the accepted baseline until the confidential system has independent security review.
- Do not claim that ballot privacy alone increases participation or governance quality without user evidence.

Exit criterion: a separate testnet experiment with explicit trust and recovery assumptions; not a transparent-Governor replacement by default.

### ZK-R4 — ZKML feasibility research only

- Evaluate whether a small deterministic model or bounded computation can be represented economically as a circuit.
- Distinguish “the circuit executed correctly” from “the model was accurate, unbiased or economically correct.”
- Keep Evidence citation, deterministic calculators, Risk/Compliance challenges and DAO control even if inference execution becomes provable.

Exit criterion: measured feasibility and threat analysis. No full-LLM proof promise is made without an implemented benchmark.

## 6. Non-goals and prohibited claims

- No current AEOS screen, API, contract or Agent is ZK-enabled.
- ZK does not prove arbitrary off-chain facts, investment returns, liquidity or market correctness.
- ZK does not remove issuer, circuit, setup, verifier, data-availability or governance trust assumptions.
- A proof of computation does not prove that an AI recommendation is good.
- No foundation grant, ecosystem partnership, standard adoption or funding amount is claimed without a current primary-source verification and written acceptance.

## 7. Priority decision

This research starts only after the current submission package, hosted materials, external user discovery and accepted MVP gaps are safely closed. It must not delay the Attestcoin-centered competition story or be counted toward the current `18/18 PARTIAL` PRD acceptance.
