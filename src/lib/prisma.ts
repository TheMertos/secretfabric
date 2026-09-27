import { PrismaClient } from "@prisma/client";

declare global {
  var __secretfabric_prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__secretfabric_prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.__secretfabric_prisma = prisma;
