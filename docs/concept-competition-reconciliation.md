# AEOS Concept Design × PRD × competition reconciliation

Last reconciled: 2026-08-12

## Authority and non-negotiable boundaries

`AEOS_Concept_Design.md` is a product-vision and competitive-differentiation input. The 18 detailed PRD documents remain the implementation contract. A concept may strengthen a PRD requirement, but it may not silently replace, reduce, rename away or weaken one.

Every adopted concept must preserve:

- Evidence first: material claims remain bound to immutable, eligible Evidence IDs.
- DAO in control: AI produces advice and drafts only; it never signs, broadcasts, votes or receives asset authority.
- Deterministic guardrails: policy, limits, simulation, pause, replay protection and authorization remain non-LLM controls.
- Tenant isolation: every persisted or retrieved tenant record is scoped by `organization_id` and protected by RLS/ACL tests.
- Immutable provenance: Evidence, Agent message, Decision, Simulation, Proposal and on-chain anchor snapshots are append-only or superseded by explicit relations.

## Ten-role concept versus eight-Agent PRD

The concept document proposes ten organizational roles. PRD/06 defines exactly eight MVP decision Agents. The product and implementation must continue to present **eight Agents**, not ten.

| Concept role | Strict PRD realization | Decision |
|---|---|---|
| DAO Strategy Agent | Strategy Agent | Adopt as one of the required eight |
| Opportunity Discovery Agent | Research discovery stage plus Strategy candidate-generation capability | Adopt as a bounded advisory capability, not a ninth Agent |
| Research Agent | Research Agent | Adopt as one of the required eight |
| Risk Agent | Risk Agent | Adopt as one of the required eight |
| Quant Agent | Quant Agent | Adopt as one of the required eight |
| Compliance Agent | Compliance Agent | Adopt as one of the required eight |
| Portfolio Agent | Portfolio Agent | Adopt as one of the required eight |
| Treasury Agent | Treasury Agent | Adopt as one of the required eight; simulation read-only and no signing tool |
| Monitoring Agent | Deterministic anomaly producers, alert rules and read-only monitoring projection | Keep outside the advisory committee; deterministic service, not a ninth Agent |
| Governor Agent | Governor Agent | Adopt as one of the required eight |

The eight-Agent roster is therefore: Governor, Research, Strategy, Quant, Risk, Compliance, Portfolio and Treasury. Opportunity discovery and monitoring must still have distinct schemas, audit events and tests, but may not inflate the committee roster or bypass its challenge workflow.

## Valuable concepts to adopt without reducing PRD scope

### 1. Evidence Intelligence routing graph

Add deterministic normalization labels such as liquidity, growth, risk, security and governance. Store the versioned classifier/rule result and route eligible Evidence to Agent-readable queues. Labels are navigation metadata, not proof of truth; the original Attestcoin provenance and verification status remain authoritative.

Competition value: judges can visibly follow a fact from source chain, through ASC verification and Evidence labeling, into the exact Agent claims it supports.

### 2. Auditable A2A challenge ledger

Implement Agent requests, responses, challenges and resolutions as immutable `agent_messages` with sender role, recipient role, message type, Evidence manifest, input/output hashes, workflow ordinal and deterministic budget. Risk and Compliance independently challenge candidate strategies; unresolved HIGH issues force `INSUFFICIENT_EVIDENCE` or rejection.

Competition value: this demonstrates a real AI organization rather than eight decorative prompts.

### 3. Governed institutional memory

Preserve the concept's four useful memory layers while applying PRD/09 controls:

- Ephemeral/short-term context: task-local and deleted on expiry.
- Working memory: project-stage state with explicit validity.
- Event/decision memory: immutable historical decisions and outcomes.
- Enterprise knowledge: approved, organization-scoped, versioned long-term material.

No auto-summary may become trusted memory directly. Candidate memories require source, author, approver, effective/expiry time, ACL, content hash and supersession/deletion behavior. Historical conclusions never replace current verified Evidence.

### 4. Closed-loop learning without autonomous finance

Use the concept's PID feedback as an explainable governance feedback loop: target → observed verified state → deterministic deviation → bounded PI/PID suggestion → eight-Agent review → human/DAO authorization → observed result. The loop proposes parameter changes; it does not self-activate policy or execute treasury actions.

Competition value: an Evidence-backed feedback loop is more differentiated than a one-shot chatbot or generic portfolio dashboard.

### 5. ASC-backed Evidence commitment

Implement an AEOS Evidence Anchor ASC on Creditcoin that validates the expected source transaction through the supported native verifier boundary, verifies success and exact event fields, rejects replay, and emits a stable Evidence commitment. The backend then freezes the confirmed ASC event into the organization-scoped Evidence record.

Competition value: Attestcoin becomes the trust root of the Decision Room, rather than an ornamental API integration.

### 6. Bidirectional Evidence Demand Loop

Treat the simulated enterprise departments as responsibility boundaries, not extra Agents. The eight formal Agents may identify a structured evidence gap, but a deterministic Evidence Request Broker validates organization, role, chain, address/event allowlists, freshness, range, cost and retry budget before selecting an approved read-only discovery or Attestcoin adapter. Agents never receive arbitrary network, RPC, provider-payload or credential access.

Newly verified facts create a new Evidence Snapshot and child Decision revision. They never mutate the prior Decision or erase its refusal and dissent. This creates a judge-visible loop from Attestcoin evidence supply to committee analysis, back to a bounded evidence demand, and forward again into a fully cited recommendation.

Competition value: when facts are missing, the committee requests cryptographic evidence instead of hallucinating; every request, proof, revision and final claim remains organization-scoped and auditable.

## Judge-visible product story

The strongest submission narrative is a three-act proof, not a broad feature tour:

1. **Prove the fact:** show a real source-chain treasury event, Attestcoin proof, Creditcoin ASC verification/anchor event and immutable AEOS Evidence provenance.
2. **Prove the organization:** show all eight Agents, routed Evidence, A2A requests, Risk/Compliance challenges, citations, dissent and deterministic refusal when Evidence is stale, conflicting or tampered.
3. **Prove control:** show a reproducible PID/strategy suggestion becoming an unsigned Proposal/Safe review payload while the UI and audit trail demonstrate `assetExecutionAuthorized=false` until the DAO acts.

The demo must include both a valid happy path and an adversarial refusal path. That makes safety observable rather than a README claim.

## Competitive language rules

- Preferred positioning: **Evidence-native operating system for DAO treasury intelligence**.
- Supporting line: **Verifiable cross-chain facts in; cited multi-Agent advice out; DAO authority always retained.**
- Do not market AEOS as autonomous asset management or autonomous execution.
- Do not describe `TreasuryGuard` as an ASC.
- Do not describe five implemented Agents as the complete eight-Agent committee.
- Do not call Mock, offline or derived data on-chain verified.

## Implementation priorities introduced by this reconciliation

1. **Locally verified:** complete eight-Agent roster and immutable A2A challenge ledger, including Opportunity Discovery as a Research/Strategy capability and Monitoring as a deterministic service.
2. **Locally verified foundation:** PRD/09 RAG and governed memory now enforce organization RLS, role ACL, approval, validity, supersession/tombstones, immutable provenance and deterministic golden evaluation; production embedding and physical backup deletion remain incomplete.
3. **Locally verified:** all eight Agent inputs receive immutable role-partitioned Retrieval Manifests; frozen requester-role RLS prevents same-organization ACL widening, and retries reuse the original bundle.
4. **Next:** implement deterministic Evidence classification/routing and the Evidence Request Broker defined in `next-development-plan.md`.
5. Complete the wallet-explicit source-chain → Attestcoin → Creditcoin ASC → immutable Evidence → cited eight-Agent Decision demonstration.
6. Surface the feedback loop and adversarial refusal in the cockpit and submission assets without granting AI any execution capability.

These enhancements add competition differentiation; they do not change the unresolved PRD and event hard gates recorded in `docs/prd-traceability-matrix.md`.
