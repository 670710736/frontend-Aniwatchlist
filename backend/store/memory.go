package store

import (
	"context"
	"errors"
	"sync"
)

var (
	ErrNotFound        = errors.New("watchlist entry not found")
	ErrInvalidAnimeID  = errors.New("anime id must be positive")
	ErrInvalidMemberID = errors.New("member id must be positive")
	ErrInvalidStatus   = errors.New("status must be planned, watching, or completed")
	ErrInvalidProgress = errors.New("progress cannot be negative")
)

// WatchStatus values accepted by the frontend watchlist API.
type WatchStatus string

const (
	StatusPlanned   WatchStatus = "planned"
	StatusWatching  WatchStatus = "watching"
	StatusCompleted WatchStatus = "completed"
)

// WatchlistEntry mirrors the fields returned by GET/POST /api/watchlist.
// Anime details are fetched from AniList and are intentionally not stored here.
type WatchlistEntry struct {
	MemberID int         `json:"memberId"`
	AnimeID  int         `json:"animeId"`
	Status   WatchStatus `json:"status"`
	Progress int         `json:"progress"`
}

// FavoriteEntry mirrors the persisted relationship behind /api/favorites.
type FavoriteEntry struct {
	MemberID int `json:"memberId"`
	AnimeID  int `json:"animeId"`
}

type WatchlistStore interface {
	ListWatchlist(ctx context.Context, memberID int) ([]WatchlistEntry, error)
	SetWatchlistEntry(ctx context.Context, entry WatchlistEntry) (WatchlistEntry, error)
	DeleteWatchlistEntry(ctx context.Context, memberID, animeID int) error
	ListFavorites(ctx context.Context, memberID int) ([]FavoriteEntry, error)
	FavoriteCount(ctx context.Context, animeID int) (int, error)
	AddFavorite(ctx context.Context, memberID, animeID int) (FavoriteEntry, error)
	RemoveFavorite(ctx context.Context, memberID, animeID int) error
	IsFavorite(ctx context.Context, memberID, animeID int) (bool, error)
}

// MemoryStore is a concurrency-safe, process-local store. Data is lost when
// the backend restarts; use a database-backed implementation for persistence.
type MemoryStore struct {
	mu           sync.RWMutex
	watchlist    map[int]map[int]WatchlistEntry // memberID -> animeID -> entry
	favorites    map[int]map[int]struct{}       // memberID -> animeID set
	members      map[int64]Member
	nextMemberID int64
	reviews      map[int64]Review
	nextReviewID int64
	anime        map[int]Anime
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		watchlist:    make(map[int]map[int]WatchlistEntry),
		favorites:    make(map[int]map[int]struct{}),
		members:      make(map[int64]Member),
		nextMemberID: 1,
		reviews:      make(map[int64]Review),
		nextReviewID: 1,
		anime:        make(map[int]Anime),
	}
}

func (s *MemoryStore) ListWatchlist(ctx context.Context, memberID int) ([]WatchlistEntry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if memberID <= 0 {
		return nil, ErrInvalidMemberID
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries := s.watchlist[memberID]
	out := make([]WatchlistEntry, 0, len(entries))
	for _, entry := range entries {
		out = append(out, entry)
	}
	return out, nil
}

// SetWatchlistEntry creates or updates a member's entry for an anime, matching
// the frontend's POST /api/watchlist upsert behavior.
func (s *MemoryStore) SetWatchlistEntry(ctx context.Context, entry WatchlistEntry) (WatchlistEntry, error) {
	if err := ctx.Err(); err != nil {
		return WatchlistEntry{}, err
	}
	if entry.MemberID <= 0 {
		return WatchlistEntry{}, ErrInvalidMemberID
	}
	if entry.AnimeID <= 0 {
		return WatchlistEntry{}, ErrInvalidAnimeID
	}
	if entry.Status == "" {
		entry.Status = StatusPlanned
	}
	if !validStatus(entry.Status) {
		return WatchlistEntry{}, ErrInvalidStatus
	}
	if entry.Progress < 0 {
		return WatchlistEntry{}, ErrInvalidProgress
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.watchlist[entry.MemberID] == nil {
		s.watchlist[entry.MemberID] = make(map[int]WatchlistEntry)
	}
	s.watchlist[entry.MemberID][entry.AnimeID] = entry
	return entry, nil
}

func (s *MemoryStore) DeleteWatchlistEntry(ctx context.Context, memberID, animeID int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if memberID <= 0 {
		return ErrInvalidMemberID
	}
	if animeID <= 0 {
		return ErrInvalidAnimeID
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	entries := s.watchlist[memberID]
	if _, exists := entries[animeID]; !exists {
		return ErrNotFound
	}
	delete(entries, animeID)
	if len(entries) == 0 {
		delete(s.watchlist, memberID)
	}
	return nil
}

func (s *MemoryStore) ListFavorites(ctx context.Context, memberID int) ([]FavoriteEntry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if memberID <= 0 {
		return nil, ErrInvalidMemberID
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.favorites[memberID]
	out := make([]FavoriteEntry, 0, len(ids))
	for animeID := range ids {
		out = append(out, FavoriteEntry{MemberID: memberID, AnimeID: animeID})
	}
	return out, nil
}

// FavoriteCount returns how many distinct members favorited an anime.
func (s *MemoryStore) FavoriteCount(ctx context.Context, animeID int) (int, error) {
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	if animeID <= 0 {
		return 0, ErrInvalidAnimeID
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	for _, ids := range s.favorites {
		if _, exists := ids[animeID]; exists {
			count++
		}
	}
	return count, nil
}

// AddFavorite is idempotent, matching POST /api/favorites behavior.
func (s *MemoryStore) AddFavorite(ctx context.Context, memberID, animeID int) (FavoriteEntry, error) {
	if err := ctx.Err(); err != nil {
		return FavoriteEntry{}, err
	}
	if memberID <= 0 {
		return FavoriteEntry{}, ErrInvalidMemberID
	}
	if animeID <= 0 {
		return FavoriteEntry{}, ErrInvalidAnimeID
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.favorites[memberID] == nil {
		s.favorites[memberID] = make(map[int]struct{})
	}
	s.favorites[memberID][animeID] = struct{}{}
	return FavoriteEntry{MemberID: memberID, AnimeID: animeID}, nil
}

func (s *MemoryStore) RemoveFavorite(ctx context.Context, memberID, animeID int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if memberID <= 0 {
		return ErrInvalidMemberID
	}
	if animeID <= 0 {
		return ErrInvalidAnimeID
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	ids := s.favorites[memberID]
	if _, exists := ids[animeID]; !exists {
		return ErrNotFound
	}
	delete(ids, animeID)
	if len(ids) == 0 {
		delete(s.favorites, memberID)
	}
	return nil
}

func (s *MemoryStore) IsFavorite(ctx context.Context, memberID, animeID int) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	if memberID <= 0 {
		return false, ErrInvalidMemberID
	}
	if animeID <= 0 {
		return false, ErrInvalidAnimeID
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, exists := s.favorites[memberID][animeID]
	return exists, nil
}

func validStatus(status WatchStatus) bool {
	switch status {
	case StatusPlanned, StatusWatching, StatusCompleted:
		return true
	default:
		return false
	}
}

var _ WatchlistStore = (*MemoryStore)(nil)
var _ AnimeCacheStore = (*MemoryStore)(nil)
