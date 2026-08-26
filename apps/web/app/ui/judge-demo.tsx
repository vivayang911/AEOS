"use client";

import Link from "next/link";

type JudgeStep = {
  id: string;
  phase: string;
  title: string;
  status: "LIVE VERIFIED" | "FROZEN REPLAY";
  reference: string;
  href: string;
  external?: boolean;
  supportingProofs?: ReadonlyArray<{ label: string; href: string }>;
  proves: string;
  doesNotProve: string;
};

export const judgeDemoSteps: readonly JudgeStep[] = [
  {
    id: "01",
    phase: "SOURCE",
    title: "Sepolia treasury observation committed",
    status: "LIVE VERIFIED",
    reference: "0xf035fdf4…91abab",
    href: "https://sepolia.etherscan.io/tx/0xf035fdf437b434629087abf81bdf4100997c45e95f97ce8b945985f33291abab",
    external: true,
    proves: "A project-owned, reporter-bound source event was canonically included on Sepolia.",
    doesNotProve: "The payload is profitable, liquid, current, or authorized for execution.",
  },
  {
    id: "02",
    phase: "ATTESTCOIN",
    title: "Merkle and continuity proof frozen",
    status: "FROZEN REPLAY",
    reference: "uscjob_cb566443…7034",
    href: "https://github.com/vivayang911/AEOS/blob/main/reports/live-demo/step-4-usc-proof-retry-1.json",
    external: true,
    proves: "The exact supported-source Proof bundle and requester commitment were frozen.",
    doesNotProve: "A proof request alone is not Creditcoin finality or an Evidence record.",
  },
  {
    id: "03",
    phase: "CREDITCOIN",
    title: "TransactionVerified observed",
    status: "LIVE VERIFIED",
    reference: "0x1011f237…4fb860",
    href: "https://creditcoin-testnet.blockscout.com/tx/0x1011f237c21733a59472b82c7a14c01e79d99e23ffb3fba1ce4905655a4fb860",
    external: true,
    proves: "Creditcoin BlockProver accepted the exact source transaction inclusion proof.",
    doesNotProve: "Transaction inclusion does not independently prove economic truth.",
  },
  {
    id: "04",
    phase: "EVIDENCE",
    title: "Immutable tenant Evidence imported",
    status: "FROZEN REPLAY",
    reference: "ev_aa0b5dbc…60bf",
    href: "/evidence/ev_aa0b5dbc6fdf431aa6d9f20789c160bf",
    proves: "The verified lineage was normalized and bound to one organization under RLS.",
    doesNotProve: "Other organizations can read it or that stale Evidence may authorize action.",
  },
  {
    id: "05",
    phase: "SNAPSHOT + RAG",
    title: "Evidence Snapshot and role manifests frozen",
    status: "FROZEN REPLAY",
    reference: "snap_5f3081a8…231f",
    href: "/decisions?decision=decision_a9a37c5bd3ff43c68f5b0af32a13b8ed",
    proves: "Every role received a hashed, immutable Evidence and Retrieval context.",
    doesNotProve: "Historical manifests can be rewritten after later knowledge approval.",
  },
  {
    id: "06",
    phase: "AI COMMITTEE",
    title: "Eight cited Agents returned HOLD",
    status: "FROZEN REPLAY",
    reference: "decision_a9a37…b8ed",
    href: "/decisions?decision=decision_a9a37c5bd3ff43c68f5b0af32a13b8ed",
    proves: "Exactly eight bounded roles produced cited advice with independent Risk and Compliance challenges.",
    doesNotProve: "AI approval, a wallet signature, transaction broadcast, or asset authority.",
  },
  {
    id: "07",
    phase: "ASC ANCHOR",
    title: "Decision and Snapshot anchored",
    status: "LIVE VERIFIED",
    reference: "0x181ab1d5…bb9731",
    href: "https://creditcoin-testnet.blockscout.com/tx/0x181ab1d51085f845b76cdc5c4971622f550dafd33ed2e501dcc6c284c8bb9731",
    external: true,
    proves: "EvidenceAnchorASC emitted the exact Decision/Snapshot commitment after verification.",
    doesNotProve: "The recommendation was economically correct or executable.",
  },
  {
    id: "08",
    phase: "DAO GOVERNANCE",
    title: "Proposal reached quorum and Timelock",
    status: "LIVE VERIFIED",
    reference: "Proposal 0x60ae…211e",
    href: "https://creditcoin-testnet.blockscout.com/tx/0x60ae201fd9deefac70931f6968cc02bb2e6196572c4c24fefaaef592c096211e",
    external: true,
    supportingProofs: [
      {
        label: "VOTE RECEIPT",
        href: "https://creditcoin-testnet.blockscout.com/tx/0x82428c71a329ccf18951d4b11d7db0ee2bbf7ad5ba36fe328626d1d2c543a8c9",
      },
      {
        label: "QUEUE RECEIPT",
        href: "https://creditcoin-testnet.blockscout.com/tx/0x3ce62447b836bec8ed450f77964cfa6b54b4a9255f09fa86bf260094e6e1bfc5",
      },
    ],
    proves: "Attempt 3 followed Proposal, 1,000,000 For votes, Queue and a 60-second Timelock.",
    doesNotProve: "Earlier defeated attempts disappeared or AI cast any vote.",
  },
  {
    id: "09",
    phase: "GUARD EXECUTE",
    title: "Zero-value withholding executed",
    status: "LIVE VERIFIED",
    reference: "0xeecd79ba…c01160",
    href: "https://creditcoin-testnet.blockscout.com/tx/0xeecd79baabd81d23000ef36791384c1919615d8c4a609fc8215819c970c01160",
    external: true,
    proves: "The DAO kept TreasuryGuard paused through canonical Governor/Timelock execution.",
    doesNotProve: "An asset transfer, positive return, causal AI benefit, or Policy activation.",
  },
  {
    id: "10",
    phase: "OUTCOME",
    title: "Immutable Outcome Evidence reconciled",
    status: "FROZEN REPLAY",
    reference: "govout_ef2917…2936e",
    href: "/governance",
    proves: "The zero-value withholding result is bound back to Decision, Snapshot and source Evidence.",
    doesNotProve: "Automatic learning or unapproved promotion into PID, RAG, Skill, or execution authority.",
  },
] as const;

const agentRoles = ["Governor", "Research", "Strategy", "Quant", "Risk", "Compliance", "Portfolio", "Treasury"];

export function JudgeDemo({activeStep,running,onRun,onSelect}:{activeStep:number;running:boolean;onRun:()=>void;onSelect:(step:number)=>void}) {
  const step=judgeDemoSteps[activeStep]??judgeDemoSteps[0];
  const referenceLink=step.external
    ? <a href={step.href} target="_blank" rel="noreferrer">OPEN PUBLIC PROOF ↗</a>
    : <Link href={step.href}>OPEN AEOS RECORD →</Link>;
  return <section className={running?"judge-demo running":"judge-demo"} aria-label="Verified judge demonstration" aria-live="polite">
    <header className="judge-demo-header">
      <div><span className="judge-kicker">JUDGE MODE / VERIFIED TESTNET LINEAGE</span><h1>Evidence → AI Decision → DAO Withholding</h1><p>Frozen replay of one accepted sample. It performs no API write, wallet request, signature, broadcast, vote or asset action.</p></div>
      <div className="judge-controls"><span className="judge-truth"><i/> FROZEN REPLAY</span><button type="button" onClick={onRun} disabled={running}>{running?`REPLAYING ${activeStep+1} / ${judgeDemoSteps.length}`:activeStep?"REPLAY VERIFIED DEMO":"RUN VERIFIED DEMO"}</button></div>
    </header>
    <ol className="judge-timeline">
      {judgeDemoSteps.map((item,index)=><li key={item.id} className={index<activeStep?"complete":index===activeStep?"active":"pending"}><button type="button" onClick={()=>onSelect(index)} aria-label={`Inspect judge step ${index+1}: ${item.title}`}><span>{item.id}</span><i/><small>{item.phase}</small></button></li>)}
    </ol>
    <div className="judge-detail">
      <div className="judge-step-title"><span>{step.status}</span><small>STEP {step.id} / {judgeDemoSteps.length}</small><h2>{step.title}</h2><code>{step.reference}</code><div className="judge-proof-links">{referenceLink}{step.supportingProofs?.map(proof=><a key={proof.label} href={proof.href} target="_blank" rel="noreferrer">{proof.label} ↗</a>)}</div></div>
      <div className="judge-proof"><small>PROVES</small><p>{step.proves}</p></div>
      <div className="judge-limit"><small>DOES NOT PROVE</small><p>{step.doesNotProve}</p></div>
      <div className="judge-authority"><small>AUTHORITY BOUNDARY</small><strong>ASSET EXECUTION AUTHORIZED / false</strong><span>Human/DAO confirmation remains the only transaction authority.</span></div>
    </div>
    {activeStep===5&&<div className="judge-agent-strip" aria-label="Exactly eight PRD Agent roles">{agentRoles.map(role=><span key={role}>{role}<i>{role==="Risk"||role==="Compliance"?"CHALLENGE":"CITED"}</i></span>)}</div>}
  </section>;
}
