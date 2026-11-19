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
| `POST /api/import/url` | Reads a deck from a link (Archidekt, Scryfall, TappedOut, MTGGoldfish) and returns it as a list for the normal list import. Moxfield is explained, not fetched, because it blocks other sites. The server only fetches fixed templates for those hosts, with the deck id filled in, never a redirect |
| `POST /api/analysis` | Analyses a draft or saved deck from its card ids, boards and counts: Commander bracket (rules floor and speed estimate), consistency chances, colour pips and sources, combos from Commander Spellbook, simulated setup speed, and what the deck is built around. Works on unsaved edits. 30 a minute per player |
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

- `docker compose --profile app up --build` starts the database, the API, the site and Caddy (HTTPS) together. The step by step for a real server, backups and monitoring is in [docs/deploy.md](docs/deploy.md). The API refuses to start in production on a placeholder `EREGION_JWT_SECRET` or without a mail server, and always sets the login cookie as Secure.
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

### Export and import

- Export (builder and public deck pages): plain list, with sets (Moxfield, Archidekt), MTG Arena, MTG Online and CSV, as text to copy or a file to download. What is exported can be imported again.
- Import takes a pasted list, a file, or a link. Importing into a deck keeps the art already chosen for each card, a printing or your custom art, for cards that were in the deck before.
- In a quick test the deck sites other than Archidekt answered 403 to automated requests, so for them the import explains that and asks for the text export. Archidekt works.

### Public sharing

- Public decks (`/explore` and `/explore/{id}`) and the art in them can be read without an account. A visitor who is not signed in can browse, export and copy the link, and is asked to sign in only to copy a deck to their own. A bad or expired login on those pages is ignored instead of refused. Writes still need a valid login.
- Shared links have a preview (title, owner, description, commander art) so chat apps and search engines show the deck.
- Public reads are limited per network (`EREGION_RATE_PUBLIC`, default 240 a minute).
- A deck can have a description (up to 2000 characters, shown on its public page). Saving it does not make a version.
- Signed in players can report a public deck (`POST /api/explore/{id}/report`, one per player per deck, 10 an hour). Reports are stored in `deck_reports` for whoever runs the site to review. There is no moderation screen yet.

### Drafts and sessions

- Unsaved edits in the builder are kept on the device (per deck and version) a moment after each change. After a refresh, a crash or a sign in, the builder offers to restore them or discard them. Saving, applying or discarding clears the kept draft, and signing out clears all of them.
- When a save fails because the session ended, the message says so, the edits are kept, and a link goes to sign in and back to the deck.

### Deck analysis

- The calculators live in `backend/.../analysis` as pure functions with unit tests, like `StatsCalculator`. `AnalysisService` loads the cards and flags and runs them.
- The bracket has two layers kept apart on purpose. The **floor** is exact rules from Wizards of the Coast's brackets (Game Changers, mass land denial, chained extra turns, two-card combos). The **estimate** is a weighted speed score whose weights are reasoned guesses, not fitted to labelled decks, so it is a second opinion. The shown bracket is the higher of the two. Bracket 1 is about intent and is never estimated.
- Game Changers and extra turn cards are read from Scryfall once a day (`BracketFlagSyncService`, table `bracket_flag_names`), so a new Game Changers list needs no release. Mass land denial and fast mana are curated in `bracket-lists.json`: the mass land denial list is an approximation, check it against the current Wizards article.
- What a deck is built around comes from the patterns, roles and types in `deck-themes.json`. Edit the file and restart. A close top two is reported as a close call, and a deck with no theme above the floor is called Goodstuff.
- Combos come from Commander Spellbook's public API, cached per exact card list for six hours. If it is down the combo block says so and the bracket notes that combos were not counted. `eregion.spellbook.enabled=false` turns it off.
- Chances assume the player is on the play, draws from the main board, and counts a Ramp card of mana value 2 or less as cheap ramp. Public deck pages show the analysis only to signed in players, since the endpoint needs a login.
- Setup speed (`GoldfishSimulator`) plays the main board alone 800 times, seeded from the deck so the numbers are stable: mana left per turn, the turn the commander can be cast, and the chance a game-ending combo can be executed by turns 4, 6, 8 and 10 (tutors fetch missing pieces). Spells need the colours of their cost, so a deck whose lands do not make its ramp's colour casts it late, and lands that enter tapped (or tapped unless a condition holds) give their mana a turn later. Only a combo that ends the game by itself counts (a win, a drain, infinite damage or combat or mill): an infinite mana, draw or enter-the-battlefield loop needs a payoff, so it sets the bracket floor like any two-card infinite combo but adds only a fraction to the speed score. It ignores commander tax, opponents, disruption and every spell that is not mana, land fetching or a tutor, and it has no power or toughness to work with, so it measures how fast a deck gets going and not how fast it wins. It feeds two parts of the bracket's speed score ("Fast start" and "Combo by turn 6"). A trained win-turn model is not built: it needs decks labelled with their true bracket.
- Estimated win turn (`WinTurnEstimator`) puts the bracket's speed score on the turn ranges of the five brackets (10+, 8 to 10, 6 to 8, 4 to 6, under 4) in a straight line between fixed points, and takes the simulator's average combo turn (a game that never gets there counts as turn 12, so a combo deck that sometimes stumbles lands later than on a typical good game) when that is quicker. It is a reading of signals and simulated setup, not a model trained on played games.
- Deck health (`DeckHealthCalculator`) scores lands, ramp, keepable hands and colour access (Mana), removal, wipes and protection (Interaction), and card draw, recursion and plan focus (Engine). A measure inside its range scores 100 and falls off in a straight line outside it. The ranges are common rules of thumb, not measured from decks of the same commander, and the counts use each card's main role, so untagged cards show low counts.
- Archenemy level (`ArchenemyCalculator`) adds points for patterns known for annoying a table (mill, theft, hand attack, group drain, taxes and locks, land denial, repeated wipes, extra turns, fast mana, tutors, game-ending combos), each capped, onto a ten step scale from Chill to Archenemy.
- Tutors and combos only speed a deck up when a game-ending combo tends to be ready, so the bracket's speed score counts them in full when the simulator gets one ready by turn 8 in half the games or more, and down to a floor (75% for tutors, 60% for combos) when it never does. The floors were set against one deck with a known reference turn, so they are a starting point. A tutor is a spell: lands that Scryfall tags as tutors, such as fetch lands, are not counted. When combo data is unavailable nothing is discounted. Combo lookups use HTTP/1.1 and retry once, because an idle connection reset by the server would otherwise mark combos unavailable for a minute.
- The estimated win turn is never earlier than the turn the commander can be cast plus 0.4 of a turn, unless a game-ending combo is ready by turn 8 in half the games or more, or the deck is a reanimator plan (8 or more spells that put creatures into play from a graveyard), since neither needs the commander. Reanimation spells beyond 5 add 0.15 points each to the speed score, up to 1.5.
- Reference decks: `docs/analysis-references.json` lists saved deck versions with the turn commanderbracket.app showed for them and the turn this engine gave when it was accepted. `node backend/scripts/reference-check.mjs [apiUrl]` runs them through a running API and fails when an estimate moves more than 0.05 from its pin, so a change that fixes one deck cannot quietly move another. Move a pin only on purpose, in the same commit as the change.
- Calibration status: the speed score's weights are reasoned guesses, and two settings (a Game Changer is worth 1.2 points, and the tutor and combo floors) were set so two decks with a known reference turn (Sauron 6.4, Kaalia 6.6 on commanderbracket.app) land on them. Two points fix two settings and leave nothing to check against, so treat the estimated win turn as accurate to about half a turn at best until more reference decks are available.
- A two-card combo sets a bracket floor only when Commander Spellbook rates it at its top power tier (tag R): the strongest combos are what decide a bracket, while a two-card loop that needs setup or only makes resources (tags S, O and below) is counted in the signals but moves nothing. A combo with no rating keeps the plain rule (castable early is bracket 4, later is bracket 3), so a missing tier never lowers a bracket.
- Tutors are weighted by how freely they find a card: any card 1.0, a whole card type 0.7, anything narrower 0.4, and the speed score adds 0.6 per unit of weight. The "open" count shown is the tutors that find any card.
- Owner brackets: `node backend/scripts/archidekt-compare.mjs [apiUrl] --bracket 3 --count 10` takes the most viewed public Commander decks Archidekt's owners tagged with a bracket (one search and one request per deck), imports their cards through the API, and reports how often our bracket and estimated win turn agree with the owner's tag. The baseline for bracket 3 is in `docs/reference-decks/archidekt-bracket-3.json`. Owner tags are noisy labels, so read the pattern, not each row. Run it after the tag sync, since new cards have no roles until then. It does not use commanderbracket.app: its terms forbid collecting its output by script.
- `archidekt-compare.mjs --export <dir>` writes the decks as paste-ready text lists plus an empty `other-site.csv`; typing the turn and bracket another site shows into that file and passing it as `--other-site` prints the gap next to ours. This is for checking a few decks by hand.
- Calibration of the estimated win turn: after the score map, combo and commander steps, the turn is pulled toward 6.5 (`6.5 + 0.6 * (turn - 6.5)`, and left on its own scale below 5.0 where there is no data). Nine decks with a turn from commanderbracket.app, entered by hand, correlated 0.96 with ours but ran wider (ours 5.0 to 9.8, theirs 6.0 to 8.6); the pull cut the mean gap from 0.81 to 0.30 turns and left the four earlier reference decks exactly where they were. `docs/analysis-references.json` holds all of them with their pins.
