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

function secretField(path: string, label: string, input: "password" | "textarea" = "password"): FieldSchema {
  return { path, label, input, sensitive: true, claimOnly: true };
}

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
    type: "mysql",
    label: "MySQL / MariaDB",
    description: "MySQL-compatible database connection",
    fields: [
      { path: "host", label: "Host", input: "hostname", required: true },
      { path: "port", label: "Port", input: "port", defaultValue: "3306" },
      { path: "database", label: "Database", input: "text", required: true },
      { path: "username", label: "Username", input: "text", required: true },
      secretField("password", "Password"),
      { path: "ssl", label: "TLS", input: "select", defaultValue: "required", options: ["required", "verify", "disabled"] },
    ],
  },
  {
    type: "redis",
    label: "Redis",
    description: "Redis or Valkey connection",
    fields: [
      { path: "host", label: "Host", input: "hostname", required: true },
      { path: "port", label: "Port", input: "port", defaultValue: "6379" },
      { path: "database", label: "Database number", input: "text", defaultValue: "0" },
      secretField("password", "Password"),
      { path: "tls", label: "TLS", input: "select", defaultValue: "true", options: ["true", "false"] },
    ],
  },
  {
    type: "mongodb",
    label: "MongoDB",
    description: "MongoDB connection",
    fields: [
      { path: "host", label: "Host", input: "hostname", required: true },
      { path: "port", label: "Port", input: "port", defaultValue: "27017" },
      { path: "database", label: "Database", input: "text", required: true },
      { path: "username", label: "Username", input: "text" },
      secretField("password", "Password"),
      { path: "replicaSet", label: "Replica set", input: "text" },
    ],
  },
  {
    type: "rest-api",
    label: "REST API",
    description: "Generic HTTP API credential",
    fields: [
      { path: "baseUrl", label: "Base URL", input: "url", required: true },
      { path: "auth.type", label: "Authentication", input: "select", defaultValue: "bearer", options: ["none", "basic", "bearer", "api-key", "oauth2"] },
      { path: "auth.username", label: "Username", input: "text" },
      secretField("auth.password", "Password"),
      secretField("auth.token", "API token"),
      { path: "auth.header", label: "API key header", input: "text", defaultValue: "Authorization" },
    ],
  },
  {
    type: "oauth2",
    label: "OAuth2 / OIDC",
    description: "OAuth2 client and token material",
    fields: [
      { path: "issuerUrl", label: "Issuer URL", input: "url" },
      { path: "authorizationUrl", label: "Authorization URL", input: "url" },
      { path: "tokenUrl", label: "Token URL", input: "url", required: true },
      { path: "clientId", label: "Client ID", input: "text", required: true },
      secretField("clientSecret", "Client secret"),
      { path: "scopes", label: "Scopes", input: "text" },
      secretField("refreshToken", "Refresh token"),
    ],
  },
  {
    type: "github",
    label: "GitHub",
    description: "GitHub account or application credential",
    fields: [
      { path: "account", label: "Account / organization", input: "text" },
      { path: "apiUrl", label: "API URL", input: "url", defaultValue: "https://api.github.com" },
      secretField("token", "Personal access token"),
      { path: "ssh.host", label: "SSH host", input: "hostname", defaultValue: "github.com" },
      secretField("ssh.privateKey", "SSH private key", "textarea"),
    ],
  },
  {
    type: "gitlab",
    label: "GitLab",
    description: "GitLab account or instance credential",
    fields: [
      { path: "instanceUrl", label: "Instance URL", input: "url", defaultValue: "https://gitlab.com" },
      { path: "username", label: "Username", input: "text" },
      secretField("token", "Personal access token"),
      secretField("ssh.privateKey", "SSH private key", "textarea"),
    ],
  },
  {
    type: "kubernetes",
    label: "Kubernetes",
    description: "Kubeconfig or cluster credential",
    fields: [
      { path: "clusterName", label: "Cluster name", input: "text", required: true },
      { path: "server", label: "API server", input: "url", required: true },
      secretField("certificateAuthority", "Certificate authority", "textarea"),
      secretField("clientCertificate", "Client certificate", "textarea"),
      secretField("clientKey", "Client key", "textarea"),
      { path: "namespace", label: "Namespace", input: "text", defaultValue: "default" },
    ],
  },
  {
    type: "aws",
    label: "AWS",
    description: "AWS account and access credential",
    fields: [
      { path: "accountId", label: "Account ID", input: "text" },
      { path: "region", label: "Region", input: "text", defaultValue: "eu-central-1" },
      { path: "accessKeyId", label: "Access key ID", input: "text", required: true },
      secretField("secretAccessKey", "Secret access key"),
      secretField("sessionToken", "Session token"),
      { path: "roleArn", label: "Role ARN", input: "text" },
    ],
  },
  {
    type: "azure",
    label: "Microsoft Azure",
    description: "Azure service principal or workload credential",
    fields: [
      { path: "tenantId", label: "Tenant ID", input: "text", required: true },
      { path: "subscriptionId", label: "Subscription ID", input: "text" },
      { path: "clientId", label: "Client ID", input: "text", required: true },
      secretField("clientSecret", "Client secret"),
      { path: "cloud", label: "Cloud", input: "select", defaultValue: "public", options: ["public", "government", "china"] },
    ],
  },
  {
    type: "gcp",
    label: "Google Cloud",
    description: "GCP service account or workload credential",
    fields: [
      { path: "projectId", label: "Project ID", input: "text", required: true },
      { path: "serviceAccount", label: "Service account email", input: "text" },
      secretField("privateKey", "Private key", "textarea"),
      secretField("accessToken", "Access token"),
    ],
  },
  {
    type: "docker-registry",
    label: "Docker Registry",
    description: "OCI/Docker registry credential",
    fields: [
      { path: "registry", label: "Registry URL", input: "url", required: true },
      { path: "username", label: "Username", input: "text", required: true },
      secretField("password", "Password or access token"),
      { path: "repository", label: "Repository", input: "text" },
    ],
  },
  {
    type: "ldap",
    label: "LDAP / Active Directory",
    description: "LDAP directory connection",
    fields: [
      { path: "url", label: "LDAP URL", input: "url", required: true },
      { path: "baseDn", label: "Base DN", input: "text", required: true },
      { path: "bindDn", label: "Bind DN", input: "text" },
      secretField("bindPassword", "Bind password"),
      { path: "tls", label: "TLS", input: "select", defaultValue: "ldaps", options: ["ldaps", "starttls", "none"] },
    ],
  },
  {
    type: "wireguard",
    label: "WireGuard",
    description: "WireGuard peer configuration",
    fields: [
      { path: "interface.address", label: "Interface address", input: "text", required: true },
      { path: "interface.endpoint", label: "Endpoint", input: "hostname", required: true },
      { path: "interface.port", label: "Endpoint port", input: "port", defaultValue: "51820" },
      secretField("interface.privateKey", "Interface private key"),
      secretField("peer.publicKey", "Peer public key"),
      { path: "peer.allowedIps", label: "Allowed IPs", input: "text" },
    ],
  },
  {
    type: "mqtt",
    label: "MQTT",
    description: "MQTT broker connection",
    fields: [
      { path: "host", label: "Broker host", input: "hostname", required: true },
      { path: "port", label: "Port", input: "port", defaultValue: "8883" },
      { path: "clientId", label: "Client ID", input: "text" },
      { path: "username", label: "Username", input: "text" },
      secretField("password", "Password"),
      { path: "tls", label: "TLS", input: "select", defaultValue: "true", options: ["true", "false"] },
    ],
  },
  {
    type: "tls-certificate",
    label: "TLS Certificate",
    description: "Certificate and private key material",
    fields: [
      { path: "commonName", label: "Common name", input: "text", required: true },
      { path: "certificate", label: "Certificate", input: "textarea", required: true, sensitive: true, claimOnly: true },
      secretField("privateKey", "Private key", "textarea"),
      secretField("chain", "Certificate chain", "textarea"),
      { path: "expiresAt", label: "Expires at", input: "text" },
    ],
  },
  {
    type: "website-login",
    label: "Website Login",
    description: "Website account, login and MFA data",
    fields: [
      { path: "site.name", label: "Website name", input: "text", required: true },
      { path: "site.url", label: "Website URL", input: "url", required: true },
      { path: "account.username", label: "Username", input: "text" },
      { path: "account.email", label: "Email address", input: "text" },
      secretField("account.password", "Password"),
      { path: "mfa.method", label: "MFA method", input: "select", defaultValue: "none", options: ["none", "totp", "sms", "email", "passkey", "security-key"] },
      secretField("mfa.totpSecret", "TOTP secret"),
      secretField("mfa.recoveryCodes", "Recovery codes", "textarea"),
      secretField("mfa.passkeyReference", "Passkey reference"),
      { path: "notes", label: "Notes", input: "textarea" },
    ],
  },
  {
    type: "domain-dns",
    label: "Domain / DNS Provider",
    description: "Registrar, DNS zone and domain account data",
    fields: [
      { path: "domain", label: "Domain", input: "text", required: true },
      { path: "provider", label: "Provider", input: "text", required: true },
      { path: "login.url", label: "Login URL", input: "url" },
      { path: "login.username", label: "Username", input: "text" },
      secretField("login.password", "Password"),
      secretField("api.token", "API token"),
      { path: "zoneId", label: "Zone ID", input: "text" },
      { path: "nameservers", label: "Nameservers", input: "textarea" },
    ],
  },
  {
    type: "web-service",
    label: "Web Service Account",
    description: "Generic hosted service or SaaS account",
    fields: [
      { path: "service.name", label: "Service name", input: "text", required: true },
      { path: "service.url", label: "Service URL", input: "url", required: true },
      { path: "account.organization", label: "Organization / workspace", input: "text" },
      { path: "account.username", label: "Username", input: "text" },
      { path: "account.email", label: "Email address", input: "text" },
      secretField("account.password", "Password"),
      secretField("api.key", "API key"),
      { path: "plan", label: "Plan", input: "text" },
      { path: "notes", label: "Notes", input: "textarea" },
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
