const { resolve } = require("node:path");
process.env.AEOS_WALLET_HANDOFF_PORT = process.env.AEOS_WALLET_HANDOFF_PORT || "4193";
process.env.AEOS_WALLET_HANDOFF_PATH = process.env.AEOS_WALLET_HANDOFF_PATH || resolve(__dirname, "../reports/live-demo/live-balance-observer-usc-wallet-handoff-retry-1.json");
process.env.AEOS_WALLET_SUBMISSION_PATH = process.env.AEOS_WALLET_SUBMISSION_PATH || resolve(__dirname, "../reports/live-demo/live-balance-observer-usc-wallet-submission-retry-1.json");
const { createServerInstance, readHandoff } = require("./usc-verification-wallet-handoff-server.cjs");
readHandoff();
createServerInstance().listen(Number(process.env.AEOS_WALLET_HANDOFF_PORT), "127.0.0.1", () => console.log(`AEOS Balance Observer USC wallet handoff: http://127.0.0.1:${process.env.AEOS_WALLET_HANDOFF_PORT}`));
