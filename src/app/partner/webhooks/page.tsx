import PartnerShell from "@/components/partner/PartnerShell";
import WebhookDeliveriesTable from "@/components/partner/WebhookDeliveriesTable";
import WebhookEndpointManager from "@/components/partner/WebhookEndpointManager";
import { requirePartnerMember } from "@/lib/domain/partner-api/partner-console";
export default async function PartnerWebhooksPage({searchParams}:{searchParams:Promise<{partner?:string;environment?:string}>}){
 const sp=await searchParams;const {membership,memberships,admin}=await requirePartnerMember({partnerIdQuery:sp.partner, allowedRoles:["owner","developer","viewer"]});
 const environment=sp.environment==="live"?"live":"test";
 const [{data:endpoints},{data:deliveries}]=await Promise.all([
  admin.from("webhook_endpoints").select("id,url,environment,status,description,created_at").eq("partner_id",membership.partnerId).order("created_at",{ascending:false}),
  admin.from("webhook_deliveries").select("id,event_id,event_type,status,attempts,last_error,last_status_code,created_at,delivered_at,next_attempt_at,environment,endpoint_id").eq("partner_id",membership.partnerId).eq("environment",environment).order("created_at",{ascending:false}).limit(50),
 ]);
 const deliveryIds=(deliveries||[]).map((d:any)=>d.id);
 const {data:attempts}=deliveryIds.length?await admin.from("webhook_delivery_attempts").select("id,delivery_id,attempt_number,started_at,completed_at,response_status,duration_ms,error").in("delivery_id",deliveryIds).order("attempt_number",{ascending:false}):{data:[]};
 const attemptMap=new Map<string,any[]>();for(const attempt of attempts||[]){attemptMap.set(String(attempt.delivery_id),[...(attemptMap.get(String(attempt.delivery_id))||[]),attempt]);}
 const deliveryRows=(deliveries||[]).map((d:any)=>({...d,attempt_history:attemptMap.get(String(d.id))||[]}));
 return <PartnerShell active="webhooks" partnerName={membership.partnerName} partnerId={membership.partnerId} memberships={memberships} role={membership.role} environmentHint={environment}>
  <div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Delivery operations</p><h1 className="mt-1 text-3xl font-black tracking-tight text-white">Webhooks</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Inspect delivery attempts, diagnose failures and safely replay eligible deliveries. Signing secrets are encrypted at rest and shown only when registered.</p></div>
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><a href={`/partner/webhooks?partner=${membership.partnerId}&environment=test`} className={`rounded-lg border px-3 py-2 text-xs font-semibold no-underline ${environment==="test"?"border-emerald-300/30 bg-emerald-300/10 text-emerald-200":"border-[#26384c] text-slate-400"}`}>Test deliveries</a><a href={`/partner/webhooks?partner=${membership.partnerId}&environment=live`} className={`rounded-lg border px-3 py-2 text-xs font-semibold no-underline ${environment==="live"?"border-amber-300/30 bg-amber-300/10 text-amber-200":"border-[#26384c] text-slate-400"}`}>Live deliveries</a></div><span className="text-xs text-slate-500">Showing latest 50 · {environment.toUpperCase()}</span></div>
  <WebhookEndpointManager partnerId={membership.partnerId} role={membership.role} defaultEnvironment={environment} endpoints={(endpoints||[]) as any[]} />
  <div className="mt-8"><h2 className="mb-3 text-sm font-bold text-white">Recent delivery attempts</h2><WebhookDeliveriesTable rows={deliveryRows as any[]} partnerId={membership.partnerId} role={membership.role}/></div>
 </PartnerShell>;
}
