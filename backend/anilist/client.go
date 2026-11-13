// Package anilist provides the AniList GraphQL implementation used by the API.
package anilist

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"aniwatchlist/backend/store"
)

const defaultEndpoint = "https://graphql.anilist.co"

// Client performs public, read-only requests to AniList.
type Client struct {
	Endpoint string
	HTTP     *http.Client
}

func NewClient(endpoint string) *Client {
	if strings.TrimSpace(endpoint) == "" {
		endpoint = defaultEndpoint
	}
	return &Client{
		Endpoint: endpoint,
		HTTP:     &http.Client{Timeout: 12 * time.Second},
	}
}

const animeFields = `
 id
 title { romaji english native userPreferred }
 coverImage { large extraLarge color }
 bannerImage
 description(asHtml: false)
 genres
 averageScore
 popularity
 episodes
 status
 format
`

type graphQLError struct {
	Message string `json:"message"`
}

func (c *Client) request(ctx context.Context, query string, variables map[string]any, target any) error {
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 12 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	var envelope struct {
		Data   json.RawMessage `json:"data"`
		Errors []graphQLError  `json:"errors"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return fmt.Errorf("decode AniList response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || len(envelope.Errors) > 0 {
		if len(envelope.Errors) > 0 {
			return fmt.Errorf("AniList GraphQL: %s", envelope.Errors[0].Message)
		}
		return fmt.Errorf("AniList returned HTTP %d", resp.StatusCode)
	}
	if len(envelope.Data) == 0 || string(envelope.Data) == "null" {
		return errors.New("AniList response has no data")
	}
	return json.Unmarshal(envelope.Data, target)
}

func (c *Client) SearchAnime(ctx context.Context, search, genre string) ([]any, error) {
	query := `query SearchAnime($search: String, $genre: String) {
 Page(page: 1, perPage: 50) {
  media(search: $search, genre: $genre, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {` + animeFields + `}
 }
}`
	var result struct {
		Page struct {
			Media []store.Anime `json:"media"`
		} `json:"Page"`
	}
	variables := map[string]any{}
	if strings.TrimSpace(search) != "" {
		variables["search"] = strings.TrimSpace(search)
	}
	if strings.TrimSpace(genre) != "" {
		variables["genre"] = strings.TrimSpace(genre)
	}
	if err := c.request(ctx, query, variables, &result); err != nil {
		return nil, err
	}
	items := make([]any, 0, len(result.Page.Media))
	for _, anime := range result.Page.Media {
		if !hasEcchi(anime.Genres) {
			normalizeAnime(&anime)
			items = append(items, anime)
		}
	}
	return items, nil
}

func (c *Client) GetAnime(ctx context.Context, animeID int) (any, error) {
	query := `query Anime($id: Int) {
 Media(id: $id, type: ANIME) {` + animeFields + `}
}`
	var result struct {
		Media *store.Anime `json:"Media"`
	}
	if err := c.request(ctx, query, map[string]any{"id": animeID}, &result); err != nil {
		return nil, err
	}
	if result.Media == nil || hasEcchi(result.Media.Genres) {
		return nil, store.ErrNotFound
	}
	normalizeAnime(result.Media)
	return *result.Media, nil
}

func (c *Client) ListReviews(ctx context.Context, animeID int) ([]any, error) {
	query := `query AnimeReviews($id: Int) {
 Media(id: $id, type: ANIME) {
  reviews(sort: RATING_DESC, perPage: 5) {
   nodes { id summary body score user { name } }
  }
 }
}`
	var result struct {
		Media *struct {
			Reviews struct {
				Nodes []map[string]any `json:"nodes"`
			} `json:"reviews"`
		} `json:"Media"`
	}
	if err := c.request(ctx, query, map[string]any{"id": animeID}, &result); err != nil {
		return nil, err
	}
	if result.Media == nil {
		return []any{}, nil
	}
	items := make([]any, len(result.Media.Reviews.Nodes))
	for i, review := range result.Media.Reviews.Nodes {
		items[i] = review
	}
	return items, nil
}

func hasEcchi(genres []string) bool {
	for _, genre := range genres {
		if strings.EqualFold(genre, "Ecchi") {
			return true
		}
	}
	return false
}

func normalizeAnime(anime *store.Anime) {
	if anime.CoverImage.Large == "" {
		anime.CoverImage.Large = anime.CoverImage.ExtraLarge
	}
	if anime.CoverImage.ExtraLarge == "" {
		anime.CoverImage.ExtraLarge = anime.CoverImage.Large
	}
}
