import { NextResponse } from "next/server";
import { completeClaim, getClaimForm, revokeClaim } from "@/lib/claims";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const form = await getClaimForm(token);
  if (!form) return NextResponse.json({ error: "Claim expired or already used" }, { status: 410 });
  return NextResponse.json(form);
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const accepted = await completeClaim(token, (await request.json()) as Record<string, unknown>);
  if (!accepted) return NextResponse.json({ error: "Claim expired or already used" }, { status: 410 });
  return NextResponse.json({ status: "claimed" });
}

export async function DELETE(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const revoked = await revokeClaim(token);
  if (!revoked) return NextResponse.json({ error: "Claim not found, expired, used or already revoked" }, { status: 404 });
  return NextResponse.json({ status: "revoked" });
}
