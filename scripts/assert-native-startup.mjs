/**
 * Fail closed before the native Next.js process starts.
 * Prints only stable messages. Never prints keys, tokens, or database URLs.
 */

const databaseUrl = process.env.DATABASE_URL ?? "";
const encryptionKey = process.env.ENCRYPTION_KEY ?? "";
const apiToken = process.env.SECRET_FABRIC_API_TOKEN ?? "";

/**
 * Prints a stable message and exits.
 * @param {string} message
 */
function fail(message) {
  console.error(message);
  process.exit(2);
}

if (!databaseUrl.startsWith("file:")) fail("DATABASE_URL must be an explicit sqlite file URL");
const sqlitePath = databaseUrl.slice("file:".length).replace(/^\/\//, "/");
if (!sqlitePath.startsWith("/") || sqlitePath.split("/").includes("..")) {
  fail("DATABASE_URL must be an absolute sqlite file path");
}
if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
  fail("ENCRYPTION_KEY must be a 32-byte hexadecimal key supplied outside the repository");
}
if (apiToken.length < 32 || apiToken.includes("REPLACE_WITH")) {
  fail("SECRET_FABRIC_API_TOKEN must be a long random token supplied outside the repository");
}
