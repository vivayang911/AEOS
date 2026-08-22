import { AbiCoder, Interface, keccak256, toUtf8Bytes } from "ethers";

export const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const erc20 = new Interface(["function transfer(address recipient,uint256 amount) returns (bool)"]);
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const amountPattern = /^(0|[1-9][0-9]{0,77})$/;

export type Erc20TransferAction = { kind: "ERC20_TRANSFER"; tokenContract: string; recipient: string; amountBaseUnits: string; amountUsd: string };

export function buildErc20TransferAction(input: Erc20TransferAction) {
  if (!addressPattern.test(input.tokenContract) || !addressPattern.test(input.recipient)) throw new Error("INVALID_PROPOSAL_ADDRESS");
  if (!amountPattern.test(input.amountBaseUnits) || BigInt(input.amountBaseUnits) <= 0n || !amountPattern.test(input.amountUsd)) throw new Error("INVALID_PROPOSAL_AMOUNT");
  const tokenContract = input.tokenContract.toLowerCase(); const recipient = input.recipient.toLowerCase();
  const calldata = erc20.encodeFunctionData("transfer", [recipient, BigInt(input.amountBaseUnits)]);
  if (calldata.slice(0, 10).toLowerCase() !== ERC20_TRANSFER_SELECTOR) throw new Error("CALLDATA_SELECTOR_MISMATCH");
  const decoded = erc20.decodeFunctionData("transfer", calldata);
  if (String(decoded[0]).toLowerCase() !== recipient || decoded[1].toString() !== input.amountBaseUnits) throw new Error("CALLDATA_DESCRIPTION_MISMATCH");
  const action = { kind: "ERC20_TRANSFER" as const, tokenContract, recipient, amountBaseUnits: input.amountBaseUnits, amountUsd: input.amountUsd, humanReadable: `Transfer ${input.amountBaseUnits} base units of token ${tokenContract} to ${recipient}` };
  return { action, target: tokenContract, value: "0", calldata, functionSelector: ERC20_TRANSFER_SELECTOR, decoded: { function: "transfer(address,uint256)", recipient, amountBaseUnits: input.amountBaseUnits }, consistencyVerified: true, advisoryOnly: true, assetExecutionAuthorized: false };
}

export function buildGovernorProposalIdentity(targets: string[], values: string[], calldatas: string[], description: string) {
  if (!description.trim() || targets.length === 0 || targets.length !== values.length || targets.length !== calldatas.length) throw new Error("INVALID_GOVERNOR_PROPOSAL_SHAPE");
  const descriptionHash = keccak256(toUtf8Bytes(description));
  const encoded = AbiCoder.defaultAbiCoder().encode(["address[]", "uint256[]", "bytes[]", "bytes32"], [targets, values.map(BigInt), calldatas, descriptionHash]);
  const proposalIdHex = keccak256(encoded);
  return { description, descriptionHash, proposalId: BigInt(proposalIdHex).toString(), proposalIdHex };
}
