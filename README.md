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
cp ../.env.example .env.local   # only NEXT_PUBLIC_API_URL is used here
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
| `POST /api/auth/register`, `POST /api/auth/login` | Returns `{ token, user }` |
| `GET /api/me` | Current user |
| `GET /api/cards/search?q=` | Search by name. Looks in our catalog first, then Scryfall for anything missing, and saves what it finds. Needs login. |
| `POST /api/cards/resolve` | Turn pasted card names into catalog cards in bulk (75 per Scryfall request, fuzzy fallback for typos). Powers list import. |
| `GET /api/cards/{id}/printings` | Every English paper printing of a card, newest first, with set, art and price |
| `POST /api/cards/import` | Import cards by exact name from Scryfall |
| `GET /api/decks`, `POST /api/decks` | List and create decks |
| `GET /api/decks/{id}` | Deck with its latest version and stats |
| `POST /api/decks/{id}/versions` | Save a new full snapshot. Send `fromVersion` (the version the draft started from). Saving from the newest version of a branch extends it. Saving from an older one needs `branchName`, which starts a new branch. |
| `GET /api/decks/{id}/versions[/{n}]` | Version history and one version |
| `GET /api/decks/{id}/timeline` | Every branch with its versions, for the multiverse timeline |
| `GET /api/decks/{id}/diff?from=7&to=8` | Added, removed and changed cards plus stat deltas |
| `GET /api/collection`, `PUT /api/collection/{cardId}` | Cards you own, and set how many of one card |
| `POST /api/collection/bulk` | Add many cards at once (`mode`: `add` or `replace`). Powers list import on the collection screen. |

Authenticated routes take `Authorization: Bearer <token>`. Errors are RFC 9457 problem details.

## Design notes

- Versions are stored as complete card lists. Diffs and stats are computed on read in `DeckDiffer` and `StatsCalculator`, which are pure functions with unit tests.
- A deck is a multiverse of versions. It starts on a branch called `main`, and any version can be forked into a new branch. Version numbers are shared across the whole deck, so "v7" is never ambiguous. History is never rewritten: editing an old version can only start a new branch (`SavePlanner`, unit tested).
- A card is identified inside a version by card and board together (`commander`, `main`, `maybe`, `considering`). Only commander and main count toward the 100 cards and the stats.
- A deck line can pin a specific printing (art, set and price) and carry free-form tags. Tags drive the "Custom tag" grouping. Prices are Scryfall market prices in USD, refreshed by a background job (`PriceRefreshService`) for stale cards and pinned printings.
- The card catalog is filled on demand from Scryfall by exact name. Card art is placeholder art owned by Wizards of the Coast and the artists.
