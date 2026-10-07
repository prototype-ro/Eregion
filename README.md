# Eregion

A Commander deck builder with real version history. Every save is a full snapshot of the deck, and any two versions can be compared to see which cards moved and how the stats shifted.

- `backend/` Spring Boot 4 (Java 25), PostgreSQL, Flyway, stateless JWT auth
- `frontend/` Next.js 16 (App Router), Tailwind v4
- `docker-compose.yml` local Postgres

## Run it locally

```bash
# 1. Database
docker compose up -d db

# 2. Backend (http://localhost:8080)
cd backend
./mvnw spring-boot:run

# 3. Frontend (http://localhost:3000)
cd frontend
cp ../.env.example .env.local   # only BACKEND_URL is used here
npm install
npm run dev
```

Backend settings come from environment variables, see `.env.example`. The defaults work with the compose database. Set `EREGION_JWT_SECRET` to your own value outside local development.

## Tests

```bash
cd backend && ./mvnw test        # unit tests for stats, diff and card mapping
cd frontend && npm run build     # type check and production build
```

## API in short

| Route | What it does |
|---|---|
| `POST /api/auth/register`, `POST /api/auth/login` | Returns the user and sets the login token in an httpOnly cookie |
| `POST /api/auth/logout` | Expires the cookie |
| `GET /api/me` | Current user |
| `GET /api/cards/search?q=` | Search by name. Looks in our catalog first, then Scryfall for anything missing, and saves what it finds. Needs login. |
| `POST /api/cards/resolve` | Turn pasted card names into catalog cards in bulk (75 per Scryfall request, fuzzy fallback for typos). Powers list import. |
| `GET /api/cards/{id}/printings` | Every English paper printing of a card, newest first, with set, art and price |
| `POST /api/cards/import` | Import cards by exact name from Scryfall |
| `GET /api/decks`, `POST /api/decks` | List decks with their latest version's size, price, commander colors and what keeps it from being a legal Commander deck. Create a deck |
| `GET /api/decks/{id}` | Deck with its latest version and stats |
| `PATCH /api/decks/{id}` | Rename a deck |
| `PATCH /api/decks/{id}/flags` | Pin a deck to the top of the list or archive it. Send only the flag that changes |
| `POST /api/decks/{id}/duplicate` | Copy the latest version into a new private deck |
| `POST /api/decks/{id}/versions` | Save a new full snapshot. Send `fromVersion` (the version the draft started from). Saving from the newest version of a branch extends it. Saving from an older one needs `branchName`, which starts a new branch. |
| `GET /api/decks/{id}/versions[/{n}]` | Version history and one version |
| `GET /api/decks/{id}/timeline` | Every branch with its versions, for the multiverse timeline |
| `PATCH /api/decks/{id}/branches/{branchId}` | Rename a branch |
| `DELETE /api/decks/{id}/branches/{branchId}` | Delete a branch and its versions. Refused for the first branch, a branch others split from, or one holding the public version |
| `GET /api/decks/{id}/branches/{branchId}/merge` | Preview merging a branch into main: the shared version, what main would gain or lose, and cards both lines changed differently (conflicts) |
| `POST /api/decks/{id}/merge` | Merge a branch into main as a new main version that records both parents. Needs a choice (`ours` or `theirs`) for each conflict, and the heads that were previewed. Can delete the branch afterwards |
| `PUT /api/decks/{id}/versions/{n}` | Apply changes: save the cards (and optionally the note) over an existing version instead of adding one. Refused when a later version, merge or branch grew from it |
| `PATCH /api/decks/{id}/versions/{n}`, `DELETE /api/decks/{id}/versions/{n}` | Edit a version's note, or delete a version. History closes up around a deleted version. The public version, the last version of a deck and the only version on main cannot be deleted |
| `GET /api/decks/{id}/branches/status` | For each branch other than main, how many versions it is ahead of and behind main, and the version they last shared |
| `GET /api/decks/{id}/cards/{cardId}/history` | Every version a card appears in, with its board, copies and printing |
| `GET /api/decks/{id}/diff?from=7&to=8` | Added, removed and changed cards plus stat deltas |
| `PUT /api/decks/{id}/visibility` | Publish one saved version of a deck (`public` plus `versionNumber`) or make it private again. Only the chosen version is ever shown to others |
| `GET /api/explore?commander=&q=&limit=&offset=` | Public decks, newest first, optionally only those with a given commander card |
| `GET /api/explore/{id}` | A public deck's published version, read only. Private decks answer 404 |
| `GET /api/custom-printings`, `GET`/`POST /api/cards/{id}/custom-printings` | A player's own card art (proxies). Upload PNG, JPEG or WebP up to 10 MB (500 MB per player) as multipart `file` plus `label`. Private to the owner |
| `GET /api/custom-printings/{id}/image`, `DELETE /api/custom-printings/{id}` | The image (owner, or anyone while it is part of a public deck's published version) and removal |
| `GET /api/collection`, `PUT /api/collection/{cardId}` | Cards you own, and set how many of one card |
| `POST /api/collection/bulk` | Add many cards at once (`mode`: `add` or `replace`). Powers list import on the collection screen. |

Authenticated routes read the `eregion_session` cookie, or an `Authorization: Bearer <token>` header for tools. Errors are RFC 9457 problem details.

### Login security

- The token lives in an httpOnly, SameSite=Lax cookie (Secure when `EREGION_COOKIE_SECURE=true`), so page scripts cannot read it. Nothing about the session is kept in `localStorage`.
- The browser only talks to the Next site. Next forwards `/api/*` to the backend (`BACKEND_URL`), so the cookie is first party and needs no cross-site settings.
- Requests that change data and use the cookie must carry an `Origin` from `EREGION_CORS_ORIGINS`, which stops cross-site forgery. Requests with an Authorization header skip this because a forged request cannot add that header.
- Signing in, signing up and signing out ignore any token, so an expired cookie cannot lock someone out.

## Design notes

- Versions are stored as complete card lists. Diffs and stats are computed on read in `DeckDiffer` and `StatsCalculator`, which are pure functions with unit tests.
- A deck is a multiverse of versions. It starts on a branch called `main`, and any version can be forked into a new branch. Version numbers are shared across the whole deck, so "v7" is never ambiguous. History is never rewritten: editing an old version can only start a new branch (`SavePlanner`, unit tested).
- A card is identified inside a version by card and board together (`commander`, `main`, `maybe`, `considering`). Only commander and main count toward the 100 cards and the stats.
- A deck line can pin a specific printing (art, set and price) and carry free-form tags. Tags drive the "Custom tag" grouping. Prices are Scryfall market prices in USD, refreshed by a background job (`PriceRefreshService`) for stale cards and pinned printings.
- The card catalog is filled on demand from Scryfall by exact name. Card art is placeholder art owned by Wizards of the Coast and the artists.

### Custom art

Custom printings are images a player uploads for a card. A deck line can pin one instead of a Scryfall printing (`customPrintingId`), and the picker shows them in a Custom section above the Scryfall printings. On the Collection page, "Import custom art" takes many files named after their cards (`Sol Ring - foil proxy.png`) and can add the cards to the collection. Images are checked by their first bytes (SVG and HTML are refused), stored in Postgres, and served with `nosniff` and a sandbox CSP. Deleting art leaves saved versions intact: their lines fall back to the card's default printing.

### Versions, branches and merging

- Versions are full snapshots. Their numbers only go up, so a deleted number is never reused.
- Each deck has one main branch. Other branches fork from any version and can be merged back into main.
- A merge is a three way merge from the newest version both lines share. A card only one line changed takes that change. A card both lines changed differently is a conflict that needs a choice. A line is the copies, printing, custom art and tags of a card on a board together.
- A merge version records the branch it brought in as a second parent, so merging the same branch again only brings what changed since.
- A version has at most one child on its branch, so two tabs saving at once cannot fork a line silently: one save wins and the other gets a conflict.

### Running it for real

- `docker compose --profile app up --build` starts the database, the API and the site together. It needs `EREGION_JWT_SECRET` (for example `openssl rand -base64 48`). With `EREGION_ENV=production` the API refuses to start on a placeholder secret and always sets the login cookie as Secure, so put it behind HTTPS.
- `GET /api/health` answers 200 when the API can reach its database, for load balancers and uptime checks.
- Rate limits (sign in per network and per account, sign ups, card searches, list lookups, uploads) are kept in memory per server. Defaults and the settings that change them are in `.env.example`. Behind a proxy, set `EREGION_TRUST_PROXY=true` so limits count real visitors, not the proxy.
- Passwords need 10 characters and may not be a common password, a run of keys, or contain the email name or display name.
- The site sends a Content Security Policy, frame, referrer and permission headers, and HSTS in production.
- CI (`.github/workflows/ci.yml`) runs the backend tests and the frontend type check, tests and build.
- The site forwards `/api` to the API with `src/proxy.ts`, which reads `BACKEND_URL` when the server starts, so one built image can run against any backend. (A rewrite in `next.config` would have fixed the address at build time.)
- Accounts: new accounts must confirm their email before making a deck public. Password reset links last an hour and work once. Changing the password, resetting it or signing out everywhere ends every other session, and deleting an account removes everything it owns. Without `SPRING_MAIL_HOST` the API writes each email, with its link, to its log.

### Card names and Commander legality

- Names are matched ignoring case, accents, ligatures and curly quotes, so `Atraxa, Praetors’ Voice`, `SOL RING` and `Æther Vial` all find their card. `eregion_norm` in the database and `NameNormalizer` in the API do the same folding and must stay in step.
- Each card carries Scryfall's Commander legality (`legal`, `not_legal`, `banned`), refreshed with the daily price refresh. A deck with a banned or not legal card says so.
- The legality rules live twice, in `DeckLegality` (Java, for the decks page) and `legality.ts` (the builder). Both run every case in `shared/legality-cases.json`, so a change to a rule is a change to that file and shows up in both test suites. They cover copy limits ("any number" and "up to seven" cards), partner pairs (partner, partner with, partner variants, friends forever, background, Doctor's companion), colors and size.
