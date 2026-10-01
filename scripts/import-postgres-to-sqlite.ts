import { runImportCli } from "../src/lib/postgres-sqlite-import";

runImportCli(process.argv.slice(2)).then((code) => {
  process.exit(code);
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "import failed";
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://redacted"));
  process.exit(1);
});
