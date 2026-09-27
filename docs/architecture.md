# SecretFabric — Teknik Mimari

## 1. Mimari karar

Sistem bağımsız bir Secret Broker olarak geliştirilecektir. Vaultwarden zorunlu backend olmayacaktır.

Temel prensipler:

- Secret payload’ları esnek JSON olarak modellenir.
- Plaintext payload PostgreSQL’de tutulmaz.
- Schema’lar payload’ı sınırlamak için değil, form, validation ve tool kullanımını tanımlamak için kullanılır.
- Hermes secret değerini doğrudan almaz.
- Secret kullanımı policy kontrollü `secret_read` veya ilgili Hermes tool’u üzerinden yapılır.
- Claim linkleri tek kullanımlık ve kısa ömürlüdür.
- Sistem Tailscale ağı içinde çalışır.

## 2. Bileşenler

```text
┌──────────────────────────────┐
│ Hermes Agent / Telegram       │
└──────────────┬───────────────┘
               │ MCP veya custom tool API
┌──────────────▼───────────────┐
│ Secret Broker API             │
│                               │
│  - Secret service             │
│  - Schema registry            │
│  - Claim service              │
│  - Policy engine              │
│  - Adapter runner             │
│  - Audit service              │
└──────┬─────────────┬─────────┘
       │             │
┌──────▼──────┐ ┌────▼─────────┐
│ PostgreSQL  │ │ Hermes tools / clients │
│ encrypted   │ │ Himalaya, kubectl, db  │
│ payloads    │ │ HTTP/etc.     │
└─────────────┘ └───────────────┘
       │
┌──────▼────────────────────────┐
│ Tailscale Serve HTTPS          │
│ Dynamic claim/admin UI         │
└───────────────────────────────┘
```

## 3. Önerilen teknoloji

- Next.js App Router + Route Handlers
- Database: PostgreSQL via Prisma
- Frontend: Next.js + Mantine
- Deployment: Docker Compose
- HTTPS/network: Tailscale Serve HTTPS
- Encryption: libsodium XChaCha20-Poly1305 or AES-256-GCM
- Key management: separate protected key; OpenBao/KMS-compatible abstraction
- Hermes integration: MCP server or Hermes custom tool
- Validation: JSON Schema
- Migrations: Prisma Migrate

## 4. Veritabanı şeması

### 4.1 `secret_records`

Secret metadata ve encrypted payload.

```sql
CREATE TABLE secret_records (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT,
    schema_id UUID,
    schema_version INTEGER,
    encrypted_payload BYTEA NOT NULL,
    payload_nonce BYTEA NOT NULL,
    encryption_key_ref TEXT NOT NULL,
    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`encrypted_payload` hiçbir zaman plaintext JSON içermemelidir.

### 4.2 `secret_schemas`

Protocol ve custom schema tanımları.

```sql
CREATE TABLE secret_schemas (
    id UUID PRIMARY KEY,
    type TEXT NOT NULL,
    provider TEXT,
    version INTEGER NOT NULL,
    name TEXT NOT NULL,
    definition JSONB NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(type, provider, version)
);
```

Örnek `definition`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SMTP Credential",
  "type": "object",
  "properties": {
    "host": {
      "type": "string",
      "format": "hostname",
      "x-ui": {"input": "hostname"},
      "x-security": {"sensitive": false}
    },
    "port": {
      "type": "integer",
      "default": 587,
      "minimum": 1,
      "maximum": 65535
    },
    "username": {
      "type": "string",
      "x-ui": {"input": "username"},
      "x-security": {"sensitive": false}
    },
    "password": {
      "type": "string",
      "x-ui": {"input": "password"},
      "x-security": {
        "sensitive": true,
        "claim_only": true,
        "expose_to_ai": false
      }
    }
  },
  "required": ["host", "port", "username", "password"]
}
```

### 4.3 `secret_claims`

Tek kullanımlık magic link işlemleri.

```sql
CREATE TABLE secret_claims (
    id UUID PRIMARY KEY,
    secret_record_id UUID NOT NULL REFERENCES secret_records(id),
    token_hash BYTEA NOT NULL UNIQUE,
    allowed_paths JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Token plaintext olarak hiçbir zaman kaydedilmez.

### 4.4 `policies`

Hangi consumer’ın hangi secret’ı hangi operasyonla kullanacağını belirler.

```sql
CREATE TABLE policies (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    consumer TEXT NOT NULL,
    secret_selector JSONB NOT NULL,
    operations JSONB NOT NULL,
    allowed_paths JSONB,
    max_ttl_seconds INTEGER,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Örnek:

```json
{
  "consumer": "mail_tool",
  "secret_selector": {"type": "email", "name": "info-mail"},
  "operations": ["send_email"],
  "allowed_paths": [
    "outgoing.host",
    "outgoing.port",
    "outgoing.security",
    "outgoing.username",
    "outgoing.password"
  ],
  "max_ttl_seconds": 60
}
```

### 4.5 `audit_events`

Secret değerlerini içermeyen audit kayıtları.

```sql
CREATE TABLE audit_events (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor TEXT NOT NULL,
    consumer TEXT,
    secret_record_id UUID REFERENCES secret_records(id),
    operation TEXT NOT NULL,
    field_paths JSONB,
    result TEXT NOT NULL,
    failure_code TEXT,
    request_id UUID NOT NULL
);
```

## 5. Encryption modeli

İlk sürüm için envelope encryption kullanılmalıdır:

```text
Root/KEK
  └── encrypts record-specific DEK
          └── encrypts JSON payload
```

Her secret kaydı için ayrı DEK:

1. Rastgele DEK üretilir.
2. JSON payload DEK ile authenticated encryption kullanılarak şifrelenir.
3. DEK, root key/KMS key ile sarılır.
4. DB’ye ciphertext, nonce, wrapped DEK ve key reference yazılır.

Payload örneği plaintext olarak yalnızca backend belleğinde bulunur:

```json
{
  "data": {
    "host": "smtp.example.com",
    "password": "..."
  },
  "schema_version": 1
}
```

Frontend’e mevcut secret değerleri varsayılan olarak geri gönderilmez.

## 6. Claim akışı

```text
Hermes → POST /v1/secrets/drafts
       ← draft_id + claim_url

Browser → GET /claim/{token}
         ← schema + non-sensitive prefilled values

Browser → POST /claim/{token}
         → user-entered sensitive fields

API → validate schema
    → validate token
    → encrypt payload
    → save record
    → mark token used
    → write audit event

Hermes ← claim completed + metadata only
```

API kuralları:

- Token hash üzerinden lookup yapılır.
- Expired veya used token reddedilir.
- Claim işlemi transaction içinde atomik olmalıdır.
- Başarılı submit sonrasında token tekrar kullanılamaz.
- Form endpoint’i secret değerlerini response içinde echo etmez.

## 7. API taslağı

### Secret metadata

```http
GET /v1/secrets
GET /v1/secrets/{id}/metadata
POST /v1/secrets/drafts
PATCH /v1/secrets/{id}/metadata
DELETE /v1/secrets/{id}
```

### Claim

```http
POST /v1/claims
GET  /claim/{token}
POST /claim/{token}
```

### Schema

```http
GET  /v1/schemas
GET  /v1/schemas/{type}
POST /v1/schemas
POST /v1/schemas/validate
```

### Tool execution

```http
POST /v1/tool-runs
```

Örnek request:

```json
{
  "consumer": "mail_tool",
  "secret_id": "uuid",
  "operation": "send_email",
  "input": {
    "to": "recipient@example.com",
    "subject": "Test",
    "body": "..."
  }
}
```

Response yalnızca operasyon sonucunu içermelidir:

```json
{
  "request_id": "uuid",
  "status": "success",
  "message_id": "provider-message-id"
}
```

## 8. Hermes entegrasyonu

### Secret read ve write tool’ları

Hermes entegrasyonunda secret değerini döndüren genel amaçlı ve sınırsız bir tool bulunmaz. Bunun yerine scoped operasyonlar kullanılır:

```text
create_secret_draft
create_claim_link
list_secret_metadata
read_secret
write_secret
get_secret_status
request_secret_rotation
read_rule
execute_rule
read_prompt
execute_prompt
```

`read_secret` yalnızca açıkça istenen field path’lerinin policy ve share kontrolünden sonra projection olarak döner. `write_secret` readonly paylaşımı aşamaz.

## 9. Secret erişim katmanı

Secret değerlerine erişim adapter zorunluluğu olmadan, scoped read operasyonu ile yapılır. Bot yalnızca policy ve share izinleriyle yetkilendirilmiş field path’leri okuyabilir.

İlk kullanım katmanı:

```text
secret_read
secret_metadata_read
secret_write
secret_rotate
rule_read
rule_write
```

Secret değerleri doğrudan Hermes botuna yalnızca policy izin veriyorsa ve izin verilen field path’leriyle verilir. Genel, filtresiz `dump_all_secrets` operasyonu bulunmaz.

### 9.1 Scoped secret read

Bot bir secret’ı okuyabilir; ancak okuma işlemi account, share, role, operation ve field path kontrollerinden geçer.

```json
{
  "secret_id": "info-mail",
  "field_paths": [
    "outgoing.host",
    "outgoing.port",
    "outgoing.username",
    "outgoing.password"
  ],
  "purpose": "smtp_connection"
}
```

Broker yalnızca izin verilen projection’ı döner. Secret’ın tamamı, paylaşılmamış alanlar veya başka account’a ait kayıtlar döndürülmez.

```text
Bot → read_secret(info-mail)
Broker:
  1. bot identity doğrula
  2. owner/share ilişkisini kontrol et
  3. readonly/readwrite rolünü kontrol et
  4. field path intersection hesapla
  5. yalnızca izinli JSON projection döndür
  6. audit event yaz
```

Plaintext secret’ın model context’ine dönmesi varsayılan olarak kapalı olmalıdır. `read_secret` sonucu trusted tool/process’e verilebilir; modelin görmesi ancak ayrıca izin verilen `expose_to_model` policy’siyle mümkün olmalıdır.

Mail hesabı için gerekli alanlar `secret_read` ile okunabilir; mail gönderme işlemi Hermes’in mevcut Himalaya workflow’u veya ilgili tool’u tarafından gerçekleştirilir. `info@mertyagci.de` gönderimleri için Himalaya ve `--save Sent` kuralı korunur.


## 10. Rules sistemi

Secret kayıtlarından ayrı bir `rule` kaynağı bulunur. Rule; otomasyon, karar, prompt, workflow veya operasyon tanımını JSON olarak saklar ve secret’lara referans verebilir.

Örnek rule:

```json
{
  "type": "mail_triage",
  "name": "Info mailbox triage",
  "trigger": {
    "event": "new_mail",
    "mailbox_secret": {"$secret_ref": "info-mail"}
  },
  "conditions": [
    {"field": "from", "operator": "contains", "value": "@example.com"}
  ],
  "actions": [
    {"type": "label", "value": "important"},
    {"type": "create_draft", "template": "professional-reply"}
  ]
}
```

Rule payload’ı da arbitrary JSON desteklemelidir. Secret değerleri rule içine gömülmemeli; yalnızca `secret_ref` kullanılmalıdır.

### 11.1 Rule izinleri

- `read`: rule görüntüleme ve çalıştırma tanımını okuma
- `execute`: rule çalıştırma
- `edit`: rule içeriğini değiştirme
- `share`: rule’ı başkalarıyla paylaşma
- `delete`: rule silme
- `admin`: tüm işlemler

Bir rule başka account veya bot ile paylaşılırken role ve field/path scope tanımlanabilmelidir.

### 11.2 Rule paylaşımı

Rule paylaşımı secret paylaşımından bağımsızdır; rule secret referansı içeriyorsa ilgili secret’a ayrıca erişim verilmesi gerekir.

```text
Rule shared to: threda-agent
Role: readonly
Allowed operation: execute
Referenced secret: info-mail
Secret permission: readonly/read
```

Rule’ı readonly alan bot:

- Rule JSON’unu okuyabilir.
- Rule’ı çalıştırabilir, eğer `execute` ayrıca verilmişse.
- Rule’ı değiştiremez.
- Rule’ı yeniden paylaşamaz.
- Rule içindeki secret referansını çözemez, eğer secret paylaşımı ayrıca yoksa.

### 11.3 Shared readonly

Paylaşımı yapan account şu yetkileri ayrı ayrı verebilmelidir:

```text
share role:
  - readonly
  - execute-only
  - editor
  - admin

secret role:
  - metadata-only
  - field-readonly
  - readwrite
```

Varsayılan paylaşım `metadata-only` veya `readonly` olmalı; readwrite açıkça seçilmelidir.

## 12. Güncellenmiş authorization sırası

Her secret veya rule erişiminde:

1. Bot identity doğrulama
2. Source/owner account kontrolü
3. Share kaydı ve revoke/expiry kontrolü
4. Role ve operation kontrolü
5. Field path veya rule scope kontrolü
6. Referenced secret erişim kontrolü
7. Model exposure kontrolü
8. Audit event yazılması
9. İzinli projection veya rule payload döndürülmesi

İlk sürüm:

- Servis yalnızca Tailscale interface/Serve üzerinden yayınlanır.
- Claim token bearer credential olarak kullanılır.
- Admin endpoint’leri ayrıca application authentication ister.
- Public internet erişimi kapalıdır.

Sonraki sürüm:

- Tailscale identity/headers doğrulaması
- Claim linkini belirli kullanıcı veya cihazla bağlama
- Kullanıcı bazlı policy
- Device/session revocation

## 11. Deployment

```text
Docker Compose:
  secret-broker-api
  secret-broker-ui
  postgres
  optional: openbao
```

Tailscale Serve yalnızca UI/API container’ına yönlendirilir. PostgreSQL tailnet dışına port açmadan aynı Docker network içinde çalışır.

Backup:

- PostgreSQL backup alınır.
- Encryption root key ayrı backup kanalında saklanır.
- Backup ve key aynı yerde tutulmaz.
- Restore işlemi test edilmeden backup başarılı kabul edilmez.

## 12. Uygulama sırası

### Sprint 1 — Çekirdek

- Repository ve Docker Compose
- PostgreSQL migration’ları
- Secret encryption service
- Secret metadata CRUD
- Audit service

### Sprint 2 — Schema ve claim

- Schema registry
- JSON Schema validation
- Dynamic form UI
- One-time claim link
- Tailscale Serve

### Sprint 3 — Hermes entegrasyonu

- MCP/custom tools
- `create_secret_draft`
- `create_claim_link`
- `list_secret_metadata`
- Telegram link delivery

### Sprint 4 — İlk Hermes resource erişimleri

- `read_secret`
- `read_rule`
- `execute_rule`
- SMTP/IMAP bilgileri için mevcut Himalaya workflow’una scoped secret erişimi
- PostgreSQL, SSH ve HTTP tool’ları için field projection
- Policy enforcement

### Sprint 5 — Güvenlik ve operasyon

- Rate limiting
- Log redaction
- Expiry notifications
- Encrypted backup/restore
- Rotation framework
- Security testleri

## 13. Multi-account ve paylaşım mimarisi

### 13.1 Account modeli

Aynı deployment içinde birden fazla account/workspace bulunur. Her secret bir `owner_account_id` ile ilişkilendirilir.

```text
Deployment
├── Account: mert-personal
│   ├── Hermes bot: hermes-main
│   └── private secrets
├── Account: threda
│   ├── Hermes bot: threda-agent
│   └── workspace secrets
└── Account: shared-infra
    └── shared infrastructure secrets
```

### 13.2 Önerilen tablolar

```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bot_identities (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id),
    name TEXT NOT NULL,
    external_subject TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account_memberships (
    account_id UUID NOT NULL REFERENCES accounts(id),
    subject TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, subject)
);

CREATE TABLE secret_shares (
    id UUID PRIMARY KEY,
    secret_record_id UUID NOT NULL REFERENCES secret_records(id),
    source_account_id UUID NOT NULL REFERENCES accounts(id),
    target_account_id UUID REFERENCES accounts(id),
    target_bot_id UUID REFERENCES bot_identities(id),
    scope TEXT NOT NULL,
    allowed_paths JSONB,
    allowed_operations JSONB,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 13.3 Resource modeli

Secret dışında rule ve prompt kayıtları da aynı account/share modelini kullanır. Bu nedenle paylaşım tablosunun yalnızca `secret_record_id` alanına bağlı kalmaması gerekir.

Önerilen genel resource modeli:

```sql
CREATE TABLE resources (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id),
    resource_type TEXT NOT NULL,
    name TEXT NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resource_versions (
    id UUID PRIMARY KEY,
    resource_id UUID NOT NULL REFERENCES resources(id),
    version INTEGER NOT NULL,
    encrypted_payload BYTEA NOT NULL,
    payload_nonce BYTEA NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(resource_id, version)
);

CREATE TABLE resource_shares (
    id UUID PRIMARY KEY,
    resource_id UUID NOT NULL REFERENCES resources(id),
    source_account_id UUID NOT NULL REFERENCES accounts(id),
    target_account_id UUID REFERENCES accounts(id),
    target_bot_id UUID REFERENCES bot_identities(id),
    role TEXT NOT NULL,
    allowed_operations JSONB,
    allowed_paths JSONB,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`secret_shares` geriye dönük uyumluluk için tutulabilir veya migration ile `resource_shares` içine taşınabilir. Uzun vadede secret, rule ve prompt için tek share modeli kullanılmalıdır.

### 13.4 Prompt sistemi

Prompt ayrı bir resource type’tır ve plaintext veya hassas içeriğe göre encrypted version payload olarak saklanır.

```json
{
  "type": "prompt",
  "name": "Professional mail reply",
  "purpose": "email_reply",
  "content": "Du bist ein professioneller E-Mail-Assistent...",
  "variables": {
    "tone": "professional",
    "language": "de"
  },
  "secret_refs": [],
  "tags": ["email", "professional"]
}
```

Prompt kayıtları şunları desteklemelidir:

- version history
- draft/published/archive status
- variables ve variable types
- tags
- optional secret references
- model/tool scope
- execution notes

Prompt içine password veya token gömülmemelidir. Gerekirse `$secret_ref` kullanılmalı ve prompt çalıştırılırken secret erişimi ayrıca authorize edilmelidir.

Örnek:

```json
{
  "content": "Use the following account context: {{$secret_ref:crm-readonly}}",
  "secret_refs": ["crm-readonly"],
  "expose_secret_to_model": false
}
```

### 13.5 Paylaşım scope’ları

```sql
ALTER TABLE secret_records
ADD COLUMN owner_account_id UUID NOT NULL REFERENCES accounts(id);
```

### 13.3 Share scope’ları

```text
private  → yalnızca owner account
workspace → account içindeki izinli botlar
shared   → açıkça seçilen account/bot
system   → yalnızca broker kontrollü Hermes tool/process
```

Varsayılan scope `private` olmalıdır.

### 13.4 Paylaşım örneği

`mert-personal` account’undaki `info-mail` secret’ı `threda-agent` botuna paylaşılabilir:

```text
source account: mert-personal
target bot: threda-agent
allowed operations: send_email
allowed paths:
  - outgoing.host
  - outgoing.port
  - outgoing.security
  - outgoing.username
  - outgoing.password
expires: 2026-12-31
```

Bot `read_secret` veya `execute_rule` çağırır. Broker share, policy, field scope ve referenced-resource kontrollerini birlikte uygular.

### 13.5 Authorization sırası

Her erişimde kontroller şu sırada yapılır:

1. Bot identity doğrulama
2. Bot’un account üyeliği ve status kontrolü
3. Secret owner account kontrolü
4. Share kaydı ve revoke/expiry kontrolü
5. Operation kontrolü
6. Field path intersection kontrolü
7. Adapter doğrulaması
8. Audit event yazılması
9. Kısa ömürlü execution

## 14. Web UI ve frontend kararı

### Önerilen seçim: Next.js + Mantine

İlk sürüm için Next.js ve Mantine uygundur:

- Form ağırlıklı admin panel için hızlıdır.
- Table, modal, drawer, notification ve form bileşenleri hazırdır.
- Dinamik schema-driven form oluşturmak kolaydır.
- Dark mode ve responsive UI hazır gelir.
- Tailwind zorunlu olmadığı için CSS karmaşası azalır.

UI katmanları:

```text
app/
├── (auth)/
├── dashboard/
├── secrets/
├── prompts/
├── schemas/
├── shares/
├── bots/
├── audit/
└── claim/[token]/
```

Alternatifler:

- shadcn/ui + Tailwind: Daha fazla tasarım kontrolü; daha fazla component assembly işi.
- React Aria + kendi design system’i: Erişilebilirlik kontrolü yüksek; MVP için yavaş.
- SvelteKit + Skeleton: Hafif ve hızlı; Hermes/React ekosistemiyle daha az ortak kod.

Karar: MVP’de Mantine; ürünün görsel dili büyürse tasarım token’ları Mantine theme üzerinden merkezi yönetilir.

## 15. Container ve CI/CD mimarisi

### 15.1 Container’lar

```text
secret-broker-api
secret-broker-web
secret-broker-worker
postgres
optional: openbao
```

İlk MVP’de worker, API container içinde background process olarak başlayabilir; production’da ayrı container tercih edilir.

### 15.2 Repository yapısı

```text
secret-manager/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── schema-types/
│   └── shared-contracts/
├── integrations/
├── migrations/
├── deploy/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── tailscale/
├── Dockerfile.api
├── Dockerfile.web
├── compose.yaml
└── README.md
```

### 15.3 Image stratejisi

Docker Hub repository’leri:

```text
<dockerhub-user>/secret-manager-api
<dockerhub-user>/secret-manager-web
<dockerhub-user>/secret-manager-worker
```

Tag’ler:

```text
v0.1.0       release tag
sha-abc123   immutable commit tag
main         development branch image
latest       yalnızca stable release için
```

Her production image immutable digest ile deployment manifestine pinlenmelidir.

### 15.4 CI pipeline

Git server push/tag sonrası:

1. Backend testleri
2. Frontend typecheck/lint/test
3. Schema validation testleri
4. Migration testleri
5. Docker image build
6. Trivy veya eşdeğer vulnerability scan
7. SBOM üretimi
8. Registry login
9. Docker Hub push
10. Tag ve digest çıktısını artifact olarak yayınlama

Docker Hub token CI secret olarak tutulmalı, repository içine yazılmamalıdır.

### 15.5 Multi-stage Dockerfile prensipleri

- Dependency install stage
- Build stage
- Minimal runtime stage
- Non-root user
- Read-only filesystem mümkün olduğunda
- Healthcheck
- Runtime secret’ları image içine koymama
- `.dockerignore` ile `.env`, key ve local backup dışlama

## 17. Agent discovery ve dokümantasyon

Bu container başka Hermes agent’lar tarafından kullanılırken yalnızca insan dokümantasyonuna güvenilmemelidir. Sistem kendini machine-readable biçimde tanıtmalıdır.

### 17.1 Public olmayan discovery endpoint’leri

Tailscale ağı içinde erişilebilen endpoint’ler:

```text
GET /.well-known/secret-manager.json
GET /docs
GET /openapi.json
GET /mcp/capabilities
GET /v1/schemas
GET /v1/resource-types
```

`/.well-known/secret-manager.json` örneği:

```json
{
  "service": "secretfabric",
  "display_name": "SecretFabric Agent Resource Manager",
  "version": "0.1.0",
  "api_base": "https://secrets.tailnet.ts.net",
  "openapi": "/openapi.json",
  "mcp": {
    "endpoint": "/mcp",
    "transport": "streamable-http"
  },
  "resource_types": ["secret", "rule", "prompt"],
  "operations": [
    "create_secret_draft",
    "read_secret",
    "read_rule",
    "execute_rule",
    "read_prompt",
    "execute_prompt"
  ],
  "auth": {
    "network": "tailscale",
    "mode": "bot_identity_and_policy"
  },
  "documentation": "/docs/agent-guide.md"
}
```

### 17.2 Agent guide

Container image içinde ve endpoint üzerinden şu dosya bulunmalıdır:

```text
/docs/agent-guide.md
```

Bu guide diğer Hermes agent’a şu soruların cevabını vermelidir:

- Servis nedir?
- Hangi resource type’ları var?
- Secret nasıl aranır?
- Field-scoped `read_secret` nasıl çağrılır?
- Rule ve prompt nasıl okunur/çalıştırılır?
- Share ve readonly ne anlama gelir?
- Hangi işlemler approval ister?
- Hangi hatalar ve status kodları döner?
- Secret değerleri modele ne zaman gösterilebilir?

### 17.3 MCP entegrasyonu

Önerilen entegrasyon MCP üzerinden yapılır. Diğer Hermes agent MCP capability discovery yaptıktan sonra tool’ları kendi tool kataloğuna alabilir.

Tool isimleri açık ve resource-oriented olmalıdır:

```text
secret_manager.list_resources
secret_manager.read_secret
secret_manager.read_rule
secret_manager.execute_rule
secret_manager.read_prompt
secret_manager.execute_prompt
secret_manager.create_claim_link
```

MCP tool description’ları kritik güvenlik kurallarını da içermelidir:

```text
- Never request all secret fields unless explicitly needed.
- Respect field-level sharing and readonly permissions.
- Do not put secret values into chat output or logs.
- Referenced resources require separate authorization.
```

### 17.4 İnsan ve makine dokümantasyonu

Container repository’sinde:

```text
README.md
/docs/agent-guide.md
/docs/architecture.md
/docs/security.md
/docs/examples/
  read-secret.json
  read-rule.json
  read-prompt.json
  create-claim-link.json
```

Docker image içinde de `agent-guide.md` ve capability manifest bulunmalıdır; agent’ın repository’ye erişimi olmasa bile servisi anlayabilmesi gerekir.

### 17.5 İsimle keşif

“secret-manager” ismiyle erişim için iki mekanizma bulunmalıdır:

1. Tailscale DNS alias: `secrets.tailnet.ts.net`
2. Hermes/MCP service registry alias: `secret-manager`

Agent önce manifest’i okur, sonra capability ve schema katalogunu alır. API yollarını veya permission modelini tahmin etmez.

## 18. Deployment ve image dokümantasyonu

`agent-guide.md`, capability manifest ve OpenAPI specification Docker image içine dahil edilmelidir. Container repository’sindeki aynı dosyalar image build sırasında kopyalanmalı; image, repository erişimi olmayan başka bir Hermes agent’ın da servisi keşfedebilmesini sağlamalıdır.

## 19. İlk kabul testi

Aşağıdaki senaryo uçtan uca çalışmalıdır:

1. Hermes’e “info mail secret’ı oluştur” denir.
2. Sistem email schema’sını seçer.
3. IMAP/SMTP alanları dinamik hazırlanır.
4. Kullanıcıya Tailscale HTTPS claim linki gönderilir.
5. Kullanıcı password alanlarını formda girer.
6. Secret encrypted payload olarak kaydedilir.
7. Link ikinci kez kullanılamaz.
8. Hermes password’ü görmez.
9. Himalaya workflow’u scoped secret read ile çalıştırılır ve mail gönderimi doğrulanır.
10. Audit log’da operation görünür, password görünmez.
