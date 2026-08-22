"use strict";

let handoff;
let validatedAccount;

const statusNode = document.querySelector("#status");
const deployButton = document.querySelector("#deploy");
const validateButton = document.querySelector("#validate");
const switchNetworkButton = document.querySelector("#switch-network");
const reconnectAccountButton = document.querySelector("#reconnect-account");
const resetAccountButton = document.querySelector("#reset-account");

function status(message) { statusNode.textContent = message; }
function check(name, ok, text) {
  const node = document.querySelector(`[data-check="${name}"]`);
  node.classList.toggle("ok", ok);
  node.textContent = `${ok ? "PASS" : "FAIL"} — ${text}`;
}
function fact(label, value) {
  const item = document.createElement("div");
  item.className = "fact";
  const small = document.createElement("small");
  small.textContent = label;
  const code = document.createElement("code");
  code.textContent = value;
  item.append(small, code);
  return item;
}

async function load() {
  handoff = await fetch("/handoff", { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error(`Handoff load failed: ${response.status}`);
    return response.json();
  });
  const facts = document.querySelector("#facts");
  const constructorFacts = handoff.plan.constructor.nativeQueryVerifier
    ? [["Native verifier", handoff.plan.constructor.nativeQueryVerifier], ["Source chain key", String(handoff.plan.constructor.allowedSourceChainKey)]]
    : [["Immutable reporter", handoff.plan.constructor.reporter]];
  [
    ["Network", `${handoff.chain.name} (${handoff.chain.chainId})`],
    ["Deployer", handoff.deployer],
    ["Contract", handoff.plan.contract],
    ["Predicted address", handoff.predictedContractAddress],
    ...constructorFacts,
    ["Transaction value", `${handoff.plan.unsignedTransaction.value} ${handoff.chain.currencySymbol}`],
    ["Estimated maximum cost", `${handoff.gas.estimatedMaxCostWei} wei`],
    ["Plan hash", handoff.plan.planHash],
    ["Init code hash", handoff.plan.unsignedTransaction.initCodeHash],
  ].forEach(([label, value]) => facts.append(fact(label, value)));
  status("Unsigned handoff loaded. Connect the designated wallet to run deterministic checks.");
}

async function validate() {
  deployButton.disabled = true;
  if (!window.ethereum) throw new Error("MetaMask-compatible provider not found");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  check("wallet", accounts.length > 0, "Wallet connected");
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  const expectedChainHex = `0x${handoff.chain.chainId.toString(16)}`;
  const chainOk = chainId.toLowerCase() === expectedChainHex;
  check("chain", chainOk, `Observed ${chainId}; expected ${expectedChainHex}`);
  const account = accounts[0] || "";
  const accountOk = account.toLowerCase() === handoff.deployer.toLowerCase();
  check("account", accountOk, `Observed ${account || "none"}`);
  const pendingNonceHex = await window.ethereum.request({ method: "eth_getTransactionCount", params: [account, "pending"] });
  const pendingNonce = Number.parseInt(pendingNonceHex, 16);
  const nonceOk = pendingNonce === handoff.pendingNonce;
  check("nonce", nonceOk, `Observed ${pendingNonce}; expected ${handoff.pendingNonce}`);
  const observedHash = await window.ethereum.request({ method: "web3_sha3", params: [handoff.plan.unsignedTransaction.data] });
  const bytecodeOk = observedHash.toLowerCase() === handoff.plan.unsignedTransaction.initCodeHash.toLowerCase();
  check("bytecode", bytecodeOk, `Observed ${observedHash}`);
  if (!chainOk || !accountOk || !nonceOk || !bytecodeOk) throw new Error("Deterministic guardrail validation failed; deployment remains disabled");
  validatedAccount = account;
  deployButton.disabled = false;
  status("All deterministic checks passed. Deployment remains unsubmitted until you explicitly request it and confirm in MetaMask.");
}

async function switchNetwork() {
  if (!window.ethereum) throw new Error("MetaMask-compatible provider not found");
  deployButton.disabled = true;
  try {
    const expectedChainHex = `0x${handoff.chain.chainId.toString(16)}`;
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: expectedChainHex }] });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: expectedChainHex,
        chainName: handoff.chain.name,
        nativeCurrency: { name: "Creditcoin", symbol: handoff.chain.currencySymbol, decimals: 18 },
        rpcUrls: [handoff.chain.rpcUrl],
        blockExplorerUrls: [handoff.chain.explorerUrl],
      }],
    });
  }
  status(`${handoff.chain.name} selected. Reconnect the designated account, then validate again.`);
}

async function reconnectAccount() {
  if (!window.ethereum) throw new Error("MetaMask-compatible provider not found");
  deployButton.disabled = true;
  await window.ethereum.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
  status(`Account permission refreshed. Select ${handoff.deployer}, then validate again.`);
}

async function resetAccountPermission() {
  if (!window.ethereum) throw new Error("MetaMask-compatible provider not found");
  deployButton.disabled = true;
  await window.ethereum.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  validatedAccount = undefined;
  status("Old site account permission removed. Click Connect & validate wallet and authorize only the target account.");
}

async function deploy() {
  deployButton.disabled = true;
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  const nonceHex = await window.ethereum.request({ method: "eth_getTransactionCount", params: [validatedAccount, "pending"] });
  const expectedChainHex = `0x${handoff.chain.chainId.toString(16)}`;
  if (chainId.toLowerCase() !== expectedChainHex || accounts[0]?.toLowerCase() !== validatedAccount.toLowerCase() || Number.parseInt(nonceHex, 16) !== handoff.pendingNonce) {
    throw new Error("Wallet state changed after validation; reconnect and validate again");
  }
  status("MetaMask confirmation requested. Review the zero-value contract creation and confirm it in your wallet.");
  const transactionHash = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [{ from: validatedAccount, data: handoff.plan.unsignedTransaction.data, value: "0x0" }],
  });
  await fetch("/submission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactionHash, from: validatedAccount }),
  }).then(async (response) => {
    if (!response.ok) throw new Error((await response.json()).error || "Submission record failed");
  });
  status(`Wallet submitted transaction:\n${transactionHash}\n\nWaiting for the chain receipt…`);
  for (;;) {
    const receipt = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [transactionHash] });
    if (receipt) {
      const succeeded = receipt.status === "0x1";
      status(`${succeeded ? "DEPLOYED" : "FAILED"}\nTransaction: ${transactionHash}\nContract: ${receipt.contractAddress || "none"}\nBlock: ${Number.parseInt(receipt.blockNumber, 16)}`);
      if (!succeeded) throw new Error("Deployment transaction reverted");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

validateButton.addEventListener("click", () => validate().catch((error) => status(error.message)));
switchNetworkButton.addEventListener("click", () => switchNetwork().catch((error) => status(error.message)));
reconnectAccountButton.addEventListener("click", () => reconnectAccount().catch((error) => status(error.message)));
resetAccountButton.addEventListener("click", () => resetAccountPermission().catch((error) => status(error.message)));
deployButton.addEventListener("click", () => deploy().catch((error) => { status(error.message); deployButton.disabled = false; }));
window.ethereum?.on?.("accountsChanged", () => { deployButton.disabled = true; status("Wallet account changed. Validate again."); });
window.ethereum?.on?.("chainChanged", () => { deployButton.disabled = true; status("Wallet network changed. Validate again."); });
load().catch((error) => status(error.message));
