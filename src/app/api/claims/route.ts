import { NextResponse } from "next/server";
import { createClaim } from "@/lib/claims";
import { z } from "zod";

const createClaimSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1),
  provider: z.string().trim().max(120).optional(),
  prefill: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: Request) {
  const parsed = createClaimSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const claim = await createClaim(parsed.data);
    return NextResponse.json({ ...claim, claimUrl: `/claim/${claim.token}` }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unknown schema type" }, { status: 400 });
  }
}
