# Production deploy — Ubuntu 24.04 + Docker + Let's Encrypt

Single-host deploy of the full stack (Postgres, Redis, API, Bot, Web, Nginx)
behind nginx with HTTPS terminated via Let's Encrypt.

Target: `unithack.play2go.cloud` → `2.26.103.150` (Ubuntu 24.04).

## 0. Prerequisites (do this once)

1. DNS A-record `unithack.play2go.cloud → 2.26.103.150` is created and propagated:
   ```bash
   dig +short unithack.play2go.cloud
   # → 2.26.103.150
   ```
   Wait until this returns the right IP before running certbot — otherwise the
   HTTP-01 challenge will fail.
2. SSH access to the server with a sudo-capable user.
3. Inbound ports 22, 80, 443 open in cloud-provider firewall (if any).

## 1. Prepare the server

```bash
ssh <user>@2.26.103.150

# Docker + git + ufw
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git ufw openssl

# Run docker without sudo
sudo usermod -aG docker $USER
newgrp docker   # or log out + back in

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Clone repo
sudo mkdir -p /opt/unithack && sudo chown $USER /opt/unithack
git clone https://github.com/ecl1pseeee-boop/smart-kanban.git /opt/unithack
cd /opt/unithack
```

## 2. Write production `.env`

The compose files read variables from `/opt/unithack/.env`. Generate strong
secrets in-place — never commit this file:

```bash
cd /opt/unithack
cat > .env <<EOF
# ── Database ──────────────────────────────────────────
POSTGRES_USER=kanban_user
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=smart_kanban

# ── Redis ─────────────────────────────────────────────
REDIS_PASSWORD=$(openssl rand -hex 24)

# ── JWT ───────────────────────────────────────────────
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# ── API ───────────────────────────────────────────────
PORT=3001
NODE_ENV=production
CORS_ORIGINS=https://unithack.play2go.cloud

# ── AI (optional — falls back to heuristics if empty) ─
ANTHROPIC_API_KEY=

# ── Telegram ──────────────────────────────────────────
TELEGRAM_BOT_TOKEN=
BOT_SECRET=$(openssl rand -hex 24)

# ── Public URLs ───────────────────────────────────────
WEB_URL=https://unithack.play2go.cloud

# Empty: web container serves SPA from same origin via its internal nginx,
# which proxies /api and /socket.io to api:3001. Browsers only need port 443.
VITE_API_URL=
VITE_WS_URL=
API_URL=
WS_URL=
EOF

chmod 600 .env
nano .env   # paste TELEGRAM_BOT_TOKEN (a fresh one from BotFather) and ANTHROPIC_API_KEY
```

> ⚠️ If the token you used in development was ever shared in chat / commits /
> screenshots — revoke it in BotFather (`/mybots` → `API Token` → `Revoke`)
> and use the fresh token here.

## 3. First-time TLS bootstrap

Nginx config references `/etc/letsencrypt/live/unithack.play2go.cloud/{fullchain,privkey}.pem`.
On a fresh server those files don't exist, so we generate a dummy self-signed
cert first, start the stack, then run certbot which overwrites the dummy with
a real Let's Encrypt cert.

```bash
DOMAIN=unithack.play2go.cloud
EMAIL=fedulov.06@mail.ru
# Shorthand for the rest of the doc
dcp() { docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"; }

# 1) Dummy cert so nginx can start with HTTPS
dcp run --rm --entrypoint sh certbot -c "
  mkdir -p /etc/letsencrypt/live/$DOMAIN &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj /CN=$DOMAIN
"

# 2) Build & start everything
dcp up -d --build

# 3) Wait for nginx, then request the real cert (webroot HTTP-01)
sleep 10
dcp run --rm certbot certonly --webroot -w /var/www/certbot \
  -d $DOMAIN --email $EMAIL --agree-tos --no-eff-email --force-renewal

# 4) Reload nginx to pick up the real cert
dcp exec nginx nginx -s reload
```

After step 4 — https://unithack.play2go.cloud should serve a valid cert.

## 4. Database migrations + seed

API container does **not** auto-run migrations. Run them once:

```bash
dcp exec api pnpm db:migrate
dcp exec api pnpm db:seed     # optional — creates demo users + board
```

Demo users (after seed) — see `README.md` "Demo users" table.

## 5. Smoke verification

```bash
# Health
curl -sf https://unithack.play2go.cloud/health | jq
# → {"status":"ok","db":"ok","redis":"ok","uptime":...}

# SPA loads
curl -sI https://unithack.play2go.cloud/ | head -1
# → HTTP/2 200

# Bot is in real mode, not stub
dcp logs bot --tail 30
# Look for: "Smart Kanban bot started (long-polling)"
# If you see "running in STUB mode" — TELEGRAM_BOT_TOKEN is empty/invalid in .env.

# Telegram API surface (server-side, doesn't need real bot)
dcp exec api node scripts/telegram-smoke.mjs
```

In Telegram: open your bot, send `/start` — should reply with link instructions.
To fully test linking: log in to the web SPA, generate a code via the API
(`POST /api/telegram/link/generate` with Bearer token — see README "Привязка
аккаунта"), and send `/start <CODE>` to the bot.

## 6. Cert auto-renewal (cron)

Let's Encrypt certs are valid 90 days. Add to host crontab (root or sudoer):

```bash
sudo crontab -e
# Add:
0 3 * * 1 cd /opt/unithack && docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot renew --quiet && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload
```

Runs weekly at 03:00 Mon. `certbot renew` is a no-op until 30 days before expiry.

## 7. Update / redeploy

```bash
cd /opt/unithack
git pull
dcp up -d --build
dcp exec api pnpm db:migrate   # only if prisma/migrations changed
```

For a single service: `dcp up -d --build api` (or `bot`, `web`).

## 8. Operations cheatsheet

| Task | Command |
|---|---|
| Status | `dcp ps` |
| Logs (live) | `dcp logs -f api bot` |
| Restart service | `dcp restart bot` |
| Shell in container | `dcp exec api sh` |
| DB shell | `dcp exec postgres psql -U kanban_user -d smart_kanban` |
| Stop everything | `dcp down` |
| Wipe DB (⚠ destructive) | `dcp down -v` |

## Troubleshooting

- **`502 Bad Gateway`** — `dcp logs api` (or `web`/`bot`). Common: bad
  `DATABASE_URL`, missed `db:migrate`, or API crashed at boot — check the
  first 50 lines of `dcp logs api`.
- **Bot logs `running in STUB mode`** — `TELEGRAM_BOT_TOKEN` empty/whitespace
  in `.env`. Edit, then `dcp up -d bot`.
- **Bot logs `BOT_SECRET is not set`** — same, but for `BOT_SECRET`. Must be
  identical for `api` and `bot` (compose feeds both from the same `.env`).
- **Certbot fails: "Connection refused" / "Invalid response"** — nginx not on
  port 80, firewall blocks 80, or DNS not propagated. Check `dig`, `sudo ufw
  status`, `dcp ps`.
- **Certbot says "too many requests"** — Let's Encrypt rate limit (5
  certs/week per domain). Wait or use `--staging` for testing.
- **`/api/telegram/*` returns 403** — `BOT_SECRET` mismatch. Re-check the
  value isn't accidentally quoted or has trailing whitespace.
- **HTTPS shows a self-signed warning** — you stopped at step 3.1 and didn't
  run 3.3/3.4. Run certbot, then `nginx -s reload`.
