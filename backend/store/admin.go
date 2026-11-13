package store

import (
	"context"
	"errors"
)

var ErrAnimeExists = errors.New("anime already exists")

// AdminStats summarizes the local AniWatchlist data managed by admins.
// Anime records are cached AniList metadata; watchlists, favorites, and
// reviews are member-owned relationships.
type AdminStats struct {
	AnimeCount          int `json:"animeCount"`
	MemberCount         int `json:"memberCount"`
	ReviewCount         int `json:"reviewCount"`
	WatchlistEntryCount int `json:"watchlistEntryCount"`
	FavoriteEntryCount  int `json:"favoriteEntryCount"`
}

// Stats returns counts for the admin dashboard.
func (s *MemoryStore) Stats(ctx context.Context) (AdminStats, error) {
	if err := ctx.Err(); err != nil {
		return AdminStats{}, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := AdminStats{
		AnimeCount:  len(s.anime),
		MemberCount: len(s.members),
		ReviewCount: len(s.reviews),
	}
	for _, entries := range s.watchlist {
		stats.WatchlistEntryCount += len(entries)
	}
	for _, favorites := range s.favorites {
		stats.FavoriteEntryCount += len(favorites)
	}
	return stats, nil
}

// AdminGetAnime returns a cached AniList record for admin tools.
func (s *MemoryStore) AdminGetAnime(ctx context.Context, id int) (Anime, error) {
	return s.GetAnime(ctx, id)
}

// CreateAnime adds a record to the local AniList cache. The ID must be the
// existing AniList Media ID; the store does not create records on AniList.
func (s *MemoryStore) CreateAnime(ctx context.Context, anime Anime) (Anime, error) {
	if err := ctx.Err(); err != nil {
		return Anime{}, err
	}
	if anime.ID <= 0 || anime.Popularity < 0 {
		return Anime{}, ErrInvalidAnime
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.anime[anime.ID]; exists {
		return Anime{}, ErrAnimeExists
	}
	if s.anime == nil {
		s.anime = make(map[int]Anime)
	}
	s.anime[anime.ID] = cloneAnime(anime)
	return cloneAnime(anime), nil
}

// UpdateAnime replaces a cached AniList record while keeping its stable ID.
func (s *MemoryStore) UpdateAnime(ctx context.Context, id int, anime Anime) (Anime, error) {
	if err := ctx.Err(); err != nil {
		return Anime{}, err
	}
	if id <= 0 || anime.Popularity < 0 {
		return Anime{}, ErrInvalidAnime
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.anime[id]; !exists {
		return Anime{}, ErrNotFound
	}
	anime.ID = id
	s.anime[id] = cloneAnime(anime)
	return cloneAnime(anime), nil
}

// DeleteAnime removes only the local metadata cache entry. Member data keeps
// the AniList ID so a later cache refresh does not lose watchlist/favorite data.
func (s *MemoryStore) DeleteAnime(ctx context.Context, id int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if id <= 0 {
		return ErrInvalidAnimeID
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.anime[id]; !exists {
		return ErrNotFound
	}
	delete(s.anime, id)
	return nil
}
