import { NextResponse } from "next/server";
import { completeClaim, getClaim } from "@/lib/claims";
import { getSchema } from "@/lib/schema-catalog";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const claim = getClaim(token);
  if (!claim) return NextResponse.json({ error: "Claim expired or already used" }, { status: 410 });
  const schema = getSchema(claim.type)!;
  return NextResponse.json({ name: claim.name, type: claim.type, provider: claim.provider, fields: schema.fields });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const accepted = completeClaim(token, (await request.json()) as Record<string, unknown>);
  if (!accepted) return NextResponse.json({ error: "Claim expired or already used" }, { status: 410 });
  return NextResponse.json({ status: "claimed" });
}
