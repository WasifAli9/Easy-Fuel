# Contabo deploy (portal.easyfuel.ai)

Single Docker app container (API + SPA) behind Docker Caddy on network `caddy`, using shared Postgres.

## Paths on the server

| Path | Purpose |
|------|---------|
| `/opt/caddy/` | Shared Caddy (`Caddyfile`, `docker-compose.yml`) |
| `/opt/easyfuel/` | App compose + **server-only** `.env` |
| Docker network `caddy` | `caddy`, `postgres`, `easyfuel` |

## One-time server setup

### 1. App directory + env

```bash
mkdir -p /opt/easyfuel
# Copy secrets from your inventory / GoDaddy .env — never commit this file
nano /opt/easyfuel/.env
```

Minimum Contabo values (see also repo [`.env.example`](../.env.example)):

```text
NODE_ENV=production
PORT=5002
HOST=0.0.0.0
TRUST_PROXY=1
DATABASE_URL=postgresql://easyfuel_app:YOUR_PASSWORD@postgres:5432/easyfuel
PUBLIC_APP_URL=https://portal.easyfuel.ai
AUTH_PROVIDER=local
SESSION_SECRET=...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
OBJECT_STORAGE_PROVIDER=local
LOCAL_STORAGE_DIR=/app/storage
PRIVATE_OBJECT_DIR=private
# + Ozow, Resend, VAPID, etc.
```

Place [`docker-compose.yml`](../docker-compose.yml) in `/opt/easyfuel/` (GitHub Actions also SCPs it on each deploy).

### 2. Caddy site block

Edit `/opt/caddy/Caddyfile` carefully (shared config). When the `easyfuel` container exists:

```caddy
portal.easyfuel.ai {
    reverse_proxy easyfuel:5002
}
```

Remove or keep the temporary `:80 { respond ... }` block as you prefer for unmatched hosts.

Reload:

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

DNS A record for `portal.easyfuel.ai` must point at the Contabo public IP (e.g. `169.58.40.94`) for Let's Encrypt.

### 3. GitHub Actions secrets

In the GitHub repo → Settings → Secrets and variables → Actions:

| Secret | Purpose |
|--------|---------|
| `CONTABO_HOST` | Server IP or hostname |
| `CONTABO_USER` | SSH user (often `root`) |
| `CONTABO_SSH_KEY` | Private key for deploy |
| `CONTABO_SSH_PORT` | Optional (default 22) |
| `VITE_MAPBOX_TOKEN` | Baked into SPA at image build |
| `VITE_WS_URL` | Optional (`wss://portal.easyfuel.ai/ws`) |
| `GHCR_PULL_TOKEN` | Optional PAT with `read:packages` if server cannot pull with `GITHUB_TOKEN` |

Push to `main` (or run **Deploy EasyFuel to Contabo** manually) → build → push `ghcr.io/wasifali9/easy-fuel:latest` → SSH → `docker compose up -d`.

### 4. Make GHCR image pullable

If the package is private, create a PAT (`read:packages`) as `GHCR_PULL_TOKEN`, or make the package public under GitHub → Packages.

---

## Data migration (GoDaddy → Contabo)

### Database

1. Maintenance window: stop writes on GoDaddy (or freeze app).
2. Dump:

```bash
pg_dump -Fc -h ... -U ... -d Easyfuel -f easyfuel.dump
```

3. Copy to Contabo (`scp`), then restore into Docker Postgres:

```bash
docker cp easyfuel.dump postgres:/tmp/easyfuel.dump
docker exec -it postgres pg_restore -U creativecloud -d easyfuel --clean --if-exists /tmp/easyfuel.dump
# Or for plain SQL:
# docker exec -i postgres psql -U creativecloud -d easyfuel < easyfuel.sql
```

(Use the admin role that owns the cluster — often `creativecloud` on this host.)

4. Verify row counts: `profiles`, `orders`, `drivers`, `customers`, `suppliers`.
5. Prefer full dump restore over `drizzle-kit push` for production cutover.

### File storage

1. Archive GoDaddy `storage/` (or `LOCAL_STORAGE_DIR`).
2. Copy into the Docker volume used by EasyFuel, e.g.:

```bash
docker run --rm -v easyfuel_easyfuel_storage:/data -v "$(pwd)/storage-backup:/backup" alpine \
  sh -c "cp -a /backup/. /data/"
```

(Volume name may be `easyfuel_easyfuel_storage` from project folder `easyfuel`; check with `docker volume ls`.)

3. Confirm uploads load via `GET /objects/...`.

### Optional Linux backup

```bash
docker exec postgres pg_dump -U easyfuel_app -d easyfuel -Fc -f /tmp/easyfuel.dump
docker cp postgres:/tmp/easyfuel.dump ./backups/easyfuel-$(date +%F).dump
```

---

## Cutover checklist

1. Final DB dump + storage sync from GoDaddy  
2. Restore into Contabo `easyfuel` + volume  
3. `docker logs easyfuel` — listening on 5002, DB OK  
4. `https://portal.easyfuel.ai` — SSL via Caddy  
5. Smoke: login, uploads, `/ws`, payments if staging  
6. Update Ozow webhook/redirect URLs to `https://portal.easyfuel.ai/...`  
7. DNS A → Contabo (TTL lowered beforehand)  
8. Stop GoDaddy app process  
9. Monitor logs 1–2 hours  
10. Mobile: set `EXPO_PUBLIC_API_URL=https://portal.easyfuel.ai` and rebuild if needed  

**Rollback:** keep GoDaddy artifact + last dump; repoint DNS; restore Ozow URLs.

---

## Ops checklist (side-by-side)

### Done / confirm on Contabo

- [x] Docker network `caddy`
- [x] Docker Caddy at `/opt/caddy` (host systemd Caddy disabled)
- [x] Postgres on `caddy`; DB `easyfuel` + user `easyfuel_app`
- [ ] `/opt/easyfuel/.env` filled from inventory
- [ ] Caddyfile site block for `portal.easyfuel.ai` (after first app container)
- [ ] DNS TTL lowered; A record → Contabo when ready
- [ ] GitHub Actions secrets set
- [ ] Ozow / Resend / Mapbox cutover notes ready
- [ ] Mobile API URL update planned

### Constraints

- App compose: **no** `ports:` — only Caddy publishes 80/443  
- App DB host: **`postgres`**; GUI: **`localhost` + SSH tunnel**  
- Never commit `.env`  
- One app replica (in-process timers)  
- Persist `/app/storage` volume  

### Validation

- Web login / roles / APIs  
- Uploads + `/objects/...`  
- Chat + WebSocket  
- Ozow webhooks on new host  
- Resend email  
