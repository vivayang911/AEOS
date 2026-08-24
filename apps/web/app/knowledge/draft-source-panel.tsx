"use client";

import {useState} from "react";
import {ApiError,useSession} from "../ui/session-context";
import {DEMO_ADVISORY_RUBRIC_V1} from "./demo-advisory-rubric-v1";

type PreviewChunk={index:number;heading:string;contentHash:string;characterCount:number;preview:string};
type DraftResult={id:string;sourceKey:string;version:number;status:string;partition:string;contentHash:string;originalContentHash:string;redactionApplied:boolean;scanResult:{safe:boolean;codes:string[];contentHash:string};persistedChunkCount:number;prospectiveChunks:PreviewChunk[];previewOnly:boolean;assetExecutionAuthorized:boolean};

export function DraftSourcePanel(){
  const auth=useSession();const[busy,setBusy]=useState(false);const[error,setError]=useState("");const[results,setResults]=useState<DraftResult[]>([]);
  const eligible=Boolean(auth.session?.activeOrganizationId&&["ADMIN","REVIEWER"].includes(auth.session.role??"")&&auth.canMutate);
  const createDrafts=async()=>{setBusy(true);setError("");const created:DraftResult[]=[];try{for(const source of DEMO_ADVISORY_RUBRIC_V1){const result=await auth.request<DraftResult>("/knowledge/sources",{method:"POST",csrf:true,headers:{"idempotency-key":`demo-advisory-rubric-v1-draft-${source.sourceKey}`},body:JSON.stringify(source)});if(result.status!=="DRAFT"||result.assetExecutionAuthorized!==false||result.persistedChunkCount!==0)throw new Error(`Draft boundary failed for ${source.sourceKey}`);created.push(result);setResults([...created])}}catch(cause){setError(cause instanceof ApiError?`${cause.code}: ${cause.message}`:cause instanceof Error?cause.message:"Draft creation failed.")}finally{setBusy(false)}};
  return <section className="terminal-panel" aria-labelledby="draft-corpus-title" style={{marginTop:"16px"}}><header><div><span className="terminal-kicker">HUMAN-CONFIRMED INPUT</span><h2 id="draft-corpus-title">DEMO_ADVISORY_RUBRIC_V1 Draft Corpus</h2></div><span className="advisory-chip">NOT APPROVED</span></header>
    <p>Create exactly five organization-scoped sources as DRAFT. Approval, persisted chunks, retrieval, Agent execution and asset authority remain withheld.</p>
    <div className="mvp-heading-actions"><button type="button" onClick={createDrafts} disabled={!eligible||busy}>{busy?`CREATING ${results.length}/5`:results.length===5?"5 DRAFTS CREATED":"CREATE 5 DRAFT SOURCES"}</button></div>
    {!auth.session?.activeOrganizationId&&<p className="warning-banner">Select AEOS Hackathon Demo DAO in the workspace control first.</p>}
    {auth.session?.activeOrganizationId&&!auth.canMutate&&<p className="warning-banner">Re-authenticate SIWE to restore the in-memory CSRF token before this write.</p>}
    {error&&<p className="error-banner" role="alert">{error}</p>}
    {results.map(result=><article key={result.id} style={{borderTop:"1px solid var(--line, #16445b)",marginTop:"14px",paddingTop:"12px"}}><h3>{result.sourceKey}</h3><dl><dt>Source ID</dt><dd>{result.id}</dd><dt>Status</dt><dd>{result.status} / NOT APPROVED</dd><dt>Content hash</dt><dd>{result.contentHash}</dd><dt>Scan</dt><dd>{result.scanResult.safe?"SAFE":"BLOCKED"} / {result.scanResult.codes.length?result.scanResult.codes.join(", "):"NO FINDINGS"}</dd><dt>Persisted chunks</dt><dd>{result.persistedChunkCount}</dd></dl><details><summary>Prospective deterministic chunk preview ({result.prospectiveChunks.length})</summary>{result.prospectiveChunks.map(chunk=><div key={chunk.contentHash}><b>{chunk.index+1}. {chunk.heading}</b><code>{chunk.contentHash}</code><p>{chunk.preview}</p></div>)}</details></article>)}
    <footer><strong>ASSET EXECUTION AUTHORIZED / false</strong><span> No approve · no retrieval · no Agent run · no signature · no broadcast</span></footer>
  </section>;
}
