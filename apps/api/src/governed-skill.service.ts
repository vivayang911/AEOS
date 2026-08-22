import { BadRequestException,ConflictException,Injectable,NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { DatabaseService } from "./database.service";
import { CreateGovernedSkillDto } from "./governed-skill.dto";
import { GOVERNED_SKILL_BACKTEST_VERSION,GOVERNED_SKILL_SCHEMA_VERSION,GovernedSkillVersion,runGovernedSkillBacktest,validateGovernedSkillRule } from "./governed-skill-engine";
import { hashText,scanKnowledgeContent } from "./knowledge-engine";

const makeId=(prefix:string)=>`${prefix}_${randomUUID().replaceAll("-","")}`;
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`:JSON.stringify(value);
const hash=(value:unknown)=>hashText(canonical(value));
type Queryable={query:(text:string,values?:unknown[])=>Promise<any>};

export async function loadApprovedGovernedSkills(queryable:Queryable,org:string,ids:string[]):Promise<GovernedSkillVersion[]>{
  const unique=[...new Set(ids)].sort();if(unique.length!==ids.length||unique.length>8)throw new ConflictException("Governed Skill references must be unique and limited to eight versions");if(!unique.length)return[];
  const found=await queryable.query(`SELECT skill.id,skill.content_hash,skill.content
    FROM governed_skill_versions skill
   WHERE skill.organization_id=$1 AND skill.id=ANY($2::text[])
     AND (SELECT event.status FROM governed_skill_version_events event WHERE event.organization_id=skill.organization_id AND event.skill_version_id=skill.id ORDER BY event.ordinal DESC LIMIT 1)='APPROVED'
     AND EXISTS(SELECT 1 FROM governed_skill_backtests backtest WHERE backtest.organization_id=skill.organization_id AND backtest.skill_version_id=skill.id AND backtest.suite_version=$3 AND backtest.passed=true)
     AND NOT EXISTS(SELECT 1 FROM unnest(skill.source_memory_ids) source_id WHERE NOT EXISTS(
       SELECT 1 FROM organization_memories memory WHERE memory.id=source_id AND memory.organization_id=skill.organization_id AND memory.memory_type='ENTERPRISE'
         AND (memory.valid_until IS NULL OR memory.valid_until>now())
         AND (SELECT event.status FROM memory_events event WHERE event.organization_id=memory.organization_id AND event.memory_id=memory.id ORDER BY event.ordinal DESC LIMIT 1)='APPROVED'))
   ORDER BY skill.id`,[org,unique,GOVERNED_SKILL_BACKTEST_VERSION]);
  if(found.rowCount!==unique.length)throw new ConflictException("Every Policy Skill reference must be approved, backtested and backed by current approved enterprise memory");
  return found.rows.map((row:any)=>({id:row.id,contentHash:row.content_hash,rule:validateGovernedSkillRule(row.content.rule)}));
}

@Injectable()
export class GovernedSkillService{
  constructor(private readonly db:DatabaseService){}
  async create(org:string,actorId:string,input:CreateGovernedSkillDto){
    const scan=scanKnowledgeContent(`${input.name}\n${input.description}`);if(!scan.safe)throw new BadRequestException(`Governed Skill content rejected: ${scan.codes.join(",")}`);
    let rule;try{rule=validateGovernedSkillRule(structuredClone(input.rule))}catch(error){throw new BadRequestException(error instanceof Error?error.message:"INVALID_GOVERNED_SKILL")}
    const sourceMemoryIds=[...new Set(input.sourceMemoryIds)].sort();if(sourceMemoryIds.length!==input.sourceMemoryIds.length)throw new BadRequestException("Governed Skill source memories must be unique");
    const applicableAgentRoles=[...new Set(input.applicableAgentRoles)].sort();if(applicableAgentRoles.length!==input.applicableAgentRoles.length)throw new BadRequestException("Governed Skill Agent roles must be unique");
    return this.db.transaction(async client=>{
      const sources=await client.query(`SELECT memory.id FROM organization_memories memory WHERE memory.organization_id=$1 AND memory.id=ANY($2::text[]) AND memory.memory_type='ENTERPRISE' AND (memory.valid_until IS NULL OR memory.valid_until>now()) AND (SELECT event.status FROM memory_events event WHERE event.organization_id=memory.organization_id AND event.memory_id=memory.id ORDER BY event.ordinal DESC LIMIT 1)='APPROVED'`,[org,sourceMemoryIds]);
      if(sources.rowCount!==sourceMemoryIds.length)throw new NotFoundException("Every Skill source must be current approved ENTERPRISE memory in this organization");
      await client.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE",[org]);
      const latest=await client.query("SELECT coalesce(max(version),0)::int+1 AS version FROM governed_skill_versions WHERE organization_id=$1 AND skill_key=$2",[org,input.skillKey]);const version=latest.rows[0].version;
      const content={schemaVersion:GOVERNED_SKILL_SCHEMA_VERSION,skillKey:input.skillKey,name:input.name,description:input.description,version,applicableAgentRoles,rule,sourceMemoryIds};const contentHash=hash(content);const skillId=makeId("skillv");
      await client.query("INSERT INTO governed_skill_versions(id,organization_id,skill_key,version,name,schema_version,content,content_hash,source_memory_ids,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[skillId,org,input.skillKey,version,input.name,GOVERNED_SKILL_SCHEMA_VERSION,content,contentHash,sourceMemoryIds,actorId]);
      await this.event(client,org,skillId,0,"DRAFT",actorId,"Awaiting human approval after deterministic backtest");
      const backtestInput={schemaVersion:"treasury.governed-skill-backtest-input.v1",skillVersionId:skillId,skillContentHash:contentHash,suiteVersion:GOVERNED_SKILL_BACKTEST_VERSION,rule};const backtestResult=runGovernedSkillBacktest(rule);
      await client.query("INSERT INTO governed_skill_backtests(id,organization_id,skill_version_id,suite_version,input,input_hash,result,result_hash,passed,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[makeId("skilltest"),org,skillId,GOVERNED_SKILL_BACKTEST_VERSION,backtestInput,hash(backtestInput),backtestResult,hash(backtestResult),backtestResult.passed,actorId]);
      await this.audit(client,org,"skill.version_drafted",skillId,{actorId,contentHash,sourceMemoryIds,backtestPassed:backtestResult.passed,historicalPerformanceClaimed:false,assetExecutionAuthorized:false});
      return{id:skillId,organizationId:org,skillKey:input.skillKey,version,status:"DRAFT",content,contentHash,sourceMemoryIds,backtest:backtestResult,advisoryOnly:true,assetExecutionAuthorized:false};
    });
  }
  async approve(org:string,id:string,actorId:string,rationale:string){return this.transition(org,id,actorId,rationale,"APPROVED")}
  async retire(org:string,id:string,actorId:string,rationale:string){return this.transition(org,id,actorId,rationale,"RETIRED")}
  async list(org:string){const rows=await this.db.query(`SELECT skill.*,event.status,backtest.result AS backtest_result,backtest.passed AS backtest_passed FROM governed_skill_versions skill JOIN LATERAL(SELECT status FROM governed_skill_version_events WHERE organization_id=skill.organization_id AND skill_version_id=skill.id ORDER BY ordinal DESC LIMIT 1)event ON true LEFT JOIN governed_skill_backtests backtest ON backtest.organization_id=skill.organization_id AND backtest.skill_version_id=skill.id AND backtest.suite_version=$2 WHERE skill.organization_id=$1 ORDER BY skill.skill_key,skill.version DESC`,[org,GOVERNED_SKILL_BACKTEST_VERSION]);return{items:rows.rows.map((row:any)=>this.map(row))}}
  async get(org:string,id:string){const row=await this.db.query(`SELECT skill.*,event.status,backtest.result AS backtest_result,backtest.passed AS backtest_passed FROM governed_skill_versions skill JOIN LATERAL(SELECT status FROM governed_skill_version_events WHERE organization_id=skill.organization_id AND skill_version_id=skill.id ORDER BY ordinal DESC LIMIT 1)event ON true LEFT JOIN governed_skill_backtests backtest ON backtest.organization_id=skill.organization_id AND backtest.skill_version_id=skill.id AND backtest.suite_version=$3 WHERE skill.organization_id=$1 AND skill.id=$2`,[org,id,GOVERNED_SKILL_BACKTEST_VERSION]);if(!row.rowCount)throw new NotFoundException("Governed Skill version not found");return this.map(row.rows[0])}
  private async transition(org:string,id:string,actorId:string,rationale:string,target:"APPROVED"|"RETIRED"){
    return this.db.transaction(async client=>{const skill=await client.query("SELECT * FROM governed_skill_versions WHERE organization_id=$1 AND id=$2 FOR UPDATE",[org,id]);if(!skill.rowCount)throw new NotFoundException("Governed Skill version not found");const latest=await client.query("SELECT ordinal,status FROM governed_skill_version_events WHERE organization_id=$1 AND skill_version_id=$2 ORDER BY ordinal DESC LIMIT 1 FOR UPDATE",[org,id]);const expected=target==="APPROVED"?"DRAFT":"APPROVED";if(latest.rows[0].status!==expected)throw new ConflictException(`Governed Skill transition ${latest.rows[0].status} -> ${target} is invalid`);if(target==="APPROVED"){const backtest=await client.query("SELECT passed FROM governed_skill_backtests WHERE organization_id=$1 AND skill_version_id=$2 AND suite_version=$3",[org,id,GOVERNED_SKILL_BACKTEST_VERSION]);if(!backtest.rows[0]?.passed)throw new ConflictException("Governed Skill cannot be approved without a passing deterministic backtest")}
      await this.event(client,org,id,latest.rows[0].ordinal+1,target,actorId,rationale);await this.audit(client,org,`skill.version_${target.toLowerCase()}`,id,{actorId,previousStatus:expected,contentHash:skill.rows[0].content_hash,assetExecutionAuthorized:false});return{...(await this.mapFromClient(client,org,id)),status:target};});
  }
  private async mapFromClient(client:PoolClient,org:string,id:string){const row=await client.query(`SELECT skill.*,backtest.result AS backtest_result,backtest.passed AS backtest_passed FROM governed_skill_versions skill LEFT JOIN governed_skill_backtests backtest ON backtest.organization_id=skill.organization_id AND backtest.skill_version_id=skill.id AND backtest.suite_version=$3 WHERE skill.organization_id=$1 AND skill.id=$2`,[org,id,GOVERNED_SKILL_BACKTEST_VERSION]);return this.map(row.rows[0])}
  private map(row:any){return{id:row.id,organizationId:row.organization_id,skillKey:row.skill_key,version:row.version,status:row.status,content:row.content,contentHash:row.content_hash,sourceMemoryIds:row.source_memory_ids,backtest:row.backtest_result??null,backtestPassed:row.backtest_passed??false,advisoryOnly:true,assetExecutionAuthorized:false,createdAt:new Date(row.created_at).toISOString()}}
  private event(client:PoolClient,org:string,skillId:string,ordinal:number,status:string,actorId:string,rationale:string){const payload={skillId,ordinal,status,actorId,rationale};return client.query("INSERT INTO governed_skill_version_events(id,organization_id,skill_version_id,ordinal,status,actor_id,rationale,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[makeId("skillevent"),org,skillId,ordinal,status,actorId,rationale,hash(payload)])}
  private audit(client:PoolClient,org:string,eventType:string,objectId:string,data:unknown){const payload={eventType,organizationId:org,objectType:"governed_skill",objectId,data};return client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,$3,$4,$5,'governed_skill',$6,$7,$8)",[makeId("audit"),org,eventType,{type:"human",id:(data as any).actorId},eventType,objectId,data,hash(payload)])}
}
