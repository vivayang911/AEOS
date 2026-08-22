const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { verifyTreasuryGuardDeploymentManifestSignature } = require("../dist/deployment-engine");

function required(name) { const value=process.env[name]; if(!value) throw new Error(`${name} is required`); return value; }
const document=JSON.parse(readFileSync(resolve(required("TREASURY_GUARD_MANIFEST_PATH")),"utf8"));
const manifest=document.manifest||document;
const result=verifyTreasuryGuardDeploymentManifestSignature({manifest,signerId:required("TREASURY_GUARD_MANIFEST_SIGNER_ID"),publicKeySpkiBase64:required("TREASURY_GUARD_MANIFEST_PUBLIC_KEY_SPKI_BASE64"),signatureBase64:required("TREASURY_GUARD_MANIFEST_SIGNATURE_BASE64")});
console.log(JSON.stringify(result,null,2));
if(result.status!=="VERIFIED")process.exitCode=1;
