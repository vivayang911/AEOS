const { readdirSync,readFileSync,statSync }=require("node:fs");
const { basename,extname,join,relative,resolve }=require("node:path");
const { scanTextForSecrets }=require("../dist/security-scan-engine");
const root=resolve(__dirname,"../../..");
const excluded=new Set([".git","node_modules","dist","out","cache",".next",".venv","coverage"]);
const extensions=new Set([".ts",".tsx",".js",".cjs",".mjs",".json",".md",".yaml",".yml",".sol",".toml",".ps1",".env",".example"]);
const findings=[];let filesScanned=0;
function visit(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){if(entry.isDirectory()){if(!excluded.has(entry.name))visit(join(directory,entry.name));continue}if(!entry.isFile())continue;const path=join(directory,entry.name);const name=basename(path);if(!(extensions.has(extname(path).toLowerCase())||name==="Dockerfile"||name===".dockerignore"||name===".env"||name.startsWith(".env.")))continue;const size=statSync(path).size;if(size>2_000_000)continue;filesScanned+=1;const text=readFileSync(path,"utf8");for(const finding of scanTextForSecrets(text))findings.push({detector:finding.detector,file:relative(root,path).replaceAll("\\","/"),line:finding.line})}}
visit(root);const result={schemaVersion:"aeos.secret-scan.v1",filesScanned,findings,passed:findings.length===0,secretValuesPrinted:false};console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
