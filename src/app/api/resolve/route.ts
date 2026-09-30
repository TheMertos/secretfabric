import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeControlPlaneRequest } from "@/lib/control-plane-auth";
import { resolveScopedResource } from "@/lib/resolver";

const schema = z
  .object({
    resourceId: z.string().uuid(),
    purpose: z.enum(["imap-sync", "imap-list-mailboxes", "smtp-send", "caldav-sync"]),
    fieldPaths: z.array(z.string()).min(1).max(20),
  })
  .strict();

export async function POST(request: Request) {
  const auth = await authorizeControlPlaneRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    return NextResponse.json(await resolveScopedResource({ ctx: auth.ctx, ...parsed.data }));
  } catch (error) {
    const code = error instanceof Error ? error.message : "resolve_failed";
    const status = code === "resource_not_found" ? 404 : 403;
    return NextResponse.json({ error: code }, { status });
  }
}
