"use client";
import { usePathname, useRouter } from "next/navigation";
export default function EnvironmentSwitcher({ environment, partnerId }: { environment: string; partnerId?: string }) {
 const router=useRouter();const pathname=usePathname();
 if(environment==="all")return <span className="rounded-full border border-[#2a3d51] bg-[#0d1b2b] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">All environments</span>;
 function select(next:string){const params=new URLSearchParams(window.location.search);if(partnerId)params.set("partner",partnerId);params.set("environment",next);params.delete("cursor");router.push(`${pathname}?${params.toString()}`)}
 return <div role="group" aria-label="Environment" className="flex items-center rounded-xl border border-[#26384c] bg-[#0d1b2b] p-1"><button type="button" onClick={()=>select("test")} aria-pressed={environment==="test"} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase ${environment==="test"?"bg-emerald-300/15 text-emerald-200":"text-slate-500 hover:text-slate-200"}`}>Test</button><button type="button" onClick={()=>select("live")} aria-pressed={environment==="live"} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase ${environment==="live"?"bg-amber-300/15 text-amber-200":"text-slate-500 hover:text-slate-200"}`}>Live</button></div>
}
