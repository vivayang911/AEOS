import { buildExecutionPreflight, executionActionId } from "./execution-engine";
import { buildErc20TransferAction } from "./proposal-engine";

const action = buildErc20TransferAction({ kind:"ERC20_TRANSFER",tokenContract:"0x1111111111111111111111111111111111111111",recipient:"0x2222222222222222222222222222222222222222",amountBaseUnits:"1000000",amountUsd:"1" });
const hash = (byte:string)=>`0x${byte.repeat(64)}`;
const base = {
  proposal:{content:{governor:{proposalId:"123"},policy:{contentHash:hash("1")}},content_hash:hash("2"),targets:[action.target],calldatas:[action.calldata]},
  policy:{id:"policy_1",status:"ACTIVE",version:1,content_hash:hash("1")},
  governance:{state:"QUEUED",chain_id:11155111,external_proposal_id:"123",payload:{onchainFinalityVerified:true,mockOnly:false}},
  guard:{mode:"evm-readonly" as const,chainId:11155111,address:"0x3333333333333333333333333333333333333333",policyRegistry:"0x4444444444444444444444444444444444444444",paused:false,policyHash:hash("1"),policyVersion:1,policyValidFrom:1,policyValidUntil:2000000000,registryPolicyHash:hash("1"),registryPolicyValidFrom:1,registryPolicyValidUntil:2000000000,policyRegistryBindingVerified:true,targetAllowed:true,selectorAllowed:true,actionConsumed:false,blockNumber:100,blockHash:hash("4"),confirmations:2,onchainReadVerified:true,assetExecutionAuthorized:false as const},
  evidenceEligible:true,resimulation:{status:"SUGGESTED",blockers:[]},actionId:hash("5"),actionCalldata:action.calldata,actionTarget:action.target,actionSelector:action.functionSelector,deadline:2000000000,expiresAt:"2033-05-18T03:33:20.000Z",
};

describe("execution preflight engine",()=>{
  it("builds only an unsigned non-asset-moving Safe review payload when every check passes",()=>{const result=buildExecutionPreflight(base);expect(result.status).toBe("READY_FOR_SAFE_REVIEW");expect(result.blockers).toEqual([]);expect(result.safeHandoff).toEqual(expect.objectContaining({to:base.guard.address,signed:false,submitted:false,executesAssetTransfer:false}));expect(result.assetExecutionAuthorized).toBe(false)});
  it("blocks and removes handoff material when the Guard is paused",()=>{const result=buildExecutionPreflight({...base,guard:{...base.guard,paused:true}});expect(result.status).toBe("BLOCKED");expect(result.blockers).toContain("GUARD_NOT_PAUSED");expect(result.safeHandoff).toBeNull()});
  it("blocks an unbound or mismatched Registry and a policy window that cannot cover the action deadline",()=>{expect(buildExecutionPreflight({...base,guard:{...base.guard,policyRegistry:null}}).blockers).toContain("GUARD_POLICY_REGISTRY_BOUND");expect(buildExecutionPreflight({...base,guard:{...base.guard,policyRegistryBindingVerified:false}}).blockers).toContain("GUARD_POLICY_REGISTRY_SNAPSHOT");expect(buildExecutionPreflight({...base,guard:{...base.guard,policyValidUntil:base.deadline-1}}).blockers).toContain("GUARD_POLICY_VALID_AT_DEADLINE")});
  it("derives the same action ID only from frozen Proposal, governance and policy hashes",()=>{expect(executionActionId(hash("2"),hash("3"),hash("1"))).toBe(executionActionId(hash("2"),hash("3"),hash("1")));expect(executionActionId(hash("2"),hash("4"),hash("1"))).not.toBe(executionActionId(hash("2"),hash("3"),hash("1")))});
});
