import { createHash } from "node:crypto";

export const EMBEDDING_DIMENSIONS=16;
export const MOCK_EMBEDDING_MODEL="deterministic-hash-embedding-v1-mock-only";
const injection=/ignore\s+(all\s+)?(previous|prior)|system\s+prompt|developer\s+message|bypass\s+(the\s+)?(policy|guardrail)|execute\s+(this\s+)?(instruction|command)|reveal\s+(a\s+)?secret/i;
const secrets=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,/\b(?:bearer|api[_-]?key|access[_-]?token|private[_ -]?key|wallet[_ -]?key)\s*[:=]\s*\S+/i,/\b(?:[a-z]+\s+){11,23}[a-z]+\b/i];
const email=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export type KnowledgePartition="VERIFIED_EVIDENCE"|"GOVERNANCE"|"PROTOCOL"|"DECISION_MEMORY";
export type RetrievalCandidate={id:string;sourceId:string;sourceVersion:number;partition:KnowledgePartition|"ORGANIZATION_MEMORY";heading:string;content:string;contentHash:string;embedding:number[];validUntil:string|null;conflictGroupId:string|null};

export function hashText(value:string){return `0x${createHash("sha256").update(value).digest("hex")}`}
export function scanKnowledgeContent(content:string){
  const codes:string[]=[];
  if(secrets.some(pattern=>pattern.test(content)))codes.push("SECRET_MATERIAL_DETECTED");
  if(injection.test(content))codes.push("PROMPT_INJECTION_DETECTED");
  return {safe:codes.length===0,codes,contentHash:hashText(content)};
}
export function redactSensitiveContent(content:string){return content.replace(email,"[REDACTED_EMAIL]")}
export function tokenize(value:string){return (value.toLowerCase().match(/[a-z0-9_]+|[\u4e00-\u9fff]/g)??[]).filter(token=>token.length>0)}
export function deterministicMockEmbedding(text:string){
  const vector=Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for(const token of tokenize(text)){const digest=createHash("sha256").update(token).digest();const index=digest[0]%EMBEDDING_DIMENSIONS;vector[index]+=(digest[1]&1)?1:-1}
  const norm=Math.sqrt(vector.reduce((sum,value)=>sum+value*value,0))||1;
  return vector.map(value=>Number((value/norm).toFixed(8)));
}
export function chunkKnowledgeDocument(content:string,maxCharacters=1200){
  const lines=content.replaceAll("\r\n","\n").split("\n");let heading="Document";let buffer:string[]=[];const chunks:Array<{heading:string;content:string}>=[];
  const flush=()=>{const joined=buffer.join("\n").trim();if(joined)for(let offset=0;offset<joined.length;offset+=maxCharacters)chunks.push({heading,content:joined.slice(offset,offset+maxCharacters)});buffer=[]};
  for(const line of lines){const match=/^#{1,6}\s+(.+)$/.exec(line);if(match){flush();heading=match[1].trim()}else buffer.push(line)}flush();
  return chunks.map((chunk,index)=>({...chunk,index,contentHash:hashText(`${chunk.heading}\n${chunk.content}`),embedding:deterministicMockEmbedding(`${chunk.heading}\n${chunk.content}`)}));
}
function cosine(left:number[],right:number[]){return left.reduce((sum,value,index)=>sum+value*(right[index]??0),0)}
const trust:Record<RetrievalCandidate["partition"],number>={VERIFIED_EVIDENCE:1,GOVERNANCE:.9,PROTOCOL:.8,DECISION_MEMORY:.7,ORGANIZATION_MEMORY:.65};
export function retrieveKnowledge(query:string,candidates:RetrievalCandidate[],limit=8,now=new Date()){
  if(injection.test(query))return {status:"REFUSED" as const,reasonCode:"PROMPT_INJECTION_DETECTED",items:[],hasConflicts:false,embeddingModel:MOCK_EMBEDDING_MODEL,assetExecutionAuthorized:false};
  const queryTokens=new Set(tokenize(query));const queryEmbedding=deterministicMockEmbedding(query);
  const ranked=candidates.filter(item=>!item.validUntil||new Date(item.validUntil)>now).map(item=>{
    const tokens=new Set(tokenize(`${item.heading} ${item.content}`));const overlap=[...queryTokens].filter(token=>tokens.has(token)).length;const keyword=queryTokens.size?overlap/queryTokens.size:0;
    const vector=Math.max(0,cosine(queryEmbedding,item.embedding));const score=.5*keyword+.3*vector+.15*trust[item.partition]+.05*(item.validUntil?Math.min(1,Math.max(0,(new Date(item.validUntil).getTime()-now.getTime())/(30*86400000))):1);
    return {...item,keywordScore:keyword,vectorScore:vector,score:Number(score.toFixed(8)),citation:`rag:${item.sourceId}:v${item.sourceVersion}:${item.id}:${item.contentHash}`};
  }).filter(item=>(item.keywordScore>=.5||item.vectorScore>=.45)&&item.score>=.2).sort((a,b)=>b.score-a.score||a.citation.localeCompare(b.citation)).slice(0,limit);
  const conflictCounts=new Map<string,number>();for(const item of ranked)if(item.conflictGroupId)conflictCounts.set(item.conflictGroupId,(conflictCounts.get(item.conflictGroupId)??0)+1);const hasConflicts=[...conflictCounts.values()].some(count=>count>1);
  return {status:ranked.length?"SUPPORTED" as const:"INSUFFICIENT_CONTEXT" as const,reasonCode:ranked.length?null:"NO_SUPPORTED_CONTEXT",items:ranked,hasConflicts,embeddingModel:MOCK_EMBEDDING_MODEL,assetExecutionAuthorized:false};
}
