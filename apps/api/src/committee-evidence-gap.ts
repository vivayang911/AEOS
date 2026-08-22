import { DecisionRole,hashValue } from "./decision-engine";

export const committeeGapSchemaVersion="committee.evidence-gap.v1" as const;
export const committeeGapCodes=["MISSING_EVIDENCE","STALE_EVIDENCE","CONFLICTING_EVIDENCE","LOW_QUALITY_EVIDENCE","UNSUPPORTED_CONTEXT"] as const;
export type CommitteeGapCode=typeof committeeGapCodes[number];
export type CommitteeGap={schemaVersion:typeof committeeGapSchemaVersion;code:CommitteeGapCode;sourceBlocker:string;requestingRole:DecisionRole;status:"REQUESTABLE"|"REFUSAL_ONLY";gapType:"BALANCE"|"TRANSACTION"|"EVENT"|null;sourceChainId:number|null;subject:string|null;rationale:string;supportingEvidenceIds:string[];gapHash:string;assetExecutionAuthorized:false};

const blockerMap:Record<string,{code:CommitteeGapCode;role:DecisionRole;gapType:"BALANCE"|null}>={
  STALE_EVIDENCE:{code:"STALE_EVIDENCE",role:"Research",gapType:"BALANCE"},
  LOW_QUALITY_EVIDENCE:{code:"LOW_QUALITY_EVIDENCE",role:"Research",gapType:"BALANCE"},
  UNVERIFIED_EVIDENCE:{code:"UNSUPPORTED_CONTEXT",role:"Compliance",gapType:null},
  UNRESOLVED_CONFLICT:{code:"CONFLICTING_EVIDENCE",role:"Risk",gapType:null},
  PROMPT_INJECTION_DETECTED:{code:"UNSUPPORTED_CONTEXT",role:"Compliance",gapType:null},
  EXTREME_NUMERIC_VALUE:{code:"UNSUPPORTED_CONTEXT",role:"Quant",gapType:null}
};

function evmAddress(subject:unknown){
  const candidate=typeof subject==="string"?subject:subject&&typeof subject==="object"?String((subject as any).id??"").split(":").at(-1)??"":"";
  return /^0x[0-9a-fA-F]{40}$/.test(candidate)?candidate.toLowerCase():null;
}

export function deriveCommitteeEvidenceGaps(blockers:string[],evidence:Array<{id:string;subject:unknown;chain?:{id?:number}}>):CommitteeGap[]{
  const supportingEvidenceIds=[...new Set(evidence.map(item=>item.id))].sort();
  const subject=evidence.map(item=>evmAddress(item.subject)).find(Boolean)??null;
  const sourceChainId=Number(evidence[0]?.chain?.id);const supportedChain=[11155111,80002].includes(sourceChainId)?sourceChainId:null;
  const sourceBlockers=[...new Set(blockers)].sort();
  if(!sourceBlockers.length&&!evidence.length)sourceBlockers.push("MISSING_EVIDENCE");
  return sourceBlockers.map(sourceBlocker=>{
    const mapped=sourceBlocker==="MISSING_EVIDENCE"?{code:"MISSING_EVIDENCE" as const,role:"Research" as const,gapType:"BALANCE" as const}:blockerMap[sourceBlocker]??{code:"UNSUPPORTED_CONTEXT" as const,role:"Governor" as const,gapType:null};
    const requestable=Boolean(mapped.gapType&&subject&&supportedChain);
    const basis={schemaVersion:committeeGapSchemaVersion,code:mapped.code,sourceBlocker,requestingRole:mapped.role,status:requestable?"REQUESTABLE" as const:"REFUSAL_ONLY" as const,gapType:requestable?mapped.gapType:null,sourceChainId:requestable?supportedChain:null,subject:requestable?subject:null,rationale:requestable?`${mapped.role} requires bounded replacement Evidence for ${mapped.code}.`:`${mapped.code} cannot be resolved through a safe bounded provider request from the frozen snapshot.`,supportingEvidenceIds,assetExecutionAuthorized:false as const};
    return {...basis,gapHash:hashValue(basis)};
  });
}
