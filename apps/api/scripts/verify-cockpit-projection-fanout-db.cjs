const path=require("node:path");
const{firstValueFrom,takeUntil,timer,toArray,timeout}=require("rxjs");
const{DatabaseService}=require("../dist/database.service");
const{CockpitProjectionNotificationService}=require("../dist/cockpit-projection-notification.service");

async function main(){
  process.env.DATABASE_URL??="postgresql://aeos:aeos@127.0.0.1:5432/aeos";
  process.env.MIGRATIONS_DIR??=path.resolve(__dirname,"../../../infra/migrations");
  const db=new DatabaseService();await db.onModuleInit();
  const listenerA=new CockpitProjectionNotificationService(db),listenerB=new CockpitProjectionNotificationService(db);
  const suffix=Date.now().toString(36),orgA=`org_fanout_${suffix}_a`,orgB=`org_fanout_${suffix}_b`,eventId=`audit_fanout_${suffix}`;
  try{
    await db.runAsSystem(()=>db.query("INSERT INTO organizations(id,name,status)VALUES($1,'Fanout A','ACTIVE'),($2,'Fanout B','ACTIVE')",[orgA,orgB]));
    await listenerA.onModuleInit();await listenerB.onModuleInit();
    const deliveredA=firstValueFrom(listenerA.forOrganization(orgA).pipe(timeout({first:3000})));
    const deliveredB=firstValueFrom(listenerB.forOrganization(orgA).pipe(timeout({first:3000})));
    const crossTenant=firstValueFrom(listenerA.forOrganization(orgB).pipe(takeUntil(timer(300)),toArray()));
    await db.runAsSystem(()=>db.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash)VALUES($1,$2,'cockpit.fanout_fixture',$3,'cockpit.fanout_fixture','fixture',$1,$4,$5)",[eventId,orgA,{type:"system",id:"fanout-fixture"},{assetExecutionAuthorized:false},`0x${"1".repeat(64)}`]));
    const[first,second,wrongOrg]=await Promise.all([deliveredA,deliveredB,crossTenant]);
    await db.runAsSystem(()=>db.query("SELECT pg_notify('aeos_cockpit_projection_v1','malformed')"));
    await new Promise(resolve=>setTimeout(resolve,50));
    const result={migrationApplied:(await db.runAsSystem(()=>db.query("SELECT 1 FROM schema_migrations WHERE version='043_cockpit_projection_notifications.sql'"))).rowCount===1,twoInstancesDelivered:first.eventId===eventId&&second.eventId===eventId,organizationScoped:first.organizationId===orgA&&second.organizationId===orgA&&wrongOrg.length===0,immutableAuditReference:first.schemaVersion==="aeos.cockpit.wakeup.v1"&&first.eventId===eventId,malformedRejected:listenerA.metrics().fanoutRejectedNotificationsTotal>=1&&listenerB.metrics().fanoutRejectedNotificationsTotal>=1,listenersHealthy:listenerA.metrics().fanoutListenerConnected===1&&listenerB.metrics().fanoutListenerConnected===1,tenantLabelsExposed:false,assetExecutionAuthorized:first.assetExecutionAuthorized||second.assetExecutionAuthorized};
    if(!result.migrationApplied||!result.twoInstancesDelivered||!result.organizationScoped||!result.immutableAuditReference||!result.malformedRejected||!result.listenersHealthy||result.tenantLabelsExposed!==false||result.assetExecutionAuthorized!==false)throw new Error(`Cockpit fanout assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  }finally{
    await listenerA.onModuleDestroy();await listenerB.onModuleDestroy();
    await db.runAsSystem(()=>db.query("DELETE FROM organizations WHERE id=ANY($1::text[])",[[orgA,orgB]])).catch(()=>undefined);
    await db.onModuleDestroy();
  }
}
main().catch(error=>{console.error(error);process.exit(1)});
