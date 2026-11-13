# AniWatchlist backend

The Go API serves AniList catalog data and stores member accounts, watchlists,
favorites, and member-authored reviews. Set `DATABASE_URL` to the Supabase
PostgreSQL Session pooler URL to keep this data in your Supabase project. If it
is omitted, the API uses process-local memory and registered accounts disappear
when the API restarts.

## Supabase setup

1. For an empty Supabase project, import the schema using the steps in
   [Import to Supabase](#import-to-supabase). Never run the dump against a
   database that already has these tables.
2. Copy `.env.example` to `.env`, set a unique random `JWT_SECRET` and set
   `DATABASE_URL` to the project's Session pooler URL. Keep `.env` private.
   Then load it and start the API:

   ```sh
   cp backend/.env.example backend/.env
   # Edit backend/.env and set JWT_SECRET and DATABASE_URL.
   set -a
   . backend/.env
   set +a
   go run ./backend
   ```
3. In another terminal, set `REACT_APP_USE_MOCK=false` and
   `REACT_APP_API_URL=http://localhost:8080` in `frontend/.env.local`, then run
   `npm start` from `frontend/`. CRA development proxies `/api` through
   `frontend/src/setupProxy.js`; restart React after changing env files.

For a deployed frontend, set `REACT_APP_API_URL` to the API origin and configure
`ALLOWED_ORIGINS` on the API to include the frontend's exact origin.

After registering the first account in PostgreSQL mode, promote it once with
`UPDATE members SET role = 'admin' WHERE lower(email) = lower('your@email');`.
Do not expose this operation as an unauthenticated API.

When `DATABASE_URL` is omitted, the API starts with an empty in-memory store.
This is useful for local API wiring, but user data is lost when the process
stops. AniList data is fetched from the public GraphQL API and does not require
the local seed.

For local PostgreSQL development instead, start `backend/compose.yaml`, apply
`backend/schema.sql` and `backend/seed.sql`, and set `DATABASE_URL` to that local
database before starting the API.

## Import to Supabase

For a new, empty Supabase database, copy the **Session pooler** connection URL
from the project dashboard. From the repository root, enter it without adding
it to shell history, then import the full schema-and-data dump:

```sh
read -r -s -p "Supabase connection string: " SUPA_URL
printf '\n'
export SUPA_URL
docker run --rm -i --network host -e SUPA_URL postgres:16 \
  sh -c 'psql "$SUPA_URL" -v ON_ERROR_STOP=1' < backend/anilist-dump.sql
```

After the import completes, enable row-level security immediately:

```sh
docker run --rm -i --network host -e SUPA_URL postgres:16 \
  sh -c 'psql "$SUPA_URL" -v ON_ERROR_STOP=1' < backend/supabase-rls.sql
unset SUPA_URL
```

The dump contains `CREATE TABLE`, `COPY`, and constraints, but does not enable
RLS. The RLS script enables it on all application tables and creates no client
policies, so Data API roles cannot access user data directly. Keep all database
credentials server-side; the Go backend should be the database client. These
steps are for an empty database because the dump is not idempotent.

## API routes

- Public: `GET /api/anime`, `GET /api/anime/{id}`, `GET /api/reviews`,
  `GET /api/genres`, `POST /api/auth/register`, `POST /api/auth/login`
- Signed in: `PUT /api/auth/password`, `GET /api/reviews/mine`, `POST /api/reviews`,
  `DELETE /api/reviews/{id}`, `/api/watchlist`, and `/api/favorites`
- Admin: `/api/admin/stats`, `/api/admin/members`,
  `/api/admin/members/{id}/role`, and `/api/admin/anime`

Authenticated routes require `Authorization: Bearer <token>`. Admin routes
also require the `admin` role. New registrations receive the `member` role;
promote an account through the database or an existing administrator.
