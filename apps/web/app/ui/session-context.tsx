"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
type SessionPhase = "checking" | "disconnected" | "signing" | "connected" | "error";

export type AuthSession = { sessionId:string; userId:string; walletAddress:string; activeOrganizationId:string|null; role:string|null; expiresAt:string };
export type Organization = { id:string; name:string; status:string; selected:boolean; membership:{id:string;role:string;status:string} };
type EthereumProvider = { request(args:{method:string;params?:unknown[]}):Promise<unknown> };
declare global { interface Window { ethereum?:EthereumProvider } }

export class ApiError extends Error {
  constructor(public readonly status:number,public readonly code:string,message:string,public readonly requestId?:string){super(message)}
}
type RequestOptions=RequestInit&{csrf?:boolean};
type SessionContextValue={phase:SessionPhase;session:AuthSession|null;organizations:Organization[];chainId:number|null;error:string;canMutate:boolean;connectWallet():Promise<void>;selectOrganization(id:string):Promise<void>;createOrganization(name:string):Promise<void>;logout():Promise<void>;refresh():Promise<void>;request<T>(path:string,options?:RequestOptions):Promise<T>};
const SessionContext=createContext<SessionContextValue|null>(null);

function apiError(status:number,payload:unknown){const value=(payload as {error?:{code?:string;message?:string;request_id?:string}}|null)?.error;return new ApiError(status,value?.code??"REQUEST_FAILED",value?.message??`Request failed (${status})`,value?.request_id)}

export function SessionProvider({children}:{children:ReactNode}){
  const[phase,setPhase]=useState<SessionPhase>("checking"),[session,setSession]=useState<AuthSession|null>(null),[organizations,setOrganizations]=useState<Organization[]>([]),[csrfToken,setCsrfToken]=useState<string|null>(null),[chainId,setChainId]=useState<number|null>(null),[error,setError]=useState("");
  const request=useCallback(async<T,>(path:string,options:RequestOptions={})=>{const{csrf,...init}=options;const headers=new Headers(init.headers);if(init.body&&!headers.has("content-type"))headers.set("content-type","application/json");if(csrf){if(!csrfToken)throw new ApiError(401,"REAUTH_REQUIRED","The in-memory security token is unavailable. Re-authenticate with SIWE before a write operation.");headers.set("x-csrf-token",csrfToken)}const response=await fetch(`${apiBase}${path}`,{...init,headers,credentials:"include"});const payload=await response.json().catch(()=>null);if(!response.ok)throw apiError(response.status,payload);return payload as T},[csrfToken]);
  const loadOrganizations=useCallback(async()=>{const result=await request<{items:Organization[]}>("/organizations");setOrganizations(result.items)},[request]);
  const refresh=useCallback(async()=>{try{const next=await request<AuthSession>("/auth/session");setSession(next);setPhase("connected");setError("");await loadOrganizations()}catch(cause){if(cause instanceof ApiError&&cause.status===401){setSession(null);setOrganizations([]);setPhase("disconnected");setError("");return}setPhase("error");setError(cause instanceof Error?cause.message:"Unable to read the session state.")}},[loadOrganizations,request]);
  useEffect(()=>{void refresh()},[refresh]);
  const connectWallet=useCallback(async()=>{setPhase("signing");setError("");try{if(!window.ethereum)throw new Error("No EIP-1193 wallet was detected. Install or enable a browser wallet.");const accounts=await window.ethereum.request({method:"eth_requestAccounts"}) as string[];const walletAddress=accounts[0];if(!walletAddress)throw new Error("The wallet did not return an account.");const rawChainId=await window.ethereum.request({method:"eth_chainId"}) as string;const activeChainId=Number.parseInt(rawChainId,16);if(!Number.isSafeInteger(activeChainId)||activeChainId<=0)throw new Error("The wallet returned an invalid chain ID.");setChainId(activeChainId);const challenge=await request<{challengeId:string;message:string}>("/auth/nonce",{method:"POST",body:JSON.stringify({walletAddress,chainId:activeChainId})});const signature=await window.ethereum.request({method:"personal_sign",params:[challenge.message,walletAddress]}) as string;const verified=await request<{csrfToken:string;session:AuthSession}>("/auth/verify",{method:"POST",body:JSON.stringify({challengeId:challenge.challengeId,message:challenge.message,signature})});setCsrfToken(verified.csrfToken);setSession(verified.session);setPhase("connected");await loadOrganizations()}catch(cause){setPhase("error");setError(cause instanceof Error?cause.message:"SIWE sign-in failed.")}},[loadOrganizations,request]);
  const selectOrganization=useCallback(async(id:string)=>{setError("");const next=await request<AuthSession>("/auth/select-organization",{method:"POST",csrf:true,body:JSON.stringify({organizationId:id})});setSession(next);await loadOrganizations()},[loadOrganizations,request]);
  const createOrganization=useCallback(async(name:string)=>{setError("");await request("/organizations",{method:"POST",csrf:true,headers:{"idempotency-key":`web-org-${crypto.randomUUID()}`},body:JSON.stringify({name})});await refresh()},[refresh,request]);
  const logout=useCallback(async()=>{await request("/auth/logout",{method:"POST",csrf:true});setCsrfToken(null);setSession(null);setOrganizations([]);setPhase("disconnected")},[request]);
  const value=useMemo<SessionContextValue>(()=>({phase,session,organizations,chainId,error,canMutate:Boolean(session&&csrfToken),connectWallet,selectOrganization,createOrganization,logout,refresh,request}),[phase,session,organizations,chainId,error,csrfToken,connectWallet,selectOrganization,createOrganization,logout,refresh,request]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
export function useSession(){const value=useContext(SessionContext);if(!value)throw new Error("useSession must be used inside SessionProvider");return value}
