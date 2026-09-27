"use client";

import { use, useEffect, useState } from "react";
import { Alert, Button, Card, Select, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { FieldSchema } from "@/lib/schema-catalog";

const BASE_PATH = "";

type ClaimMeta = { name: string; type: string; fields: FieldSchema[] };

function setPath(root: Record<string, unknown>, path: string, value: string) {
  const parts = path.split(".");
  let current = root;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) current[part] = value;
    else {
      current[part] ??= {};
      current = current[part] as Record<string, unknown>;
    }
  });
}

export default function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [meta, setMeta] = useState<ClaimMeta>();
  const [status, setStatus] = useState<"loading" | "ready" | "submitted" | "error">("loading");

  useEffect(() => {
    fetch(`${BASE_PATH}/api/claims/${token}`)
      .then(async (response) => {
        if (!response.ok) return setStatus("error");
        setMeta(await response.json());
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meta) return;
    const data: Record<string, unknown> = {};
    for (const field of meta.fields) {
      const value = new FormData(event.currentTarget).get(field.path);
      if (typeof value === "string" && value.length > 0) setPath(data, field.path, value);
    }
    const response = await fetch(`${BASE_PATH}/api/claims/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
    });
    setStatus(response.ok ? "submitted" : "error");
  }

  if (status === "loading") return <main className="claim-page"><Text>Loading claim form…</Text></main>;
  if (status === "error") return <main className="claim-page"><Alert color="red" title="Link unavailable">This claim link is expired or already used.</Alert></main>;
  if (status === "submitted") return <main className="claim-page"><Alert color="green" title="Secret saved">The one-time claim was completed successfully.</Alert></main>;
  if (!meta) return null;

  return (
    <main className="claim-page">
      <Card withBorder radius="lg" maw={720} w="100%" p="xl">
        <form onSubmit={submit}>
          <Stack>
            <Title order={2}>Complete secret: {meta.name}</Title>
            <Text c="dimmed">Schema: {meta.type}. Sensitive values are submitted once and are not shown again.</Text>
            {meta.fields.map((field) => {
              const value = field.value ?? field.defaultValue ?? "";
              const common = { name: field.path, label: field.label, required: field.required, defaultValue: value };
              if (field.input === "password") return <TextInput key={field.path} {...common} type="password" description="Sensitive field" />;
              if (field.input === "textarea") return <Textarea key={field.path} {...common} autosize minRows={4} />;
              if (field.input === "select") return <Select key={field.path} name={field.path} label={field.label} data={field.options ?? []} defaultValue={value || null} required={field.required} />;
              return <TextInput key={field.path} {...common} type={field.input === "port" ? "number" : field.input === "url" ? "url" : "text"} />;
            })}
            <Button type="submit">Save encrypted secret</Button>
          </Stack>
        </form>
      </Card>
    </main>
  );
}
