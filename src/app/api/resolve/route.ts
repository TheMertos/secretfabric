import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiRequestAuthorized } from "@/lib/api-auth";
import { resolveScopedResource } from "@/lib/resolver";

const schema = z.object({
  resourceId: z.string().uuid(),
  purpose: z.enum(["imap-sync", "imap-list-mailboxes", "smtp-send", "caldav-sync"]),
  fieldPaths: z.array(z.string()).min(1).max(20),
  actor: z.string().trim().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  if (!isApiRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    return NextResponse.json(await resolveScopedResource(parsed.data));
  } catch (error) {
    const code = error instanceof Error ? error.message : "resolve_failed";
    const status = code === "resource_not_found" ? 404 : 403;
    return NextResponse.json({ error: code }, { status });
  }
}
