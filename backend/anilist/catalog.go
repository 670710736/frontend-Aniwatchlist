package anilist

import (
	"context"
	"errors"

	"aniwatchlist/backend/store"
)

// Catalog serves locally cached AniList records first and fills cache misses
// from AniList. This makes the SQL seed and admin edits visible through the API.
type Catalog struct {
	Cache  store.AnimeCacheStore
	Remote *Client
}

func NewCatalog(cache store.AnimeCacheStore, remote *Client) *Catalog {
	return &Catalog{Cache: cache, Remote: remote}
}

func (c *Catalog) SearchAnime(ctx context.Context, search, genre string) ([]any, error) {
	items, err := c.Cache.SearchAnime(ctx, search, genre)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		remoteItems, err := c.Remote.SearchAnime(ctx, search, genre)
		if err != nil {
			return nil, err
		}
		for _, item := range remoteItems {
			if anime, ok := item.(store.Anime); ok {
				_ = c.Cache.UpsertAnime(ctx, anime)
			}
		}
		return remoteItems, nil
	}
	result := make([]any, len(items))
	for index := range items {
		result[index] = items[index]
	}
	return result, nil
}

func (c *Catalog) GetAnime(ctx context.Context, id int) (any, error) {
	anime, err := c.Cache.GetAnime(ctx, id)
	if err == nil {
		return anime, nil
	}
	if !errors.Is(err, store.ErrNotFound) {
		return nil, err
	}
	animeValue, err := c.Remote.GetAnime(ctx, id)
	if err != nil {
		return nil, err
	}
	anime, ok := animeValue.(store.Anime)
	if !ok {
		return nil, errors.New("AniList returned an unexpected anime value")
	}
	_ = c.Cache.UpsertAnime(ctx, anime)
	return anime, nil
}
