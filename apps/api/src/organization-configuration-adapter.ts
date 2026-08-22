import { Contract, JsonRpcProvider } from "ethers";
import { OrganizationConfiguration } from "./organization-configuration-engine";

export const ORGANIZATION_CONFIGURATION_ADAPTER = Symbol("ORGANIZATION_CONFIGURATION_ADAPTER");
export interface OrganizationConfigurationInspection {
  mode: "mock"|"evm-readonly"; provider: string; status: "MOCK_ONLY"|"VERIFIED_READ_ONLY";
  chainId: number; blockNumber: number|null; blockHash: string|null; confirmations: number;
  contracts: Record<string, unknown>; mockOnly: boolean; onchainInterfacesVerified: boolean;
  readsOnly: true; signsTransactions: false; submitsTransactions: false; assetExecutionAuthorized: false;
}
export interface OrganizationConfigurationAdapter {
  readonly mode: "mock"|"evm-readonly"; readonly provider: string;
  configuration(): Record<string, unknown>;
  inspect(config: OrganizationConfiguration): Promise<OrganizationConfigurationInspection>;
}

export class MockOrganizationConfigurationAdapter implements OrganizationConfigurationAdapter {
  readonly mode="mock" as const; readonly provider="mock-organization-configuration-v1";
  configuration(){return {mode:this.mode,provider:this.provider,readsOnly:true,signsTransactions:false,submitsTransactions:false,onchainInterfacesVerified:false,assetExecutionAuthorized:false,warning:"Mock validates deterministic shape only; it does not prove chain or contract interfaces"}}
  async inspect(config:OrganizationConfiguration):Promise<OrganizationConfigurationInspection>{
    const contracts=Object.fromEntries(["governorAddress","timelockAddress","safeAddress","treasuryAddress","treasuryGuardAddress"].map((key)=>[key,{address:(config as any)[key],codePresent:false,interfaceVerified:false}]));
    return {mode:this.mode,provider:this.provider,status:"MOCK_ONLY",chainId:config.chainId,blockNumber:null,blockHash:null,confirmations:0,contracts,mockOnly:true,onchainInterfacesVerified:false,readsOnly:true,signsTransactions:false,submitsTransactions:false,assetExecutionAuthorized:false};
  }
}

export class EvmOrganizationConfigurationReadAdapter implements OrganizationConfigurationAdapter {
  readonly mode="evm-readonly" as const; readonly provider="evm-organization-configuration-readonly-v1"; private readonly rpc:JsonRpcProvider;
  constructor(rpcUrl:string,readonly chainId:number,readonly confirmationLag=2){
    if(!rpcUrl||!Number.isSafeInteger(chainId)||chainId<=0||!Number.isSafeInteger(confirmationLag)||confirmationLag<1)throw new Error("Valid ORGANIZATION_CONFIG_RPC_URL, chain ID and confirmation lag are required");
    this.rpc=new JsonRpcProvider(rpcUrl,chainId,{staticNetwork:true});
  }
  configuration(){return {mode:this.mode,provider:this.provider,chainId:this.chainId,confirmationLag:this.confirmationLag,readsOnly:true,rpcMethods:["eth_chainId","eth_blockNumber","eth_getBlockByNumber","eth_getCode","eth_call"],signsTransactions:false,submitsTransactions:false,assetExecutionAuthorized:false}}
  async inspect(config:OrganizationConfiguration):Promise<OrganizationConfigurationInspection>{
    if(config.chainId!==this.chainId)throw new Error("ORGANIZATION_CONFIGURATION_CHAIN_MISMATCH");
    const [network,latest]=await Promise.all([this.rpc.getNetwork(),this.rpc.getBlockNumber()]);
    if(Number(network.chainId)!==this.chainId)throw new Error("ORGANIZATION_CONFIGURATION_RPC_CHAIN_MISMATCH");
    const safeBlock=latest-this.confirmationLag;if(safeBlock<0)throw new Error("ORGANIZATION_CONFIGURATION_CHAIN_NOT_CONFIRMED");
    const block=await this.rpc.getBlock(safeBlock);if(!block?.hash)throw new Error("ORGANIZATION_CONFIGURATION_SAFE_BLOCK_NOT_FOUND");
    const addresses={governorAddress:config.governorAddress,timelockAddress:config.timelockAddress,safeAddress:config.safeAddress,treasuryAddress:config.treasuryAddress,treasuryGuardAddress:config.treasuryGuardAddress};
    const codeEntries=await Promise.all(Object.entries(addresses).map(async([key,address])=>[key,await this.rpc.getCode(address,safeBlock)] as const));
    const code=Object.fromEntries(codeEntries) as Record<string,string>;
    for(const key of ["governorAddress","timelockAddress","safeAddress","treasuryGuardAddress"])if(code[key]==="0x")throw new Error(`ORGANIZATION_CONFIGURATION_CODE_MISSING_${key}`);
    const options={blockTag:safeBlock};
    try{
      const governor=new Contract(config.governorAddress,["function name() view returns(string)","function votingDelay() view returns(uint256)"],this.rpc);
      const timelock=new Contract(config.timelockAddress,["function getMinDelay() view returns(uint256)"],this.rpc);
      const safe=new Contract(config.safeAddress,["function getThreshold() view returns(uint256)","function getOwners() view returns(address[])","function nonce() view returns(uint256)"],this.rpc);
      const guard=new Contract(config.treasuryGuardAddress,["function paused() view returns(bool)","function governance() view returns(address)","function guardian() view returns(address)"],this.rpc);
      const [governorName,votingDelay,minDelay,threshold,owners,safeNonce,paused,governance,guardian]=await Promise.all([
        governor.name.staticCall(options),governor.votingDelay.staticCall(options),timelock.getMinDelay.staticCall(options),safe.getThreshold.staticCall(options),safe.getOwners.staticCall(options),safe.nonce.staticCall(options),guard.paused.staticCall(options),guard.governance.staticCall(options),guard.guardian.staticCall(options)
      ]);
      const thresholdNumber=Number(threshold);if(thresholdNumber<1||thresholdNumber>(owners as string[]).length)throw new Error("ORGANIZATION_CONFIGURATION_SAFE_THRESHOLD_INVALID");
      const governanceAddress=String(governance).toLowerCase();if(![config.timelockAddress.toLowerCase(),config.safeAddress.toLowerCase()].includes(governanceAddress))throw new Error("ORGANIZATION_CONFIGURATION_GUARD_GOVERNANCE_MISMATCH");
      const contracts={
        governorAddress:{address:config.governorAddress,codePresent:true,interfaceVerified:true,name:String(governorName),votingDelay:String(votingDelay)},
        timelockAddress:{address:config.timelockAddress,codePresent:true,interfaceVerified:true,minDelay:String(minDelay)},
        safeAddress:{address:config.safeAddress,codePresent:true,interfaceVerified:true,threshold:thresholdNumber,ownerCount:(owners as string[]).length,nonce:String(safeNonce)},
        treasuryAddress:{address:config.treasuryAddress,codePresent:code.treasuryAddress!=="0x",interfaceVerified:true,kind:config.treasuryAddress.toLowerCase()===config.safeAddress.toLowerCase()?"SAFE":"ADDRESS"},
        treasuryGuardAddress:{address:config.treasuryGuardAddress,codePresent:true,interfaceVerified:true,paused:Boolean(paused),governance:String(governance),guardian:String(guardian)}
      };
      return {mode:this.mode,provider:this.provider,status:"VERIFIED_READ_ONLY",chainId:this.chainId,blockNumber:safeBlock,blockHash:block.hash.toLowerCase(),confirmations:this.confirmationLag,contracts,mockOnly:false,onchainInterfacesVerified:true,readsOnly:true,signsTransactions:false,submitsTransactions:false,assetExecutionAuthorized:false};
    }catch(error){if(error instanceof Error&&error.message.startsWith("ORGANIZATION_CONFIGURATION_"))throw error;throw new Error("ORGANIZATION_CONFIGURATION_INTERFACE_VALIDATION_FAILED")}
  }
}

export function createOrganizationConfigurationAdapterFromEnvironment():OrganizationConfigurationAdapter{
  const mode=(process.env.ORGANIZATION_CONFIG_ADAPTER??"mock").toLowerCase();if(mode==="mock")return new MockOrganizationConfigurationAdapter();
  if(mode==="evm-readonly")return new EvmOrganizationConfigurationReadAdapter(process.env.ORGANIZATION_CONFIG_RPC_URL??"",Number(process.env.ORGANIZATION_CONFIG_CHAIN_ID),Number(process.env.ORGANIZATION_CONFIG_CONFIRMATION_LAG??2));
  throw new Error(`Unsupported ORGANIZATION_CONFIG_ADAPTER: ${mode}`);
}
