"use client";

import { useEffect, useState } from "react";
import {
  AppShell,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { ResourceSchema } from "@/lib/schema-catalog";

export default function Home() {
  const [schemas, setSchemas] = useState<ResourceSchema[]>([]);
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/schemas").then((response) => response.json()).then(setSchemas);
  }, []);

  async function createClaim() {
    if (!name || !type) return;
    const response = await fetch("/api/claims", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
    const body = await response.json();
    if (response.ok) {
      setClaimUrl(body.claimUrl);
      setOpened(false);
      setName("");
      setType(null);
    }
  }

  return (
    <AppShell padding="xl" header={{ height: 72 }}>
      <AppShell.Header>
        <Group h="100%" px="xl" justify="space-between">
          <Group gap="sm"><Text fw={800} size="xl">SecretFabric</Text><Badge color="indigo">alpha</Badge></Group>
          <Text c="dimmed" size="sm">Agent Resource Manager</Text>
        </Group>
      </AppShell.Header>
      <AppShell.Main maw={1200} mx="auto">
        <Stack gap="xl">
          <Group justify="space-between" align="end">
            <Stack gap={4}>
              <Title order={1}>Resource fabric</Title>
              <Text c="dimmed">Secrets, rules and prompts shared across trusted Hermes agents.</Text>
            </Stack>
            <Button onClick={() => setOpened(true)}>Create secret claim</Button>
          </Group>

          {claimUrl && (
            <Card withBorder radius="md" bg="var(--mantine-color-dark-7)">
              <Stack gap="xs">
                <Text fw={700}>Claim link created</Text>
                <Text size="sm" c="dimmed">Open this one-time link to enter sensitive fields:</Text>
                <TextInput value={`${window.location.origin}${claimUrl}`} readOnly />
                <Button component="a" href={claimUrl} target="_blank" variant="light" w="fit-content">Open claim form</Button>
              </Stack>
            </Card>
          )}

          <Grid>
            {schemas.map((schema) => (
              <Grid.Col key={schema.type} span={{ base: 12, sm: 6, md: 3 }}>
                <Card withBorder h="100%" radius="md">
                  <Stack justify="space-between" h="100%">
                    <Stack gap="xs">
                      <Text fw={700}>{schema.label}</Text>
                      <Text size="sm" c="dimmed">{schema.description}</Text>
                      <Badge variant="light" w="fit-content">{schema.fields.length} fields</Badge>
                    </Stack>
                    <Button variant="subtle" onClick={() => { setType(schema.type); setOpened(true); }}>Use schema</Button>
                  </Stack>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        </Stack>
      </AppShell.Main>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Create secret claim" centered>
        <Stack>
          <TextInput label="Secret name" placeholder="info-mail" value={name} onChange={(event) => setName(event.currentTarget.value)} required />
          <Select label="Schema" placeholder="Choose a protocol" data={schemas.map((schema) => ({ value: schema.type, label: schema.label }))} value={type} onChange={setType} required />
          <Button onClick={createClaim} disabled={!name || !type}>Create one-time link</Button>
        </Stack>
      </Modal>
    </AppShell>
  );
}
