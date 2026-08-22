const path=require("node:path");
const{spawn}=require("node:child_process");
const{Wallet}=require("ethers");
const{Pool}=require("pg");

const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForReady(base,child){for(let attempt=0;attempt<80;attempt++){if(child.exitCode!==null)throw new Error(`API exited before readiness (${child.exitCode})`);try{const response=await fetch(`${base}/health/ready`);if(response.ok)return}catch{}await delay(125)}throw new Error("API readiness timed out")}
async function json(base,route,options={}){const response=await fetch(`${base}${route}`,options),text=await response.text();let body;try{body=JSON.parse(text)}catch{body=text}if(!response.ok)throw new Error(`${route} failed ${response.status}: ${JSON.stringify(body)}`);return{response,body}}
function sseReader(body){const reader=body.getReader(),decoder=new TextDecoder();let buffer="",queue=[];return{async nextProjection(timeoutMs=5000){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){while(queue.length){const block=queue.shift(),message={};for(const line of block.split(/\r?\n/)){const index=line.indexOf(":");if(index<0)continue;const key=line.slice(0,index),value=line.slice(index+1).trimStart();if(key==="data")message.data=(message.data??"")+value;else message[key]=value}if(message.event==="projection"){message.data=JSON.parse(message.data);return message}}const remaining=deadline-Date.now();const result=await Promise.race([reader.read(),delay(remaining).then(()=>({timeout:true}))]);if(result.timeout)break;if(result.done)throw new Error("SSE stream ended before projection");buffer+=decoder.decode(result.value,{stream:true});const blocks=buffer.split(/\r?\n\r?\n/);buffer=blocks.pop()??"";queue.push(...blocks.filter(Boolean))}throw new Error("Timed out waiting for SSE projection")},cancel:()=>reader.cancel().catch(()=>undefined)}}
async function waitForLeaseCount(pool,organizationId,expected){for(let attempt=0;attempt<40;attempt++){const result=await pool.query("SELECT count(*)::int AS count FROM cockpit_stream_leases WHERE organization_id=$1 AND expires_at>now()",[organizationId]);if(Number(result.rows[0].count)===expected)return true;await delay(50)}return false}

async function main(){
  process.env.DATABASE_URL??="postgresql://aeos:aeos@127.0.0.1:5432/aeos";
  const port=4600+Math.floor(Math.random()*150),base=`http://127.0.0.1:${port}/api/v1`,suffix=Date.now().toString(36),logs=[];
  const child=spawn(process.execPath,[path.resolve(__dirname,"../dist/main.js")],{cwd:path.resolve(__dirname,"../../.."),env:{...process.env,API_PORT:String(port),NODE_ENV:"development",SIWE_DOMAIN:"localhost:3000",SIWE_URI:"http://localhost:3000",WEB_ORIGIN:"http://localhost:3000",COCKPIT_SSE_MAX_PER_ORGANIZATION:"8",COCKPIT_SSE_MAX_TOTAL:"64"},stdio:["ignore","pipe","pipe"],windowsHide:true});
  child.stdout.on("data",chunk=>logs.push(chunk.toString()));child.stderr.on("data",chunk=>logs.push(chunk.toString()));
  const pool=new Pool({connectionString:process.env.DATABASE_URL}),controllers=[],readers=[];
  try{
    await waitForReady(base,child);
    const wallet=Wallet.createRandom(),challenge=(await json(base,"/auth/nonce",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({walletAddress:wallet.address,chainId:102031})})).body;
    const verified=await json(base,"/auth/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({challengeId:challenge.challengeId,message:challenge.message,signature:await wallet.signMessage(challenge.message)})});
    const setCookie=verified.response.headers.get("set-cookie")??"",cookie=setCookie.split(";")[0],csrf=verified.body.csrfToken;
    if(!cookie.startsWith("aeos_session=")||typeof csrf!=="string")throw new Error("Authenticated session boundary missing");
    const commandHeaders={"content-type":"application/json",cookie,origin:"http://localhost:3000","x-csrf-token":csrf,"idempotency-key":`sse-load-${suffix}`};
    const organization=(await json(base,"/organizations",{method:"POST",headers:commandHeaders,body:JSON.stringify({name:`SSE Load ${suffix}`})})).body;
    await json(base,"/auth/select-organization",{method:"POST",headers:{"content-type":"application/json",cookie,origin:"http://localhost:3000","x-csrf-token":csrf},body:JSON.stringify({organizationId:organization.id})});

    for(let index=0;index<8;index++){
      const controller=new AbortController();controllers.push(controller);
      const response=await fetch(`${base}/cockpit/stream`,{headers:{cookie},signal:controller.signal});
      if(!response.ok||!response.body)throw new Error(`Authenticated stream ${index+1} failed ${response.status}`);
      const reader=sseReader(response.body);readers.push(reader);
      const initial=await reader.nextProjection();
      if(initial.data.organizationId!==organization.id||initial.data.assetExecutionAuthorized!==false)throw new Error("Initial stream crossed authority boundary");
    }
    if(!await waitForLeaseCount(pool,organization.id,8))throw new Error("Eight shared leases were not observed");

    const rejected=await fetch(`${base}/cockpit/stream`,{headers:{cookie}}),rejectedBody=await rejected.json(),rejectionTenantFree=!JSON.stringify(rejectedBody).includes(organization.id);
    const rejectionCode=rejectedBody.code??rejectedBody.error?.code??null,capacityRejected=rejected.status===503&&rejectionCode==="COCKPIT_STREAM_CAPACITY_EXHAUSTED"&&rejectionTenantFree;

    const prefix=`audit_sse_load_${suffix}_`,burstStarted=Date.now();
    await pool.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) SELECT $2||lpad(series::text,3,'0'),$1,'cockpit.sse_load_fixture',jsonb_build_object('type','system','id','sse-authenticated-load'),'cockpit.sse_load_fixture','fixture',$2||lpad(series::text,3,'0'),jsonb_build_object('sequence',series,'assetExecutionAuthorized',false),$3 FROM generate_series(1,128) series",[organization.id,prefix,`0x${"5".repeat(64)}`]);
    await delay(350);
    const recovered=await readers[0].nextProjection(5000),burstObservedMs=Date.now()-burstStarted;
    const slowConsumerRecovered=recovered.data.organizationId===organization.id&&recovered.data.latestActivity.some(event=>event.eventId===`${prefix}128`)&&recovered.data.assetExecutionAuthorized===false;

    controllers[7].abort();await readers[7].cancel();
    if(!await waitForLeaseCount(pool,organization.id,7))throw new Error("Released stream lease was not reclaimed");
    const replacementController=new AbortController();controllers.push(replacementController);
    const replacementResponse=await fetch(`${base}/cockpit/stream`,{headers:{cookie},signal:replacementController.signal});
    const replacementReader=replacementResponse.body?sseReader(replacementResponse.body):null;if(replacementReader)readers.push(replacementReader);
    const replacement=replacementReader?await replacementReader.nextProjection():null;
    const releaseReopensCapacity=replacementResponse.ok&&replacement?.data.organizationId===organization.id&&replacement.data.assetExecutionAuthorized===false;

    for(const controller of controllers)controller.abort();for(const reader of readers)await reader.cancel();
    const leasesReleased=await waitForLeaseCount(pool,organization.id,0);
    const result={siweAuthenticated:true,authenticatedConnectionsAccepted:8,perOrganizationCapacity:8,rejectionStatus:rejected.status,rejectionCode,ninthConnectionRejected:capacityRejected,slowConsumerBurstEvents:128,slowConsumerRecoveredLatestProjection:slowConsumerRecovered,burstObservedMs,releaseReopensCapacity,leasesReleased,tenantIdentityExposedInRejection:!rejectionTenantFree,advisoryOnly:true,assetExecutionAuthorized:false,privateKeyPersisted:false};
    if(result.authenticatedConnectionsAccepted!==8||result.perOrganizationCapacity!==8||!result.ninthConnectionRejected||result.slowConsumerBurstEvents!==128||!result.slowConsumerRecoveredLatestProjection||!result.releaseReopensCapacity||!result.leasesReleased||result.assetExecutionAuthorized!==false||result.privateKeyPersisted!==false)throw new Error(`Authenticated SSE load assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  }finally{
    for(const controller of controllers)controller.abort();for(const reader of readers)await reader.cancel();await pool.end();
    if(child.exitCode===null){child.kill();await Promise.race([new Promise(resolve=>child.once("exit",resolve)),delay(3000)])}
    if(child.exitCode!==0&&child.exitCode!==null&&!child.killed)console.error(logs.join("").slice(-5000));
  }
}
main().catch(error=>{console.error(error);process.exit(1)});
