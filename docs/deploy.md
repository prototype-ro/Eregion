# Going live

One machine running docker compose: Caddy (HTTPS) in front of the site, the API and Postgres. Rate limit counts live
in the database, so more API instances can run behind the proxy later if one is not enough.

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
