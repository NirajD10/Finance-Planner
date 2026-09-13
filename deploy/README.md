# Deploy

## One-time manual setup (human only — not automatable)

### 1. Oracle Cloud account + VM

- [ ] Sign up at cloud.oracle.com with a mobile number and card (small auth hold, refunded).
      If the first Indian card fails verification, try a different card.
- [ ] Set home region to **Mumbai** — this is permanent for the tenancy, don't rush it.
- [ ] Create one `VM.Standard.A1.Flex` instance: 2 OCPU / 12 GB, Ubuntu 24.04 minimal, in Mumbai.
      If you hit "Out of host capacity," retry across availability domains, or fall back to
      an AMD micro instance (1/8 OCPU, 1 GB) — enough for this single-user app.
- [ ] In the VM's security list, open only ports 22, 80, 443. Restrict 22 to your IP if possible.
- [ ] On the VM: disable password SSH auth, key-based only.
- [ ] On the VM: `ufw allow 22,80,443/tcp && ufw enable`, confirm nothing else is open.

### 2. DuckDNS subdomain

- [ ] Register a free subdomain at duckdns.org (e.g. `yourname.duckdns.org`).
- [ ] Point it at the VM's public IP.
- [ ] Install DuckDNS's provided cron script on the VM so it stays pointed at the IP if it changes.

### 3. Docker on the VM

- [ ] SSH into the VM.
- [ ] Install Docker Engine + the Docker Compose plugin.
- [ ] `docker --version && docker compose version` to confirm.

### 4. First deploy

- [ ] Clone this repo onto the VM: `git clone <repo-url> && cd Finance-Planner/deploy`
- [ ] `cp .env.example .env` and fill in a real `POSTGRES_PASSWORD`; set
      `SITE_ADDRESS=yourname.duckdns.org` and `WEB_ORIGIN=https://yourname.duckdns.org`.
- [ ] In `docker-compose.yml`, change the `caddy` service's port mapping from
      `"8080:80"` to `"80:80"` and add `"443:443"`.
- [ ] `docker compose up -d --build`
- [ ] Confirm from outside: `curl -i https://yourname.duckdns.org/api/health`

## Every deploy after that

```bash
git pull
cd deploy
docker compose up -d --build
```

That's the entire deploy process.

## Manual follow-up checks (against the real domain, not localhost)

- [ ] `nmap yourname.duckdns.org` — confirm only 22, 80, 443 respond.
- [ ] `curl -I https://yourname.duckdns.org/` — confirm HSTS and the security headers are present.
- [ ] Log into the Oracle Cloud console occasionally even once the app is running unattended —
      Always Free tenancies have a documented history of being reclaimed for inactivity, and a
      console login is what resets that clock.

## Local development (this is what's verified in this repo checkout)

```bash
cd deploy
cp .env.example .env   # fill in POSTGRES_PASSWORD; defaults are fine otherwise
docker compose up -d --build
curl -i http://localhost:8080/api/health
```

`SITE_ADDRESS` defaults to `:80` (any host, port 80) so Caddy answers regardless of
the `Host` header — needed because local clients reach it as `localhost`, the Android
emulator reaches it as `10.0.2.2`, and a physical device would reach it via a LAN IP.
No TLS is attempted for a portless/hostless address. Swapping to the real domain later
(`SITE_ADDRESS=yourname.duckdns.org`) is a one-line env change, and Caddy will then
correctly restrict to that host and auto-provision a real certificate.
