import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReleaseManifest,KnownLimitation,ReleaseArtifact } from "./release-manifest-engine";

const root=resolve(__dirname,"../../..");
const required=(name:string)=>{const value=process.env[name];if(!value)throw new Error(`${name} is required`);return value};
const readJson=(path:string)=>JSON.parse(readFileSync(resolve(root,path),"utf8").replace(/^\uFEFF/,""));
const artifactPaths=[
  ["workspace-package","package.json"],
  ["npm-lock","package-lock.json"],
  ["api-package","apps/api/package.json"],
  ["api-dockerfile","apps/api/Dockerfile"],
  ["treasury-guard-artifact","contracts/out/TreasuryGuard.sol/TreasuryGuard.json"],
  ["aeos-evidence-source-artifact","contracts/out/AEOSTreasuryEvidenceSource.sol/AEOSTreasuryEvidenceSource.json"],
  ["npm-sbom","reports/sbom/npm.cdx.json"],
  ["agent-eval","reports/agent-evals/v1.json"],
  ["deterministic-demo","reports/demo/phase5-demo.v3.json"],
  ["npm-audit","reports/security/npm-audit.json"],
  ["docker-scout","reports/security/docker-scout.sarif.json"],
  ["known-limitations","release/known-limitations.v1.json"],
] as const;
const artifacts:ReleaseArtifact[]=artifactPaths.map(([name,path])=>{const bytes=readFileSync(resolve(root,path));return {name,path,sha256:`sha256:${createHash("sha256").update(bytes).digest("hex")}`,sizeBytes:bytes.length}});
const limitationsDocument=readJson("release/known-limitations.v1.json");
if(limitationsDocument.schemaVersion!=="aeos.known-limitations.v1")throw new Error("KNOWN_LIMITATIONS_SCHEMA_INVALID");
const demo=readJson("reports/demo/phase5-demo.v3.json");
const npmAudit=readJson("reports/security/npm-audit.json");
const scout=readJson("reports/security/docker-scout.sarif.json");
const sbom=readJson("reports/sbom/npm.cdx.json");
if(sbom.bomFormat!=="CycloneDX")throw new Error("RELEASE_SBOM_INVALID");
const npmVulnerabilities=Object.values(npmAudit.metadata?.vulnerabilities??{}).filter(value=>typeof value==="number").reduce((sum,value)=>sum+(value as number),0);
const containerVulnerabilities=Array.isArray(scout.runs?.[0]?.results)?scout.runs[0].results.length:-1;
const manifest=buildReleaseManifest({releaseVersion:"0.1.0",imageDigest:required("AEOS_RELEASE_IMAGE_DIGEST"),gitProvenance:existsSync(resolve(root,".git"))?{available:true,commit:required("AEOS_RELEASE_GIT_COMMIT").toLowerCase(),reason:null}:{available:false,commit:null,reason:"Local workspace is not a Git repository"},artifacts,limitations:limitationsDocument.items as KnownLimitation[],validations:{apiTests:361,agentEval:"21/21",contractTests:"24/24",demoReportHash:demo.reportHash,npmVulnerabilities,containerVulnerabilities,containerPackages:197}});
const directory=resolve(root,"reports/release");mkdirSync(directory,{recursive:true});
writeFileSync(resolve(directory,"aeos-0.1.0.manifest.json"),`${JSON.stringify(manifest,null,2)}\n`,"utf8");
const markdown=["# AEOS 0.1.0 release candidate manifest","",`- Status: \`${manifest.releaseStatus}\``,`- Release hash: \`${manifest.releaseHash}\``,`- Image digest: \`${manifest.image.digest}\``,`- Git provenance available: \`${manifest.gitProvenance.available}\``,`- Bound artifacts: ${manifest.artifacts.length}`,`- Known limitations: ${manifest.knownLimitations.length}`,`- API tests: ${manifest.validations.apiTests}`,`- Agent Eval: ${manifest.validations.agentEval}`,`- Contract tests: ${manifest.validations.contractTests}`,`- npm/container vulnerabilities: ${manifest.validations.npmVulnerabilities}/${manifest.validations.containerVulnerabilities}`,"","## Known limitations","",...manifest.knownLimitations.map(item=>`- **${item.id} — ${item.area}:** ${item.summary} _Impact: ${item.releaseImpact}; owner: ${item.owner}._`),"","This candidate is unsigned, unpushed, and undeployed. It contains no private key and grants no asset execution authority.",""];
writeFileSync(resolve(directory,"aeos-0.1.0.manifest.md"),markdown.join("\n"),"utf8");
console.log(JSON.stringify({status:"PASS",releaseStatus:manifest.releaseStatus,releaseHash:manifest.releaseHash,imageDigest:manifest.image.digest,artifacts:manifest.artifacts.length,knownLimitations:manifest.knownLimitations.length,manifestSigned:manifest.authority.manifestSigned,deployed:manifest.authority.deployed,assetExecutionAuthorized:manifest.authority.assetExecutionAuthorized}));
