import { buildRetrievalManifestBundle } from "./retrieval-manifest";
import { decisionRoles,hashValue } from "./decision-engine";
import { buildLiveUsdcInflowChildDecisionArtifact } from "./live-usdc-inflow-child-decision";

const evidence=(id:string)=>({id,contentHash:hashValue(id),predicate:"asset.transfer.inflow",freshnessStatus:"FRESH",verificationStatus:"VERIFIED"});
const fixture=()=>{
  const bundle=buildRetrievalManifestBundle("governance policy",{items:[{sourceId:"source",sourceVersion:1,id:"chunk",partition:"GOVERNANCE",heading:"Policy",content:"Hold",contentHash:hashValue("Hold"),citation:`rag:source:v1:chunk:${hashValue("Hold")}`,keywordScore:1,vectorScore:1,score:1,conflictGroupId:null}]});
  const rows=bundle.manifests.map((manifest,index)=>({...manifest,manifest_hash:manifest.manifestHash,query_hash:manifest.queryHash,items:manifest.items,id:`manifest-${index}`}));
  const positions=decisionRoles.map((role,index)=>({role,position:"HOLD",citations:["old"],knowledgeCitations:bundle.manifests[index].items.map(item=>item.citation)}));
  const parent={id:"parent",revisionNumber:0,evidenceSnapshotId:"parent-snap",evidenceManifestHash:"parent-hash",retrievalBundleHash:bundle.bundleHash,retrievalManifests:rows,recommendation:{recommendation:"INSUFFICIENT_EVIDENCE",actions:[],agentPositions:positions,challenges:[],assetExecutionAuthorized:false,humanApprovalRequired:true},agentRuns:Array(8).fill({}),agentMessages:[]};
  const child={...parent,id:"child",parentDecisionId:"parent",revisionNumber:1,evidenceSnapshotId:"child-snap",evidenceManifestHash:"child-hash",retrievalManifests:rows.map(row=>({...row,items:row.items.map(item=>({...item}))})),recommendation:{...parent.recommendation,agentPositions:positions.map(position=>({...position,citations:["old","new"]}))}};
  return{parent,child,parentSnapshot:{id:"parent-snap",manifestHash:"parent-hash",evidenceIds:["old"]},childSnapshot:{id:"child-snap",manifestHash:"child-hash",evidenceIds:["old","new"]},newEvidence:evidence("new")};
};

describe("live USDC inflow child Decision artifact",()=>{
  it("proves snapshot expansion while preserving all eight frozen RAG manifests",()=>{
    const artifact=buildLiveUsdcInflowChildDecisionArtifact({recordedAt:"2026-08-25T00:00:00.000Z",...fixture()});
    expect(artifact.lineage.newEvidenceAdded).toBe(true);
    expect(artifact.retrieval.inheritedExactly).toBe(true);
    expect(artifact.retrieval.roleComparisons).toHaveLength(8);
    expect(artifact.controls.assetExecutionAuthorized).toBe(false);
  });
  it("fails closed if a child mutates a frozen parent RAG manifest",()=>{
    const input=fixture();input.child.retrievalManifests[0]={...input.child.retrievalManifests[0],manifest_hash:hashValue("mutated")};
    expect(()=>buildLiveUsdcInflowChildDecisionArtifact({recordedAt:"2026-08-25T00:00:00.000Z",...input})).toThrow("LIVE_USDC_CHILD_RAG_MUTATED_Governor");
  });
});
