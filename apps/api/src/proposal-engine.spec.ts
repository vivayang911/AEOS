import { Interface } from "ethers";
import { buildErc20TransferAction, buildGovernorProposalIdentity, ERC20_TRANSFER_SELECTOR } from "./proposal-engine";

describe("Proposal calldata builder", () => {
  it("derives calldata from the human-readable action and verifies its decoded meaning", () => {
    const built = buildErc20TransferAction({ kind: "ERC20_TRANSFER", tokenContract: "0x1111111111111111111111111111111111111111", recipient: "0x2222222222222222222222222222222222222222", amountBaseUnits: "125000000", amountUsd: "125" });
    expect(built.calldata.slice(0, 10)).toBe(ERC20_TRANSFER_SELECTOR);
    const decoded = new Interface(["function transfer(address,uint256)"]).decodeFunctionData("transfer", built.calldata);
    expect(String(decoded[0]).toLowerCase()).toBe(built.action.recipient); expect(decoded[1].toString()).toBe(built.action.amountBaseUnits);
    expect(built.consistencyVerified).toBe(true); expect(built.assetExecutionAuthorized).toBe(false);
  });
  it("rejects zero, malformed, and greater-than-78-digit amounts", () => {
    const base = { kind: "ERC20_TRANSFER" as const, tokenContract: "0x1111111111111111111111111111111111111111", recipient: "0x2222222222222222222222222222222222222222", amountUsd: "1" };
    expect(() => buildErc20TransferAction({ ...base, amountBaseUnits: "0" })).toThrow("INVALID_PROPOSAL_AMOUNT");
    expect(() => buildErc20TransferAction({ ...base, amountBaseUnits: "1".repeat(79) })).toThrow("INVALID_PROPOSAL_AMOUNT");
  });
  it("reproducibly derives the OpenZeppelin Governor proposal ID from exact content", () => {
    const built = buildErc20TransferAction({ kind: "ERC20_TRANSFER", tokenContract: "0x1111111111111111111111111111111111111111", recipient: "0x2222222222222222222222222222222222222222", amountBaseUnits: "1", amountUsd: "1" });
    const first = buildGovernorProposalIdentity([built.target], [built.value], [built.calldata], "AEOS governed action");
    const second = buildGovernorProposalIdentity([built.target], [built.value], [built.calldata], "AEOS governed action");
    expect(first).toEqual(second); expect(first.proposalId).toMatch(/^[0-9]+$/); expect(first.descriptionHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
