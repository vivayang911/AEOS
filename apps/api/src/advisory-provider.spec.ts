import { BadRequestException } from "@nestjs/common";
import { AdvisoryProvider, AdvisoryProviderRequestError, AdvisoryProviderTimeoutError, AgnesAdvisoryProvider, createAdvisoryProviderFromEnvironment, FrozenAdvisoryInput } from "./advisory-provider";
import { advisoryTools, buildDecisionOutput } from "./decision-engine";
import { DecisionService } from "./decision.service";
import { unavailableRetrievalManifestBundle } from "./retrieval-manifest";

const evidenceItem={id:"ev_provider",value:{amount:"125000000"},verification:{status:"VERIFIED"},freshness:"FRESH",qualityScore:90,conflictGroupId:null};
const evidence={get:jest.fn().mockResolvedValue(evidenceItem),snapshot:jest.fn().mockResolvedValue({id:"snap_provider",manifest_hash:"0xmanifest"})} as any;
const client={query:jest.fn().mockResolvedValue({rowCount:1,rows:[{}]})};
const dbWithBudget=(timeoutMs=5000)=>({query:jest.fn().mockResolvedValue({rowCount:1,rows:[{id:"policy_provider",config:{minimumEvidenceQuality:80,agentBudget:{timeoutMs,maxRetries:1,maxAgentRuns:10,maxToolCalls:16}}}]}),transaction:jest.fn(async(work:any)=>work(client))}) as any;
const providerInput=(overrides:Partial<FrozenAdvisoryInput>={}):FrozenAdvisoryInput=>({schemaVersion:"advisory.input.v2",objective:"Preserve capital",evidence:[evidenceItem],policy:{minimumEvidenceQuality:80},allowedEvidenceIds:["ev_provider"],allowedTools:[...advisoryTools],retrievalManifests:unavailableRetrievalManifestBundle("Preserve capital").manifests,budget:{timeoutMs:5000,maxRetries:1,maxAgentRuns:10,maxToolCalls:16},...overrides});
const narrative=()=>({schemaVersion:"agnes.advisory.narrative.v1",claimText:"Frozen verified evidence supports a cautious unchanged posture.",agentPositions:Object.fromEntries(["Governor","Research","Strategy","Quant","Risk","Compliance","Portfolio","Treasury"].map(role=>[role,`${role} supports a cautious unchanged posture.`]))});

describe("Advisory Provider boundary",()=>{
  beforeEach(()=>jest.clearAllMocks());

  it("passes an immutable least-privilege input and persists Provider metadata",async()=>{
    const provider:AdvisoryProvider={providerId:"test-safe-provider",modelVersion:"test-safe-v1",kind:"deterministic-mock",run:jest.fn(async(input:FrozenAdvisoryInput)=>{
      expect(Object.isFrozen(input)).toBe(true);
      expect(Object.isFrozen(input.evidence)).toBe(true);
      expect(Object.isFrozen(input.retrievalManifests)).toBe(true);
      expect(input.retrievalManifests).toHaveLength(8);
      expect(input.allowedTools).toEqual(advisoryTools);
      expect(input.allowedTools).not.toContain("asset.execute");
      return buildDecisionOutput({objective:input.objective,evidence:[...input.evidence],policy:input.policy,retrievalManifests:input.retrievalManifests}).output;
    })};
    const result=await new DecisionService(dbWithBudget(),evidence,provider).create({organizationId:"org_provider",objective:"Preserve capital",evidenceIds:["ev_provider"]});
    expect(result).toMatchObject({provider:"test-safe-provider",modelVersion:"test-safe-v1"});
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO decisions"),expect.arrayContaining(["test-safe-provider"]));
  });

  it("rejects executable actions returned by an untrusted Provider",async()=>{
    const provider:AdvisoryProvider={providerId:"malicious-provider",modelVersion:"malicious-v1",kind:"llm",run:async(input)=>{
      const output:any=structuredClone(buildDecisionOutput({objective:input.objective,evidence:[...input.evidence],policy:input.policy}).output);
      output.actions.push({type:"SWAP",amount:"1"});
      return output;
    }};
    await expect(new DecisionService(dbWithBudget(),evidence,provider).create({organizationId:"org_provider",objective:"Preserve capital",evidenceIds:["ev_provider"]})).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO decisions"),expect.anything());
  });

  it("rejects a Provider that forges a role-scoped RAG citation",async()=>{
    const retrieval=unavailableRetrievalManifestBundle("Preserve capital");
    const provider:AdvisoryProvider={providerId:"rag-forger",modelVersion:"forger-v1",kind:"llm",run:async(input)=>{const output:any=buildDecisionOutput({objective:input.objective,evidence:[...input.evidence],policy:input.policy,retrievalManifests:input.retrievalManifests}).output;output.agentPositions[0].knowledgeCitations=["rag:forged"];return output}};
    await expect(new DecisionService(dbWithBudget(),evidence,provider).create({organizationId:"org_provider",objective:"Preserve capital",evidenceIds:["ev_provider"],retrievalBundle:retrieval})).rejects.toBeInstanceOf(BadRequestException);
  });

  it("enforces the configured Provider timeout budget",async()=>{
    const provider:AdvisoryProvider={providerId:"slow-provider",modelVersion:"slow-v1",kind:"llm",run:()=>new Promise(()=>undefined)};
    await expect(new DecisionService(dbWithBudget(5),evidence,provider).create({organizationId:"org_provider",objective:"Preserve capital",evidenceIds:["ev_provider"]})).rejects.toBeInstanceOf(AdvisoryProviderTimeoutError);
  });

  it("fails closed when an unavailable Provider is selected",()=>{
    const previous=process.env.ADVISORY_PROVIDER;
    process.env.ADVISORY_PROVIDER="unconfigured-llm";
    try{expect(()=>createAdvisoryProviderFromEnvironment()).toThrow("Unsupported ADVISORY_PROVIDER")}finally{if(previous===undefined)delete process.env.ADVISORY_PROVIDER;else process.env.ADVISORY_PROVIDER=previous}
  });

  it("uses Agnes only for bounded narrative text while AEOS retains the deterministic decision skeleton",async()=>{
    const fetcher=jest.fn(async(_url:string|URL,init?:RequestInit)=>{
      expect(String(_url)).toBe("https://apihub.agnes-ai.com/v1/chat/completions");
      expect((init?.headers as Record<string,string>).authorization).toBe("Bearer test-secret-value");
      const body=JSON.parse(String(init?.body));
      expect(body.model).toBe("agnes-2.0-flash");
      expect(body.messages[1].content).not.toContain("organizationId");
      expect(body.messages[1].content).not.toContain("AGNES_API_KEY");
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(narrative())}}]}),{status:200,headers:{"content-type":"application/json"}})
    });
    const output:any=await new AgnesAdvisoryProvider("test-secret-value",fetcher).run(providerInput());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(output).toMatchObject({recommendation:"HOLD",actions:[],humanApprovalRequired:true,assetExecutionAuthorized:false});
    expect(output.agentPositions).toHaveLength(8);
    expect(output.challenges.map((item:any)=>item.raisedBy)).toEqual(expect.arrayContaining(["Risk","Compliance"]));
    expect(output.claims[0].text).toBe(narrative().claimText);
  });

  it("does not call Agnes when deterministic Evidence guardrails require refusal",async()=>{
    const fetcher=jest.fn();
    const output:any=await new AgnesAdvisoryProvider("test-secret-value",fetcher as any).run(providerInput({evidence:[{...evidenceItem,freshness:"STALE"}]}));
    expect(fetcher).not.toHaveBeenCalled();
    expect(output.recommendation).toBe("INSUFFICIENT_EVIDENCE");
    expect(output.assetExecutionAuthorized).toBe(false);
  });

  it("rejects Agnes narrative that attempts an asset action or invents a number",async()=>{
    const malicious=narrative();malicious.claimText="Buy 10 tokens now.";
    const fetcher=jest.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(malicious)}}]}),{status:200}));
    await expect(new AgnesAdvisoryProvider("test-secret-value",fetcher).run(providerInput())).rejects.toBeInstanceOf(AdvisoryProviderRequestError);
  });

  it("accepts a single complete JSON code fence but rejects surrounding prose",async()=>{
    const fenced=jest.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:`\`\`\`json\n${JSON.stringify(narrative())}\n\`\`\``}}]}),{status:200}));
    await expect(new AgnesAdvisoryProvider("test-secret-value",fenced).run(providerInput())).resolves.toMatchObject({recommendation:"HOLD"});
    const prose=jest.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:`Here is the result:\n${JSON.stringify(narrative())}`}}]}),{status:200}));
    await expect(new AgnesAdvisoryProvider("test-secret-value",prose).run(providerInput())).rejects.toBeInstanceOf(AdvisoryProviderRequestError);
  });

  it("creates Agnes from environment only with an explicit credential and official endpoint",()=>{
    const previous={provider:process.env.ADVISORY_PROVIDER,key:process.env.AGNES_API_KEY,base:process.env.AGNES_BASE_URL};
    try{
      process.env.ADVISORY_PROVIDER="agnes-ai";delete process.env.AGNES_API_KEY;
      expect(()=>createAdvisoryProviderFromEnvironment()).toThrow("AGNES_API_KEY is required");
      process.env.AGNES_API_KEY="test-secret-value";process.env.AGNES_BASE_URL="https://example.com/v1";
      expect(()=>createAdvisoryProviderFromEnvironment()).toThrow("allowlisted official HTTPS endpoint");
      delete process.env.AGNES_BASE_URL;
      expect(createAdvisoryProviderFromEnvironment()).toMatchObject({providerId:"agnes-ai/aeos-agnes-narrative-v1",kind:"llm",credentialsRequired:true,networkAccess:true});
    }finally{for(const [name,value] of Object.entries({ADVISORY_PROVIDER:previous.provider,AGNES_API_KEY:previous.key,AGNES_BASE_URL:previous.base}))value===undefined?delete process.env[name]:process.env[name]=value}
  });
});
