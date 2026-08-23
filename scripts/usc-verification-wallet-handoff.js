const expectedChainId = 102031;
const expectedChainHex = "0x18e8f";
let handoff;
let selectedAccount;
const byId = (id) => document.getElementById(id);
const short = (value) => value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "—";

async function refresh(requestAccounts = false) {
  if (!window.ethereum) { byId("status").textContent = "MetaMask is not available in this browser."; return; }
  const accounts = await ethereum.request({ method: requestAccounts ? "eth_requestAccounts" : "eth_accounts" });
  const chainHex = await ethereum.request({ method: "eth_chainId" });
  selectedAccount = accounts[0]?.toLowerCase();
  const balanceHex = selectedAccount ? await ethereum.request({ method: "eth_getBalance", params: [selectedAccount, "latest"] }) : null;
  const chainOk = Number.parseInt(chainHex, 16) === expectedChainId;
  const accountOk = selectedAccount === handoff.verificationRequest.from.toLowerCase();
  byId("network").textContent = `${chainOk ? "PASS" : "FAIL"} · ${chainHex} / ${expectedChainId}`;
  byId("account").textContent = `${accountOk ? "PASS" : "FAIL"} · ${short(selectedAccount)}`;
  byId("balance").textContent = balanceHex == null ? "Wallet not connected" : `${BigInt(balanceHex).toString()} wei CTC`;
  byId("submit").disabled = !(chainOk && accountOk && BigInt(balanceHex || "0x0") > 0n);
  byId("status").textContent = byId("submit").disabled ? "Fail closed: select Creditcoin Testnet and the frozen requester account with CTC." : "READY: exact account/network checks passed. Final confirmation remains in MetaMask.";
}

async function load() {
  handoff = await fetch("/handoff", { cache: "no-store" }).then((response) => response.json());
  byId("target").textContent = handoff.verificationRequest.to;
  byId("value").textContent = `${handoff.verificationRequest.value} (zero native value)`;
  byId("requestHash").textContent = handoff.verificationRequestHash;
  await refresh(false);
}

byId("connect").addEventListener("click", () => refresh(true).catch((error) => { byId("result").textContent = error.message; }));
byId("submit").addEventListener("click", async () => {
  try {
    await refresh(false);
    if (byId("submit").disabled) throw new Error("Wallet boundary checks are not satisfied");
    const tx = handoff.verificationRequest;
    const transactionHash = await ethereum.request({ method: "eth_sendTransaction", params: [{ from: tx.from, to: tx.to, data: tx.data, value: tx.value }] });
    const record = await fetch("/submission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionHash, from: selectedAccount }) }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Submission recording failed"); return body; });
    byId("result").textContent = JSON.stringify(record, null, 2);
    byId("status").textContent = "SUBMITTED: receipt and TransactionVerified are still unverified.";
    byId("submit").disabled = true;
  } catch (error) { byId("result").textContent = error?.message || String(error); }
});
window.ethereum?.on?.("accountsChanged", () => refresh(false));
window.ethereum?.on?.("chainChanged", () => refresh(false));
load().catch((error) => { byId("status").textContent = error.message; });
