import { NextResponse } from "next/server";
import { createClaim } from "@/lib/claims";
import { z } from "zod";
import { authorizeControlPlaneRequest } from "@/lib/control-plane-auth";

const createClaimSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1),
    provider: z.string().trim().max(120).optional(),
    prefill: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const auth = await authorizeControlPlaneRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createClaimSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const claim = await createClaim(auth.ctx, parsed.data);
    return NextResponse.json({ ...claim, claimUrl: `/claim/${claim.token}` }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unknown schema type" }, { status: 400 });
  }
}
