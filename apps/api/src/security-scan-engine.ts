export type SecretFinding={detector:string;line:number};
const detectors:{name:string;pattern:RegExp}[]=[
  {name:"PEM_PRIVATE_KEY",pattern:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
  {name:"ETHEREUM_PRIVATE_KEY",pattern:/(?:private[_ -]?key)\s*[:=]\s*["']?0x[0-9a-fA-F]{64}\b/i},
  {name:"MNEMONIC_ASSIGNMENT",pattern:/(?:mnemonic|seed[_ -]?phrase)\s*[:=]\s*["'][a-z]+(?:\s+[a-z]+){11,23}["']/i},
  {name:"AWS_ACCESS_KEY",pattern:/\bAKIA[0-9A-Z]{16}\b/},
  {name:"GITHUB_TOKEN",pattern:/\bgh[pousr]_[A-Za-z0-9]{30,}\b/},
  {name:"OPENAI_API_KEY",pattern:/\bsk-[A-Za-z0-9_-]{20,}\b/},
  {name:"SLACK_TOKEN",pattern:/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/},
  {name:"NONEMPTY_SECRET_ENV",pattern:/^(?:export\s+)?[A-Z0-9_]*(?:PRIVATE_KEY|MNEMONIC|SEED_PHRASE|API_KEY|SECRET|TOKEN)\s*=\s*[^#\s][^#\r\n]{7,}$/}
];
export function scanTextForSecrets(text:string){const findings:SecretFinding[]=[];for(const [index,line] of text.split(/\r?\n/).entries())for(const detector of detectors){detector.pattern.lastIndex=0;if(detector.pattern.test(line))findings.push({detector:detector.name,line:index+1})}return findings}
