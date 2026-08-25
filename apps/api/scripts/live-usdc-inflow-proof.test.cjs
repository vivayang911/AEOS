const assert = require("node:assert/strict");
const test = require("node:test");
const { Interface } = require("ethers");
const { CIRCLE_SEPOLIA_USDC, buildArtifact, validateStoredArtifact } = require("./live-usdc-inflow-proof.cjs");

const monitored = "0x444d510728fb8072351cb5d0e88432e6a8501dfa";
const sender = "0xd4c0b787aa2ff9eb751bb515c877ebbf2daddaae";
const txHash = `0x${"11".repeat(32)}`;
const blockHash = `0x${"22".repeat(32)}`;
const erc20 = new Interface(["function transfer(address,uint256)", "event Transfer(address indexed from,address indexed to,uint256 value)"]);
const event = erc20.encodeEventLog(erc20.getEvent("Transfer"), [sender, monitored, 20_000_000n]);
const source = { chainId: 11155111, chainKey: 1, transactionHash: txHash, blockNumber: 123, blockHash, from: sender, to: CIRCLE_SEPOLIA_USDC, value: "0", data: erc20.encodeFunctionData("transfer", [monitored, 20_000_000n]), status: 1, observedAt: "2026-08-25T00:00:00.000Z" };
const proof = { chainKey: 1, headerNumber: 123, txIndex: 4, txHash, txBytes: "0x01", merkleProof: { root: `0x${"33".repeat(32)}`, siblings: [] }, continuityProof: { lowerEndpointDigest: `0x${"44".repeat(32)}`, roots: [] }, cached: true, generatedAt: "2026-08-25T00:01:00.000Z" };
const receipt = { hash: txHash, blockHash, blockNumber: 123, status: 1, logs: [{ address: CIRCLE_SEPOLIA_USDC, topics: event.topics, data: event.data, index: 2 }] };
const sourceChainStatus = { observedOnChain: true, sourceSupported: true, selected: { chainId: 11155111, chainKey: 1, latestAttestedHeight: 130 } };
const input = { sourceChainStatus, source, proof, receipt, latestSourceBlock: 130, monitoredAddress: monitored, expectedAmountBaseUnits: "20000000", observedAt: "2026-08-25T00:02:00.000Z" };

test("freezes a real-USDC-shaped inflow without promoting the truth boundary", () => {
  const artifact = buildArtifact(input);
  assert.equal(artifact.status, "USC_PROOF_STATICALLY_VERIFIED");
  assert.equal(artifact.economicEvent.amountFormatted, "20.0");
  assert.equal(artifact.economicEvent.monitoredAddress, monitored);
  assert.equal(artifact.verification.blockProverStaticVerificationPassed, true);
  assert.equal(artifact.truthBoundary.currentBalanceVerifiedByAttestcoin, false);
  assert.equal(artifact.truthBoundary.realFinancialValueClaimed, false);
  assert.equal(artifact.controls.assetExecutionAuthorized, false);
  assert.equal(validateStoredArtifact(artifact).bundleHash, artifact.verification.frozen.bundleHash);
});

test("fails closed on contract, recipient, amount, proof, receipt, and attested-height mismatch", () => {
  assert.throws(() => buildArtifact({ ...input, source: { ...source, to: monitored } }), /USDC_CONTRACT_MISMATCH/);
  assert.throws(() => buildArtifact({ ...input, monitoredAddress: sender }), /USDC_RECIPIENT_MISMATCH/);
  assert.throws(() => buildArtifact({ ...input, expectedAmountBaseUnits: "1" }), /USDC_AMOUNT_MISMATCH/);
  assert.throws(() => buildArtifact({ ...input, proof: { ...proof, headerNumber: 124 } }), /PROOF_SOURCE_MISMATCH/);
  assert.throws(() => buildArtifact({ ...input, receipt: { ...receipt, status: 0 } }), /SOURCE_TRANSACTION_NOT_SUCCESSFUL/);
  assert.throws(() => buildArtifact({ ...input, sourceChainStatus: { ...sourceChainStatus, selected: { ...sourceChainStatus.selected, latestAttestedHeight: 122 } } }), /SOURCE_HEIGHT_NOT_ATTESTED/);
});

test("stored artifact verification rejects frozen-hash, authority, and truth promotion", () => {
  const artifact = buildArtifact(input);
  assert.throws(() => validateStoredArtifact({ ...artifact, source: { ...artifact.source, blockNumber: 124 } }), /PROOF_SOURCE_MISMATCH/);
  assert.throws(() => validateStoredArtifact({ ...artifact, controls: { ...artifact.controls, submitted: true } }), /AUTHORITY_BOUNDARY_INVALID/);
  assert.throws(() => validateStoredArtifact({ ...artifact, truthBoundary: { ...artifact.truthBoundary, priceVerified: true } }), /TRUTH_BOUNDARY_INVALID/);
});
