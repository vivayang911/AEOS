# AEOS Minimal Content RAG Corpus — Human Review Draft

Status: `DRAFT / NOT INGESTED / NOT APPROVED`

This document proposes the smallest useful organization-scoped corpus for an eight-Agent demonstration. It is review material only. Human approval of a Knowledge Source permits retrieval; it does not activate an on-chain policy, approve a Decision, create a Proposal, sign or broadcast a transaction, or authorize asset execution.

## Acceptance boundary

- Target requirements: PRD-06 sections 1–6, PRD-09 sections 1–6, PRD-10 sections 1–6, US-04, FR-04 and FR-05.
- Every source must be created as `DRAFT`, pass the malicious-content and secret scan, and be approved separately by an `ADMIN` or `REVIEWER` with a recorded rationale.
- `organization_id` is derived from the authenticated server session and is never accepted from this document.
- The corpus contains no private key, seed phrase, API token, personal data or asset-execution instruction.
- Verified Evidence remains higher authority than RAG. A Knowledge Source cannot repair missing, stale, conflicting or low-quality Evidence.
- The current corpus supports a conservative `HOLD`/withholding analysis. It does not establish market prices, liquidity, performance, economic benefit or causal AI impact.
- Current embedding is `deterministic-hash-embedding-v1-mock-only`. A real LLM may explain retrieved content but must use the same frozen citations and deterministic guardrails.

## Source manifest

| Source key | Partition | Intended Agent access through partition policy | Truth class | Proposed validity |
|---|---|---|---|---|
| `aeos-governance-operating-policy` | `GOVERNANCE` | Governor, Research, Strategy, Compliance, Treasury | Verified deployment configuration plus operating requirements | Review after any Governor/Timelock change |
| `aeos-treasury-authorization-boundary` | `GOVERNANCE` | Governor, Research, Strategy, Compliance, Treasury | Current authorization boundary | Review after Guard/Policy/Safe change |
| `aeos-risk-review-rubric` | `PROTOCOL` | Governor, Research, Strategy, Quant, Risk, Compliance | Human-proposed analytical rubric; not on-chain enforcement | 30 days or earlier policy change |
| `aeos-contract-control-surface` | `PROTOCOL` | Governor, Research, Strategy, Quant, Risk, Compliance | Verified deployed control-surface description | Review after contract deployment/configuration change |
| `aeos-hold-outcome-memory` | `DECISION_MEMORY` | Governor, Strategy, Risk, Portfolio, Treasury | Verified historical Decision/governance Outcome | Append-only; supersede only through governed review |

The partition combination intentionally creates different role-level manifests. Quant can receive Protocol material but not Governance or Decision Memory; Portfolio can receive Decision Memory but not Governance or Protocol; Risk receives Protocol and Decision Memory; Compliance receives Governance and Protocol; Treasury receives Governance and Decision Memory. This is least-privilege partitioning, not eight private copies of the same text.

---

# Source 1 — DAO Governance Operating Policy

Source key: `aeos-governance-operating-policy`

Partition: `GOVERNANCE`

Proposed ACL roles: `ADMIN`, `TREASURY_COMMITTEE`, `REVIEWER`, `AUDITOR`, `GUARDIAN`

## Verified governance configuration

AEOS uses the deployed Creditcoin Testnet Governor and Timelock as the final authorization boundary for the current demonstration organization. The verified Governor voting period is 240 blocks. The successful Decision-bound proposal recorded 1,000,000 For votes against a quorum requirement of 40,000 votes. The Timelock minimum delay is 60 seconds. These values describe the verified deployment and must be re-read from chain before a new Proposal is treated as executable.

## Proposal requirements

A Proposal must bind the reviewed Decision ID, immutable Evidence Snapshot hash, unresolved dissent, human-readable intent, exact targets, values and calldatas. The displayed description must match the frozen payload. A Proposal may advance only after the Governor reports the canonical state required for that transition. Wallet submission is not finality; AEOS records finality only after a separate canonical receipt and event readback.

## Human and DAO control

Agent output is advisory. Human approval records acceptance of a Decision record only. It does not vote, queue, execute or grant asset authority. Proposal, vote, Queue and Execute transactions require the user-controlled wallet or configured DAO infrastructure. AI services receive no private key and have no signer or broadcaster capability.

## Fail-closed governance response

If quorum, voting state, Timelock readiness, exact calldata, policy binding, simulation freshness or canonical finality cannot be established, the committee must retain or return `HOLD` and request the missing Evidence. No narrative confidence score may override a failed deterministic governance check.

---

# Source 2 — Treasury Authorization Boundary

Source key: `aeos-treasury-authorization-boundary`

Partition: `GOVERNANCE`

Proposed ACL roles: `ADMIN`, `TREASURY_COMMITTEE`, `REVIEWER`, `OPERATOR`, `AUDITOR`, `GUARDIAN`

## Current live boundary

The verified TreasuryGuard is paused. Its governance authority is the Timelock. The verified PolicyRegistry latest version is zero and no active policy was observed for the accepted HOLD Outcome. Safe is outside the accepted deployment batch. Therefore no asset class, protocol, target, selector or non-zero amount is currently authorized by this Knowledge Source.

## Permitted preparation

AEOS may prepare a zero-value, unsigned and unsubmitted governance request; run read-only simulation; calculate an advisory PID value; and produce a human-review checklist. Preparation must keep `assetExecutionAuthorized=false`. A Knowledge Source approval cannot change this value.

## Prohibited interpretation

This document is not a transfer allowlist and is not a substitute for PolicyRegistry state. Absence of a prohibition is not permission. A future asset action requires a separately versioned policy, on-chain activation/readback, exact target and selector allowlists, bounded value, fresh simulation, Governor/Timelock or Safe authorization, and user-controlled submission.

## Required reverse Evidence requests

Before any non-zero proposal, the committee must request fresh Evidence for treasury balances, asset prices, executable liquidity, expected slippage, gas balance, target-contract identity, active policy version, Guard pause state and governance/Safe readiness. Missing or stale fields block action rather than being estimated by the model.

---

# Source 3 — Treasury Risk Review Rubric

Source key: `aeos-risk-review-rubric`

Partition: `PROTOCOL`

Proposed ACL roles: `ADMIN`, `TREASURY_COMMITTEE`, `REVIEWER`, `OPERATOR`, `AUDITOR`, `GUARDIAN`

## Status and authority

These thresholds are a proposed analytical rubric for the demonstration committee. They are not an active on-chain policy and cannot authorize execution. They may only tighten a recommendation or cause a refusal. Human review is required before this source may be retrieved.

## Evidence sufficiency threshold

Material balance, price, liquidity, volatility, peg and contract-risk claims require immutable Evidence references. Required Evidence quality is at least 85 out of 100 and required market-state freshness is at most 300 seconds at Decision freeze time. Transaction-inclusion proof alone does not establish price, liquidity or economic value. A missing required metric produces an Evidence Request and an `INSUFFICIENT_EVIDENCE` or `HOLD` position.

## Advisory market-risk thresholds

- A proposed order must not exceed 1 percent of verified 24-hour executable volume.
- Estimated slippage above 50 basis points blocks the candidate.
- A verified stablecoin deviation greater than 100 basis points from its reference value triggers a HIGH peg-risk challenge.
- Verified 24-hour volatility above 5 percent or verified peak-to-trough drawdown above 10 percent triggers a HIGH market-risk challenge.
- A route without verified exit liquidity, target-contract identity or failure-mode analysis is ineligible.

These numbers are review thresholds for Agent analysis only. Until represented by an active on-chain policy and exact deterministic checks, they cannot make a transaction executable.

## Independent challenge requirement

Risk must challenge position sizing, liquidity, drawdown and black-swan assumptions. Compliance must separately challenge policy status, allowlists, governance authority and restricted-asset assumptions. Strategy must answer both challenges with frozen citations. An unresolved material challenge blocks Portfolio and Treasury from producing an action draft.

## PID interaction

PID output is advisory and subordinate to these fail-closed checks. Missing or stale input makes the PID output zero. Output saturation, execution withholding or prolonged pause must prevent integral windup. An Agent cannot change PID gains or limits during a Decision run.

---

# Source 4 — Deployed Contract Control Surface

Source key: `aeos-contract-control-surface`

Partition: `PROTOCOL`

Proposed ACL roles: `ADMIN`, `TREASURY_COMMITTEE`, `REVIEWER`, `OPERATOR`, `AUDITOR`, `GUARDIAN`

## EvidenceAnchorASC

EvidenceAnchorASC verifies the supported USC proof path and anchors the exact Evidence, Snapshot and Decision commitments. It has no signer, broadcaster or payable asset-execution surface. An anchor proves the frozen commitment and canonical event, not the economic truth of every payload field.

## Governor and Timelock

The Governor controls Proposal lifecycle and voting. The Timelock enforces the verified delay and is the governance authority for PolicyRegistry and TreasuryGuard. Direct calls that do not satisfy the configured authority must fail closed.

## PolicyRegistry

PolicyRegistry stores sequential immutable policy versions and validity windows. Knowledge approval is not PolicyRegistry activation. Agents must use canonical readback rather than assume a policy exists.

## TreasuryGuard

TreasuryGuard begins paused and exposes deterministic authorization checks. Guardian authority can pause but cannot unpause or transfer assets. Authorization validation does not itself call the target. Target, selector, value, deadline and policy bindings must all match.

## Safe boundary

Safe has not been independently deployed and verified for the accepted batch. Any workflow that requires Safe threshold or execution Evidence must remain blocked until a canonical Safe configuration and transaction observation are available.

---

# Source 5 — Decision-bound HOLD Outcome Memory

Source key: `aeos-hold-outcome-memory`

Partition: `DECISION_MEMORY`

Proposed ACL roles: `ADMIN`, `TREASURY_COMMITTEE`, `REVIEWER`, `OPERATOR`, `AUDITOR`, `GUARDIAN`

## Frozen historical result

Decision `decision_a9a37c5bd3ff43c68f5b0af32a13b8ed` was bound to Evidence Snapshot `snap_5f3081a8dffc4e0b9f281e0095dc231f`. Earlier Proposal attempts that missed their voting window remain immutable failures. Attempt 3 reached quorum, was queued through the 60-second Timelock and executed the exact zero-value action `TreasuryGuard.setPaused(true)` in transaction `0xeecd79baabd81d23000ef36791384c1919615d8c4a609fc8215819c970c01160`.

## Verified Outcome

The canonical Outcome is `DETERMINISTIC_WITHHOLDING_EXECUTED`. The Timelock operation completed, TreasuryGuard remained paused, zero native value moved, and no PolicyRegistry mutation occurred. The result is linked to immutable organization-scoped Evidence and Outcome lineage.

## Allowed lesson

Operationally, a sufficiently long voting window and prompt human voting were necessary for this sample to reach execution. The prior zero-vote failures justify explicit deadline monitoring and fail-closed wallet handoff checks.

## Forbidden lesson

This single Outcome does not prove investment performance, avoided loss, economic benefit, market prediction accuracy or causal AI effectiveness. It must not automatically become a Skill, PID gain change or active policy. Any promotion requires a separate governed candidate, independent review and preserved source lineage.

---

## Proposed retrieval demonstration

Use an objective containing the real decision context without claiming unavailable market facts:

> Using the current verified treasury Evidence and approved governance knowledge, assess whether treasury assets should remain unchanged. Evaluate governance readiness, authorization, liquidity, volatility, peg risk and contract controls. Request any missing Evidence and submit only an advisory recommendation for DAO human review.

Expected role-level behavior:

| Agent | Expected content | Expected position |
|---|---|---|
| Governor | Governance, Protocol and Decision Memory | Coordinate, preserve unresolved gaps, require human review |
| Research | Governance and Protocol | Explain verified context and identify missing economic Evidence |
| Strategy | Governance, Protocol and Decision Memory | Propose HOLD until required market Evidence arrives |
| Quant | Protocol only | Refuse unsupported calculations and enumerate required metrics |
| Risk | Protocol and Decision Memory | Raise liquidity/volatility/peg challenges independently |
| Compliance | Governance and Protocol | Raise policy/allowlist/authority challenges independently |
| Portfolio | Decision Memory only | Prefer unchanged allocation because no supported asset-changing candidate exists |
| Treasury | Governance and Decision Memory | Produce no transaction; return the preflight Evidence checklist |

Expected reverse Evidence requests:

1. `BALANCE`: current treasury units and gas balance.
2. `PRICE`: verified reference prices at the Decision timestamp.
3. `LIQUIDITY`: executable depth and expected slippage for any candidate route.
4. `VOLATILITY`: verified observation window and calculation inputs.
5. `GOVERNANCE_STATE`: active policy version, Guard pause state and authorization readiness.

The first committee run should remain `HOLD` with explicit gaps. A later child Decision may change a role's position only after the requested Evidence is verified, imported into a new immutable Snapshot and cited. New Evidence is allowed to change the recommendation; editing the earlier Decision or its Manifest is not.

## Human approval checklist

- [ ] Confirm that the deployed governance values still match canonical chain readback.
- [ ] Confirm that the risk thresholds are acceptable as an advisory demonstration rubric.
- [ ] Confirm that none of the thresholds is represented as active PolicyRegistry enforcement.
- [ ] Confirm source ACL roles and validity windows.
- [ ] Confirm the Outcome identifiers and transaction hash.
- [ ] Create each source as `DRAFT` using a fresh idempotency key.
- [ ] Review scan/redaction results and generated content hashes.
- [ ] Approve each source separately with a human rationale.
- [ ] Freeze the resulting source/chunk/version citations in a new eight-Agent Decision.
- [ ] Keep `assetExecutionAuthorized=false` throughout ingestion, retrieval and Decision generation.
