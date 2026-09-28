# SecretFabric — Requirements

## 1. Amaç

Hermes’in doğal dil komutlarıyla secret kayıtları oluşturabildiği, kullanıcıya hassas alanları güvenli bir Tailscale HTTPS formu üzerinden girdirdiği ve daha sonra secret’ları yetkili tool/process’lere kontrollü biçimde kullandırdığı self-hosted bir secret manager.

Sistem yalnızca kullanıcı adı/parola saklamamalı; farklı protokoller, entegrasyonlar ve tamamen özel JSON kayıtları için genişletilebilir olmalıdır.

## 2. Kapsam

### 2.1 Dahil

- JSON tabanlı esnek secret kayıtları
- Opsiyonel schema ve provider preset sistemi
- Protocol-aware dinamik formlar
- Tek kullanımlık magic-link claim akışı
- Tailscale HTTPS üzerinden erişim
- Alan bazlı hassasiyet ve erişim politikaları
- Şifreli secret payload saklama
- Hermes entegrasyonu
- Tool/adapter tabanlı secret kullanımı
- Audit log
- Secret expiry ve rotation altyapısı
- Kişisel profil kaydı: iletişim, adres, pasaport, kimlik kartı ve ehliyet bilgileri

### 2.2 Kapsam dışı veya sonraki faz

- İlk sürümde mevcut Vaultwarden verilerinin otomatik migrasyonu
- İlk sürümde public internet üzerinden erişim
- Secret değerlerinin AI model context’ine verilmesi
- Sınırsız otomatik secret paylaşımı
- Kullanıcıların birbirine public link ile secret göndermesi

## 3. Temel kullanıcı akışları

### 3.1 Secret oluşturma

Kullanıcı:

> “info@mertyagci.de için mail secret’ı oluşturalım.”

Sistem:

1. Uygun protocol/schema tipini seçer.
2. Gerekli alanları ve varsayılanları hazırlar.
3. Bilinen hassas olmayan alanları doldurur.
4. Password, token, private key gibi alanları boş bırakır.
5. Tek kullanımlık claim linki üretir.
6. Linki Hermes üzerinden kullanıcıya iletir.

### 3.2 Secret claim etme

1. Kullanıcı linki Tailscale HTTPS üzerinden açar.
2. Dinamik form gösterilir.
3. Kullanıcı hassas alanları doldurur.
4. Form backend’e güvenli HTTPS ile gönderilir.
5. Secret şifrelenerek kaydedilir.
6. Claim token hemen geçersizleştirilir.
7. Hermes’e yalnızca metadata ve işlem durumu döner.

### 3.3 Secret kullanma

Kullanıcı:

> “Bu mail hesabıyla e-posta gönder.”

Sistem:

1. Uygun adapter’ı seçer.
2. Yetki/policy kontrolü yapar.
3. Secret’ı yalnızca ilgili adapter/process’e verir.
4. İşlemi gerçekleştirir.
5. Secret değerini Hermes conversation context’ine döndürmez.
6. Redacted sonuç ve audit kaydı üretir.

## 4. Fonksiyonel gereksinimler

### FR-001 — Esnek JSON kayıtları

Sistem arbitrary nested JSON secret payload’larını desteklemelidir.

### FR-002 — Schema registry

Sistem schema’ları kayıt edebilmeli, versiyonlayabilmeli ve aktif schema’yı seçebilmelidir.

Schema en az şu bilgileri desteklemelidir:

- field path
- label
- input type
- required
- default value
- sensitive
- claim_only
- expose_to_ai
- validation
- visibility condition
- help text

### FR-003 — Dinamik form üretimi

Frontend, schema tanımından otomatik olarak form oluşturmalıdır.

Desteklenecek temel input tipleri:

- text
- password
- username
- email
- URL
- hostname
- port
- number
- boolean
- select
- multiselect
- textarea
- JSON
- private key
- certificate
- file
- date

### FR-004 — Koşullu alanlar

Schema, alanların başka alanların değerine göre görünmesini desteklemelidir.

Örnek: OAuth2 seçilince `client_id`, `client_secret` ve `refresh_token` gösterilmelidir.

### FR-005 — Provider preset’leri

Bir protocol için provider’a özel varsayılanlar tanımlanabilmelidir.

Örnekler:

- Gmail
- Outlook
- GitHub
- GitLab
- AWS
- Azure
- Hetzner
- Cloudflare

### FR-006 — Protocol katalogu

İlk sürümde en az şu schema’lar bulunmalıdır:

- Email: IMAP/SMTP
- SSH/SFTP
- PostgreSQL
- MySQL
- Redis
- Generic REST API
- OAuth2
- Kubernetes
- TLS certificate/private key
- Generic custom credential

### FR-007 — One-time claim link

Sistem claim linklerini:

- kriptografik olarak güvenli rastgele token ile üretmeli,
- yalnızca token hash’ini saklamalı,
- varsayılan olarak 15 dakika geçerli tutmalı,
- tek kullanımlı yapmalı,
- kullanımdan veya expiry’den sonra reddetmelidir.

### FR-008 — Tailscale erişimi

Claim UI ve yönetim API’si varsayılan olarak Tailscale ağı dışından erişilememelidir.

### FR-009 — Secret payload encryption

Secret payload’ları veritabanında plaintext tutulmamalıdır.

Minimum gereksinim:

- authenticated encryption
- key versioning
- key rotation için altyapı
- decrypt işleminin yalnızca backend içinde yapılması

### FR-010 — Alan bazlı hassasiyet

Sistem nested field path’leri bazında hassasiyet belirleyebilmelidir.

Örnek:

- `smtp.host`: public metadata
- `smtp.username`: restricted
- `smtp.password`: secret, claim-only
- `private_key`: secret, tool-only
- `personal-profile.*`: kişisel veri, claim-only; AI context'ine expose edilmez
- `personal-profile.identity.passport.*`: pasaport numarası, veren ülke, geçerlilik tarihi ve kimlik/ek sayfa dosyaları claim-only tutulur
- `personal-profile.identity.idCard.*` ve `personal-profile.identity.driversLicense.*`: belge numarası, veren ülke, geçerlilik tarihi ve ön/arka yüz dosyaları claim-only tutulur
- `personal-profile.identity.residencePermits.*`: oturum kartı bilgileri ve belge dosyaları, claim-only; dosya başına 10 MB sınırı

### FR-011 — Hermes entegrasyonu

Hermes en az şu operasyonları kullanabilmelidir:

- `create_secret_draft`
- `create_claim_link`
- `list_secret_metadata`
- `get_secret_status`
- `execute_with_secret`
- `rotate_secret`

### FR-012 — Tool adapter’ları

Secret değerleri doğrudan modele döndürülmemeli; adapter/process aracılığıyla kullanılmalıdır.

İlk adapter’lar:

- SMTP send
- IMAP read/search
- SSH command
- PostgreSQL query
- HTTP API request

### FR-013 — Policy engine

Policy en az şu boyutları desteklemelidir:

- consumer/tool
- secret record
- allowed operation
- allowed field paths
- expiry/TTL
- approval requirement

### FR-014 — Audit log

Secret değeri yazılmadan şu bilgiler audit edilmelidir:

- timestamp
- actor
- consumer/tool
- secret id/name
- operation
- selected field paths
- result
- failure reason

### FR-015 — Secret expiry

Secret kayıtları expiry tarihi taşıyabilmeli ve expiry yaklaşınca metadata üzerinden uyarı üretilebilmelidir.

### FR-016 — Rotation altyapısı

Schema ve adapter’lar secret rotation akışını destekleyecek şekilde tasarlanmalıdır.

İlk aşamada rotation manuel claim link ile yapılabilir; sonraki aşamada provider API’leri kullanılabilir.

### FR-017 — Import/export

İlk sürümde plaintext export varsayılan olarak kapalı olmalıdır.

Şifreli backup/export desteklenmelidir.

## 5. Güvenlik gereksinimleri

### SEC-001

Secret değerleri URL, query parameter, frontend route, application log, access log veya audit log içinde bulunmamalıdır.

### SEC-002

Hermes conversation context’ine secret plaintext verilmemelidir.

### SEC-003

Shell command argümanlarına secret konulmamalıdır. Secret gerekiyorsa kontrollü environment, stdin veya doğrudan process API kullanılmalıdır.

### SEC-004

Tool çıktıları secret/token/private-key pattern’leri açısından redaction filtresinden geçirilmelidir.

### SEC-005

Claim formları CSRF, clickjacking ve referrer sızıntısına karşı korunmalıdır.

Gerekli başlıklar:

- Content-Security-Policy
- Referrer-Policy: no-referrer
- X-Frame-Options veya frame-ancestors
- Strict-Transport-Security

### SEC-006

Başarısız claim denemeleri rate-limit edilmelidir.

### SEC-007

Root encryption key Docker Compose YAML’ında, Git deposunda veya PostgreSQL’de tutulmamalıdır.

### SEC-008

Secret erişimi deny-by-default olmalıdır.

### SEC-009

Backup’lar da encryption key’den bağımsız plaintext secret içermemelidir.

## 6. Teknik gereksinimler

Önerilen başlangıç stack’i:

- Backend: FastAPI
- Database: PostgreSQL
- Frontend: Next.js veya SvelteKit
- Deployment: Docker Compose
- Network exposure: Tailscale Serve HTTPS
- Encryption: XChaCha20-Poly1305 veya AES-256-GCM
- Key management: başlangıçta ayrı protected key; production’da OpenBao/KMS uyumlu tasarım
- Hermes integration: MCP veya native Hermes custom tool

## 7. Non-functional gereksinimler

- Uygulama tek sunucuda self-hosted çalışabilmelidir.
- PostgreSQL backup/restore prosedürü bulunmalıdır.
- Schema değişiklikleri versioned migration ile yapılmalıdır.
- API idempotent operasyonları desteklemelidir.
- Tüm mutation işlemleri audit edilebilir olmalıdır.
- Uygulama secret değerlerini debug modunda bile loglamamalıdır.
- UI, bilinmeyen schema alanlarını kaybetmeden korumalıdır.
- Eski schema versiyonları okunabilir olmalı veya açık migration sunulmalıdır.

## 8. İlk sürüm kabul kriterleri

- Kullanıcı “SMTP secret oluştur” komutuyla claim link alabiliyor.
- Link yalnızca Tailscale HTTPS üzerinden açılıyor.
- Form schema’dan otomatik oluşuyor.
- Kullanıcı password alanını link üzerinden girebiliyor.
- Password veritabanında plaintext görünmüyor.
- Link ikinci kez kullanılamıyor.
- Hermes password’ü sohbet çıktısında görmüyor.
- Hermes SMTP adapter ile e-posta gönderebiliyor.
- Audit log secret değerini içermiyor.
- Custom JSON secret oluşturulabiliyor.
- Aynı kayıt içinde nested ve farklı tipte alanlar destekleniyor.

## 9. Fazlar

### Faz 1 — Güvenli çekirdek

- PostgreSQL
- Encrypted JSON payload
- Schema registry
- Dynamic claim form
- One-time links
- Tailscale HTTPS
- Audit log
- Custom JSON ve email schema

### Faz 2 — Kullanılabilir protokol platformu

- SSH/SFTP
- PostgreSQL/MySQL/Redis
- REST API
- OAuth2
- Provider preset’leri
- Hermes tool adapter’ları
- Policy engine

### Faz 3 — Operasyonel yetenekler

- Secret expiry bildirimleri
- Rotation
- Encrypted backup/export
- Certificate management
- Kubernetes/cloud adapters
- Approval workflow
- Kullanım istatistikleri

### Faz 4 — Gelişmiş güvenlik

- OpenBao/KMS entegrasyonu
- Tailscale identity binding
- Device/session management
- Short-lived dynamic credentials
- Automatic rotation
- Break-glass erişim prosedürü

## 10. Multi-account ve paylaşım gereksinimleri

### FR-018 — Account/space izolasyonu

Aynı server üzerinde birden fazla bağımsız account, workspace veya bot space bulunabilmelidir. Bir account’un secret metadata’sı ve payload’ı varsayılan olarak diğer account’lara görünmemelidir.

### FR-019 — Paylaşım scope’ları

Bir secret isteğe bağlı olarak şu scope’lardan biriyle oluşturulabilmelidir:

- private: yalnızca oluşturan account
- workspace: aynı workspace içindeki yetkili botlar
- shared: açıkça seçilen account/bot listesi
- system: sistem adapter’ları tarafından kullanılabilir, doğrudan botlara görünmez

### FR-020 — Bot/service identity

Her Hermes botu ayrı bir service identity olarak tanımlanmalıdır. Policy’ler bot, workspace, secret ve operation bazında uygulanmalıdır.

### FR-021 — Field-level sharing

Paylaşım yalnızca kayıt seviyesinde değil, field path seviyesinde de yapılabilmelidir.

Örnek: shared bot `smtp.host` ve `smtp.username` görebilir; `smtp.password` yalnızca SMTP adapter’a verilebilir.

### FR-022 — Workspace üyelikleri

Bir account/workspace içinde bot ve kullanıcı üyelikleri için role tabanlı yetkilendirme bulunmalıdır:

- owner
- admin
- editor
- operator
- viewer

### FR-023 — Cross-account access audit

Bir bot başka bir account veya workspace scope’undaki secret’ı kullandığında actor, source account, target account, bot identity, operation ve field paths audit edilmelidir.

### FR-024 — Revocable sharing

Paylaşım sonradan iptal edilebilmeli, expiry zamanı tanımlanabilmeli ve secret’ın yeni kullanım talepleri anında reddedilmelidir.

### FR-025 — Shared claim links

Claim linkleri oluşturulduğu account/workspace scope’una göre sınırlandırılmalıdır. Shared link, yalnızca açıkça izin verilen bot veya kullanıcıların claim işlemine erişebilmelidir.

## 11. UI ve dağıtım gereksinimleri

### FR-026 — Web uygulaması

Yönetim paneli Next.js ile geliştirilmeli ve server-side/API route güvenlik sınırları açık olmalıdır.

### FR-027 — Container image

Backend, frontend ve gerekiyorsa worker servisleri reproducible Docker image olarak build edilebilmelidir.

### FR-028 — Git tabanlı CI/CD

Git server’daki push/tag işlemiyle test, image build, vulnerability scan ve Docker Hub push akışı çalışmalıdır.

### FR-029 — Docker Hub image’ları

Image’lar version tag, commit SHA ve güvenli bir `latest` stratejisiyle Docker Hub’da yayınlanmalıdır.

### FR-030 — Self-hosted deployment

Son kullanıcı yalnızca Docker Compose veya benzeri deployment manifesti ile server üzerinde sistemi çalıştırabilmelidir.

## 12. Rules ve paylaşım gereksinimleri

### FR-031 — Rule kayıtları

Sistem secret kayıtlarından bağımsız, JSON tabanlı rule kayıtlarını desteklemelidir. Rule’lar workflow, otomasyon, prompt, koşul ve action tanımları içerebilir.

### FR-032 — Secret reference

Rule payload’ları secret değerini gömmemeli; yalnızca secret reference taşımalıdır. Rule çalıştırılırken referenced secret için ayrıca erişim kontrolü yapılmalıdır.

### FR-033 — Rule rolleri

Rule paylaşımı şu izinleri desteklemelidir:

- read
- execute
- edit
- share
- delete
- admin

### FR-034 — Readonly sharing

Secret veya rule sahibi paylaşım sırasında hedef account/bot için readonly izin verebilmelidir. Readonly sahibi kayıtları okuyabilir ancak değiştiremez, silemez veya yeniden paylaşamaz.

### FR-035 — Execute-only sharing

Bir bot rule’ı çalıştırabilirken rule JSON’unu veya referenced secret’ları göremeyecek şekilde execute-only paylaşım yapılabilmelidir.

### FR-036 — Referanslı kaynakların zincirleme kontrolü

Bir rule başka secret veya rule’a referans veriyorsa, rule erişimi ilgili kaynak erişimini otomatik olarak vermemelidir. Her referenced resource ayrıca authorize edilmelidir.

### FR-037 — Scoped secret read

Yetkili botlar secret kayıtlarını field path seçerek okuyabilmelidir. Genel ve filtresiz tüm secret dump operasyonu bulunmamalıdır.

### FR-038 — Model exposure kontrolü

Secret field’larının trusted tool/process’e verilmesi ile model context’ine verilmesi ayrı izinler olmalıdır. `expose_to_model` varsayılan olarak false olmalıdır.

### FR-039 — Share revocation

Secret, rule ve prompt paylaşımları anında revoke edilebilmeli, expiry desteklemeli ve revoke sonrası yeni erişimler reddedilmelidir.

### FR-040 — Prompt kayıtları

Sistem prompt kayıtlarını ayrı resource type olarak saklayabilmelidir. Prompt’lar arbitrary content, variables, tags, status ve optional secret references içerebilmelidir.

### FR-041 — Prompt versioning

Prompt kayıtları version history desteklemeli; draft, published ve archived durumlarına sahip olmalıdır. Bir bot varsayılan olarak yalnızca published prompt versiyonunu kullanabilmelidir.

### FR-042 — Prompt paylaşımı

Prompt’lar account, workspace veya bot bazında paylaşılabilmelidir. Prompt paylaşımı için read, execute, edit, share ve admin rolleri bulunmalıdır.

### FR-043 — Prompt variable policy

Prompt variable’ları tip, required/default değeri ve model/tool exposure politikası taşımalıdır. Hassas variable’lar claim-only veya secret reference olarak tanımlanabilmelidir.

### FR-044 — Unified resource sharing

Secret, rule ve prompt paylaşımı mümkün olduğunca ortak `resource_shares` modeliyle çalışmalıdır. Her resource kendi operasyon ve field/content scope’unu ayrıca tanımlayabilmelidir.

## 13. Agent discovery ve dokümantasyon

### FR-045 — Machine-readable documentation

Container, diğer Hermes agent’ların servisi yalnızca servis adıyla keşfedip kullanabilmesi için makine-okunabilir dokümantasyon sunmalıdır.

Minimum dokümantasyon:

- OpenAPI specification
- MCP tool catalog
- resource type ve schema catalog
- authentication ve account scope açıklaması
- secret/read/share permission modeli
- örnek tool çağrıları
- hata kodları

### FR-046 — Service manifest

Sistem sabit bir manifest endpoint’i sunmalıdır:

```text
/.well-known/secret-manager.json
```

Manifest en az şu bilgileri içermelidir:

- service name
- service version
- API base URL
- OpenAPI URL
- MCP endpoint/capability
- supported resource types
- supported operations
- authentication mode
- documentation URL

### FR-047 — Agent-friendly discovery

Yetkili bir Hermes agent, `secret-manager` veya tanımlı service alias’ı ile service manifest, schema ve kullanım dokümantasyonuna erişebilmelidir.

### FR-048 — Documentation safety

Dokümantasyon secret değerleri, encryption key, internal token veya hassas deployment bilgisi içermemelidir. Example payload’lar yalnızca sahte değer kullanmalıdır.

### FR-049 — Versioned documentation

API, MCP tool ve schema dokümantasyonu versioned olmalıdır. Agent uyumluluğu için capability ve version bilgisi açıkça yayınlanmalıdır.
