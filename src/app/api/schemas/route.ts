import { NextResponse } from "next/server";
import { schemaCatalog } from "@/lib/schema-catalog";

export function GET() {
  return NextResponse.json(schemaCatalog);
}
