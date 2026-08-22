import { DecisionRole,decisionRoles,hashValue } from "./decision-engine";
import { MOCK_EMBEDDING_MODEL } from "./knowledge-engine";

export const RETRIEVAL_RERANKER_VERSION="hybrid-trust-freshness-v1";
export type RetrievalPartition="VERIFIED_EVIDENCE"|"GOVERNANCE"|"PROTOCOL"|"DECISION_MEMORY"|"ORGANIZATION_MEMORY";
export type RetrievalManifestItem={sourceId:string;sourceVersion:number;chunkId:string;partition:RetrievalPartition;heading:string;content:string;contentHash:string;citation:string;keywordScore:number;vectorScore:number;score:number;conflictGroupId:string|null};
export type RoleRetrievalManifest={schemaVersion:"decision.retrieval-manifest.v1";role:DecisionRole;query:string;queryHash:string;status:"SUPPORTED"|"INSUFFICIENT_CONTEXT"|"REFUSED";reasonCode:string|null;hasConflicts:boolean;embeddingModel:string;rerankerVersion:string;items:RetrievalManifestItem[];manifestHash:string;assetExecutionAuthorized:false};
export type RetrievalManifestBundle={schemaVersion:"decision.retrieval-bundle.v1";manifests:RoleRetrievalManifest[];bundleHash:string;assetExecutionAuthorized:false};

const rolePartitions:Readonly<Record<DecisionRole,ReadonlyArray<RetrievalPartition>>>={
  Governor:["VERIFIED_EVIDENCE","GOVERNANCE","PROTOCOL","DECISION_MEMORY","ORGANIZATION_MEMORY"],
  Research:["VERIFIED_EVIDENCE","GOVERNANCE","PROTOCOL","ORGANIZATION_MEMORY"],
  Strategy:["VERIFIED_EVIDENCE","GOVERNANCE","PROTOCOL","DECISION_MEMORY","ORGANIZATION_MEMORY"],
  Quant:["VERIFIED_EVIDENCE","PROTOCOL"],
  Risk:["VERIFIED_EVIDENCE","PROTOCOL","DECISION_MEMORY","ORGANIZATION_MEMORY"],
  Compliance:["VERIFIED_EVIDENCE","GOVERNANCE","PROTOCOL","ORGANIZATION_MEMORY"],
  Portfolio:["VERIFIED_EVIDENCE","DECISION_MEMORY","ORGANIZATION_MEMORY"],
  Treasury:["VERIFIED_EVIDENCE","GOVERNANCE","DECISION_MEMORY"]
};

export function buildRetrievalManifestBundle(query:string,result:any):RetrievalManifestBundle{
  const manifests=decisionRoles.map(role=>{
    const allowed=new Set(rolePartitions[role]);
    const items:RetrievalManifestItem[]=(Array.isArray(result?.items)?result.items:[]).filter((item:any)=>allowed.has(item.partition)).map((item:any)=>({sourceId:String(item.sourceId),sourceVersion:Number(item.sourceVersion),chunkId:String(item.id),partition:item.partition,heading:String(item.heading),content:String(item.content),contentHash:String(item.contentHash),citation:String(item.citation),keywordScore:Number(item.keywordScore),vectorScore:Number(item.vectorScore),score:Number(item.score),conflictGroupId:item.conflictGroupId?String(item.conflictGroupId):null}));
    const status:RoleRetrievalManifest["status"]=result?.status==="REFUSED"?"REFUSED":items.length?"SUPPORTED":"INSUFFICIENT_CONTEXT";
    const conflicts=new Map<string,number>();for(const item of items)if(item.conflictGroupId)conflicts.set(item.conflictGroupId,(conflicts.get(item.conflictGroupId)??0)+1);
    const core={schemaVersion:"decision.retrieval-manifest.v1" as const,role,query,queryHash:hashValue(query),status,reasonCode:status==="SUPPORTED"?null:String(result?.reasonCode??"NO_ROLE_SCOPED_CONTEXT"),hasConflicts:[...conflicts.values()].some(count=>count>1),embeddingModel:String(result?.embeddingModel??MOCK_EMBEDDING_MODEL),rerankerVersion:RETRIEVAL_RERANKER_VERSION,items,assetExecutionAuthorized:false as const};
    return {...core,manifestHash:hashValue(core)};
  });
  const core={schemaVersion:"decision.retrieval-bundle.v1" as const,manifests,assetExecutionAuthorized:false as const};
  return {...core,bundleHash:hashValue(core)};
}

export function unavailableRetrievalManifestBundle(query:string,reasonCode="RETRIEVAL_SERVICE_UNAVAILABLE"){
  return buildRetrievalManifestBundle(query,{status:"INSUFFICIENT_CONTEXT",reasonCode,items:[],hasConflicts:false,embeddingModel:MOCK_EMBEDDING_MODEL});
}

export function validateRetrievalManifestBundle(bundle:RetrievalManifestBundle){
  if(bundle?.schemaVersion!=="decision.retrieval-bundle.v1"||bundle.assetExecutionAuthorized!==false||bundle.manifests?.length!==decisionRoles.length)throw new Error("Retrieval manifest bundle schema is invalid");
  for(const [index,manifest] of bundle.manifests.entries()){
    if(manifest.role!==decisionRoles[index]||manifest.schemaVersion!=="decision.retrieval-manifest.v1"||manifest.assetExecutionAuthorized!==false)throw new Error("Retrieval manifest role order or authority is invalid");
    const {manifestHash,...core}=manifest;if(hashValue(core)!==manifestHash)throw new Error(`Retrieval manifest hash mismatch for ${manifest.role}`);
    if(manifest.items.some(item=>!rolePartitions[manifest.role].includes(item.partition)))throw new Error(`Retrieval partition is forbidden for ${manifest.role}`);
    if(manifest.items.some(item=>!item.citation.includes(item.chunkId)||!item.citation.includes(item.contentHash)))throw new Error(`Retrieval citation is invalid for ${manifest.role}`);
  }
  const {bundleHash,...core}=bundle;if(hashValue(core)!==bundleHash)throw new Error("Retrieval manifest bundle hash mismatch");
  return bundle;
}

export function allowedKnowledgeCitations(bundle:RetrievalManifestBundle){return Object.fromEntries(bundle.manifests.map(manifest=>[manifest.role,manifest.items.map(item=>item.citation)])) as Record<DecisionRole,string[]>}
