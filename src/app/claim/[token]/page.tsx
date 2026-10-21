"use client";

import { use, useEffect, useState } from "react";
import { ActionIcon, Alert, Button, Card, Select, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { FieldSchema } from "@/lib/schema-catalog";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 4.22-5.24M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

const BASE_PATH = "";
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

type ClaimMeta = { name: string; type: string; fields: FieldSchema[] };

function setPath(root: Record<string, unknown>, path: string, value: unknown) {
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
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
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
      if (value instanceof File && value.size > 0) {
        if (value.size > MAX_DOCUMENT_SIZE || !["image/jpeg", "image/png", "application/pdf"].includes(value.type)) {
          setStatus("error");
          return;
        }
        const bytes = new Uint8Array(await value.arrayBuffer());
        let binary = "";
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        setPath(data, field.path, { name: value.name, type: value.type, contentBase64: btoa(binary) });
      } else if (typeof value === "string" && value.length > 0) setPath(data, field.path, value);
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
              if (field.input === "password") return (
                <TextInput
                  key={field.path}
                  {...common}
                  type={visiblePasswords[field.path] ? "text" : "password"}
                  description="Sensitive field"
                  rightSection={
                    <ActionIcon
                      type="button"
                      variant="subtle"
                      color="gray"
                      aria-label={visiblePasswords[field.path] ? "Hide password" : "Show password"}
                      onClick={() => setVisiblePasswords((current) => ({ ...current, [field.path]: !current[field.path] }))}
                    >
                      <EyeIcon open={!!visiblePasswords[field.path]} />
                    </ActionIcon>
                  }
                  rightSectionPointerEvents="all"
                />
              );
              if (field.input === "textarea") return <Textarea key={field.path} {...common} autosize minRows={4} />;
              if (field.input === "select") return <Select key={field.path} name={field.path} label={field.label} data={field.options ?? []} defaultValue={value || null} required={field.required} />;
              if (field.input === "file") return <label key={field.path}>{field.label}<input name={field.path} type="file" accept="image/jpeg,image/png,application/pdf" /></label>;
              return <TextInput key={field.path} {...common} type={field.input === "port" ? "number" : field.input === "url" ? "url" : field.input === "date" ? "date" : "text"} />;
            })}
            <Button type="submit">Save encrypted secret</Button>
          </Stack>
        </form>
      </Card>
    </main>
  );
}
