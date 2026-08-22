const path=require("node:path");
const {Pool}=require("pg");
const {Wallet}=require("ethers");
const {DatabaseService}=require("../dist/database.service");
const {OrganizationConfigurationService}=require("../dist/organization-configuration.service");
const {MockOrganizationConfigurationAdapter}=require("../dist/organization-configuration-adapter");

async function main(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");process.env.MIGRATIONS_DIR??=path.resolve(__dirname,"../../../infra/migrations");
  const migrations=new DatabaseService();await migrations.onModuleInit();await migrations.onModuleDestroy();
  const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const wallet=Wallet.createRandom();
    await client.query("INSERT INTO organizations(id,name,status) VALUES('org_config_integration','Configuration Integration','ACTIVE')");
    await client.query("INSERT INTO users(id,wallet_address) VALUES('user_config_integration',$1)",[wallet.address.toLowerCase()]);
    await client.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES('membership_config_integration','org_config_integration','user_config_integration','ADMIN','ACTIVE')");
    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id','org_config_integration',true),set_config('app.current_user_id','user_config_integration',true),set_config('app.current_membership_role','ADMIN',true),set_config('app.system_worker','off',true)");
    const scopedDb={query:(text,values=[])=>client.query(text,values),transaction:(work)=>work(client)};
    const service=new OrganizationConfigurationService(scopedDb,new MockOrganizationConfigurationAdapter());
    const auth={sessionId:"session_config_integration",userId:"user_config_integration",walletAddress:wallet.address,activeOrganizationId:"org_config_integration",role:"ADMIN",expiresAt:new Date(Date.now()+60000).toISOString()};
    const input={networkName:"Creditcoin Testnet",chainId:102031,governorAddress:"0x1111111111111111111111111111111111111111",timelockAddress:"0x2222222222222222222222222222222222222222",safeAddress:"0x3333333333333333333333333333333333333333",treasuryAddress:"0x3333333333333333333333333333333333333333",treasuryGuardAddress:"0x4444444444444444444444444444444444444444",blockExplorerUrl:"https://creditcoin-testnet.blockscout.com"};
    const prepared=await service.prepare(auth,input);const signature=await wallet.signMessage(prepared.message);const activated=await service.activate(auth,prepared.requestId,prepared.message,signature);
    const stored=await client.query("SELECT * FROM organization_configuration_versions WHERE organization_id='org_config_integration'");
    const columns=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN('organization_configuration_requests','organization_configuration_versions')");
    let replayRejected=false;try{await service.activate(auth,prepared.requestId,prepared.message,signature)}catch(error){replayRejected=String(error.message).includes("consumed")}
    await client.query("SAVEPOINT config_immutable");let immutableVersion=false;try{await client.query("UPDATE organization_configuration_versions SET config='{}'::jsonb WHERE id=$1",[activated.id])}catch(error){immutableVersion=String(error.message).includes("immutable");await client.query("ROLLBACK TO SAVEPOINT config_immutable")}
    const audit=await client.query("SELECT data FROM audit_events WHERE organization_id='org_config_integration' AND object_id=$1",[activated.id]);
    await client.query("SELECT set_config('app.current_organization_id','org_other',true)");
    const crossTenant=await client.query("SELECT count(*)::int AS count FROM organization_configuration_versions WHERE id=$1",[activated.id]);
    await client.query("ROLLBACK");
    const result={
      migrationApplied:(await pool.query("SELECT 1 FROM schema_migrations WHERE version='017_organization_configuration.sql'")).rowCount===1,
      mockExplicit:activated.inspection.status==="MOCK_ONLY"&&activated.inspection.mockOnly===true&&activated.inspection.onchainInterfacesVerified===false,
      adminSignatureVerified:activated.activatedBy==="user_config_integration"&&replayRejected,
      signatureAndKeySchemaAbsent:!columns.rows.some((row)=>row.column_name.includes("signature")||row.column_name.includes("private_key")),
      immutableVersion,
      auditRecorded:audit.rowCount===1&&audit.rows[0].data.signatureStored===false&&audit.rows[0].data.assetExecutionAuthorized===false,
      crossTenantHidden:crossTenant.rows[0].count===0,
      deterministicVersion:stored.rowCount===1&&stored.rows[0].version===1&&stored.rows[0].content_hash===prepared.contentHash,
      authorityWithheld:prepared.assetExecutionAuthorized===false&&activated.assetExecutionAuthorized===false
    };
    if(!Object.values(result).every((value)=>value===true))throw new Error(`Organization configuration assertions failed: ${JSON.stringify(result)}`);console.log(JSON.stringify(result));
  }finally{client.release();await pool.end()}
}
main().catch((error)=>{console.error(error);process.exit(1)});
