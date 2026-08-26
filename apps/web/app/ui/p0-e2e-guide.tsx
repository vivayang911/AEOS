"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";
import {useSession} from "./session-context";
const stages=[
 {label:"Landing",href:"/?tour=p0e2e",matches:(path:string)=>path==="/"},
 {label:"SIWE",href:"/?tour=p0e2e#identity",matches:()=>false},
 {label:"Organization",href:"/?tour=p0e2e#organization",matches:()=>false},
 {label:"Attestcoin",href:"/attestcoin?tour=p0e2e",matches:(path:string)=>path==="/attestcoin"},
 {label:"Evidence",href:"/evidence?tour=p0e2e",matches:(path:string)=>path.startsWith("/evidence")},
 {label:"Decision",href:"/decisions?tour=p0e2e",matches:(path:string)=>path.startsWith("/decisions")},
 {label:"Governance",href:"/governance?tour=p0e2e",matches:(path:string)=>path==="/governance"},
 {label:"Outcome",href:"/governance?tour=p0e2e#verified-outcome",matches:()=>false},
] as const;
export function P0E2eGuide(){
 const pathname=usePathname(),auth=useSession();const[enabled,setEnabled]=useState(false);
 useEffect(()=>setEnabled(new URLSearchParams(window.location.search).get("tour")==="p0e2e"),[pathname]);
 if(!enabled)return null;
 const routeIndex=Math.max(0,stages.findIndex(stage=>stage.matches(pathname))),identityComplete=Boolean(auth.session),organizationComplete=Boolean(auth.session?.activeOrganizationId);
 const completed=(index:number)=>index===1?identityComplete:index===2?organizationComplete:index<routeIndex;
 const next=pathname==="/"?!identityComplete?stages[1]:!organizationComplete?stages[2]:stages[3]:stages[Math.min(stages.length-1,routeIndex+1)];
 return <aside className="p0-e2e-guide" aria-label="P0 continuous browser E2E"><header><span>P0-3 / CONTINUOUS BROWSER E2E</span><strong>Read-only route proof · DAO authority unchanged</strong></header><ol>{stages.map((stage,index)=><li key={stage.label} data-state={completed(index)?"complete":index===routeIndex?"active":"pending"}><Link href={stage.href}>{index+1}. {stage.label}</Link></li>)}</ol><Link className="p0-e2e-next" href={next.href}>{next.label==="SIWE"||next.label==="Organization"?`Complete ${next.label} below`:`Continue to ${next.label}`} →</Link></aside>
}
