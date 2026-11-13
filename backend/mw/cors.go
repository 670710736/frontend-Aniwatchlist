package mw

import (
	"net/http"
	"os"
	"strings"
)

// CORS allows only origins configured for the AniWatchlist frontend.
// Set FRONTEND_ORIGINS to a comma-separated list, for example
// http://localhost:3000,https://aniwatchlist.example.
func CORS(next http.Handler) http.Handler {
	allowedOrigins := configuredOrigins()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowedOrigins[origin] {
			header := w.Header()
			header.Set("Access-Control-Allow-Origin", origin)
			header.Add("Vary", "Origin")
			header.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			header.Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type")
			header.Set("Access-Control-Max-Age", "600")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func configuredOrigins() map[string]bool {
	value := os.Getenv("FRONTEND_ORIGINS")
	if value == "" {
		// Create React App's development server, used by this project.
		value = "http://localhost:3000"
	}

	origins := make(map[string]bool)
	for _, origin := range strings.Split(value, ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			origins[origin] = true
		}
	}
	return origins
}
