export type FieldSchema = {
  path: string;
  label: string;
  input: "text" | "password" | "hostname" | "port" | "url" | "textarea" | "select";
  required?: boolean;
  sensitive?: boolean;
  claimOnly?: boolean;
  defaultValue?: string;
  options?: string[];
};

export type ResourceSchema = {
  type: string;
  label: string;
  description: string;
  fields: FieldSchema[];
};

export const schemaCatalog: ResourceSchema[] = [
  {
    type: "email",
    label: "Email Account",
    description: "IMAP/SMTP mailbox credential",
    fields: [
      { path: "identity.email", label: "Email address", input: "text", required: true },
      { path: "incoming.protocol", label: "Incoming protocol", input: "select", defaultValue: "imap", options: ["imap", "pop3"] },
      { path: "incoming.host", label: "IMAP host", input: "hostname", required: true },
      { path: "incoming.port", label: "IMAP port", input: "port", defaultValue: "993" },
      { path: "incoming.security", label: "Incoming security", input: "select", defaultValue: "tls", options: ["tls", "starttls", "none"] },
      { path: "incoming.username", label: "IMAP username", input: "text", required: true },
      { path: "incoming.password", label: "IMAP password", input: "password", required: true, sensitive: true, claimOnly: true },
      { path: "outgoing.host", label: "SMTP host", input: "hostname", required: true },
      { path: "outgoing.port", label: "SMTP port", input: "port", defaultValue: "587" },
      { path: "outgoing.security", label: "Outgoing security", input: "select", defaultValue: "starttls", options: ["tls", "starttls", "none"] },
      { path: "outgoing.username", label: "SMTP username", input: "text", required: true },
      { path: "outgoing.password", label: "SMTP password", input: "password", required: true, sensitive: true, claimOnly: true },
    ],
  },
  {
    type: "ssh",
    label: "SSH Server",
    description: "SSH/SFTP connection credential",
    fields: [
      { path: "connection.host", label: "Host", input: "hostname", required: true },
      { path: "connection.port", label: "Port", input: "port", defaultValue: "22" },
      { path: "auth.username", label: "Username", input: "text", required: true },
      { path: "auth.password", label: "Password", input: "password", sensitive: true, claimOnly: true },
      { path: "auth.privateKey", label: "Private key", input: "textarea", sensitive: true, claimOnly: true },
    ],
  },
  {
    type: "postgres",
    label: "PostgreSQL",
    description: "PostgreSQL database connection",
    fields: [
      { path: "host", label: "Host", input: "hostname", required: true },
      { path: "port", label: "Port", input: "port", defaultValue: "5432" },
      { path: "database", label: "Database", input: "text", required: true },
      { path: "username", label: "Username", input: "text", required: true },
      { path: "password", label: "Password", input: "password", required: true, sensitive: true, claimOnly: true },
      { path: "sslMode", label: "SSL mode", input: "select", defaultValue: "require", options: ["require", "verify-full", "disable"] },
    ],
  },
  {
    type: "custom",
    label: "Custom JSON",
    description: "Free-form resource with arbitrary fields",
    fields: [{ path: "data", label: "JSON payload", input: "textarea", required: true, sensitive: false }],
  },
];

export function getSchema(type: string) {
  return schemaCatalog.find((schema) => schema.type === type);
}
