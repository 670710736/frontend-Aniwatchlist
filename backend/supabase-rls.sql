-- Run immediately after importing anilist-dump.sql into Supabase.
-- RLS is enabled without client policies: PostgREST anon/authenticated roles
-- cannot read or write these tables. The Go API connects server-side as the
-- database owner and continues to access them directly.

BEGIN;

ALTER TABLE public.anime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_entries ENABLE ROW LEVEL SECURITY;

COMMIT;
