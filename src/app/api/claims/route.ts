import { NextResponse } from "next/server";
import { createClaim } from "@/lib/claims";
import { z } from "zod";
import { isApiRequestAuthorized } from "@/lib/api-auth";

const createClaimSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1),
  provider: z.string().trim().max(120).optional(),
  prefill: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: Request) {
  if (!isApiRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createClaimSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const claim = await createClaim(parsed.data);
    return NextResponse.json({ ...claim, claimUrl: `/claim/${claim.token}` }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unknown schema type" }, { status: 400 });
  }
}
