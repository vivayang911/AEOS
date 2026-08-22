import Link from "next/link";

const destinations=[
  ["Cockpit","/dashboard"],["Attestcoin Oracle","/attestcoin"],["Evidence Explorer","/evidence"],["Decision Room","/decisions"],["Strategy & PID","/strategies"],
  ["RAG Knowledge","/knowledge"],["Skills Center","/skills"],["Governance","/governance"],["Audit Log","/audit"],["Settings","/settings"],
];

export default function NotFound(){return <section className="mvp-route-recovery"><span className="terminal-kicker">MVP ROUTE DIRECTORY</span><h1>Choose an AEOS workspace</h1><p>The requested address is not a product route. Continue through one of the complete demonstration workspaces below.</p><div>{destinations.map(([label,href])=><Link key={href} href={href}><b>{label}</b><small>{href}</small></Link>)}</div><footer>Evidence first / DAO in control / no AI asset authority</footer></section>}
