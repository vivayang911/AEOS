const { createHash } = require("node:crypto");
const { Interface, getAddress, formatUnits } = require("ethers");

const CIRCLE_SEPOLIA_USDC = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238";
const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_KEY = 1;
const USDC_DECIMALS = 6;
const ERC20 = new Interface([
  "function transfer(address to,uint256 value) returns (bool)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
    : JSON.stringify(value);

const hash = (value) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;

function requireHex(value, bytes, code) {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(value)) throw new Error(code);
  return value.toLowerCase();
}

function decodeTransfer(source) {
  if (source.to?.toLowerCase() !== CIRCLE_SEPOLIA_USDC) throw new Error("USDC_CONTRACT_MISMATCH");
  const parsed = ERC20.parseTransaction({ data: source.data, value: BigInt(source.value) });
  if (!parsed || parsed.name !== "transfer") throw new Error("USDC_TRANSFER_CALL_MISSING");
  return { recipient: getAddress(parsed.args[0]).toLowerCase(), amountBaseUnits: parsed.args[1].toString() };
}

function findTransferLog(receipt, expected) {
  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() !== CIRCLE_SEPOLIA_USDC) continue;
    try {
      const parsed = ERC20.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "Transfer" && getAddress(parsed.args[1]).toLowerCase() === expected.recipient && parsed.args[2].toString() === expected.amountBaseUnits) {
        return { logIndex: Number(log.index), from: getAddress(parsed.args[0]).toLowerCase(), to: expected.recipient, amountBaseUnits: expected.amountBaseUnits };
      }
    } catch { /* fail closed after inspecting all logs */ }
  }
  throw new Error("USDC_TRANSFER_LOG_MISSING_OR_MISMATCH");
}

function buildArtifact({ sourceChainStatus, source, proof, receipt, latestSourceBlock, monitoredAddress, expectedAmountBaseUnits, observedAt }) {
  const monitored = getAddress(monitoredAddress).toLowerCase();
  const amount = BigInt(expectedAmountBaseUnits).toString();
  if (source.chainId !== SEPOLIA_CHAIN_ID || source.chainKey !== SEPOLIA_CHAIN_KEY) throw new Error("SOURCE_CHAIN_MISMATCH");
  if (!sourceChainStatus?.observedOnChain || !sourceChainStatus.sourceSupported || sourceChainStatus.selected?.chainId !== SEPOLIA_CHAIN_ID || sourceChainStatus.selected?.chainKey !== SEPOLIA_CHAIN_KEY) throw new Error("CHAIN_INFO_SUPPORT_NOT_VERIFIED");
  if (sourceChainStatus.selected.latestAttestedHeight < source.blockNumber) throw new Error("SOURCE_HEIGHT_NOT_ATTESTED");
  if (source.status !== 1 || receipt.status !== 1) throw new Error("SOURCE_TRANSACTION_NOT_SUCCESSFUL");
  if (receipt.hash?.toLowerCase() !== source.transactionHash || receipt.blockHash?.toLowerCase() !== source.blockHash || receipt.blockNumber !== source.blockNumber) throw new Error("SOURCE_RECEIPT_MISMATCH");
  if (proof.chainKey !== SEPOLIA_CHAIN_KEY || proof.headerNumber !== source.blockNumber || proof.txHash?.toLowerCase() !== source.transactionHash) throw new Error("PROOF_SOURCE_MISMATCH");
  requireHex(source.transactionHash, 32, "SOURCE_TRANSACTION_HASH_INVALID");
  requireHex(source.blockHash, 32, "SOURCE_BLOCK_HASH_INVALID");
  const decoded = decodeTransfer(source);
  if (decoded.recipient !== monitored) throw new Error("USDC_RECIPIENT_MISMATCH");
  if (decoded.amountBaseUnits !== amount) throw new Error("USDC_AMOUNT_MISMATCH");
  const transferLog = findTransferLog(receipt, decoded);
  const confirmations = Number(latestSourceBlock) - source.blockNumber + 1;
  if (!Number.isSafeInteger(confirmations) || confirmations < 2) throw new Error("SOURCE_TRANSACTION_NOT_FINALIZED");

  const sourceSnapshot = {
    chainId: source.chainId,
    chainKey: source.chainKey,
    transactionHash: source.transactionHash,
    blockNumber: source.blockNumber,
    blockHash: source.blockHash,
    from: source.from,
    to: source.to,
    nativeValue: source.value,
    calldata: source.data,
    status: source.status,
    blockObservedAt: source.observedAt,
  };
  const proofPayload = {
    chainKey: proof.chainKey,
    headerNumber: proof.headerNumber,
    txIndex: proof.txIndex,
    txHash: proof.txHash,
    txBytes: proof.txBytes,
    merkleProof: proof.merkleProof,
    continuityProof: proof.continuityProof,
  };
  const economicEvent = {
    predicate: "asset.transfer.inflow",
    network: "Ethereum Sepolia",
    token: { standard: "ERC20", symbol: "USDC", decimals: USDC_DECIMALS, contract: CIRCLE_SEPOLIA_USDC },
    monitoredAddress: monitored,
    sender: transferLog.from,
    amountBaseUnits: amount,
    amountFormatted: formatUnits(amount, USDC_DECIMALS),
    calldataTransferMatched: true,
    receiptTransferLogMatched: true,
    transferLogIndex: transferLog.logIndex,
  };
  const frozen = {
    sourceSnapshotHash: hash(sourceSnapshot),
    proofPayloadHash: hash(proofPayload),
    economicEventHash: hash(economicEvent),
  };
  frozen.bundleHash = hash(frozen);

  return {
    schemaVersion: "aeos.live-economic-evidence.usdc-inflow.v1",
    status: "USC_PROOF_STATICALLY_VERIFIED",
    provider: "attestcoin-usc-sdk-0.18.0",
    observedAt,
    sourceChainStatus,
    source: sourceSnapshot,
    sourceFinality: { receiptStatus: 1, confirmations, latestSourceBlock: Number(latestSourceBlock), canonicalReceiptMatched: true },
    economicEvent,
    proof: { ...proofPayload, cached: proof.cached, generatedAt: proof.generatedAt },
    verification: {
      chainInfoSupportReadFromCreditcoin: true,
      proofBuilderSourceMatched: true,
      blockProverStaticVerificationPassed: true,
      sourceReceiptCorroborated: true,
      frozen,
    },
    truthBoundary: {
      verifiedClaim: "ATTESTCOIN_VERIFIED_TRANSACTION_INCLUSION_AND_CALLDATA",
      corroboratedClaim: "SEPOLIA_RECEIPT_CONTAINS_MATCHING_USDC_TRANSFER_LOG",
      testnetAssetOnly: true,
      realFinancialValueClaimed: false,
      currentBalanceVerifiedByAttestcoin: false,
      priceVerified: false,
      liquidityVerified: false,
      performanceOrCausalImpactVerified: false,
    },
    controls: {
      readOnly: true,
      signed: false,
      submitted: false,
      signerCustody: false,
      broadcastCapability: false,
      assetExecutionAuthorized: false,
    },
  };
}

function validateStoredArtifact(artifact) {
  if (artifact?.schemaVersion !== "aeos.live-economic-evidence.usdc-inflow.v1" || artifact.status !== "USC_PROOF_STATICALLY_VERIFIED") throw new Error("LIVE_USDC_ARTIFACT_INVALID");
  if (artifact.source?.chainId !== SEPOLIA_CHAIN_ID || artifact.source?.chainKey !== SEPOLIA_CHAIN_KEY || artifact.proof?.chainKey !== SEPOLIA_CHAIN_KEY) throw new Error("LIVE_USDC_CHAIN_MISMATCH");
  if (artifact.source.transactionHash !== artifact.proof.txHash || artifact.source.blockNumber !== artifact.proof.headerNumber) throw new Error("LIVE_USDC_PROOF_SOURCE_MISMATCH");
  if (artifact.economicEvent?.token?.contract !== CIRCLE_SEPOLIA_USDC || artifact.economicEvent?.token?.symbol !== "USDC" || artifact.economicEvent?.token?.decimals !== USDC_DECIMALS) throw new Error("LIVE_USDC_TOKEN_IDENTITY_MISMATCH");
  if (artifact.economicEvent?.amountBaseUnits !== "20000000" || artifact.economicEvent?.amountFormatted !== "20.0") throw new Error("LIVE_USDC_AMOUNT_MISMATCH");
  if (artifact.economicEvent?.calldataTransferMatched !== true || artifact.economicEvent?.receiptTransferLogMatched !== true) throw new Error("LIVE_USDC_EVENT_CORROBORATION_MISSING");
  const sourceSnapshotHash = hash(artifact.source);
  const proofPayload = { chainKey: artifact.proof.chainKey, headerNumber: artifact.proof.headerNumber, txIndex: artifact.proof.txIndex, txHash: artifact.proof.txHash, txBytes: artifact.proof.txBytes, merkleProof: artifact.proof.merkleProof, continuityProof: artifact.proof.continuityProof };
  const proofPayloadHash = hash(proofPayload);
  const economicEventHash = hash(artifact.economicEvent);
  const bundleHash = hash({ sourceSnapshotHash, proofPayloadHash, economicEventHash });
  const frozen = artifact.verification?.frozen;
  if (frozen?.sourceSnapshotHash !== sourceSnapshotHash || frozen?.proofPayloadHash !== proofPayloadHash || frozen?.economicEventHash !== economicEventHash || frozen?.bundleHash !== bundleHash) throw new Error("LIVE_USDC_FROZEN_HASH_MISMATCH");
  if (artifact.verification?.chainInfoSupportReadFromCreditcoin !== true || artifact.verification?.proofBuilderSourceMatched !== true || artifact.verification?.blockProverStaticVerificationPassed !== true) throw new Error("LIVE_USDC_PROOF_VERIFICATION_MISSING");
  if (artifact.truthBoundary?.verifiedClaim !== "ATTESTCOIN_VERIFIED_TRANSACTION_INCLUSION_AND_CALLDATA" || artifact.truthBoundary?.testnetAssetOnly !== true || artifact.truthBoundary?.realFinancialValueClaimed !== false || artifact.truthBoundary?.currentBalanceVerifiedByAttestcoin !== false || artifact.truthBoundary?.priceVerified !== false || artifact.truthBoundary?.liquidityVerified !== false || artifact.truthBoundary?.performanceOrCausalImpactVerified !== false) throw new Error("LIVE_USDC_TRUTH_BOUNDARY_INVALID");
  if (artifact.controls?.readOnly !== true || artifact.controls?.signed !== false || artifact.controls?.submitted !== false || artifact.controls?.signerCustody !== false || artifact.controls?.broadcastCapability !== false || artifact.controls?.assetExecutionAuthorized !== false) throw new Error("LIVE_USDC_AUTHORITY_BOUNDARY_INVALID");
  return { transactionHash: artifact.source.transactionHash, sourceBlockNumber: artifact.source.blockNumber, amount: `${artifact.economicEvent.amountFormatted} USDC`, monitoredAddress: artifact.economicEvent.monitoredAddress, bundleHash, assetExecutionAuthorized: false };
}

module.exports = { CIRCLE_SEPOLIA_USDC, buildArtifact, canonical, decodeTransfer, hash, validateStoredArtifact };
