# Security Strategy — JT808 Fleet Platform

> Applies to: `jt808-control` (8080), `jt808-server` (8888), `jt808-rtvs` (8089),
> ClickHouse (8123/9000), JT808 signalling (7611/7612), JT1078 media ingest (1078).

---

## 1. Threat Model

### Assets

| Asset | Sensitivity | Impact if compromised |
|---|---|---|
| Vehicle GPS tracks | High | Driver surveillance, route disclosure |
| Alarm media (JPEG/WMV clips) | High | Privacy violation, evidence tampering |
| JT808 terminal connections | Critical | Fake GPS injection, command spoofing |
| ClickHouse data | High | Mass data exfiltration |
| Service orchestrator (8080) | Critical | Full stack shutdown, data loss |
| RTVS live streams | High | Wiretapping of driver cabin |
| JT808 auth-code | Medium | Rogue terminal registration |

### Threat Actors

- **External attacker** reaching the server over the internet
- **Rogue terminal** sending crafted JT808 packets
- **Insider / compromised operator** abusing the control panel
- **Lateral movement** from a compromised device on the same LAN

### Current Posture (pre-hardening)

All REST APIs and the JT808 signalling port are unauthenticated.
Services bind to `0.0.0.0` by default.
This is acceptable on an isolated development LAN; it is **not acceptable** for
any network reachable from the internet or from untrusted devices.

---

## 2. Network Architecture

### Development / single-host (current)

```
     Developer browser
           │
    localhost:8080  ← jt808-control (UI + orchestrator)
    localhost:8888  ← jt808-server  (JT808 + REST API)
    localhost:8089  ← jt808-rtvs    (media server)
    localhost:8123  ← ClickHouse    (database)
    localhost:7611  ← JT808 signalling
    localhost:1078  ← JT1078 media ingest
```

All services on loopback — no external exposure. Acceptable for dev only.

---

### Production (target)

```
Internet / vehicle 4G
        │
        ▼
  ┌─────────────────────────────────┐
  │         Nginx (TLS termination) │  ← single public IP
  │  443 / 80 (redirect to 443)     │
  └─────────┬──────────┬────────────┘
            │          │
     /       │          │  /api, /media, /rtvs
  (React)    │          │
             ▼          ▼
    ┌──────────────┐  ┌─────────────────┐
    │ jt808-control│  │  jt808-server   │
    │ :8080        │  │  :8888          │
    │ (loopback)   │  │  (loopback)     │
    └──────────────┘  └────────┬────────┘
                               │
                      ┌────────▼────────┐
                      │  ClickHouse     │
                      │  :8123/:9000    │
                      │  (loopback)     │
                      └─────────────────┘

Separate firewall zone for JT808 / JT1078 (vehicle-facing):
  public:7611  → jt808-server:7611   (JT808 alarm channel)
  public:7612  → jt808-server:7612   (JT808 file channel)
  public:1078  → jt808-rtvs:1078     (JT1078 media ingest)
```

**Key principle:** HTTP management ports (8080, 8888, 8089, 8123) are never
directly reachable from the internet or from vehicle SIM networks.
Only 443 (HTTPS via Nginx) and the JT808/JT1078 ports are exposed.

---

## 3. Nginx Configuration

### TLS

```nginx
server {
    listen 443 ssl http2;
    server_name fleet.example.com;

    ssl_certificate     /etc/letsencrypt/live/fleet.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fleet.example.com/privkey.pem;

    # Modern TLS only
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:
                ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;

    # HSTS — enable only after confirming HTTPS works
    # add_header Strict-Transport-Security "max-age=63072000" always;

    # ── React SPA + control API ─────────────────────────────────────────
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE — disable buffering so events reach the browser immediately
    location /api/clips/events {
        proxy_pass http://127.0.0.1:8080;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_set_header Connection '';
        chunked_transfer_encoding on;
    }

    # ── Media files (alarm clips served by jt808-server) ───────────────
    location /media/ {
        proxy_pass http://127.0.0.1:8888;
        proxy_set_header Host $host;
        # Limit response size — alarm clips are small stubs
        proxy_max_temp_file_size 0;
    }

    # ── RTVS studio (embedded in Media page) ───────────────────────────
    location /rtvs/ {
        proxy_pass http://127.0.0.1:8089/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 80;
    server_name fleet.example.com;
    return 301 https://$host$request_uri;
}
```

### Rate limiting

Add to the `http {}` block:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=sse:10m rate=5r/m;

# Apply in server block:
location /api/ {
    limit_req zone=api burst=60 nodelay;
    ...
}
location /api/clips/events {
    limit_req zone=sse burst=3 nodelay;
    ...
}
```

---

## 4. Authentication

### Current state

No authentication exists on any HTTP endpoint. This must be added before
external exposure.

### Recommended approach — API key (pragmatic, stateless)

Suitable for an operator-facing internal tool where a single shared secret
is acceptable.

**Step 1 — add a filter to `jt808-control`:**

```java
@Component
@Order(1)
public class ApiKeyFilter implements jakarta.servlet.Filter {
    @Value("${security.api-key}")
    private String expectedKey;

    @Override
    public void doFilter(ServletRequest req, ServletResponse res,
                         FilterChain chain) throws IOException, ServletException {
        HttpServletRequest  request  = (HttpServletRequest)  req;
        HttpServletResponse response = (HttpServletResponse) res;

        // Static assets don't need auth
        String path = request.getRequestURI();
        if (path.equals("/") || path.startsWith("/assets/") || path.startsWith("/static/")) {
            chain.doFilter(req, res); return;
        }

        String key = request.getHeader("X-Api-Key");
        if (key == null || !MessageDigest.isEqual(
                key.getBytes(StandardCharsets.UTF_8),
                expectedKey.getBytes(StandardCharsets.UTF_8))) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("{\"error\":\"unauthorized\"}");
            return;
        }
        chain.doFilter(req, res);
    }
}
```

**Step 2 — generate a strong key and add to `application.yml`:**

```bash
openssl rand -hex 32
```

```yaml
security:
  api-key: "${API_KEY}"   # set via environment variable — never commit the value
```

**Step 3 — React UI sends the key on every request:**

```typescript
// src/api/client.ts
const client = axios.create({
  baseURL: '/api',
  headers: { 'X-Api-Key': import.meta.env.VITE_API_KEY },
})
```

Add `VITE_API_KEY=<value>` to `.env.local` (already gitignored).

### Longer-term — JWT / OIDC

For multi-user or role-based access (dispatcher vs. read-only analyst),
replace the API key filter with Spring Security + JWT or integrate an
OIDC provider (Keycloak, Auth0, Google Workspace).

---

## 5. JT808 Terminal Authentication

The `auth-code` in `jt808-server/application.yml` is the shared secret
that terminals send in the `0x0102` authentication message.

**Before production:**
1. Change `auth-code` from `server-token` to a random value:
   ```bash
   openssl rand -hex 16
   ```
2. Set the same value in each terminal's configuration.
3. Store it as an environment variable, not in the committed yml:
   ```yaml
   jt808-server:
     jt808:
       auth-code: "${JT808_AUTH_CODE}"
   ```

**Limitation:** JT808-2013 uses a single shared auth-code — all terminals
share the same secret. JT808-2019 adds per-terminal RSA authentication.
Upgrading to 2019 auth is the correct long-term fix for high-security deployments.

---

## 6. ClickHouse Hardening

ClickHouse by default accepts connections without a password on `default` user.

**Minimum steps:**

```xml
<!-- Add to clickhouse config or users.xml -->
<users>
  <jt808>
    <password_sha256_hex><!-- sha256 of your password --></password_sha256_hex>
    <networks>
      <ip>127.0.0.1</ip>   <!-- loopback only -->
    </networks>
    <profile>default</profile>
    <quota>default</quota>
    <databases>
      <jt808/>
    </databases>
  </jt808>

  <!-- Disable the default passwordless user -->
  <default>
    <password><!-- strong password or remove --></password>
    <networks>
      <ip>127.0.0.1</ip>
    </networks>
  </default>
</users>
```

Update the JDBC URL in `jt808-server/application.yml`:
```yaml
spring:
  datasource:
    url: jdbc:clickhouse://127.0.0.1:8123/jt808
    username: jt808
    password: "${CH_PASSWORD}"
```

---

## 7. Mapbox Token

The Mapbox public token (`pk.*`) is injected into the React UI at runtime
through `/api/config`, so it is no longer baked into the static bundle.
This is the intended Mapbox model for browser tokens, but **it must be
domain-restricted** so it cannot be used from other origins.

**Steps:**
1. Log in to [account.mapbox.com](https://account.mapbox.com)
2. Edit the token → add **Allowed URLs**: `https://fleet.example.com`
3. Optionally create a separate token per environment (dev, staging, prod)

Without domain restriction, anyone who reads the bundle source can use
your token against your Mapbox quota.

---

## 8. Secrets Management Summary

| Secret | Current | Production |
|---|---|---|
| Mapbox token | `.env.local` (gitignored) | Same — but domain-restrict in Mapbox console |
| JT808 auth-code | `application.yml` plain text | Env var `JT808_AUTH_CODE` |
| API key | Not yet implemented | Env var `API_KEY` |
| ClickHouse password | No password set | Env var `CH_PASSWORD` |
| TLS private key | N/A (dev) | Managed by certbot / Vault |

**Rule:** No secret value is ever committed to git. All secrets use
`"${ENV_VAR}"` syntax in yml and are injected at runtime via environment
variables or a secrets manager (HashiCorp Vault, AWS Secrets Manager, etc.).

---

## 9. Firewall Rules (iptables / ufw)

```bash
# Allow HTTPS and JT808/JT1078 only from the internet
ufw allow 443/tcp
ufw allow 7611/tcp   # JT808 alarm channel
ufw allow 7612/tcp   # JT808 file channel
ufw allow 1078/tcp   # JT1078 media ingest

# Block all management ports from non-loopback interfaces
ufw deny 8080/tcp    # jt808-control
ufw deny 8888/tcp    # jt808-server
ufw deny 8089/tcp    # jt808-rtvs
ufw deny 8123/tcp    # ClickHouse HTTP
ufw deny 9000/tcp    # ClickHouse native

ufw enable
```

If the application server and database server are separate hosts, open
ClickHouse only to the application server's private IP:

```bash
ufw allow from 10.0.0.5 to any port 8123
```

---

## 10. Known Remaining Items

The following are tracked but not yet implemented. They are acceptable
for an internal fleet network; each must be resolved before internet exposure.

| # | Item | Risk | Work required |
|---|---|---|---|
| 1 | No HTTP authentication | Critical | API key filter (§4) |
| 2 | JT808 auth-code is default | High | Rotate to env var (§5) |
| 3 | ClickHouse no password | High | Add user + password (§6) |
| 4 | No HTTPS | High | Nginx TLS (§3) |
| 5 | Mapbox token unrestricted | Medium | Domain-restrict in console (§7) |
| 6 | SSE no connection limit | Medium | Nginx rate limit (§3) or semaphore in code |
| 7 | No audit log | Medium | Log all state-changing API calls |
| 8 | JT808 per-terminal auth | Low (LAN) | Upgrade to JT808-2019 auth |
| 9 | No CSRF protection | Low (no cookies) | Relevant after session-based auth |

---

## 11. Deployment Checklist

Before going live on any network reachable from the internet or from
vehicle SIM cards:

- [ ] All management ports (8080, 8888, 8089, 8123, 9000) firewalled to loopback
- [ ] Nginx TLS configured with a valid certificate
- [ ] API key authentication implemented and tested
- [ ] `JT808_AUTH_CODE` set to a random value in all terminal configs
- [ ] ClickHouse `jt808` user created with password; `default` user restricted
- [ ] All secrets in environment variables — none committed to git
- [ ] Mapbox token domain-restricted
- [ ] Nginx rate limiting applied to `/api/` and SSE endpoints
- [ ] `jt808-server` `media-host` bound to loopback (`127.0.0.1`), not `0.0.0.0`
- [ ] Log retention policy set for `clickhouse-logs/` and `jt808-control/logs/`
- [ ] Confirm `media/clips/` directory is not under the web root of Nginx
