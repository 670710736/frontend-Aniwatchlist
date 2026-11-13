package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"aniwatchlist/backend/anilist"
	"aniwatchlist/backend/auth"
	"aniwatchlist/backend/handler"
	"aniwatchlist/backend/mw"
	"aniwatchlist/backend/store"
)

func main() {
	secret := os.Getenv("JWT_SECRET")
	if len([]byte(secret)) < 32 {
		log.Fatal("JWT_SECRET must be set to at least 32 bytes; see backend/.env.example")
	}
	ttl := 24 * time.Hour
	if rawTTL := os.Getenv("JWT_TTL"); rawTTL != "" {
		parsed, err := time.ParseDuration(rawTTL)
		if err != nil || parsed <= 0 {
			log.Fatal("JWT_TTL must be a positive Go duration, for example 24h")
		}
		ttl = parsed
	}

	var dataStore store.WatchlistStore = store.NewMemoryStore()
	var closeStore func()
	if databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL")); databaseURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		postgres, err := store.OpenPostgresStore(ctx, databaseURL)
		cancel()
		if err != nil {
			log.Fatalf("connect to PostgreSQL: %v", err)
		}
		dataStore = postgres
		closeStore = postgres.Close
	} else {
		log.Println("DATABASE_URL is empty; using in-memory storage (data will be lost on restart)")
	}
	if closeStore != nil {
		defer closeStore()
	}

	animeCache, ok := dataStore.(store.AnimeCacheStore)
	if !ok {
		log.Fatal("configured store does not support AniList catalog caching")
	}
	api := &handler.Handler{
		Store:        dataStore,
		AnimeService: anilist.NewCatalog(animeCache, anilist.NewClient(os.Getenv("ANILIST_GRAPHQL_URL"))),
		Tickets:      &auth.Issuer{Secret: []byte(secret), TTL: ttl},
	}

	// Keep timeout responses in the same JSON error format as other API errors.
	mux := mw.Recovery(http.TimeoutHandler(api.Routes(), 10*time.Second,
		`{"error":{"code":"REQUEST_TIMEOUT","message":"คำขอใช้เวลานานเกินไป กรุณาลองอีกครั้ง"}}`))
	origins := strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",")
	app := mw.Logging(mw.CORS(origins, mux))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port

	srv := &http.Server{
		Addr:              addr,
		Handler:           app,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		log.Printf("AniWatchlist API listening on %s; allowed origins=%v", addr, origins)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
		close(serverErrors)
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(quit)

	select {
	case sig := <-quit:
		log.Printf("received %s; shutting down AniWatchlist API", sig)
	case err := <-serverErrors:
		if err != nil {
			log.Printf("HTTP server failed: %v", err)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
		if closeErr := srv.Close(); closeErr != nil {
			log.Printf("force close failed: %v", closeErr)
		}
	}
	log.Println("AniWatchlist API stopped")
}
