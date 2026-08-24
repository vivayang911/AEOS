const EXPECTED_CHAIN_ID = 102031;
const EXPECTED_CHAIN_HEX = "0x18e8f";

let handoff;
let account;
let provider;
let ready = false;

const $ = (id) => document.getElementById(id);
const short = (value) => value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "—";
const word = (value) => BigInt(value).toString(16).padStart(64, "0");

function setStatus(message) {
  $("status").textContent = message;
}

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

async function selector(signature) {
  const bytes = new TextEncoder().encode(signature);
  const hex = `0x${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  return (await provider.request({ method: "web3_sha3", params: [hex] })).slice(0, 10);
}

async function refresh(requestAccounts = false) {
  ready = false;
  $("submit").disabled = true;
  provider ||= await waitForMetaMask();

  const accounts = await provider.request({
    method: requestAccounts ? "eth_requestAccounts" : "eth_accounts",
  });
  const chainHex = await provider.request({ method: "eth_chainId" });
  account = accounts[0]?.toLowerCase();
  const tx = handoff.unsignedTransaction;
  const balance = account
    ? await provider.request({ method: "eth_getBalance", params: [account, "latest"] })
    : "0x0";
  const chainOk = Number.parseInt(chainHex, 16) === EXPECTED_CHAIN_ID;
  const accountOk = account === tx.from.toLowerCase();

  $("network").textContent = `${chainOk ? "PASS" : "FAIL"} · ${chainHex} / ${EXPECTED_CHAIN_ID}`;
  $("account").textContent = `${accountOk ? "PASS" : "FAIL"} · ${short(account)}`;
  $("balance").textContent = `${BigInt(balance)} wei CTC`;

  if (!(chainOk && accountOk && BigInt(balance) > 0n)) {
    setStatus("Fail closed: select Creditcoin Testnet and the frozen voter account with CTC.");
    return;
  }

  const idWord = word(handoff.lineage.proposalId);
  const stateSelector = await selector("state(uint256)");
  const deadlineSelector = await selector("proposalDeadline(uint256)");
  const periodSelector = await selector("votingPeriod()");
  const [code, stateHex, deadlineHex, periodHex, latestHex, dataHash] = await Promise.all([
    provider.request({ method: "eth_getCode", params: [tx.to, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: tx.to, data: stateSelector + idWord }, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: tx.to, data: deadlineSelector + idWord }, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: tx.to, data: periodSelector }, "latest"] }),
    provider.request({ method: "eth_blockNumber" }),
    provider.request({ method: "web3_sha3", params: [tx.data] }),
  ]);
  const state = Number(BigInt(stateHex));
  const deadline = BigInt(deadlineHex);
  const latest = BigInt(latestHex);
  const period = Number(BigInt(periodHex));
  const checks = {
    code: code !== "0x",
    active: state === 1,
    window: latest <= deadline,
    period: period === 240,
    data: dataHash.toLowerCase() === tx.dataHash.toLowerCase(),
  };

  $("state").textContent = `${checks.active ? "PASS" : "FAIL"} · state ${state} / latest ${latest}`;
  $("deadline").textContent = `${checks.window ? "PASS" : "FAIL"} · ${deadline} / ${deadline > latest ? deadline - latest : 0n} blocks remaining`;
  $("period").textContent = `${checks.period ? "PASS" : "FAIL"} · ${period}`;
  $("calldata").textContent = `${checks.data ? "PASS" : "FAIL"} · ${short(dataHash)}`;

  if (!Object.values(checks).every(Boolean)) {
    setStatus("Fail closed: Governor, Active window, 240-block period or calldata mismatch.");
    return;
  }

  const request = { from: tx.from, to: tx.to, data: tx.data, value: "0x0" };
  await provider.request({ method: "eth_call", params: [request, "latest"] });
  const gas = await provider.request({ method: "eth_estimateGas", params: [request] });
  $("simulation").textContent = `PASS · estimated gas ${BigInt(gas)}`;
  ready = true;
  $("submit").disabled = false;
  setStatus("READY: exact zero-value For vote passed all wallet checks. Final confirmation remains in MetaMask.");
}

async function connect() {
  const button = $("connect");
  button.disabled = true;
  setStatus("CONNECTING: waiting for MetaMask account approval…");
  try {
    provider = await waitForMetaMask();
    await provider.request({ method: "eth_requestAccounts" });
    const chainHex = await provider.request({ method: "eth_chainId" });
    if (Number.parseInt(chainHex, 16) !== EXPECTED_CHAIN_ID) {
      setStatus("SWITCHING NETWORK: approve Creditcoin Testnet in MetaMask…");
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: EXPECTED_CHAIN_HEX }],
      });
    }
    await refresh(false);
  } finally {
    button.disabled = false;
  }
}

async function load() {
  const response = await fetch("/handoff", { cache: "no-store" });
  if (!response.ok) throw new Error(`Handoff load failed (${response.status})`);
  const payload = await response.json();
  handoff = payload.handoff;
  $("proposal").textContent = handoff.lineage.proposalId;
  $("attempt").textContent = `${handoff.lineage.attemptNumber} / ${short(handoff.lineage.attemptIdentity)}`;
  $("capacity").textContent = `${handoff.votingCapacity.voterVotes} / quorum ${handoff.votingCapacity.quorumVotes}`;
  $("artifact").textContent = handoff.artifactHash;
  provider = selectMetaMaskProvider();
  if (!provider) {
    setStatus("MetaMask not detected yet. Unlock the extension, then click Connect MetaMask.");
    return;
  }
  await refresh(false);
}

$("connect").addEventListener("click", async () => {
  try {
    await connect();
  } catch (error) {
    setStatus(`CONNECT FAILED: ${error?.message || String(error)}`);
  }
});

$("submit").addEventListener("click", async () => {
  try {
    setStatus("RECHECKING: validating frozen vote immediately before wallet confirmation…");
    await refresh(false);
    if (!ready) throw new Error("Vote boundary checks are not satisfied");
    const tx = handoff.unsignedTransaction;
    $("submit").disabled = true;
    const transactionHash = await provider.request({
      method: "eth_sendTransaction",
      params: [{ from: tx.from, to: tx.to, data: tx.data, value: "0x0" }],
    });
    const response = await fetch("/submission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionHash, from: account }),
    });
    const record = await response.json();
    if (!response.ok) throw new Error(record.error || "Submission recording failed");
    $("result").textContent = JSON.stringify(record, null, 2);
    setStatus("VOTE SUBMITTED BY WALLET: VoteCast and quorum remain independently unverified.");
  } catch (error) {
    $("result").textContent = error?.message || String(error);
    setStatus(`VOTE NOT SUBMITTED: ${error?.message || String(error)}`);
  }
});

window.addEventListener("ethereum#initialized", () => {
  provider = selectMetaMaskProvider();
  if (handoff && provider) refresh(false).catch((error) => setStatus(`WALLET CHECK FAILED: ${error.message}`));
});

load().catch((error) => setStatus(`PAGE LOAD FAILED: ${error?.message || String(error)}`));
