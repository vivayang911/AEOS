import { decisionRoles } from "./decision-engine";
import { buildRetrievalManifestBundle,buildRoleRetrievalManifestBundle,ROLE_RETRIEVAL_FOCUS,unavailableRetrievalManifestBundle,validateRetrievalManifestBundle } from "./retrieval-manifest";

const item=(overrides:Record<string,unknown>={})=>({id:"chunk_1",sourceId:"source_1",sourceVersion:1,partition:"GOVERNANCE",heading:"Policy",content:"Stablecoin allocation policy",contentHash:"0xcontent",citation:"rag:source_1:v1:chunk_1:0xcontent",keywordScore:1,vectorScore:.8,score:.9,conflictGroupId:null,...overrides});

describe("Decision retrieval manifests",()=>{
  it("reproduces an ordered immutable-hashable eight-role bundle",()=>{const first=buildRetrievalManifestBundle("stablecoin policy",{status:"SUPPORTED",reasonCode:null,items:[item()],embeddingModel:"mock"});const second=buildRetrievalManifestBundle("stablecoin policy",{status:"SUPPORTED",reasonCode:null,items:[item()],embeddingModel:"mock"});expect(first.bundleHash).toBe(second.bundleHash);expect(first.manifests.map(value=>value.role)).toEqual(decisionRoles);expect(validateRetrievalManifestBundle(first)).toBe(first);expect(first.assetExecutionAuthorized).toBe(false)});
  it("applies deterministic least-privilege partitions per Agent",()=>{const bundle=buildRetrievalManifestBundle("governance",{status:"SUPPORTED",items:[item({partition:"GOVERNANCE"})],embeddingModel:"mock"});expect(bundle.manifests.find(value=>value.role==="Compliance")?.items).toHaveLength(1);expect(bundle.manifests.find(value=>value.role==="Quant")?.items).toHaveLength(0)});
  it("freezes each role query and only that role's permitted content",()=>{
    const results=Object.fromEntries(decisionRoles.map(role=>[role,{query:ROLE_RETRIEVAL_FOCUS[role],result:{status:"SUPPORTED",embeddingModel:"mock",items:[item({id:`chunk_${role}`,partition:role==="Portfolio"?"DECISION_MEMORY":["Quant","Risk"].includes(role)?"PROTOCOL":"GOVERNANCE",citation:`rag:source_1:v1:chunk_${role}:0xcontent`})]}}])) as any;
    const bundle=buildRoleRetrievalManifestBundle(results);
    expect(bundle.manifests.every(manifest=>manifest.query===ROLE_RETRIEVAL_FOCUS[manifest.role])).toBe(true);
    expect(new Set(bundle.manifests.map(manifest=>manifest.manifestHash)).size).toBe(8);
    expect(bundle.manifests.every(manifest=>manifest.status==="SUPPORTED"&&manifest.items.length===1)).toBe(true);
    expect(bundle.manifests.find(manifest=>manifest.role==="Portfolio")?.items[0].partition).toBe("DECISION_MEMORY");
    expect(validateRetrievalManifestBundle(bundle)).toBe(bundle);
  });
  it("fails validation when a stable citation is forged",()=>{const bundle=buildRetrievalManifestBundle("policy",{status:"SUPPORTED",items:[item()],embeddingModel:"mock"});const changed=structuredClone(bundle);changed.manifests[0].items[0].citation="rag:forged";expect(()=>validateRetrievalManifestBundle(changed)).toThrow("hash mismatch")});
  it("records an explicit fail-closed bundle when retrieval is unavailable",()=>{const bundle=unavailableRetrievalManifestBundle("objective");expect(bundle.manifests.every(value=>value.status==="INSUFFICIENT_CONTEXT"&&value.reasonCode==="RETRIEVAL_SERVICE_UNAVAILABLE")).toBe(true)});
});
