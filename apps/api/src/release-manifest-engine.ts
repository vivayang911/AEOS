import { createHash } from "node:crypto";
import { canonical } from "./decision-engine";

export type ReleaseArtifact={name:string;path:string;sha256:string;sizeBytes:number};
export type KnownLimitation={id:string;status:"OPEN"|"DEFERRED";releaseImpact:string;area:string;summary:string;owner:string};
export type ReleaseManifestInput={releaseVersion:string;imageDigest:string;gitProvenance:{available:boolean;commit:string|null;reason:string|null};artifacts:ReleaseArtifact[];limitations:KnownLimitation[];validations:{apiTests:number;agentEval:string;contractTests:string;demoReportHash:string;npmVulnerabilities:number;containerVulnerabilities:number;containerPackages:number}};

const digest=/^sha256:[0-9a-f]{64}$/;
const relativePath=/^(?![A-Za-z]:)(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$)).+$/;
const hash=(value:unknown)=>`sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
function requireRelease(condition:unknown,code:string):asserts condition{if(!condition)throw new Error(code)}

export function buildReleaseManifest(input:ReleaseManifestInput){
  requireRelease(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input.releaseVersion),"RELEASE_VERSION_INVALID");
  requireRelease(digest.test(input.imageDigest),"RELEASE_IMAGE_DIGEST_INVALID");
  requireRelease(Array.isArray(input.artifacts)&&input.artifacts.length>=6,"RELEASE_ARTIFACTS_INCOMPLETE");
  requireRelease(new Set(input.artifacts.map(item=>item.name)).size===input.artifacts.length,"RELEASE_ARTIFACT_DUPLICATE");
  for(const artifact of input.artifacts){requireRelease(artifact.name.length>0&&relativePath.test(artifact.path)&&digest.test(artifact.sha256)&&Number.isSafeInteger(artifact.sizeBytes)&&artifact.sizeBytes>0,"RELEASE_ARTIFACT_INVALID")}
  requireRelease(Array.isArray(input.limitations)&&input.limitations.length>0,"RELEASE_LIMITATIONS_REQUIRED");
  requireRelease(new Set(input.limitations.map(item=>item.id)).size===input.limitations.length,"RELEASE_LIMITATION_DUPLICATE");
  for(const item of input.limitations){requireRelease(/^AEOS-LIM-\d{3}$/.test(item.id)&&["OPEN","DEFERRED"].includes(item.status)&&item.releaseImpact.length>0&&item.area.length>0&&item.summary.length>0&&item.owner.length>0,"RELEASE_LIMITATION_INVALID")}
  requireRelease(Number.isInteger(input.validations.apiTests)&&input.validations.apiTests>0&&/^\d+\/\d+$/.test(input.validations.agentEval)&&/^\d+\/\d+$/.test(input.validations.contractTests),"RELEASE_VALIDATION_COUNTS_INVALID");
  requireRelease(/^0x[0-9a-f]{64}$/.test(input.validations.demoReportHash)&&input.validations.npmVulnerabilities===0&&input.validations.containerVulnerabilities===0&&input.validations.containerPackages>0,"RELEASE_SECURITY_VALIDATION_INVALID");
  requireRelease(input.gitProvenance.available?/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(input.gitProvenance.commit??""):input.gitProvenance.commit===null&&Boolean(input.gitProvenance.reason),"RELEASE_GIT_PROVENANCE_INVALID");
  const frozen={schemaVersion:"aeos.release-manifest.v1",releaseVersion:input.releaseVersion,releaseStatus:"CANDIDATE_NOT_DEPLOYED",image:{digest:input.imageDigest,signed:false,pushed:false},gitProvenance:input.gitProvenance,artifacts:[...input.artifacts].sort((a,b)=>a.name.localeCompare(b.name)),validations:input.validations,knownLimitations:[...input.limitations].sort((a,b)=>a.id.localeCompare(b.id)),authority:{manifestSigned:false,imageSigned:false,deployed:false,containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false}};
  return {...frozen,releaseHash:hash(frozen)};
}
