# Going live

One machine running docker compose: Caddy (HTTPS) in front of the site, the API and Postgres. Rate limit counts live
in the database, so more API instances can run behind the proxy later if one is not enough.

Two ways to run it:

- **One machine** runs everything (`docker compose --profile app`). The steps below, from "Before the first deploy".
- **Free hosting**: the site on Vercel's free plan, the API and database on Oracle Cloud's Always Free machine
  (`docker compose --profile api`). Costs nothing; see "Free hosting" at the end.

## Before the first deploy

1. A server with Docker (2 GB of memory is enough to start) and a domain whose DNS points at it. Open ports 80 and
   443 only.
2. A mail provider that speaks SMTP (Postmark, Mailgun, Amazon SES, Resend...). The API will not start in
   production without one: confirming an email and resetting a password depend on it.
3. Fill in who runs the site in `frontend/src/lib/site.ts` (operator name, contact email). The privacy policy and
   terms show a "Draft" warning until you do.
4. A `.env` next to `docker-compose.yml` (never committed):

   ```bash
   EREGION_DOMAIN=eregion.example
   EREGION_PUBLIC_URL=https://eregion.example
   EREGION_JWT_SECRET=...            # openssl rand -base64 48
   EREGION_DB_PASSWORD=...           # openssl rand -base64 24
   SPRING_MAIL_HOST=smtp.example.com
   SPRING_MAIL_PORT=587
   SPRING_MAIL_USERNAME=...
   SPRING_MAIL_PASSWORD=...
   EREGION_MAIL_FROM=Eregion <no-reply@eregion.example>
   EREGION_MODERATION_EMAIL=you@example.com   # every deck report is sent here
   # EREGION_ASSISTANT_ENABLED=true  # art prompt and lore assistant: off at launch, needs a funded
   # EREGION_LLM_API_KEY=...         # DeepSeek key and one real test before turning on
   ```

   The database password is read when the database volume is first created. Set it before the first start, or
   change it inside Postgres as well.

## Deploy

```bash
git pull
docker compose --profile app up -d --build
docker compose ps        # db, backend, frontend and proxy should be "healthy" or "running"
```

On a new database the API fills the card catalog by itself: functional tags after 1 minute, bracket flags after 2,
Scryfall's bulk card file after 3. Searches answer from Scryfall directly until then. Give it about an hour before
announcing, and check `docker compose exec db psql -U eregion -d eregion -c "select * from app_sync_state"`.

After every deploy, try once by hand: sign up, receive the confirmation email, reset the password, import a list,
save two versions, compare them, publish, open the public page signed out.

## Backups

`deploy/backup.sh` writes a compressed dump and keeps 14 days of them. Run it nightly from cron and copy the backup
directory off the machine. The privacy policy promises that deleted data leaves backups within 30 days, so keep no
more than that.

Restore into a scratch database once before launch and time it:

```bash
docker compose exec -T db createdb -U eregion restore_check
docker compose exec -T db pg_restore -U eregion -d restore_check < /var/backups/eregion/eregion-<stamp>.dump
docker compose exec -T db dropdb -U eregion restore_check
```

Flyway has no down migrations: rolling back a release that changed the schema means restoring the dump taken before it.

### Uploaded art

Art lives in the database unless `EREGION_ART_STORE=s3` points it at a private bucket (see `.env.example`). Use the
bucket: art is most of the database today, so moving it makes every dump smaller and faster to restore. After
switching, a job moves the existing art 25 images a minute; `/admin` shows the database shrink as it goes (the dump
shrinks at once, the files on disk after `VACUUM FULL custom_printings`).

The dump no longer holds the art once it is in the bucket, so back the bucket up on its own, somewhere else: turn on
object versioning (or the provider's equivalent) and copy it to a second provider nightly, for example
`rclone sync r2:eregion-art b2:eregion-art-backup`. Expire old object versions after 30 days, as the privacy policy
promises for deleted data. A restored database points at objects by id (`art/<id>`), so a
restore needs the bucket copy from the same night or later.

## Watching it

- An outside uptime check (UptimeRobot, Better Stack...) on `https://<domain>/api/health` and `https://<domain>/`
  every minute, alerting you.
- Disk space on the server: the database holds uploaded art.
- `docker compose logs --since 1h backend` for errors. Each log line is one JSON object with a `requestId`; an error
  a player sees ends with "(reference xxxxxxxx)", the start of that id. Server logs hold email addresses of people who hit errors;
  the privacy policy says logs are kept up to 30 days, so rotate Docker's logs within that.

## Moderation

Reports are emailed to `EREGION_MODERATION_EMAIL` with the deck link. The accounts listed in `EREGION_ADMIN_EMAILS`
see a Moderation link at the top of the site (`/admin`): open reports with Take off Explore and Dismiss, finding an
account by email and disabling it (sign-in refused, sessions ended, public decks made private, nothing deleted), and
deleting a piece of uploaded art for a copyright claim. Every action is logged with who did it. Copyright claims
arrive at the contact address in the footer.

## Free hosting: the site on Vercel, the API on Oracle Cloud

Nothing here costs money. The site gets an address like `eregion.vercel.app`; the API sits on a free Oracle machine
behind its own address that only the site uses. A real domain can be added to Vercel later without changing anything else.

```
visitor -> eregion.vercel.app (Vercel) -> /api/* -> eregion-api.duckdns.org (Caddy on Oracle) -> API -> Postgres
```

### 1. The API machine (Oracle Cloud Always Free)

1. Create an Oracle Cloud account (a card is asked for to check who you are; Always Free resources are not charged).
   Choose the **Brazil East (Sao Paulo)** home region; it cannot be changed later.
2. Create a compute instance: shape **VM.Standard.A1.Flex** (Ampere, ARM), 2 OCPU and 12 GB memory is plenty,
   image **Ubuntu 24.04**. Keep the SSH key it offers. If it says it is out of capacity, try again later or pick
   another availability domain.
3. In the instance's subnet, **Security List**, add ingress rules for TCP ports 80 and 443 from `0.0.0.0/0`.
4. Oracle's Ubuntu image also blocks those ports in its own firewall. On the machine:

   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

5. Install Docker: `curl -fsSL https://get.docker.com | sh`, then `sudo usermod -aG docker ubuntu` and log in again.

Oracle may reclaim an Always Free machine that sits nearly idle for a week. Keep the nightly backup (below) copied
off the machine, so a reclaimed machine can be rebuilt from it.

### 2. A name for the API (DuckDNS, free)

Sign in at duckdns.org, create a subdomain (for example `eregion-api`) and set it to the machine's public IP. Visitors
never see this name; only the site uses it.

### 3. Email (a Gmail account, free)

Create a Gmail account for the site, turn on 2-step verification, then create an **app password**
(Google Account, Security, App passwords). Gmail sends about 500 emails a day, enough to start.

### 4. Start the API

```bash
git clone <your repository> eregion && cd eregion
cp .env.example .env   # then fill in:
```

```bash
EREGION_API_DOMAIN=eregion-api.duckdns.org
EREGION_PROXY_SECRET=...                       # openssl rand -hex 32; the same value goes into Vercel
EREGION_PUBLIC_URL=https://eregion.vercel.app  # the site's address, for links in emails
EREGION_JWT_SECRET=...                         # openssl rand -base64 48
EREGION_DB_PASSWORD=...                        # openssl rand -base64 24
SPRING_MAIL_HOST=smtp.gmail.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=the-site@gmail.com
SPRING_MAIL_PASSWORD=...                       # the app password
EREGION_MAIL_FROM=Eregion <the-site@gmail.com>
EREGION_MODERATION_EMAIL=you@example.com
```

```bash
docker compose --profile api up -d --build
docker compose ps    # db, backend and api-proxy running
curl -s -o /dev/null -w "%{http_code}\n" https://eregion-api.duckdns.org/api/explore   # 404: no secret, as it should be
```

The API refuses every request without the secret, so nobody can skip the site and call it directly.

### 5. The site (Vercel, free)

1. Push the repository to GitHub and import it at vercel.com (the free Hobby plan).
2. **Root Directory**: `frontend`. Vercel finds Next.js by itself; `frontend/vercel.json` runs the server code in
   Sao Paulo, next to the API.
3. **Environment variables**:
   - `BACKEND_URL` = `https://eregion-api.duckdns.org`
   - `EREGION_PROXY_SECRET` = the same value as on the API machine
   - `SITE_URL` = `https://eregion.vercel.app` (the address Vercel gives the project; rename it in the project's
     Domains settings)
4. Deploy, open the site, and run the hand check from "Deploy" above: sign up, the confirmation email, a password
   reset, import a list, save two versions, compare them, publish, open the public page signed out.

Vercel's free plan is for non-commercial use: keep `donateUrl` in `frontend/src/lib/site.ts` empty while on it.
Custom art uploads are capped at 4 MB because Vercel passes on at most 4.5 MB per request.

