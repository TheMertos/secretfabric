import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte hexadecimal key");
  }
  return Buffer.from(raw, "hex");
}

export function encryptJson(value: unknown) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([ciphertext, tag]), nonce };
}

export function decryptJson(ciphertext: Buffer, nonce: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", getKey(), nonce);
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const body = ciphertext.subarray(0, ciphertext.length - 16);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"));
}
