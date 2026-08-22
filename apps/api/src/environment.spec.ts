import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {config} from "dotenv";

describe("local environment boundary",()=>{
  it("does not override deployment-provided secrets",()=>{
    const dir=mkdtempSync(join(tmpdir(),"aeos-env-")),file=join(dir,".env"),name="AEOS_ENV_PRECEDENCE_TEST";
    writeFileSync(file,`${name}=local-value\n`);
    process.env[name]="platform-value";
    try{config({path:file,override:false,quiet:true});expect(process.env[name]).toBe("platform-value")}finally{delete process.env[name];rmSync(dir,{recursive:true,force:true})}
  });
});
