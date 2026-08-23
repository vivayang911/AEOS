const expectedChainId = 102031;
const pausedSelector = "0x5c975abb";
const votingPeriodSelector = "0x02a251a3";
let handoff;
let selectedAccount;
let preflightPassed = false;
const byId = (id) => document.getElementById(id);
const short = (value) => value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "—";

async function refresh(requestAccounts = false) {
  preflightPassed = false;
  byId("submit").disabled = true;
  if (!window.ethereum) { byId("status").textContent = "MetaMask is not available in this browser."; return; }
  const accounts = await ethereum.request({ method: requestAccounts ? "eth_requestAccounts" : "eth_accounts" });
  const chainHex = await ethereum.request({ method: "eth_chainId" });
  selectedAccount = accounts[0]?.toLowerCase();
  const tx = handoff.unsignedTransaction;
  const balanceHex = selectedAccount ? await ethereum.request({ method: "eth_getBalance", params: [selectedAccount, "latest"] }) : null;
  const chainOk = Number.parseInt(chainHex, 16) === expectedChainId;
  const accountOk = selectedAccount === tx.from.toLowerCase();
  byId("network").textContent = `${chainOk ? "PASS" : "FAIL"} · ${chainHex} / ${expectedChainId}`;
  byId("account").textContent = `${accountOk ? "PASS" : "FAIL"} · ${short(selectedAccount)}`;
  byId("balance").textContent = balanceHex == null ? "Wallet not connected" : `${BigInt(balanceHex).toString()} wei CTC`;
  if (!(chainOk && accountOk && BigInt(balanceHex || "0x0") > 0n)) { byId("status").textContent = "Fail closed: select Creditcoin Testnet and the frozen proposer account with CTC."; return; }
  const [governorCode, guardCode, pausedResult, votingPeriodResult] = await Promise.all([
    ethereum.request({ method: "eth_getCode", params: [tx.to, "latest"] }),
    ethereum.request({ method: "eth_getCode", params: [handoff.contracts.treasuryGuard, "latest"] }),
    ethereum.request({ method: "eth_call", params: [{ to: handoff.contracts.treasuryGuard, data: pausedSelector }, "latest"] }),
    ethereum.request({ method: "eth_call", params: [{ to: tx.to, data: votingPeriodSelector }, "latest"] }),
  ]);
  const governorCodeOk = governorCode && governorCode !== "0x";
  const guardCodeOk = guardCode && guardCode !== "0x";
  const guardPaused = BigInt(pausedResult) === 1n;
  const votingPeriodBlocks = BigInt(votingPeriodResult);
  const votingPeriodOk = handoff.schemaVersion !== "aeos.live-governance-hold-proposal.v2" || votingPeriodBlocks === 240n;
  byId("governorCode").textContent = `${governorCodeOk ? "PASS" : "FAIL"} · ${governorCodeOk ? `${(governorCode.length - 2) / 2} bytes` : "no code"}`;
  byId("guardState").textContent = `${guardCodeOk && guardPaused ? "PASS" : "FAIL"} · code ${guardCodeOk ? "present" : "missing"} / paused ${guardPaused}`;
  const calculatedDataHash = await ethereum.request({ method: "web3_sha3", params: [tx.data] });
  const calldataOk = calculatedDataHash.toLowerCase() === tx.dataHash.toLowerCase();
  byId("calldata").textContent = `${calldataOk ? "PASS" : "FAIL"} · ${short(calculatedDataHash)}`;
  if (!(governorCodeOk && guardCodeOk && guardPaused && votingPeriodOk && calldataOk)) { byId("status").textContent = `Fail closed: governance code, paused Guard, voting period (${votingPeriodBlocks}) or frozen calldata mismatch.`; return; }
  const request = { from: tx.from, to: tx.to, data: tx.data, value: "0x0" };
  await ethereum.request({ method: "eth_call", params: [request, "latest"] });
  const gas = await ethereum.request({ method: "eth_estimateGas", params: [request] });
  byId("simulation").textContent = `PASS · estimated gas ${BigInt(gas).toString()}`;
  preflightPassed = true;
  byId("submit").disabled = false;
  byId("status").textContent = `READY: exact account, chain, contracts, paused Guard, voting period ${votingPeriodBlocks}, calldata and Proposal simulation passed. Final confirmation remains in MetaMask.`;
}

async function connectAndSelectNetwork() {
  if (!window.ethereum) throw new Error("MetaMask is not available in this browser");
  await ethereum.request({ method: "eth_requestAccounts" });
  const chainHex = await ethereum.request({ method: "eth_chainId" });
  if (Number.parseInt(chainHex, 16) !== expectedChainId) await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x18e8f" }] });
  await refresh(false);
}

async function load() {
  handoff = await fetch("/handoff", { cache: "no-store" }).then((response) => response.json());
  byId("decision").textContent = `${handoff.lineage.decisionId} / ${short(handoff.lineage.decisionOutputHash)}${handoff.lineage.attempt ? ` / attempt ${handoff.lineage.attempt.attemptNumber}` : ""}`;
  byId("proposalId").textContent = handoff.proposal.proposalId;
  byId("action").textContent = `${handoff.proposal.action.function} = true / ${handoff.truthBoundary.proposedEffect}`;
  byId("target").textContent = handoff.unsignedTransaction.to;
  byId("value").textContent = `${handoff.unsignedTransaction.value} (zero native value)`;
  byId("artifactHash").textContent = handoff.artifactHash;
  await refresh(false);
}

byId("connect").addEventListener("click", () => connectAndSelectNetwork().catch((error) => { byId("simulation").textContent = `FAIL · ${error.message}`; byId("status").textContent = "Preflight failed; submission remains disabled."; }));
byId("submit").addEventListener("click", async () => {
  try {
    await refresh(false);
    if (!preflightPassed || byId("submit").disabled) throw new Error("Wallet boundary checks are not satisfied");
    const tx = handoff.unsignedTransaction;
    byId("submit").disabled = true;
    const transactionHash = await ethereum.request({ method: "eth_sendTransaction", params: [{ from: tx.from, to: tx.to, data: tx.data, value: "0x0" }] });
    const record = await fetch("/submission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionHash, from: selectedAccount }) }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Submission recording failed"); return body; });
    byId("result").textContent = JSON.stringify(record, null, 2);
    byId("status").textContent = "SUBMITTED BY WALLET: receipt and ProposalCreated remain unverified.";
  } catch (error) { byId("result").textContent = error?.message || String(error); }
});
window.ethereum?.on?.("accountsChanged", () => refresh(false));
window.ethereum?.on?.("chainChanged", () => refresh(false));
load().catch((error) => { byId("status").textContent = error.message; });
