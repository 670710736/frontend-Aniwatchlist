package store

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrInvalidReview      = errors.New("review text must contain at least 10 characters")
	ErrInvalidReviewScore = errors.New("review score must be between 1 and 10")
)

type ReviewAuthor struct {
	ID          int64  `json:"id"`
	DisplayName string `json:"displayName"`
}

// Review is a member's review of an AniList anime. Anime metadata remains
// sourced from AniList and is referenced here only by its stable anime ID.
type Review struct {
	ID        int64        `json:"id"`
	MemberID  int64        `json:"memberId"`
	AnimeID   int64        `json:"animeId"`
	Text      string       `json:"text"`
	CreatedAt time.Time    `json:"createdAt"`
	UpdatedAt time.Time    `json:"updatedAt"`
	Member    ReviewAuthor `json:"member"`
	Score     *int16       `json:"score"`
}

// ListReviews returns an anime's reviews, newest first. Review records are
// copied so callers cannot mutate data held by MemoryStore.
func (s *MemoryStore) ListReviews(ctx context.Context, animeID int64) ([]Review, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if animeID <= 0 {
		return nil, ErrInvalidAnimeID
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	items := make([]Review, 0)
	for _, review := range s.reviews {
		if review.AnimeID != animeID {
			continue
		}
		review.Score = cloneScore(review.Score)
		items = append(items, review)
	}
	sort.Slice(items, func(i, j int) bool {
		if !items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].CreatedAt.After(items[j].CreatedAt)
		}
		return items[i].ID > items[j].ID
	})
	return items, nil
}

// SaveReview creates or updates a member's review for an anime. Each member
// may have one review per anime; saving again preserves its ID and creation time.
func (s *MemoryStore) SaveReview(ctx context.Context, memberID, animeID int64, text string, score *int16) (Review, error) {
	if err := ctx.Err(); err != nil {
		return Review{}, err
	}
	if memberID <= 0 {
		return Review{}, ErrInvalidMemberID
	}
	if animeID <= 0 {
		return Review{}, ErrInvalidAnimeID
	}
	text = strings.TrimSpace(text)
	if utf8.RuneCountInString(text) < 10 {
		return Review{}, ErrInvalidReview
	}
	if score != nil && (*score < 1 || *score > 10) {
		return Review{}, ErrInvalidReviewScore
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	author, ok := s.members[memberID]
	if !ok {
		return Review{}, ErrNotFound
	}

	now := time.Now().UTC()
	for id, current := range s.reviews {
		if current.MemberID == memberID && current.AnimeID == animeID {
			current.Text = text
			current.Score = cloneScore(score)
			current.UpdatedAt = now
			s.reviews[id] = current
			return current, nil
		}
	}

	review := Review{
		ID:        s.nextReviewID,
		MemberID:  memberID,
		AnimeID:   animeID,
		Text:      text,
		CreatedAt: now,
		UpdatedAt: now,
		Member:    ReviewAuthor{ID: author.ID, DisplayName: author.DisplayName},
		Score:     cloneScore(score),
	}
	s.nextReviewID++
	s.reviews[review.ID] = review
	return review, nil
}

func cloneScore(score *int16) *int16 {
	if score == nil {
		return nil
	}
	copy := *score
	return &copy
}
