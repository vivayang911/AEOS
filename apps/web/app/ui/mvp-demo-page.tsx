"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import type {ReactNode} from "react";
import {useLanguage} from "./language-context";

type Panel={title:string;status:string;body:string;facts:string[]};
type DemoPageProps={kicker:string;title:string;summary:string;mode:string;panels:Panel[];flow:string[];primaryHref?:string;primaryLabel?:string;children?:ReactNode};

export function MvpDemoPage({kicker,title,summary,mode,panels,flow,primaryHref="/dashboard",primaryLabel="Return to Cockpit",children}:DemoPageProps){const{tr}=useLanguage();const[activeStep,setActiveStep]=useState(-1);const[running,setRunning]=useState(false);const[complete,setComplete]=useState(false);useEffect(()=>{if(!running)return;const timer=window.setInterval(()=>setActiveStep(current=>{if(current>=flow.length-1){window.clearInterval(timer);setRunning(false);setComplete(true);return current}return current+1}),420);return()=>window.clearInterval(timer)},[running,flow.length]);const runDemo=()=>{setComplete(false);setActiveStep(0);setRunning(true)};return <div className={`mvp-page${running?" mvp-page-running":""}${complete?" mvp-page-complete":""}`}>
  <section className="terminal-banner"><div><span className="pulse-dot"/> {tr("DEMONSTRATION WORKSPACE")}</div><strong>{tr("Evidence First")}</strong><span>{tr("Organization-scoped read model")}</span><em>{tr("ADVISORY ONLY / EXECUTION WITHHELD")}</em></section>
  <header className="mvp-heading"><div><span className="terminal-kicker">{kicker}</span><h1>{title}</h1><p>{summary}</p></div><div className="mvp-heading-actions"><span className="mock-tag">{mode}</span><button type="button" onClick={runDemo} disabled={running}>{running?`RUNNING ${activeStep+1}/${flow.length}`:complete?"REPLAY PAGE DEMO":"RUN PAGE DEMO"}</button><Link href={primaryHref}>{primaryLabel}</Link></div></header>
  <section className="mvp-assurance" aria-label="MVP assurance boundary"><div><small>{tr("DATA SCOPE")}</small><b>{tr("ACTIVE ORGANIZATION")}</b></div><div><small>{tr("Evidence")}</small><b>{tr("IMMUTABLE REFERENCES")}</b></div><div><small>{tr("AI AUTHORITY")}</small><b>{tr("ADVISORY ONLY")}</b></div><div><small>{tr("ASSET EXECUTION")}</small><b>{tr("EXECUTION WITHHELD")}</b></div></section>
  <section className="mvp-flow" aria-label={`${title} demonstration flow`}>{flow.map((step,index)=><div className={complete||index<activeStep?"complete":index===activeStep?"active":"pending"} key={step}><span>{String(index+1).padStart(2,"0")}</span><b>{step}</b><small>{complete||index<activeStep?"COMPLETE":index===activeStep?"IN PROGRESS":"PENDING"}</small>{index<flow.length-1&&<i aria-hidden="true">--&gt;</i>}</div>)}</section>
  <section className="mvp-run-status" aria-live="polite"><div><span className={running?"pulse-dot":""}/><small>DEMO STATUS</small><b>{running?flow[activeStep]:complete?"FLOW COMPLETE":"READY"}</b></div><p>{complete?"All read/advice stages completed. DAO authorization and asset execution remain withheld.":"Deterministic UI demonstration only · no API write · no signer · no broadcast"}</p><strong>{complete?"NO ASSET EXECUTION":running?"PROCESSING":"ADVISORY ONLY"}</strong></section>
  <section className="mvp-panel-grid">{panels.map(panel=><article className="terminal-panel mvp-panel" key={panel.title}><header><div><span className="terminal-kicker">{tr("LIVE MVP VIEW")}</span><h2>{panel.title}</h2></div><span className={panel.status.includes("BLOCK")||panel.status.includes("WITHHELD")?"advisory-chip":"verified-chip"}>{panel.status}</span></header><p>{panel.body}</p><ul>{panel.facts.map(fact=><li key={fact}>{fact}</li>)}</ul></article>)}</section>
  {children}
  <footer className="mvp-footer"><strong>{tr("DAO IN CONTROL")}</strong><span>This page demonstrates a complete read/advice workflow. No private key, signer, transaction broadcast or governance vote is available to AI.</span></footer>
 </div>}
