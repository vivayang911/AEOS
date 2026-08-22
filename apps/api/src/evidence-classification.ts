import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { DecisionRole } from "./decision-engine";
import { hashValue } from "./decision-engine";

export const evidenceClassificationLabels=["LIQUIDITY","GROWTH","RISK","SECURITY","GOVERNANCE","TREASURY","PROTOCOL"] as const;
export type EvidenceClassificationLabel=typeof evidenceClassificationLabels[number];
export const evidenceClassificationVersion="deterministic-evidence-classifier-v1";

export type ClassifiableEvidence={id:string;contentHash:string;subject:unknown;predicate:string;value:unknown;source:unknown;verificationStatus:string};
export type EvidenceClassification={schemaVersion:"evidence.classification.v1";classifierVersion:string;evidenceId:string;evidenceContentHash:string;verificationStatus:string;labels:EvidenceClassificationLabel[];routes:DecisionRole[];reasons:string[];classificationHash:string;assetExecutionAuthorized:false};

const roleOrder:DecisionRole[]=["Governor","Research","Strategy","Quant","Risk","Compliance","Portfolio","Treasury"];
const routeMap:Record<EvidenceClassificationLabel,DecisionRole[]>={
  LIQUIDITY:["Research","Quant","Risk","Portfolio","Treasury"],GROWTH:["Research","Strategy","Quant","Portfolio"],
  RISK:["Research","Risk","Compliance","Portfolio"],SECURITY:["Research","Risk","Compliance","Treasury"],
  GOVERNANCE:["Governor","Strategy","Risk","Compliance","Treasury"],TREASURY:["Strategy","Quant","Risk","Portfolio","Treasury"],
  PROTOCOL:["Research","Strategy","Risk","Compliance"]
};
const tests:ReadonlyArray<{label:EvidenceClassificationLabel;pattern:RegExp}>=[
  {label:"LIQUIDITY",pattern:/liquidity|reserve|tvl|pool|balance|volume/},
  {label:"GROWTH",pattern:/growth|revenue|fee|user|adoption|yield|reward/},
  {label:"RISK",pattern:/risk|exposure|volatility|loss|debt|liquidation|insolven/},
  {label:"SECURITY",pattern:/security|exploit|vulnerab|audit|permission|upgrade|transaction\.included/},
  {label:"GOVERNANCE",pattern:/governance|proposal|vote|quorum|delegate|timelock/},
  {label:"TREASURY",pattern:/treasury|asset|balance|transfer|transaction|allocation|portfolio/},
  {label:"PROTOCOL",pattern:/protocol|contract|chain|bridge|blockchain|transaction/}
];

export function classifyEvidence(input:ClassifiableEvidence):EvidenceClassification{
  const navigationText=[input.predicate,input.subject,input.value,input.source].map(value=>typeof value==="string"?value:JSON.stringify(value)).join(" ").toLowerCase();
  const labels=tests.filter(test=>test.pattern.test(navigationText)).map(test=>test.label);
  if(!labels.length)labels.push("PROTOCOL");
  const stableLabels=evidenceClassificationLabels.filter(label=>labels.includes(label));
  const routes=roleOrder.filter(role=>stableLabels.some(label=>routeMap[label].includes(role)));
  const reasons=stableLabels.map(label=>`RULE_${label}_V1`);
  const basis={schemaVersion:"evidence.classification.v1" as const,classifierVersion:evidenceClassificationVersion,evidenceId:input.id,evidenceContentHash:input.contentHash,verificationStatus:input.verificationStatus,labels:stableLabels,routes,reasons,assetExecutionAuthorized:false as const};
  return {...basis,classificationHash:hashValue(basis)};
}

export function validateEvidenceClassification(value:EvidenceClassification,source:ClassifiableEvidence){
  if(value.evidenceId!==source.id||value.evidenceContentHash!==source.contentHash)throw new Error("Evidence classification source identity mismatch");
  if(value.verificationStatus!==source.verificationStatus)throw new Error("Evidence classification cannot change verification truth");
  if(value.assetExecutionAuthorized!==false)throw new Error("Evidence classification cannot grant asset authority");
  const expected=classifyEvidence(source);
  if(value.classificationHash!==expected.classificationHash||JSON.stringify(value)!==JSON.stringify(expected))throw new Error("Evidence classification is not deterministic");
  return value;
}

export async function persistEvidenceClassification(client:PoolClient,organizationId:string,source:ClassifiableEvidence){
  const result=validateEvidenceClassification(classifyEvidence(source),source);
  const saved=await client.query("INSERT INTO evidence_classifications(id,organization_id,evidence_id,schema_version,classifier_version,evidence_content_hash,verification_status,labels,routes,reasons,classification_hash,asset_execution_authorized) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false) ON CONFLICT(evidence_id,classifier_version) DO NOTHING RETURNING *",[`evclass_${randomUUID().replaceAll("-","")}`,organizationId,source.id,result.schemaVersion,result.classifierVersion,result.evidenceContentHash,result.verificationStatus,JSON.stringify(result.labels),JSON.stringify(result.routes),JSON.stringify(result.reasons),result.classificationHash]);
  if(saved.rowCount)return result;
  const existing=await client.query("SELECT classification_hash FROM evidence_classifications WHERE organization_id=$1 AND evidence_id=$2 AND classifier_version=$3",[organizationId,source.id,evidenceClassificationVersion]);
  if(!existing.rowCount||existing.rows[0].classification_hash!==result.classificationHash)throw new Error("Existing Evidence classification does not match deterministic output");
  return result;
}
