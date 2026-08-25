import { decisionRoles,hashValue } from "./decision-engine";

const expectedPartitions:Readonly<Record<typeof decisionRoles[number],ReadonlyArray<string>>>={
  Governor:["GOVERNANCE","PROTOCOL","DECISION_MEMORY"],
  Research:["GOVERNANCE","PROTOCOL"],
  Strategy:["GOVERNANCE","PROTOCOL","DECISION_MEMORY"],
  Quant:["PROTOCOL"],
  Risk:["PROTOCOL","DECISION_MEMORY"],
  Compliance:["GOVERNANCE","PROTOCOL"],
  Portfolio:["DECISION_MEMORY"],
  Treasury:["GOVERNANCE","DECISION_MEMORY"]
};
const fail=(code:string):never=>{throw new Error(code)};
const sorted=(values:string[])=>[...new Set(values)].sort();

export function buildContentfulEightAgentDecisionArtifact(input:{recordedAt:string;approvalReceiptHash:string;approvedSources:Array<{id:string;sourceKey:string;partition:string;contentHash:string}>;historical:any;current:any;job:{jobId:string;status:string;decisionId:string|null};snapshot:{id:string;manifestHash:string};evidence:{id:string;contentHash:string}}){
  const {historical,current}=input;
  if(input.approvedSources.length!==5||new Set(input.approvedSources.map(source=>source.id)).size!==5)fail("CONTENTFUL_APPROVED_SOURCE_SET_INVALID");
  if(historical.id===current.id||historical.outputHash===current.outputHash||historical.retrievalBundleHash===current.retrievalBundleHash)fail("CONTENTFUL_DECISION_IDENTITY_NOT_NEW");
  if(historical.retrievalManifests?.length!==8||historical.retrievalManifests.some((manifest:any)=>manifest.status!=="INSUFFICIENT_CONTEXT"||!Array.isArray(manifest.items)||manifest.items.length))fail("HISTORICAL_NO_CONTEXT_DECISION_MUTATED");
  if(input.job.status!=="COMPLETED"||input.job.decisionId!==current.id||current.status!=="REVIEW_REQUIRED"||current.provider!=="mock-deterministic"||current.evidenceSnapshotId!==input.snapshot.id||current.evidenceManifestHash!==input.snapshot.manifestHash)fail("CONTENTFUL_DECISION_BOUNDARY_INVALID");
  if(current.retrievalManifests?.length!==8||current.agentRuns?.length!==8)fail("CONTENTFUL_EIGHT_ROLE_RECORDS_REQUIRED");
  const allowedSources=new Map(input.approvedSources.map(source=>[source.id,source]));
  const positions=new Map(current.recommendation?.agentPositions?.map((position:any)=>[position.role,position])??[]);
  const manifests=decisionRoles.map(role=>{
    const manifest=current.retrievalManifests.find((item:any)=>item.role===role),position:any=positions.get(role);
    if(!manifest||manifest.status!=="SUPPORTED"||manifest.reason_code!==null||!Array.isArray(manifest.items)||!manifest.items.length)fail(`CONTENTFUL_MANIFEST_UNSUPPORTED_${role}`);
    const actualPartitions=sorted(manifest.items.map((item:any)=>String(item.partition)));
    if(JSON.stringify(actualPartitions)!==JSON.stringify(sorted([...expectedPartitions[role]])))fail(`CONTENTFUL_MANIFEST_PARTITIONS_INVALID_${role}`);
    if(manifest.items.some((item:any)=>!allowedSources.has(item.sourceId)||!String(item.citation).includes(item.chunkId)||!String(item.citation).includes(item.contentHash)))fail(`CONTENTFUL_MANIFEST_SOURCE_INVALID_${role}`);
    const citations=manifest.items.map((item:any)=>item.citation);
    if(position?.retrievalManifestHash!==manifest.manifest_hash||position?.retrievalStatus!=="SUPPORTED"||position?.assetExecutionAuthorized!==false||JSON.stringify(position?.knowledgeCitations)!==JSON.stringify(citations))fail(`CONTENTFUL_POSITION_BINDING_INVALID_${role}`);
    return {role,id:manifest.id,query:manifest.query,queryHash:manifest.query_hash,manifestHash:manifest.manifest_hash,status:manifest.status,itemCount:manifest.items.length,partitions:actualPartitions,sources:sorted(manifest.items.map((item:any)=>allowedSources.get(item.sourceId)!.sourceKey)),citations:manifest.items.map((item:any)=>({citation:item.citation,sourceKey:allowedSources.get(item.sourceId)!.sourceKey,partition:item.partition,heading:item.heading,contentHash:item.contentHash,score:item.score})),position:position.position};
  });
  if(new Set(manifests.map(manifest=>manifest.manifestHash)).size!==8)fail("CONTENTFUL_MANIFEST_HASHES_NOT_DISTINCT");
  const output=current.recommendation;
  if(!["HOLD","INSUFFICIENT_EVIDENCE"].includes(output?.recommendation)||output.actions?.length||output.humanApprovalRequired!==true||output.assetExecutionAuthorized!==false||output.citationCoverage?.coverage!==1)fail("CONTENTFUL_DECISION_OUTPUT_INVALID");
  const risk=output.challenges?.find((challenge:any)=>challenge.raisedBy==="Risk"&&challenge.code==="RISK_MARKET_EVIDENCE_REQUIRED"),compliance=output.challenges?.find((challenge:any)=>challenge.raisedBy==="Compliance"&&challenge.code==="COMPLIANCE_AUTHORITY_EVIDENCE_REQUIRED");
  if(risk?.code!=="RISK_MARKET_EVIDENCE_REQUIRED"||compliance?.code!=="COMPLIANCE_AUTHORITY_EVIDENCE_REQUIRED")fail("CONTENTFUL_INDEPENDENT_CHALLENGES_INVALID");
  if(current.agentRuns.some((run:any)=>run.run_state!=="SUCCEEDED"||run.model_version!=="mock-deterministic-v4-eight-agent")||!current.agentMessages?.length)fail("CONTENTFUL_AGENT_OR_A2A_INVALID");
  const core={schemaVersion:"aeos.contentful-eight-agent-decision.v1",status:"CONTENTFUL_DECISION_FROZEN",recordedAt:input.recordedAt,approvalReceiptHash:input.approvalReceiptHash,approvedSourceCount:input.approvedSources.length,evidence:input.evidence,evidenceSnapshot:input.snapshot,historical:{decisionId:historical.id,retrievalBundleHash:historical.retrievalBundleHash,manifestStatuses:historical.retrievalManifests.map((manifest:any)=>({role:manifest.role,status:manifest.status,itemCount:manifest.items.length})),immutable:true},current:{decisionId:current.id,jobId:input.job.jobId,retrievalBundleHash:current.retrievalBundleHash,inputHash:current.inputHash,outputHash:current.outputHash,recommendation:output.recommendation,manifests,positions:output.agentPositions.map((position:any)=>({role:position.role,position:position.position,retrievalManifestHash:position.retrievalManifestHash,retrievalStatus:position.retrievalStatus,knowledgeCitations:position.knowledgeCitations})),challenges:[risk,compliance],agentRuns:current.agentRuns.length,a2aMessages:current.agentMessages.length,humanApprovalRequired:true},truthBoundary:{verifiedClaim:"SOURCE_TRANSACTION_INCLUSION",approvedKnowledgeAvailable:true,marketStateVerified:false,economicTruthVerified:false},controls:{manifestFrozen:true,agentRun:true,proposalCreated:false,signature:false,broadcast:false,assetExecutionAuthorized:false}};
  return {...core,artifactHash:hashValue(core)};
}
