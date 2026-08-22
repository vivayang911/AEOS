import { AbiCoder, Interface, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { CREDITCOIN_TESTNET_CHAIN_ID, UscProofSnapshot, WalletTransactionRequest } from "./attestcoin-adapter";

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

export const EVIDENCE_ANCHOR_ABI = [
  "function verifyAndAnchor(bytes32 decisionId,bytes32 snapshotHash,uint64 sourceChainKey,uint64 sourceBlockHeight,bytes encodedTransaction,(bytes32 root,(bytes32 hash,bool isLeft)[] siblings) merkleProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof) returns (bytes32 commitmentId)",
  "event EvidenceAnchored(bytes32 indexed commitmentId,bytes32 indexed decisionId,bytes32 indexed snapshotHash,bytes32 encodedTransactionHash,uint64 sourceChainKey,uint64 sourceBlockHeight,address requester)",
];

const iface = new Interface(EVIDENCE_ANCHOR_ABI);
const coder = AbiCoder.defaultAbiCoder();

export type EvidenceAnchorManifest = {
  schemaVersion: "evidence.anchor.handoff.v1";
  decisionId: string;
  decisionKey: string;
  decisionOutputHash: string;
  evidenceSnapshotId: string;
  evidenceSnapshotHash: string;
  sourceChainKey: number;
  sourceBlockHeight: number;
  encodedTransactionHash: string;
  requester: string;
  ascAddress: string;
  commitmentId: string;
  transaction: WalletTransactionRequest;
  signed: false;
  submitted: false;
  assetExecutionAuthorized: false;
};

export function buildEvidenceAnchorManifest(input: {
  ascAddress: string;
  requester: string;
  decisionId: string;
  decisionOutputHash: string;
  evidenceSnapshotId: string;
  evidenceSnapshotHash: string;
  proof: UscProofSnapshot;
}): EvidenceAnchorManifest {
  if (!input.decisionId.trim() || !input.evidenceSnapshotId.trim()) throw new Error("INVALID_ANCHOR_REFERENCE");
  if (!BYTES32.test(input.decisionOutputHash) || !BYTES32.test(input.evidenceSnapshotHash)) throw new Error("INVALID_ANCHOR_HASH");
  if (!Number.isSafeInteger(input.proof.chainKey) || input.proof.chainKey <= 0 || !Number.isSafeInteger(input.proof.headerNumber) || input.proof.headerNumber <= 0 || !/^0x(?:[0-9a-fA-F]{2})+$/.test(input.proof.txBytes)) throw new Error("INVALID_ANCHOR_PROOF");
  const ascAddress = getAddress(input.ascAddress).toLowerCase();
  const requester = getAddress(input.requester).toLowerCase();
  const decisionKey = keccak256(toUtf8Bytes(input.decisionId));
  const snapshotHash = input.evidenceSnapshotHash.toLowerCase();
  const encodedTransactionHash = keccak256(input.proof.txBytes);
  const commitmentId = keccak256(coder.encode(
    ["bytes32", "bytes32", "uint64", "uint64", "bytes32", "address"],
    [decisionKey, snapshotHash, input.proof.chainKey, input.proof.headerNumber, encodedTransactionHash, requester],
  ));
  const data = iface.encodeFunctionData("verifyAndAnchor", [decisionKey, snapshotHash, input.proof.chainKey, input.proof.headerNumber, input.proof.txBytes, input.proof.merkleProof, input.proof.continuityProof]);
  return {
    schemaVersion: "evidence.anchor.handoff.v1",
    decisionId: input.decisionId,
    decisionKey,
    decisionOutputHash: input.decisionOutputHash.toLowerCase(),
    evidenceSnapshotId: input.evidenceSnapshotId,
    evidenceSnapshotHash: snapshotHash,
    sourceChainKey: input.proof.chainKey,
    sourceBlockHeight: input.proof.headerNumber,
    encodedTransactionHash,
    requester,
    ascAddress,
    commitmentId,
    transaction: { chainId: CREDITCOIN_TESTNET_CHAIN_ID, from: requester, to: ascAddress, data, value: "0x0" },
    signed: false,
    submitted: false,
    assetExecutionAuthorized: false,
  };
}

export function parseAndValidateEvidenceAnchoredLog(log: { address: string; topics: readonly string[]; data: string }, manifest: EvidenceAnchorManifest) {
  if (log.address.toLowerCase() !== manifest.ascAddress) return null;
  let parsed;
  try { parsed = iface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; }
  if (!parsed || parsed.name !== "EvidenceAnchored") return null;
  const exact = String(parsed.args.commitmentId).toLowerCase() === manifest.commitmentId
    && String(parsed.args.decisionId).toLowerCase() === manifest.decisionKey
    && String(parsed.args.snapshotHash).toLowerCase() === manifest.evidenceSnapshotHash
    && String(parsed.args.encodedTransactionHash).toLowerCase() === manifest.encodedTransactionHash
    && Number(parsed.args.sourceChainKey) === manifest.sourceChainKey
    && Number(parsed.args.sourceBlockHeight) === manifest.sourceBlockHeight
    && String(parsed.args.requester).toLowerCase() === manifest.requester;
  if (!exact) throw new Error("EVIDENCE_ANCHOR_EVENT_MISMATCH");
  return { commitmentId: manifest.commitmentId, decisionKey: manifest.decisionKey, snapshotHash: manifest.evidenceSnapshotHash };
}
