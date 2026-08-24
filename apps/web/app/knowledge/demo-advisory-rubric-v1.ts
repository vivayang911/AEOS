export type DraftKnowledgeSource={sourceKey:string;partition:"GOVERNANCE"|"PROTOCOL"|"DECISION_MEMORY";title:string;content:string;aclRoles:string[]};

const governanceAcl=["ADMIN","TREASURY_COMMITTEE","REVIEWER","AUDITOR","GUARDIAN"];
const operationsAcl=["ADMIN","TREASURY_COMMITTEE","REVIEWER","OPERATOR","AUDITOR","GUARDIAN"];

export const DEMO_ADVISORY_RUBRIC_V1:DraftKnowledgeSource[]=[
  {
    sourceKey:"aeos-governance-operating-policy",partition:"GOVERNANCE",title:"DAO Governance Operating Policy",aclRoles:governanceAcl,
    content:`# Verified governance configuration
AEOS uses the deployed Creditcoin Testnet Governor and Timelock as the final authorization boundary for the demonstration organization. The verified Governor voting period is 240 blocks. The successful Decision-bound proposal recorded 1,000,000 For votes against a quorum requirement of 40,000 votes. The Timelock minimum delay is 60 seconds. These values must be re-read from chain before a new Proposal is treated as executable.

# Proposal requirements
A Proposal must bind the reviewed Decision ID, immutable Evidence Snapshot hash, unresolved dissent, human-readable intent, exact targets, values and calldatas. A Proposal may advance only after the Governor reports the canonical state required for that transition. Wallet submission is not finality; finality requires a separate canonical receipt and event readback.

# Human and DAO control
Agent output is advisory. Human approval accepts a Decision record only; it does not vote, queue, execute or grant asset authority. Proposal, vote, Queue and Execute transactions require the user-controlled wallet or configured DAO infrastructure. AI services have no signer or broadcaster capability.

# Fail-closed governance response
If quorum, voting state, Timelock readiness, exact calldata, policy binding, simulation freshness or canonical finality cannot be established, retain or return HOLD and request the missing Evidence. Narrative confidence cannot override a failed deterministic check.`
  },
  {
    sourceKey:"aeos-treasury-authorization-boundary",partition:"GOVERNANCE",title:"Treasury Authorization Boundary",aclRoles:operationsAcl,
    content:`# Current live boundary
The verified TreasuryGuard is paused and its governance authority is the Timelock. The verified PolicyRegistry latest version is zero and no active policy was observed for the accepted HOLD Outcome. Safe is outside the accepted deployment batch. No asset class, protocol, target, selector or non-zero amount is authorized by this Knowledge Source.

# Permitted preparation
AEOS may prepare a zero-value, unsigned and unsubmitted governance request; run read-only simulation; calculate an advisory PID value; and produce a human-review checklist. Preparation must keep assetExecutionAuthorized=false. Knowledge approval cannot change this value.

# Prohibited interpretation
This document is not a transfer allowlist and is not a substitute for PolicyRegistry state. Absence of a prohibition is not permission. A future asset action requires a separately versioned policy, on-chain activation and readback, exact target and selector allowlists, bounded value, fresh simulation, DAO authorization and user-controlled submission.

# Required reverse Evidence requests
Before any non-zero proposal, request fresh Evidence for treasury balances, prices, executable liquidity, slippage, gas balance, target-contract identity, active policy version, Guard pause state and governance or Safe readiness. Missing or stale fields block action rather than being estimated.`
  },
  {
    sourceKey:"aeos-risk-review-rubric",partition:"PROTOCOL",title:"Treasury Risk Review Rubric",aclRoles:operationsAcl,
    content:`# Status and authority
DEMO_ADVISORY_RUBRIC_V1 is a human-confirmed analytical rubric for the demonstration committee. It is not an active on-chain policy and cannot authorize execution. It may only tighten a recommendation or cause a refusal.

# Evidence sufficiency threshold
Material balance, price, liquidity, volatility, peg and contract-risk claims require immutable Evidence references. Required Evidence quality is at least 85 out of 100 and market-state freshness is at most 300 seconds at Decision freeze time. Transaction inclusion alone does not establish price, liquidity or economic value. A missing required metric produces an Evidence Request and an INSUFFICIENT_EVIDENCE or HOLD position.

# Advisory market-risk thresholds
- A proposed order must not exceed 1 percent of verified 24-hour executable volume.
- Estimated slippage above 50 basis points blocks the candidate.
- A verified stablecoin deviation greater than 100 basis points triggers a HIGH peg-risk challenge.
- Verified 24-hour volatility above 5 percent or peak-to-trough drawdown above 10 percent triggers a HIGH market-risk challenge.
- A route without verified exit liquidity, target-contract identity or failure-mode analysis is ineligible.
These thresholds are Agent review gates only. They cannot make a transaction executable.

# Independent challenge requirement
Risk independently challenges position sizing, liquidity, drawdown and black-swan assumptions. Compliance independently challenges policy status, allowlists, governance authority and restricted-asset assumptions. Strategy must answer both with frozen citations. An unresolved material challenge blocks Portfolio and Treasury from drafting an action.

# PID interaction
PID output is advisory and subordinate to fail-closed checks. Missing or stale input makes PID output zero. Output saturation, execution withholding or prolonged pause must prevent integral windup. An Agent cannot change PID gains or limits during a Decision run.`
  },
  {
    sourceKey:"aeos-contract-control-surface",partition:"PROTOCOL",title:"Deployed Contract Control Surface",aclRoles:operationsAcl,
    content:`# EvidenceAnchorASC
EvidenceAnchorASC verifies the supported USC proof path and anchors exact Evidence, Snapshot and Decision commitments. It has no signer, broadcaster or payable asset-execution surface. An anchor proves the frozen commitment and canonical event, not the economic truth of every payload field.

# Governor and Timelock
The Governor controls Proposal lifecycle and voting. The Timelock enforces the verified delay and is the governance authority for PolicyRegistry and TreasuryGuard. Direct calls without configured authority fail closed.

# PolicyRegistry
PolicyRegistry stores sequential immutable policy versions and validity windows. Knowledge approval is not PolicyRegistry activation. Agents use canonical readback rather than assume a policy exists.

# TreasuryGuard
TreasuryGuard begins paused and exposes deterministic authorization checks. Guardian authority can pause but cannot unpause or transfer assets. Authorization validation does not itself call the target. Target, selector, value, deadline and policy bindings must all match.

# Safe boundary
Safe has not been independently deployed and verified for the accepted batch. Any workflow requiring Safe threshold or execution Evidence remains blocked until canonical configuration and transaction observation exist.`
  },
  {
    sourceKey:"aeos-hold-outcome-memory",partition:"DECISION_MEMORY",title:"Decision-bound HOLD Outcome Memory",aclRoles:operationsAcl,
    content:`# Frozen historical result
Decision decision_a9a37c5bd3ff43c68f5b0af32a13b8ed was bound to Evidence Snapshot snap_5f3081a8dffc4e0b9f281e0095dc231f. Earlier Proposal attempts that missed their voting window remain immutable failures. Attempt 3 reached quorum, was queued through the 60-second Timelock and executed the exact zero-value action TreasuryGuard.setPaused(true) in transaction 0xeecd79baabd81d23000ef36791384c1919615d8c4a609fc8215819c970c01160.

# Verified Outcome
The canonical Outcome is DETERMINISTIC_WITHHOLDING_EXECUTED. The Timelock operation completed, TreasuryGuard remained paused, zero native value moved, and no PolicyRegistry mutation occurred. The result is linked to immutable organization-scoped Evidence and Outcome lineage.

# Allowed lesson
A sufficiently long voting window and prompt human voting were necessary for this sample to reach execution. Prior zero-vote failures justify explicit deadline monitoring and fail-closed wallet handoff checks.

# Forbidden lesson
This single Outcome does not prove investment performance, avoided loss, economic benefit, market prediction accuracy or causal AI effectiveness. It must not automatically become a Skill, PID gain change or active policy. Promotion requires a separate governed candidate, independent review and preserved source lineage.`
  }
];
