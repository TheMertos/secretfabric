import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "secretfabric",
    display_name: "SecretFabric Agent Resource Manager",
    version: "0.1.0",
    openapi: "/openapi.json",
    resource_types: ["secret", "rule", "prompt"],
    operations: [
      "create_secret_draft",
      "read_secret",
      "read_rule",
      "execute_rule",
      "read_prompt",
      "execute_prompt",
    ],
    auth: { network: "tailscale", mode: "bot_identity_and_policy" },
    documentation: "/docs/agent-guide.md",
  });
}
