# AniWatchlist backend

The Go API serves AniList catalog data and stores member accounts, watchlists,
favorites, and member-authored reviews. By default it uses process-local memory;
set `DATABASE_URL` to use PostgreSQL.

## Local setup

1. Copy `.env.example` to `.env`, set unique random values for `JWT_SECRET`
   and `POSTGRES_PASSWORD`, then export the settings:

   ```sh
   cp backend/.env.example backend/.env
   # Edit backend/.env and set JWT_SECRET.
   set -a
   . backend/.env
   set +a
   ```
2. Start the local PostgreSQL container from the repository root and wait until it is healthy:

   ```sh
   docker compose -f backend/compose.yaml --env-file backend/.env up -d
   docker compose -f backend/compose.yaml --env-file backend/.env ps
   ```

3. Apply the schema and AniList catalog seed to the local database:

   ```sh
   docker compose -f backend/compose.yaml --env-file backend/.env exec -T db psql -v ON_ERROR_STOP=1 -U aniwatchlist -d aniwatchlist < backend/schema.sql
   docker compose -f backend/compose.yaml --env-file backend/.env exec -T db psql -v ON_ERROR_STOP=1 -U aniwatchlist -d aniwatchlist < backend/seed.sql
   ```

4. Start the API from the repository root with `go run ./backend`.

After registering the first account in PostgreSQL mode, promote it once with
`UPDATE members SET role = 'admin' WHERE lower(email) = lower('your@email');`.
Do not expose this operation as an unauthenticated API.

When `DATABASE_URL` is omitted, the API starts with an empty in-memory store.
This is useful for local API wiring, but user data is lost when the process
stops. AniList data is fetched from the public GraphQL API and does not require
the local seed.

The frontend remains in mock mode until explicitly changed. When ready to
connect it later, copy `frontend/.env.example` to `frontend/.env` and restart
the React development server.

## API routes

- Public: `GET /api/anime`, `GET /api/anime/{id}`, `GET /api/reviews`,
  `GET /api/genres`, `POST /api/auth/register`, `POST /api/auth/login`
- Signed in: `/api/watchlist` and `/api/favorites`
- Admin: `/api/admin/stats`, `/api/admin/members`,
  `/api/admin/members/{id}/role`, and `/api/admin/anime`

Authenticated routes require `Authorization: Bearer <token>`. Admin routes
also require the `admin` role. New registrations receive the `member` role;
promote an account through the database or an existing administrator.
