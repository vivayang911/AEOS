const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { verifyBalanceObserverArtifact } = require("../dist/contract-surface-engine");

const artifactPath = resolve(
  process.env.AEOS_BALANCE_OBSERVER_ARTIFACT_PATH
    || resolve(__dirname, "../../../contracts/out/AEOSBalanceObserver.sol/AEOSBalanceObserver.json"),
);
const result = verifyBalanceObserverArtifact(JSON.parse(readFileSync(artifactPath, "utf8")));
console.log(JSON.stringify(result));
if (result.status !== "VERIFIED") process.exitCode = 1;
