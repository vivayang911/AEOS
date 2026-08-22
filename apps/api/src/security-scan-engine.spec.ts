import { scanTextForSecrets } from "./security-scan-engine";

describe("secret scan engine",()=>{
  it("detects contextual wallet keys without returning the value",()=>{const value=`private_key=0x${"ab".repeat(32)}`;expect(scanTextForSecrets(value)).toEqual([{detector:"ETHEREUM_PRIVATE_KEY",line:1}]);expect(JSON.stringify(scanTextForSecrets(value))).not.toContain("abab")});
  it("detects non-empty sensitive environment values",()=>expect(scanTextForSecrets("METRICS_TOKEN=do-not-commit-this")).toEqual([{detector:"NONEMPTY_SECRET_ENV",line:1}]));
  it("allows empty templates and ordinary hashes",()=>expect(scanTextForSecrets(`METRICS_TOKEN=\ncontent_hash=0x${"11".repeat(32)}`)).toEqual([]));
  it("reports line numbers but never source content",()=>expect(scanTextForSecrets(`safe\nAWS_ACCESS_KEY=AKIA${"A".repeat(16)}`)).toEqual([{detector:"AWS_ACCESS_KEY",line:2}]));
});
