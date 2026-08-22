const path=require("node:path");
const{Pool}=require("pg");
const{firstValueFrom,take,timeout,toArray}=require("rxjs");
const{DatabaseService}=require("../dist/database.service");
const{CockpitProjectionNotificationService}=require("../dist/cockpit-projection-notification.service");

const STORM_EVENTS=128;
const waitFor=async(predicate,timeoutMs=10000)=>{const started=Date.now();while(Date.now()-started<timeoutMs){if(predicate())return Date.now()-started;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error("Timed out waiting for fanout recovery")};
async function insertAudit(db,org,eventId,eventType="cockpit.fanout_recovery_fixture"){
  return db.runAsSystem(()=>db.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash)VALUES($1,$2,$3,$4,$3,'fixture',$1,$5,$6)",[eventId,org,eventType,{type:"system",id:"fanout-recovery-fixture"},{assetExecutionAuthorized:false},`0x${"2".repeat(64)}`]));
}

async function main(){
  process.env.DATABASE_URL??="postgresql://aeos:aeos@127.0.0.1:5432/aeos";
  process.env.MIGRATIONS_DIR??=path.resolve(__dirname,"../../../infra/migrations");
  const db=new DatabaseService();await db.onModuleInit();
  const controlPool=new Pool({connectionString:process.env.DATABASE_URL});
  const listenerA=new CockpitProjectionNotificationService(db),listenerB=new CockpitProjectionNotificationService(db);
  const suffix=Date.now().toString(36),org=`org_fanout_recovery_${suffix}`;
  try{
    await db.runAsSystem(()=>db.query("INSERT INTO organizations(id,name,status)VALUES($1,'Fanout Recovery','ACTIVE')",[org]));
    await listenerA.onModuleInit();await listenerB.onModuleInit();
    const applicationName=`aeos-cockpit-fanout:${process.pid}`;
    const backends=await controlPool.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 ORDER BY backend_start DESC",[applicationName]);
    if(backends.rows.length<2)throw new Error(`Expected two fanout listener backends, found ${backends.rows.length}`);
    await controlPool.query("SELECT pg_terminate_backend($1)",[backends.rows[0].pid]);
    const reconnectMs=await waitFor(()=>listenerA.metrics().fanoutListenerConnected===1&&listenerB.metrics().fanoutListenerConnected===1&&listenerA.metrics().fanoutReconnectsTotal+listenerB.metrics().fanoutReconnectsTotal>=1);
    const recoveryId=`audit_fanout_recovered_${suffix}`;
    const recoveredA=firstValueFrom(listenerA.forOrganization(org).pipe(take(1),timeout({first:5000}))),recoveredB=firstValueFrom(listenerB.forOrganization(org).pipe(take(1),timeout({first:5000})));
    await insertAudit(db,org,recoveryId);
    const recovered=await Promise.all([recoveredA,recoveredB]);
    const stormA=firstValueFrom(listenerA.forOrganization(org).pipe(take(STORM_EVENTS),toArray(),timeout({each:10000}))),stormB=firstValueFrom(listenerB.forOrganization(org).pipe(take(STORM_EVENTS),toArray(),timeout({each:10000})));
    const stormStarted=Date.now();
    await db.runAsSystem(()=>db.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) SELECT $1||i::text,$2,'cockpit.fanout_storm_fixture',$3,'cockpit.fanout_storm_fixture','fixture',$1||i::text,$4,$5 FROM generate_series(1,$6) i",[`audit_fanout_storm_${suffix}_`,org,{type:"system",id:"fanout-recovery-fixture"},{assetExecutionAuthorized:false},`0x${"3".repeat(64)}`,STORM_EVENTS]));
    const[eventsA,eventsB]=await Promise.all([stormA,stormB]),stormDeliveryMs=Date.now()-stormStarted;
    const uniqueA=new Set(eventsA.map(event=>event.eventId)),uniqueB=new Set(eventsB.map(event=>event.eventId));
    const result={listenerBackendTerminated:true,reconnected:listenerA.metrics().fanoutReconnectsTotal+listenerB.metrics().fanoutReconnectsTotal>=1,reconnectObservedMs:reconnectMs,recoveryDeliveredToBoth:recovered.every(event=>event.eventId===recoveryId),stormEventsPerListener:STORM_EVENTS,stormDeliveredToBoth:eventsA.length===STORM_EVENTS&&eventsB.length===STORM_EVENTS&&uniqueA.size===STORM_EVENTS&&uniqueB.size===STORM_EVENTS,stormDeliveryObservedMs:stormDeliveryMs,listenerA:listenerA.metrics(),listenerB:listenerB.metrics(),tenantLabelsExposed:false,assetExecutionAuthorized:eventsA.some(event=>event.assetExecutionAuthorized!==false)||eventsB.some(event=>event.assetExecutionAuthorized!==false)};
    if(!result.reconnected||!result.recoveryDeliveredToBoth||!result.stormDeliveredToBoth||result.tenantLabelsExposed!==false||result.assetExecutionAuthorized!==false)throw new Error(`Cockpit fanout recovery assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  }finally{
    await listenerA.onModuleDestroy();await listenerB.onModuleDestroy();
    await db.runAsSystem(()=>db.query("DELETE FROM organizations WHERE id=$1",[org])).catch(()=>undefined);
    await controlPool.end();
    await db.onModuleDestroy();
  }
}
main().catch(error=>{console.error(error);process.exit(1)});
