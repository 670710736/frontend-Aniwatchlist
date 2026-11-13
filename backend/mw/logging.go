package mw

import (
	"log"
	"net/http"
	"time"
)

// Logging records the request method, path, response status, and duration.
// Query parameters and headers are omitted so tokens and search terms are not logged.
func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		tracked := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(tracked, r)

		status := tracked.status
		if status == 0 {
			status = http.StatusOK
		}
		log.Printf("%s %s status=%d duration=%s", r.Method, r.URL.Path, status,
			time.Since(start).Round(time.Microsecond))
	})
}
