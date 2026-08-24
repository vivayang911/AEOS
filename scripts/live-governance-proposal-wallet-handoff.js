const EXPECTED_CHAIN_ID = 102031;
const EXPECTED_CHAIN_HEX = "0x18e8f";
const PAUSED_SELECTOR = "0x5c975abb";
const VOTING_PERIOD_SELECTOR = "0x02a251a3";

let handoff;
let selectedAccount;
let provider;
let preflightPassed = false;

const byId = (id) => document.getElementById(id);
const short = (value) => value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "—";
const setStatus = (value) => { byId("status").textContent = value; };

function selectMetaMaskProvider() {
  const injected = window.ethereum;
  if (!injected) return null;
  if (Array.isArray(injected.providers)) {
    return injected.providers.find((candidate) => candidate?.isMetaMask) || injected;
  }
  return injected;
}

async function waitForMetaMask(timeoutMs = 3000) {
  const existing = selectMetaMaskProvider();
  if (existing) return existing;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("ethereum#initialized", onInitialized);
      reject(new Error("MetaMask provider was not injected. Unlock MetaMask, allow this site, then reload."));
    }, timeoutMs);
    function onInitialized() {
      const detected = selectMetaMaskProvider();
      if (!detected) return;
      window.clearTimeout(timeout);
      window.removeEventListener("ethereum#initialized", onInitialized);
      resolve(detected);
    }
    window.addEventListener("ethereum#initialized", onInitialized, { once: true });
  });
}

async function refresh(requestAccounts = false) {
  preflightPassed = false;
  byId("submit").disabled = true;
  provider ||= await waitForMetaMask();
  const accounts = await provider.request({ method: requestAccounts ? "eth_requestAccounts" : "eth_accounts" });
  const chainHex = await provider.request({ method: "eth_chainId" });
  selectedAccount = accounts[0]?.toLowerCase();
  const tx = handoff.unsignedTransaction;
  const balanceHex = selectedAccount
    ? await provider.request({ method: "eth_getBalance", params: [selectedAccount, "latest"] })
    : "0x0";
  const chainOk = Number.parseInt(chainHex, 16) === EXPECTED_CHAIN_ID;
  const accountOk = selectedAccount === tx.from.toLowerCase();
  byId("network").textContent = `${chainOk ? "PASS" : "FAIL"} · ${chainHex} / ${EXPECTED_CHAIN_ID}`;
  byId("account").textContent = `${accountOk ? "PASS" : "FAIL"} · ${short(selectedAccount)}`;
  byId("balance").textContent = `${BigInt(balanceHex)} wei CTC`;
  if (!(chainOk && accountOk && BigInt(balanceHex) > 0n)) {
    setStatus("Fail closed: select Creditcoin Testnet and the frozen proposer account with CTC.");
    return;
  }

  const [governorCode, guardCode, pausedResult, votingPeriodResult] = await Promise.all([
    provider.request({ method: "eth_getCode", params: [tx.to, "latest"] }),
    provider.request({ method: "eth_getCode", params: [handoff.contracts.treasuryGuard, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: handoff.contracts.treasuryGuard, data: PAUSED_SELECTOR }, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: tx.to, data: VOTING_PERIOD_SELECTOR }, "latest"] }),
  ]);
  const governorCodeOk = governorCode !== "0x";
  const guardCodeOk = guardCode !== "0x";
  const guardPaused = BigInt(pausedResult) === 1n;
  const votingPeriodBlocks = BigInt(votingPeriodResult);
  const votingPeriodOk = handoff.schemaVersion !== "aeos.live-governance-hold-proposal.v2" || votingPeriodBlocks === 240n;
  byId("governorCode").textContent = `${governorCodeOk ? "PASS" : "FAIL"} · ${governorCodeOk ? `${(governorCode.length - 2) / 2} bytes` : "no code"}`;
  byId("guardState").textContent = `${guardCodeOk && guardPaused ? "PASS" : "FAIL"} · code ${guardCodeOk ? "present" : "missing"} / paused ${guardPaused}`;
  const calculatedDataHash = await provider.request({ method: "web3_sha3", params: [tx.data] });
  const calldataOk = calculatedDataHash.toLowerCase() === tx.dataHash.toLowerCase();
  byId("calldata").textContent = `${calldataOk ? "PASS" : "FAIL"} · ${short(calculatedDataHash)}`;
  if (!(governorCodeOk && guardCodeOk && guardPaused && votingPeriodOk && calldataOk)) {
    setStatus(`Fail closed: governance code, paused Guard, voting period (${votingPeriodBlocks}) or frozen calldata mismatch.`);
    return;
  }

  const request = { from: tx.from, to: tx.to, data: tx.data, value: "0x0" };
  await provider.request({ method: "eth_call", params: [request, "latest"] });
  const gas = await provider.request({ method: "eth_estimateGas", params: [request] });
  byId("simulation").textContent = `PASS · estimated gas ${BigInt(gas)}`;
  preflightPassed = true;
  byId("submit").disabled = false;
  setStatus(`READY: exact account, chain, contracts, paused Guard, voting period ${votingPeriodBlocks}, calldata and Proposal simulation passed. Final confirmation remains in MetaMask.`);
}

async function connectAndSelectNetwork() {
  const button = byId("connect");
  button.disabled = true;
  setStatus("CONNECTING: waiting for MetaMask account approval…");
  try {
    provider = await waitForMetaMask();
    await provider.request({ method: "eth_requestAccounts" });
    const chainHex = await provider.request({ method: "eth_chainId" });
    if (Number.parseInt(chainHex, 16) !== EXPECTED_CHAIN_ID) {
      setStatus("SWITCHING NETWORK: approve Creditcoin Testnet in MetaMask…");
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: EXPECTED_CHAIN_HEX }] });
    }
    await refresh(false);
  } finally {
    button.disabled = false;
  }
}

async function load() {
  const response = await fetch("/handoff", { cache: "no-store" });
  if (!response.ok) throw new Error(`Handoff load failed (${response.status})`);
  handoff = await response.json();
  byId("decision").textContent = `${handoff.lineage.decisionId} / ${short(handoff.lineage.decisionOutputHash)}${handoff.lineage.attempt ? ` / attempt ${handoff.lineage.attempt.attemptNumber}` : ""}`;
  byId("proposalId").textContent = handoff.proposal.proposalId;
  byId("action").textContent = `${handoff.proposal.action.function} = true / ${handoff.truthBoundary.proposedEffect}`;
  byId("target").textContent = handoff.unsignedTransaction.to;
  byId("value").textContent = `${handoff.unsignedTransaction.value} (zero native value)`;
  byId("artifactHash").textContent = handoff.artifactHash;
  provider = selectMetaMaskProvider();
  if (!provider) {
    setStatus("MetaMask not detected yet. Unlock the extension, then click Connect MetaMask.");
    return;
  }
  await refresh(false);
}

byId("connect").addEventListener("click", async () => {
  try {
    await connectAndSelectNetwork();
  } catch (error) {
    setStatus(`CONNECT FAILED: ${error?.message || String(error)}`);
  }
});

byId("submit").addEventListener("click", async () => {
  try {
    setStatus("RECHECKING: validating frozen Proposal immediately before wallet confirmation…");
    await refresh(false);
    if (!preflightPassed) throw new Error("Wallet boundary checks are not satisfied");
    const tx = handoff.unsignedTransaction;
    byId("submit").disabled = true;
    const transactionHash = await provider.request({
      method: "eth_sendTransaction",
      params: [{ from: tx.from, to: tx.to, data: tx.data, value: "0x0" }],
    });
    const response = await fetch("/submission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionHash, from: selectedAccount }),
    });
    const record = await response.json();
    if (!response.ok) throw new Error(record.error || "Submission recording failed");
    byId("result").textContent = JSON.stringify(record, null, 2);
    setStatus("SUBMITTED BY WALLET: receipt and ProposalCreated remain independently unverified.");
  } catch (error) {
    byId("result").textContent = error?.message || String(error);
    setStatus(`PROPOSAL NOT SUBMITTED: ${error?.message || String(error)}`);
  }
});

window.addEventListener("ethereum#initialized", () => {
  provider = selectMetaMaskProvider();
  if (handoff && provider) refresh(false).catch((error) => setStatus(`WALLET CHECK FAILED: ${error.message}`));
});

load().catch((error) => setStatus(`PAGE LOAD FAILED: ${error?.message || String(error)}`));
