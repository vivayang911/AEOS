import { hashValue } from "./decision-engine";
import { OutboxEnvelope } from "./outbox-publisher";

export const ALERT_CONSUMER="alert-rules-v1";
export const ALERT_RULE_VERSION="aeos-alert-rules.v1";
export type AlertSeverity="MEDIUM"|"HIGH"|"CRITICAL";
export interface AlertClassification{severity:AlertSeverity;category:string;titleCode:string;details:Record<string,unknown>}

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const fixed=(severity:AlertSeverity,category:string,titleCode:string,details:Record<string,unknown>={}):AlertClassification=>({severity,category,titleCode,details});

export function classifyAlert(event:Readonly<OutboxEnvelope>):AlertClassification|null{
  if(event.type==="evidence.rejected"||event.type==="attestcoin.proof_rejected")return fixed("HIGH","EVIDENCE_INTEGRITY","EVIDENCE_VERIFICATION_REJECTED",{sourceEventType:event.type});
  if(event.type==="attestcoin.provider_unavailable")return fixed("HIGH","PROVIDER_HEALTH","ATTESTCOIN_PROVIDER_UNAVAILABLE");
  if(event.type==="evidence.stale")return fixed("HIGH","EVIDENCE_FRESHNESS","EVIDENCE_BECAME_STALE");
  if(event.type==="decision.job_failed")return fixed("HIGH","DECISION_PIPELINE","DECISION_JOB_FAILED");
  if(event.type==="policy.simulation_blocked")return fixed("MEDIUM","POLICY_GUARDRAIL","POLICY_SIMULATION_BLOCKED");
  if(event.type==="organization.configuration_activated")return fixed("MEDIUM","CONFIGURATION_CHANGE","ORGANIZATION_CONFIGURATION_CHANGED");
  if(event.type==="membership.changed"||event.type==="organization.membership_changed"||event.type==="organization.permission_changed")return fixed("HIGH","PERMISSION_CHANGE","ORGANIZATION_PERMISSION_CHANGED",{sourceEventType:event.type});
  if(event.type==="proposal.state_unknown")return fixed("HIGH","GOVERNANCE_STATE","PROPOSAL_STATE_UNKNOWN");
  if(event.type==="security.paused"||event.type==="treasury_guard.paused")return fixed("CRITICAL","EMERGENCY_CONTROL","TREASURY_OPERATIONS_PAUSED",{sourceEventType:event.type});
  if(event.type==="execution.reconciliation_attempted"){
    const data=record(event.data);const outcome=typeof data.outcome==="string"?data.outcome:"UNKNOWN";const errorCode=typeof data.errorCode==="string"?data.errorCode:null;
    if(outcome==="FAILED_TERMINAL"||outcome==="REJECTED")return fixed("CRITICAL","EXECUTION_SAFETY","EXECUTION_RECONCILIATION_TERMINAL",{outcome,errorCode});
    if(outcome==="FAILED_RETRYABLE")return fixed("HIGH","EXECUTION_SAFETY","EXECUTION_RECONCILIATION_RETRYABLE",{outcome,errorCode});
  }
  return null;
}

export const alertContentHash=(event:Readonly<OutboxEnvelope>,classification:AlertClassification)=>hashValue({schemaVersion:ALERT_RULE_VERSION,organizationId:event.organization_id,sourceEventId:event.id,sourceEventType:event.type,...classification,notificationAdapter:"mock-local-v1"});
export const alertAdapterConfiguration=()=>({mode:"mock",adapter:"mock-local-v1",consumer:ALERT_CONSUMER,networkAccess:false,credentialsRequired:false,signerCapability:false,broadcastCapability:false,assetExecutionAuthorized:false});
