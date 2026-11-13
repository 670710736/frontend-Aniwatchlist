package store

import (
	"context"
	"errors"
	"sort"
	"strings"
)

var ErrInvalidAnime = errors.New("invalid anime record")

// AnimeCacheStore is implemented by the in-memory and PostgreSQL catalog stores.
type AnimeCacheStore interface {
	SearchAnime(ctx context.Context, search, genre string) ([]Anime, error)
	GetAnime(ctx context.Context, id int) (Anime, error)
	UpsertAnime(ctx context.Context, anime Anime) error
}

// Anime mirrors the AniList GraphQL fields used by the AniWatchlist frontend.
// IDs are AniList Media IDs and scores use AniList's 0–100 scale.
type Anime struct {
	ID           int             `json:"id"`
	Title        AnimeTitle      `json:"title"`
	CoverImage   AnimeCoverImage `json:"coverImage"`
	BannerImage  *string         `json:"bannerImage"`
	Description  *string         `json:"description"`
	Genres       []string        `json:"genres"`
	AverageScore *int            `json:"averageScore"`
	Popularity   int             `json:"popularity"`
	Episodes     *int            `json:"episodes"`
	Status       string          `json:"status"`
	Format       string          `json:"format"`
}

type AnimeTitle struct {
	Romaji        *string `json:"romaji"`
	English       *string `json:"english"`
	Native        *string `json:"native"`
	UserPreferred *string `json:"userPreferred"`
}

type AnimeCoverImage struct {
	Large      string  `json:"large"`
	ExtraLarge string  `json:"extraLarge"`
	Color      *string `json:"color,omitempty"`
}

// UpsertAnime adds or replaces one cached AniList record in MemoryStore.
func (s *MemoryStore) UpsertAnime(ctx context.Context, anime Anime) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if anime.ID <= 0 || anime.Popularity < 0 {
		return ErrInvalidAnime
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.anime == nil {
		s.anime = make(map[int]Anime)
	}
	s.anime[anime.ID] = cloneAnime(anime)
	return nil
}

// SearchAnime searches all AniList title variants and orders results by
// popularity. Ecchi titles are excluded to match the frontend's content filter.
func (s *MemoryStore) SearchAnime(ctx context.Context, query, genre string) ([]Anime, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	query = strings.ToLower(strings.TrimSpace(query))
	genre = strings.ToLower(strings.TrimSpace(genre))

	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]Anime, 0, len(s.anime))
	for _, anime := range s.anime {
		if hasEcchiGenre(anime.Genres) || (query != "" && !animeTitleContains(anime.Title, query)) ||
			(genre != "" && !hasGenre(anime.Genres, genre)) {
			continue
		}
		items = append(items, cloneAnime(anime))
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Popularity != items[j].Popularity {
			return items[i].Popularity > items[j].Popularity
		}
		return items[i].ID < items[j].ID
	})
	return items, nil
}

func hasGenre(genres []string, wanted string) bool {
	for _, genre := range genres {
		if strings.EqualFold(genre, wanted) {
			return true
		}
	}
	return false
}

// GetAnime returns cached AniList details, including the description.
func (s *MemoryStore) GetAnime(ctx context.Context, id int) (Anime, error) {
	if err := ctx.Err(); err != nil {
		return Anime{}, err
	}
	if id <= 0 {
		return Anime{}, ErrInvalidAnimeID
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	anime, ok := s.anime[id]
	if !ok {
		return Anime{}, ErrNotFound
	}
	return cloneAnime(anime), nil
}

// ListGenres returns the distinct genres present in the cached catalog.
func (s *MemoryStore) ListGenres(ctx context.Context) ([]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	seen := make(map[string]struct{})
	for _, anime := range s.anime {
		if hasEcchiGenre(anime.Genres) {
			continue
		}
		for _, genre := range anime.Genres {
			seen[genre] = struct{}{}
		}
	}
	genres := make([]string, 0, len(seen))
	for genre := range seen {
		genres = append(genres, genre)
	}
	sort.Strings(genres)
	return genres, nil
}

func animeTitleContains(title AnimeTitle, query string) bool {
	for _, value := range []*string{title.Romaji, title.English, title.Native, title.UserPreferred} {
		if value != nil && strings.Contains(strings.ToLower(*value), query) {
			return true
		}
	}
	return false
}

func hasEcchiGenre(genres []string) bool {
	for _, genre := range genres {
		if strings.EqualFold(genre, "Ecchi") {
			return true
		}
	}
	return false
}

func cloneAnime(anime Anime) Anime {
	anime.Title = AnimeTitle{
		Romaji:        cloneString(anime.Title.Romaji),
		English:       cloneString(anime.Title.English),
		Native:        cloneString(anime.Title.Native),
		UserPreferred: cloneString(anime.Title.UserPreferred),
	}
	anime.CoverImage.Color = cloneString(anime.CoverImage.Color)
	anime.BannerImage = cloneString(anime.BannerImage)
	anime.Description = cloneString(anime.Description)
	anime.AverageScore = cloneInt(anime.AverageScore)
	anime.Episodes = cloneInt(anime.Episodes)
	anime.Genres = append([]string(nil), anime.Genres...)
	return anime
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
