import { NextResponse } from "next/server";
import { readHealth } from "@/lib/health";
import { prisma } from "@/lib/prisma";

/** Reports process health after a SQLite-only probe. */
export async function GET() {
  const health = await readHealth(() => prisma.$queryRaw`SELECT sqlite_version() AS v`);
  return NextResponse.json(health.body, { status: health.httpStatus });
}
