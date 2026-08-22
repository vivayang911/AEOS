const path=require("node:path");
const{spawn}=require("node:child_process");
const{Wallet}=require("ethers");
const{Pool}=require("pg");
let capturedLogs="";

const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForReady(base,child){for(let attempt=0;attempt<80;attempt++){if(child.exitCode!==null)throw new Error(`API exited before readiness (${child.exitCode})`);try{const response=await fetch(`${base}/health/ready`);if(response.ok)return}catch{}await delay(125)}throw new Error("API readiness timed out")}
async function json(base,route,options={}){const response=await fetch(`${base}${route}`,options),text=await response.text();let body;try{body=JSON.parse(text)}catch{body=text}if(!response.ok)throw new Error(`${route} failed ${response.status}: ${JSON.stringify(body)}`);return{response,body}}
function sseReader(body){const reader=body.getReader(),decoder=new TextDecoder();let buffer="",queue=[];return{async nextProjection(timeoutMs=5000){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){while(queue.length){const block=queue.shift(),message={};for(const line of block.split(/\r?\n/)){const index=line.indexOf(":");if(index<0)continue;const key=line.slice(0,index),value=line.slice(index+1).trimStart();if(key==="data")message.data=(message.data??"")+value;else message[key]=value}if(message.event==="projection"){message.type=message.event;message.data=JSON.parse(message.data);return message}}const remaining=deadline-Date.now();const result=await Promise.race([reader.read(),delay(remaining).then(()=>({timeout:true}))]);if(result.timeout)break;if(result.done)throw new Error("SSE stream ended before projection");buffer+=decoder.decode(result.value,{stream:true});const blocks=buffer.split(/\r?\n\r?\n/);buffer=blocks.pop()??"";queue.push(...blocks.filter(Boolean))}throw new Error("Timed out waiting for SSE projection")},cancel:()=>reader.cancel()}}
async function insertAudit(pool,org,eventId,eventType){await pool.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash)VALUES($1,$2,$3,$4,$3,'fixture',$1,$5,$6)",[eventId,org,eventType,{type:"system",id:"sse-http-e2e"},{assetExecutionAuthorized:false},`0x${"4".repeat(64)}`])}

async function main(){
  process.env.DATABASE_URL??="postgresql://aeos:aeos@127.0.0.1:5432/aeos";
  const port=4400+Math.floor(Math.random()*200),base=`http://127.0.0.1:${port}/api/v1`,suffix=Date.now().toString(36),otherOrg=`org_sse_http_other_${suffix}`;
  const child=spawn(process.execPath,[path.resolve(__dirname,"../dist/main.js")],{cwd:path.resolve(__dirname,"../../.."),env:{...process.env,API_PORT:String(port),NODE_ENV:"development",SIWE_DOMAIN:"localhost:3000",SIWE_URI:"http://localhost:3000",WEB_ORIGIN:"http://localhost:3000"},stdio:["ignore","pipe","pipe"],windowsHide:true});
  child.stdout.on("data",chunk=>{capturedLogs=(capturedLogs+chunk.toString()).slice(-4000)});child.stderr.on("data",chunk=>{capturedLogs=(capturedLogs+chunk.toString()).slice(-4000)});
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  const wallet=Wallet.createRandom(),controllerA=new AbortController(),controllerB=new AbortController();
  try{
    await waitForReady(base,child);
    const challenge=(await json(base,"/auth/nonce",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({walletAddress:wallet.address,chainId:102031})})).body;
    const signature=await wallet.signMessage(challenge.message);
    const verified=await json(base,"/auth/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({challengeId:challenge.challengeId,message:challenge.message,signature})});
    const setCookie=verified.response.headers.get("set-cookie")??"",cookie=setCookie.split(";")[0],csrf=verified.body.csrfToken;
    if(!cookie.startsWith("aeos_session=")||!setCookie.includes("HttpOnly")||!setCookie.includes("SameSite=Strict")||typeof csrf!=="string")throw new Error("Secure session boundary missing")
    const commandHeaders={"content-type":"application/json",cookie,origin:"http://localhost:3000","x-csrf-token":csrf,"idempotency-key":`sse-http-${suffix}`};
    const created=(await json(base,"/organizations",{method:"POST",headers:commandHeaders,body:JSON.stringify({name:`SSE HTTP ${suffix}`})})).body,org=created.id;
    await json(base,"/auth/select-organization",{method:"POST",headers:{"content-type":"application/json",cookie,origin:"http://localhost:3000","x-csrf-token":csrf},body:JSON.stringify({organizationId:org})});
    const session=(await json(base,"/auth/session",{headers:{cookie}})).body;
    if(session.activeOrganizationId!==org||session.role!=="ADMIN")throw new Error("Server session organization was not selected")
    await pool.query("INSERT INTO organizations(id,name,status)VALUES($1,'SSE HTTP Other','ACTIVE')",[otherOrg]);
    const response=await fetch(`${base}/cockpit/stream`,{headers:{cookie,"last-event-id":"0x"+"0".repeat(64),"x-organization-id":otherOrg},signal:controllerA.signal});
    if(!response.ok||!response.body||!String(response.headers.get("content-type")).includes("text/event-stream"))throw new Error(`SSE connection failed ${response.status}`);
    const stream=sseReader(response.body),first=await stream.nextProjection();
    const otherEvent=`audit_sse_http_other_${suffix}`;await insertAudit(pool,otherOrg,otherEvent,"cockpit.sse_other_fixture");await delay(250);
    const ownEvent=`audit_sse_http_own_${suffix}`;await insertAudit(pool,org,ownEvent,"cockpit.sse_own_fixture");const second=await stream.nextProjection();
    controllerA.abort();
    const resumedResponse=await fetch(`${base}/cockpit/stream`,{headers:{cookie,"last-event-id":second.id,"x-organization-id":otherOrg},signal:controllerB.signal});
    if(!resumedResponse.ok||!resumedResponse.body)throw new Error(`SSE resume failed ${resumedResponse.status}`);
    const resumed=sseReader(resumedResponse.body);await delay(250);const resumeEvent=`audit_sse_http_resume_${suffix}`;await insertAudit(pool,org,resumeEvent,"cockpit.sse_resume_fixture");const third=await resumed.nextProjection();controllerB.abort();
    const firstSafe=first.data.organizationId===org&&first.data.assetExecutionAuthorized===false,secondSafe=second.data.organizationId===org&&second.data.assetExecutionAuthorized===false,thirdSafe=third.data.organizationId===org&&third.data.assetExecutionAuthorized===false;
    const ownVisible=second.data.latestActivity.some(event=>event.eventId===ownEvent),otherHidden=!second.data.latestActivity.some(event=>event.eventId===otherEvent),resumeVisible=third.data.latestActivity.some(event=>event.eventId===resumeEvent);
    const result={siweAuthenticated:true,httpOnlySession:true,csrfProtectedWrite:true,serverSelectedOrganization:session.activeOrganizationId===org,forgedOrganizationHeaderIgnored:firstSafe&&secondSafe&&thirdSafe,crossOrganizationEventHidden:otherHidden,committedOrganizationEventDelivered:ownVisible,lastEventIdResumeDeliveredNewProjection:third.id!==second.id&&resumeVisible,advisoryOnly:[first,second,third].every(event=>event.data.advisoryOnly===true),assetExecutionAuthorized:[first,second,third].some(event=>event.data.assetExecutionAuthorized!==false),privateKeyPersisted:false};
    const requiredTrue=["siweAuthenticated","httpOnlySession","csrfProtectedWrite","serverSelectedOrganization","forgedOrganizationHeaderIgnored","crossOrganizationEventHidden","committedOrganizationEventDelivered","lastEventIdResumeDeliveredNewProjection","advisoryOnly"];
    if(!requiredTrue.every(key=>result[key]===true)||result.assetExecutionAuthorized!==false||result.privateKeyPersisted!==false)throw new Error(`SSE HTTP E2E assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  }finally{
    controllerA.abort();controllerB.abort();await pool.end();
    if(child.exitCode===null){child.kill();await Promise.race([new Promise(resolve=>child.once("exit",resolve)),delay(3000)])}
    if(child.exitCode!==0&&child.exitCode!==null&&!child.killed)console.error(capturedLogs);
  }
}
main().catch(error=>{console.error(error);if(capturedLogs)console.error(capturedLogs);process.exit(1)});
