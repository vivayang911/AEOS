"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useState,type ReactNode} from "react";
import {useSession} from "./session-context";
import {useLanguage} from "./language-context";
import {P0E2eGuide} from "./p0-e2e-guide";

const navigation=[
  {href:"/dashboard",label:"Cockpit",short:"OV",caption:"Treasury overview"},
  {href:"/attestcoin",label:"Attestcoin Oracle",short:"AC",caption:"Verified data flow"},
  {href:"/evidence",label:"Evidence Explorer",short:"EV",caption:"Immutable facts"},
  {href:"/decisions",label:"Decision Room",short:"DR",caption:"Eight-Agent committee"},
  {href:"/strategies",label:"Strategy & PID",short:"PI",caption:"Advisory control"},
  {href:"/knowledge",label:"RAG Knowledge",short:"RG",caption:"Governed memory"},
  {href:"/skills",label:"Skills Center",short:"SK",caption:"Read / advise only"},
  {href:"/governance",label:"Governance",short:"GV",caption:"DAO authorization"},
  {href:"/audit",label:"Audit Log",short:"AU",caption:"Immutable trail"},
  {href:"/settings",label:"Settings",short:"SE",caption:"Organization control"},
];

const shortWallet=(wallet:string)=>`${wallet.slice(0,6)}...${wallet.slice(-4)}`;

export function AppShell({children}:{children:ReactNode}){
  const pathname=usePathname(),auth=useSession();
  const{locale,setLocale,tr}=useLanguage();
  const[open,setOpen]=useState(false),[organizationName,setOrganizationName]=useState("My DAO"),[operationError,setOperationError]=useState("");
  const active=auth.organizations.find(item=>item.id===auth.session?.activeOrganizationId);
  const connected=auth.phase==="connected"&&Boolean(auth.session);
  const run=(action:()=>Promise<void>)=>{setOperationError("");void action().catch(cause=>setOperationError(cause instanceof Error?cause.message:"Session operation failed."))};
  return <div className="cockpit-shell">
    <a className="skip-link" href="#main-content">{tr("Skip to main content")}</a>
    <aside className="cockpit-sidebar" aria-label={tr("Primary navigation")}>
      <Link className="brand" href="/dashboard" aria-label={tr("AEOS cockpit home")}><span className="brand-mark">A</span><span><b>AEOS</b><small>EVIDENCE FIRST</small></span></Link>
      <div className="sidebar-context"><span>{tr("TREASURY PORTFOLIO")}</span><strong>{tr("Institutional DAO")}</strong><small>{tr("Multi-treasury workspace")}</small></div>
      <nav className="primary-nav">{navigation.map(item=>{const base=item.href.split("#")[0];const current=pathname===base||(base!=="/dashboard"&&pathname.startsWith(`${base}/`));return <Link key={item.href} href={item.href} aria-current={current?"page":undefined} className={current?"nav-item active":"nav-item"}><span className="nav-glyph" aria-hidden="true">{item.short}</span><span className="nav-copy"><b>{tr(item.label)}</b><small>{tr(item.caption)}</small></span></Link>})}</nav>
      <div className="agent-rail" aria-label={tr("Eight-Agent committee")}><span>{tr("EIGHT-AGENT COMMITTEE")}</span><div>{["GO","RE","ST","QU","RI","CO","PO","TR"].map(role=><i key={role} title={role}>{role}</i>)}</div></div>
      <div className="authority-card"><span className="section-kicker">{tr("AUTHORITY BOUNDARY")}</span><strong>{tr("Advice is not authorization")}</strong><p>{tr("AI, PID, RAG and Skills can recommend. Only DAO governance may authorize asset actions.")}</p><span className="authority-state"><i/> {tr("EXECUTION WITHHELD")}</span></div>
    </aside>
    <div className="cockpit-stage">
      <header className="cockpit-topbar">
        <div className="context-cluster"><span className="context-label">{tr("WORKSPACE")}</span><button className="context-button" type="button" aria-expanded={open} aria-controls="session-panel" onClick={()=>setOpen(value=>!value)}><span className="dao-avatar">{active?active.name.slice(0,2).toUpperCase():"--"}</span><span><b>{active?.name??tr("Select DAO workspace")}</b><small>{auth.session?.role??tr("Organization session required")}</small></span><span aria-hidden="true">v</span></button><span className="treasury-selector"><small>{tr("TREASURY")}</small><b>{tr("Core Treasury / USDC")}</b></span></div>
        <div className="topbar-status" aria-label={tr("System context")}><label className="language-picker"><span className="sr-only">{tr("Interface language")}</span><select aria-label={tr("Interface language")} value={locale} onChange={event=>setLocale(event.target.value as typeof locale)}><option value="en">EN</option><option value="zh-CN">中文</option><option value="ja">日本語</option></select></label><span className="enterprise-security"><i/> ENTERPRISE SECURITY<small>POLICY ENFORCED</small></span><span className="network-pill"><i/> {tr("Creditcoin Testnet / 102031")}</span><span className={connected?"live-pill":"mode-pill"}>{tr(connected?"SESSION VERIFIED":"READ ONLY")}</span><button className="session-button secondary-auth" type="button" onClick={()=>setOpen(value=>!value)}>{connected?`SIGNER ${shortWallet(auth.session!.walletAddress)}`:auth.phase==="signing"?"VERIFYING SIGNER":"GOVERNANCE SIGNER"}</button></div>
        {open&&<section id="session-panel" className="session-panel" aria-label="Enterprise identity and governance signer"><div className="session-panel-head"><div><span className="section-kicker">ENTERPRISE IDENTITY CONTROL</span><h2>{connected?"Verified governance signer":"Step-up governance verification"}</h2></div><button className="icon-button" type="button" aria-label="Close session panel" onClick={()=>setOpen(false)}>x</button></div>{!connected?<><p>Daily enterprise monitoring remains read-only. A wallet is used only as a step-up identity signer for controlled governance operations; SIWE grants no transaction, governance or asset authority.</p><button className="primary-action" type="button" disabled={auth.phase==="signing"} onClick={()=>run(auth.connectWallet)}>{auth.phase==="signing"?"Confirm signer identity...":"Verify governance signer"}</button></>:<><dl className="session-facts"><div><dt>Wallet</dt><dd>{shortWallet(auth.session!.walletAddress)}</dd></div><div><dt>Role</dt><dd>{auth.session!.role??"No organization selected"}</dd></div><div><dt>Writes</dt><dd>{auth.canMutate?"CSRF READY":"RE-AUTH REQUIRED"}</dd></div></dl><label className="field-label" htmlFor="organization-select">DAO workspace</label><select id="organization-select" value={auth.session?.activeOrganizationId??""} onChange={event=>event.target.value&&run(()=>auth.selectOrganization(event.target.value))} disabled={!auth.canMutate}><option value="">Select an organization</option>{auth.organizations.map(org=><option key={org.id} value={org.id}>{org.name} / {org.membership.role}</option>)}</select>{!auth.organizations.length&&<div className="create-organization"><label className="field-label" htmlFor="organization-name">Create first organization</label><div><input id="organization-name" value={organizationName} minLength={3} maxLength={120} onChange={event=>setOrganizationName(event.target.value)}/><button type="button" disabled={!auth.canMutate||organizationName.trim().length<3} onClick={()=>run(()=>auth.createOrganization(organizationName.trim()))}>Create</button></div></div>}<div className="session-actions">{!auth.canMutate&&<button type="button" onClick={()=>run(auth.connectWallet)}>Re-authenticate SIWE</button>}<button type="button" disabled={!auth.canMutate} onClick={()=>run(auth.logout)}>Sign out</button></div></>}{(operationError||auth.error)&&<p className="inline-error" role="alert">{operationError||auth.error}</p>}<footer>HttpOnly cookie / CSRF in memory / no private key / no asset authority</footer></section>}
      </header>
      <main id="main-content" className="cockpit-content">{auth.phase==="reconnecting"&&<div className="api-recovery-banner" role="status"><strong>API CONNECTION INTERRUPTED</strong><span>Keeping the server-side session boundary and retrying read-only recovery automatically. No wallet request is made.</span><button type="button" onClick={()=>void auth.refresh()}>RETRY NOW</button></div>}<P0E2eGuide/>{children}</main>
    </div>
  </div>
}

