"use client";

import { useEffect, useState } from "react";
import { AppShell, Badge, Card, Grid, Group, Stack, Text, Title } from "@mantine/core";
import { ResourceSchema } from "@/lib/schema-catalog";

export default function Home() {
  const [schemas, setSchemas] = useState<ResourceSchema[]>([]);

  useEffect(() => {
    fetch("/api/schemas").then((response) => response.json()).then(setSchemas);
  }, []);

  return (
    <AppShell padding="xl" header={{ height: 72 }}>
      <AppShell.Header>
        <Group h="100%" px="xl" justify="space-between">
          <Group gap="sm"><Text fw={800} size="xl">SecretFabric</Text><Badge color="indigo">alpha</Badge></Group>
          <Text c="dimmed" size="sm">Hermes-controlled resource manager</Text>
        </Group>
      </AppShell.Header>
      <AppShell.Main maw={1200} mx="auto">
        <Stack gap="xl">
          <Stack gap={4}>
            <Title order={1}>Protocol schema catalog</Title>
            <Text c="dimmed">Secret claims are created by Hermes. This UI is used only when Hermes sends you a one-time link to enter sensitive fields.</Text>
          </Stack>
          <Grid>
            {schemas.map((schema) => (
              <Grid.Col key={schema.type} span={{ base: 12, sm: 6, md: 4 }}>
                <Card withBorder h="100%" radius="md">
                  <Stack gap="xs">
                    <Text fw={700}>{schema.label}</Text>
                    <Text size="sm" c="dimmed">{schema.description}</Text>
                    <Badge variant="light" w="fit-content">{schema.fields.length} fields</Badge>
                  </Stack>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
