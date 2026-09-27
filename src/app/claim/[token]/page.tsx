"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, PasswordInput, Select, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { FieldSchema } from "@/lib/schema-catalog";

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
  const [token, setToken] = useState<string>();
  const [meta, setMeta] = useState<{ name: string; type: string; fields: FieldSchema[] }>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "submitted" | "error">("loading");

  useEffect(() => {
    params.then(({ token: resolvedToken }) => {
      setToken(resolvedToken);
      fetch(`/api/claims/${resolvedToken}`).then(async (response) => {
        if (!response.ok) return setStatus("error");
        setMeta(await response.json());
        setStatus("ready");
      });
    });
  }, [params]);

  async function submit() {
    if (!token || !meta) return;
    const data: Record<string, unknown> = {};
    Object.entries(values).forEach(([path, value]) => setPath(data, path, value));
    const response = await fetch(`/api/claims/${token}`, {
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
        <Stack>
          <Title order={2}>Complete secret: {meta.name}</Title>
          <Text c="dimmed">Schema: {meta.type}. Sensitive values are submitted once and are not shown again.</Text>
          {meta.fields.map((field) => {
            const common = {
              label: field.label,
              required: field.required,
              value: values[field.path] ?? field.defaultValue ?? "",
              onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((current) => ({ ...current, [field.path]: event.currentTarget.value })),
            };
            if (field.input === "password") return <PasswordInput key={field.path} {...common} description="Sensitive field" />;
            if (field.input === "textarea") return <Textarea key={field.path} {...common} autosize minRows={4} />;
            if (field.input === "select") return <Select key={field.path} label={field.label} data={field.options ?? []} value={values[field.path] ?? field.defaultValue ?? null} onChange={(value) => setValues((current) => ({ ...current, [field.path]: value ?? "" }))} required={field.required} />;
            return <TextInput key={field.path} {...common} type={field.input === "port" ? "number" : field.input === "url" ? "url" : "text"} />;
          })}
          <Button onClick={submit}>Save encrypted secret</Button>
        </Stack>
      </Card>
    </main>
  );
}
