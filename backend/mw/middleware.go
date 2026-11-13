package mw

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
)

// Recovery converts unexpected panics into the JSON error shape expected by
// the frontend. ErrAbortHandler is preserved because net/http uses it to abort
// a request without writing a response.
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tracked := &statusWriter{ResponseWriter: w}
		defer func() {
			if recovered := recover(); recovered != nil {
				if errors.Is(asError(recovered), http.ErrAbortHandler) {
					panic(recovered)
				}
				log.Printf("panic serving %s %s: %v", r.Method, r.URL.Path, recovered)
				if tracked.wroteHeader {
					return
				}
				tracked.Header().Set("Content-Type", "application/json; charset=utf-8")
				tracked.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(tracked).Encode(map[string]any{
					"error": map[string]string{
						"code":    "INTERNAL_ERROR",
						"message": "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ กรุณาลองอีกครั้ง",
					},
				})
			}
		}()
		next.ServeHTTP(tracked, r)
	})
}

func asError(value any) error {
	err, _ := value.(error)
	return err
}

type statusWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (w *statusWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.status = status
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(body []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}
