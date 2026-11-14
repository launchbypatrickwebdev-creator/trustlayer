import { NextResponse } from "next/server";
import { getPartnerSession, writePartnerAuditEvent } from "@/lib/domain/partner-api/partner-session";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
 const {id}=await context.params; const body=await request.json().catch(()=>({}));if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 }); const partnerId=String(body.partner_id||"");
 if(!partnerId||!id)return NextResponse.json({error:"partner_id and endpoint id are required"},{status:400});
 const session=await getPartnerSession(request,partnerId,["owner"]); if("error" in session)return session.error;
 const status=body.status==="active"?"active":body.status==="inactive"?"inactive":null;
 if(!status)return NextResponse.json({error:"status must be active or inactive"},{status:400});
 if(status==="active") { const {data:secret}=await session.admin.from("webhook_endpoint_signing_secrets").select("endpoint_id").eq("endpoint_id",id).maybeSingle(); if(!secret)return NextResponse.json({error:"This endpoint has no encrypted signing secret. Rotate/re-register it before enabling."},{status:409}); }
 const {data,error}=await session.admin.from("webhook_endpoints").update({status,updated_at:new Date().toISOString()}).eq("id",id).eq("partner_id",partnerId).select("id,status,environment,url").maybeSingle();
 if(error)return NextResponse.json({error:"Could not update endpoint"},{status:500}); if(!data)return NextResponse.json({error:"Endpoint not found"},{status:404});
 try{await writePartnerAuditEvent({partnerId,actorUserId:session.user.id,action:status==="active"?"webhook_endpoint.enabled":"webhook_endpoint.disabled",targetType:"webhook_endpoint",targetId:id,metadata:{environment:data.environment}})}catch{return NextResponse.json({error:"Endpoint changed but audit logging failed; contact support"},{status:500})}
 return NextResponse.json({data});
}
