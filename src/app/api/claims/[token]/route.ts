import { NextResponse } from "next/server";
import { completeClaim, getClaimForm, revokeClaim } from "@/lib/claims";
import { authorizeControlPlaneRequest } from "@/lib/control-plane-auth";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const form = await getClaimForm(token);
  if (!form) return NextResponse.json({ error: "Claim expired or already used" }, { status: 410 });
  return NextResponse.json(form);
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const submitted = "data" in body && body.data && typeof body.data === "object" ? body.data : body;
  const accepted = await completeClaim(token, submitted as Record<string, unknown>);
  if (!accepted) return NextResponse.json({ error: "Claim expired or already used" }, { status: 410 });
  return NextResponse.json({ status: "claimed" });
}

export async function DELETE(request: Request, context: { params: Promise<{ token: string }> }) {
  const auth = await authorizeControlPlaneRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { token } = await context.params;
  const revoked = await revokeClaim(auth.ctx, token);
  if (!revoked) return NextResponse.json({ error: "Claim not found, expired, used or already revoked" }, { status: 404 });
  return NextResponse.json({ status: "revoked" });
}
