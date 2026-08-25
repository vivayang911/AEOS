const {mkdirSync,writeFileSync}=require("node:fs");
const {dirname,resolve}=require("node:path");
require("dotenv").config({path:resolve(__dirname,"../../../.env"),quiet:true});
const {Pool}=require("pg");

const REQUEST_ID=process.env.AEOS_REVERSE_EVIDENCE_REQUEST_ID||"evreq_bf3e479163564867b284bbbe81cc7de8";
const DECISION_ID="decision_6967bcf81c7e43e9bba64b3bb5f7101a";
const GAP_ID="gap_8edafe59c3ef4af8aa63a0be3a47feff";
const EXPECTED_SUBJECT="0x444d510728fb8072351cb5d0e88432e6a8501dfa";
const EXPECTED_EVENTS=["PROPOSED","VALIDATED","QUEUED","DISCOVERING","NORMALIZED","INDEXED","SATISFIED"];
const fail=code=>{throw new Error(code)};

async function main(){
  if(!process.env.DATABASE_URL)fail("DATABASE_URL_REQUIRED");
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  const system=(text,values)=>pool.query(text,values);
  try{
    const owner=await system("SELECT organization_id FROM evidence_requests WHERE id=$1",[REQUEST_ID]);
    if(owner.rowCount!==1)fail("REVERSE_REQUEST_MISSING");
    const org=owner.rows[0].organization_id;
    const context=await system("SELECT s.user_id,m.role FROM auth_sessions s JOIN memberships m ON m.organization_id=s.active_organization_id AND m.user_id=s.user_id AND m.status='ACTIVE' WHERE s.active_organization_id=$1 AND s.revoked_at IS NULL AND s.expires_at>now() ORDER BY s.created_at DESC LIMIT 1",[org]);
    if(context.rowCount!==1)fail("REVERSE_REQUEST_ACTIVE_TENANT_CONTEXT_REQUIRED");
    const run=async(text,values)=>{const client=await pool.connect();try{await client.query("BEGIN READ ONLY");await client.query("SET LOCAL ROLE aeos_app");await client.query("SELECT set_config('app.current_organization_id',$1,true),set_config('app.current_user_id',$2,true),set_config('app.current_membership_role',$3,true),set_config('app.system_worker','off',true)",[org,context.rows[0].user_id,context.rows[0].role]);const result=await client.query(text,values);await client.query("COMMIT");return result}catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}};
    const request=await run("SELECT * FROM evidence_requests WHERE organization_id=$1 AND id=$2",[org,REQUEST_ID]);
    if(request.rowCount!==1)fail("REVERSE_REQUEST_RLS_READ_FAILED");
    const row=request.rows[0];
    if(row.decision_id!==DECISION_ID||row.requesting_role!=="Research"||row.gap_code!=="STALE_EVIDENCE"||row.gap_type!=="BALANCE"||row.source_chain_id!==11155111||row.subject!==EXPECTED_SUBJECT)fail("REVERSE_REQUEST_SCOPE_MISMATCH");
    if(JSON.stringify(row.required_fields)!==JSON.stringify(["amount","symbol"])||row.required_confirmations!==12||row.max_freshness_seconds!==300||row.priority!=="HIGH")fail("REVERSE_REQUEST_BOUND_MISMATCH");
    if(row.broker_version!=="deterministic-mock-evidence-broker-v1"||row.asset_execution_authorized!==false)fail("REVERSE_REQUEST_AUTHORITY_MISMATCH");

    const events=await run("SELECT ordinal,status,evidence_id,payload_hash,created_at FROM evidence_request_events WHERE organization_id=$1 AND request_id=$2 ORDER BY ordinal",[org,REQUEST_ID]);
    if(JSON.stringify(events.rows.map(item=>item.status))!==JSON.stringify(EXPECTED_EVENTS)||events.rows.some((item,index)=>item.ordinal!==index+1))fail("REVERSE_REQUEST_EVENT_SEQUENCE_INVALID");
    const evidenceId=events.rows.at(-1).evidence_id;if(!evidenceId)fail("REVERSE_REQUEST_EVIDENCE_MISSING");

    const evidence=await run("SELECT e.id,e.subject,e.predicate,e.value,e.chain,e.source,e.verification_status,e.freshness_status,e.freshness_expires_at,e.quality_score,e.observed_at,e.content_hash,r.provider,r.payload,r.content_hash raw_content_hash,c.classifier_version,c.labels,c.routes,c.classification_hash,c.asset_execution_authorized classification_asset_authority FROM evidence e JOIN raw_attestations r ON r.organization_id=e.organization_id AND r.id=e.raw_attestation_id JOIN evidence_classifications c ON c.organization_id=e.organization_id AND c.evidence_id=e.id WHERE e.organization_id=$1 AND e.id=$2",[org,evidenceId]);
    if(evidence.rowCount!==1)fail("REVERSE_REQUEST_EVIDENCE_LINEAGE_MISSING");
    const ev=evidence.rows[0];
    if(ev.subject?.id!==`eip155:11155111:${EXPECTED_SUBJECT}`||ev.subject?.type!=="wallet"||ev.predicate!=="asset.balance"||Number(ev.chain?.id)!==11155111||ev.source?.provider!=="mock-attestcoin-demand-v1"||ev.provider!=="mock-attestcoin-demand-v1"||ev.payload?.mockOnly!==true)fail("REVERSE_REQUEST_MOCK_LABEL_MISMATCH");
    if(ev.verification_status!=="VERIFIED"||ev.freshness_status!=="FRESH"||Number(ev.quality_score)!==80||ev.classifier_version!=="deterministic-evidence-classifier-v1"||ev.classification_asset_authority!==false)fail("REVERSE_REQUEST_EVIDENCE_STATE_INVALID");

    const lineage=await run("SELECT g.status,g.gap_type,g.source_chain_id,g.subject,g.gap_hash,g.asset_execution_authorized gap_asset_authority,l.evidence_request_id,l.agent_message_id,l.child_decision_id,l.link_hash,l.asset_execution_authorized link_asset_authority,m.sender_role,m.recipient_role,m.message_type,m.code,m.evidence_request_id message_request_id FROM decision_evidence_gaps g JOIN decision_evidence_gap_links l ON l.organization_id=g.organization_id AND l.gap_id=g.id JOIN agent_messages m ON m.organization_id=l.organization_id AND m.id=l.agent_message_id WHERE g.organization_id=$1 AND g.decision_id=$2 AND g.id=$3",[org,DECISION_ID,GAP_ID]);
    if(lineage.rowCount!==1)fail("REVERSE_REQUEST_GAP_LINK_MISSING");
    const link=lineage.rows[0];
    if(link.status!=="REFUSAL_ONLY"||link.gap_type!==null||link.source_chain_id!==null||link.subject!==null||link.evidence_request_id!==REQUEST_ID||link.child_decision_id!==null||link.sender_role!=="Research"||link.recipient_role!=="Governor"||link.message_type!=="REQUEST"||link.code!=="STALE_EVIDENCE"||link.message_request_id!==REQUEST_ID||link.gap_asset_authority!==false||link.link_asset_authority!==false)fail("REVERSE_REQUEST_IMMUTABLE_GAP_MISMATCH");
    const children=await run("SELECT count(*)::int count FROM decisions WHERE organization_id=$1 AND parent_decision_id=$2",[org,DECISION_ID]);
    if(children.rows[0].count!==0)fail("REVERSE_REQUEST_UNEXPECTED_CHILD_DECISION");
    const audit=await run("SELECT event_type,actor,data,payload_hash FROM audit_events WHERE organization_id=$1 AND object_type='evidence_request' AND object_id=$2 ORDER BY created_at,id",[org,REQUEST_ID]);
    const humanAudit=audit.rows.find(item=>item.event_type==="decision.evidence_gap_human_scoped");
    if(!humanAudit||humanAudit.actor?.type!=="human"||humanAudit.data?.mockOnly!==true||humanAudit.data?.networkAuthority!==false||humanAudit.data?.assetExecutionAuthorized!==false)fail("REVERSE_REQUEST_HUMAN_AUDIT_MISSING");
    const other=await system("SELECT id FROM organizations WHERE id<>$1 ORDER BY id LIMIT 1",[org]);
    if(other.rowCount!==1)fail("REVERSE_REQUEST_CROSS_TENANT_FIXTURE_REQUIRED");
    const crossTenantClient=await pool.connect();let hidden;try{await crossTenantClient.query("BEGIN READ ONLY");await crossTenantClient.query("SET LOCAL ROLE aeos_app");await crossTenantClient.query("SELECT set_config('app.current_organization_id',$1,true),set_config('app.current_user_id',$2,true),set_config('app.current_membership_role',$3,true),set_config('app.system_worker','off',true)",[other.rows[0].id,context.rows[0].user_id,context.rows[0].role]);hidden=await crossTenantClient.query("SELECT id FROM evidence_requests WHERE id=$1 UNION ALL SELECT id FROM evidence WHERE id=$2 UNION ALL SELECT id FROM decision_evidence_gap_links WHERE evidence_request_id=$1",[REQUEST_ID,evidenceId]);await crossTenantClient.query("COMMIT")}catch(error){await crossTenantClient.query("ROLLBACK");throw error}finally{crossTenantClient.release()}
    if(hidden.rowCount!==0)fail("REVERSE_REQUEST_CROSS_TENANT_LEAK");

    const recordedAt=new Date(),freshnessExpiresAt=new Date(ev.freshness_expires_at);
    const report={schemaVersion:"aeos.reverse-evidence-request-receipt.v1",status:"MOCK_EVIDENCE_REQUEST_SATISFIED",recordedAt:recordedAt.toISOString(),request:{id:REQUEST_ID,decisionId:DECISION_ID,gapId:GAP_ID,requestingRole:"Research",gapCode:"STALE_EVIDENCE",gapType:"BALANCE",sourceChainId:11155111,subject:EXPECTED_SUBJECT,requestHash:row.request_hash,brokerVersion:row.broker_version,lifecycle:EXPECTED_EVENTS},lineage:{originalGapStatus:"REFUSAL_ONLY",originalGapHash:link.gap_hash,a2a:`${link.sender_role}->${link.recipient_role}`,agentMessageId:link.agent_message_id,linkHash:link.link_hash,childDecisionId:null,originalGapImmutable:true},evidence:{id:evidenceId,predicate:ev.predicate,contentHash:ev.content_hash,rawContentHash:ev.raw_content_hash,classificationHash:ev.classification_hash,verificationStatus:ev.verification_status,recordedFreshnessStatus:ev.freshness_status,observedAt:new Date(ev.observed_at).toISOString(),freshnessExpiresAt:freshnessExpiresAt.toISOString(),currentlyFresh:recordedAt<freshnessExpiresAt,qualityScore:Number(ev.quality_score),provider:ev.provider,mockOnly:true},controls:{humanAuditPresent:true,crossTenantHidden:true,networkAuthority:false,signerCapability:false,broadcastCapability:false,assetExecutionAuthorized:false,automaticAgentRerun:false}};
    const output=resolve(process.env.AEOS_REVERSE_EVIDENCE_REQUEST_OUTPUT||resolve(__dirname,"../../../reports/live-demo/reverse-evidence-request-mock-v1.json"));mkdirSync(dirname(output),{recursive:true});writeFileSync(output,`${JSON.stringify(report,null,2)}\n`);
    console.log(JSON.stringify(report,null,2));
  }finally{await pool.end()}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"REVERSE_REQUEST_VERIFY_FAILED");process.exit(1)});
