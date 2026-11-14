import { NextResponse } from "next/server";
export async function POST(){ return NextResponse.json({error:"Database-only dispute resolution is disabled. Use the on-chain admin resolution endpoint."},{status:410}); }
