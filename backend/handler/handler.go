package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"

	"aniwatchlist/backend/auth"
	"aniwatchlist/backend/mw"
	"aniwatchlist/backend/store"
)

// WithMemberID is intended for authenticated middleware after it validates the
// bearer token. Never take the member ID from a request body or query string.
func WithMemberID(ctx context.Context, memberID int) context.Context {
	return mw.WithIdentity(ctx, int64(memberID), "member")
}

type AnimeResolver interface {
	GetAnime(ctx context.Context, animeID int) (any, error)
}

// AnimeService supplies catalog data from AniList or another anime provider.
// The watchlist store keeps only anime IDs and member-specific relationships.
type AnimeService interface {
	AnimeResolver
	SearchAnime(ctx context.Context, search, genre string) ([]any, error)
}

type reviewStore interface {
	ListReviews(ctx context.Context, animeID int64) ([]store.Review, error)
	ListMemberReviews(ctx context.Context, memberID int64) ([]store.Review, error)
	SaveReview(ctx context.Context, memberID, animeID int64, text string, score *int16) (store.Review, error)
	DeleteReview(ctx context.Context, memberID, reviewID int64) error
}

var ErrAnimeNotFound = errors.New("anime not found")

type Handler struct {
	Store        store.WatchlistStore
	AnimeService AnimeService
	Tickets      *auth.Issuer
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]string{"code": code, "message": message},
	})
}

func memberIDFromRequest(r *http.Request) (int, bool) {
	memberID, ok := mw.MemberID(r.Context())
	if !ok || int64(int(memberID)) != memberID {
		return 0, false
	}
	return int(memberID), true
}

func parseAnimeID(raw string) (int, error) {
	id, err := strconv.Atoi(raw)
	if err != nil || id <= 0 {
		return 0, store.ErrInvalidAnimeID
	}
	return id, nil
}

func (h *Handler) SearchAnime(w http.ResponseWriter, r *http.Request) {
	if h.AnimeService == nil {
		writeError(w, http.StatusServiceUnavailable, "ANIME_SERVICE_UNAVAILABLE", "ยังไม่ได้ตั้งค่าบริการค้นหาอนิเมะ")
		return
	}
	items, err := h.AnimeService.SearchAnime(r.Context(), r.URL.Query().Get("search"), r.URL.Query().Get("genre"))
	if err != nil {
		internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

func (h *Handler) GetAnime(w http.ResponseWriter, r *http.Request) {
	if h.AnimeService == nil {
		writeError(w, http.StatusServiceUnavailable, "ANIME_SERVICE_UNAVAILABLE", "ยังไม่ได้ตั้งค่าบริการข้อมูลอนิเมะ")
		return
	}
	animeID, err := parseAnimeID(r.PathValue("id"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	anime, err := h.AnimeService.GetAnime(r.Context(), animeID)
	if errors.Is(err, ErrAnimeNotFound) || errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "ANIME_NOT_FOUND", "ไม่พบอนิเมะเรื่องนี้")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, anime)
}

func (h *Handler) ListReviews(w http.ResponseWriter, r *http.Request) {
	rawAnimeID := r.PathValue("id")
	if rawAnimeID == "" {
		rawAnimeID = r.URL.Query().Get("animeId")
	}
	animeID, err := parseAnimeID(rawAnimeID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	reviews, ok := h.Store.(reviewStore)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "REVIEW_STORE_UNAVAILABLE", "ระบบรีวิวยังไม่พร้อมใช้งาน")
		return
	}
	items, err := reviews.ListReviews(r.Context(), int64(animeID))
	if err != nil {
		internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) ListMyReviews(w http.ResponseWriter, r *http.Request) {
	memberID, ok := memberIDFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบ")
		return
	}
	reviews, ok := h.Store.(reviewStore)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "REVIEW_STORE_UNAVAILABLE", "ระบบรีวิวยังไม่พร้อมใช้งาน")
		return
	}
	items, err := reviews.ListMemberReviews(r.Context(), int64(memberID))
	if err != nil {
		internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) SaveReview(w http.ResponseWriter, r *http.Request) {
	memberID, ok := memberIDFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบ")
		return
	}
	var body struct {
		AnimeID int    `json:"animeId"`
		Rating  int16  `json:"rating"`
		Text    string `json:"text"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", "ข้อมูลคำขอไม่ถูกต้อง")
		return
	}
	if body.AnimeID <= 0 {
		writeStoreError(w, store.ErrInvalidAnimeID)
		return
	}
	reviews, ok := h.Store.(reviewStore)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "REVIEW_STORE_UNAVAILABLE", "ระบบรีวิวยังไม่พร้อมใช้งาน")
		return
	}
	if h.AnimeService != nil {
		if _, err := h.AnimeService.GetAnime(r.Context(), body.AnimeID); err != nil {
			if errors.Is(err, ErrAnimeNotFound) || errors.Is(err, store.ErrNotFound) {
				writeError(w, http.StatusNotFound, "ANIME_NOT_FOUND", "ไม่พบอนิเมะเรื่องนี้")
				return
			}
			internal(w, err)
			return
		}
	}
	score := body.Rating
	item, err := reviews.SaveReview(r.Context(), int64(memberID), int64(body.AnimeID), body.Text, &score)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *Handler) DeleteReview(w http.ResponseWriter, r *http.Request) {
	memberID, ok := memberIDFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบ")
		return
	}
	reviewID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || reviewID <= 0 {
		writeError(w, http.StatusBadRequest, "INVALID_REVIEW_ID", "รหัสรีวิวไม่ถูกต้อง")
		return
	}
	reviews, ok := h.Store.(reviewStore)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "REVIEW_STORE_UNAVAILABLE", "ระบบรีวิวยังไม่พร้อมใช้งาน")
		return
	}
	if err := reviews.DeleteReview(r.Context(), int64(memberID), reviewID); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// AdminDeleteReview lets an authenticated administrator moderate any review.
// The route is protected by RequireRole("admin").
func (h *Handler) AdminDeleteReview(w http.ResponseWriter, r *http.Request) {
	reviewID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || reviewID <= 0 {
		writeError(w, http.StatusBadRequest, "INVALID_REVIEW_ID", "รหัสรีวิวไม่ถูกต้อง")
		return
	}
	reviews, ok := h.Store.(interface {
		DeleteReviewByID(context.Context, int64) error
	})
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "REVIEW_STORE_UNAVAILABLE", "ระบบรีวิวยังไม่พร้อมใช้งาน")
		return
	}
	if err := reviews.DeleteReviewByID(r.Context(), reviewID); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func internal(w http.ResponseWriter, err error) {
	// Keep provider/database details in server logs, not in the API response.
	log.Printf("internal API error: %v", err)
	writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "ระบบขัดข้อง กรุณาลองอีกครั้ง")
}

func (h *Handler) ListWatchlist(w http.ResponseWriter, r *http.Request) {
	memberID, ok := memberIDFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบ")
		return
	}
	items, err := h.Store.ListWatchlist(r.Context(), memberID)
	if err != nil {
		internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) SetWatchlistEntry(w http.ResponseWriter, r *http.Request) {
	memberID, ok := memberIDFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบ")
		return
	}

	var body struct {
		AnimeID  int               `json:"animeId"`
		Status   store.WatchStatus `json:"status"`
		Progress int               `json:"progress"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", "ข้อมูลคำขอไม่ถูกต้อง")
		return
	}

	entry, err := h.Store.SetWatchlistEntry(r.Context(), store.WatchlistEntry{
		MemberID: memberID,
		AnimeID:  body.AnimeID,
		Status:   body.Status,
		Progress: body.Progress,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, entry)
}

func (h *Handler) DeleteWatchlistEntry(w http.ResponseWriter, r *http.Request) {
	memberID, ok := memberIDFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบ")
		return
	}
	animeID, err := parseAnimeID(r.PathValue("animeId"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if err := h.Store.DeleteWatchlistEntry(r.Context(), memberID, animeID); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListFavorites(w http.ResponseWriter, r *http.Request) {
	if rawID := r.URL.Query().Get("animeId"); rawID != "" {
		animeID, err := parseAnimeID(rawID)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		count, err := h.Store.FavoriteCount(r.Context(), animeID)
		if err != nil {
			internal(w, err)
			return
		}
		favorited := false
		if memberID, authenticated := memberIDFromRequest(r); authenticated {
			favorited, err = h.Store.IsFavorite(r.Context(), memberID, animeID)
			if err != nil {
				internal(w, err)
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"animeId":   animeID,
			"count":     count,
			"favorited": favorited,
		})
		return
	}
	memberID, ok := memberIDFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบ")
		return
	}

	if h.AnimeService == nil {
		writeError(w, http.StatusServiceUnavailable, "ANIME_RESOLVER_UNAVAILABLE", "ยังไม่ได้ตั้งค่าบริการข้อมูลอนิเมะ")
		return
	}
	entries, err := h.Store.ListFavorites(r.Context(), memberID)
	if err != nil {
		internal(w, err)
		return
	}
	items := make([]any, 0, len(entries))
	for _, entry := range entries {
		anime, err := h.AnimeService.GetAnime(r.Context(), entry.AnimeID)
		if err != nil {
			writeError(w, http.StatusBadGateway, "ANILIST_ERROR", "โหลดข้อมูลอนิเมะจาก AniList ไม่สำเร็จ")
			return
		}
		items = append(items, anime)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) AddFavorite(w http.ResponseWriter, r *http.Request) {
	memberID, ok := memberIDFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบ")
		return
	}
	var body struct {
		AnimeID int `json:"animeId"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", "ข้อมูลคำขอไม่ถูกต้อง")
		return
	}
	entry, err := h.Store.AddFavorite(r.Context(), memberID, body.AnimeID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"animeId":  entry.AnimeID,
		"memberId": entry.MemberID,
		"favorite": true,
	})
}

func (h *Handler) RemoveFavorite(w http.ResponseWriter, r *http.Request) {
	memberID, ok := memberIDFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบ")
		return
	}
	animeID, err := parseAnimeID(r.PathValue("animeId"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if err := h.Store.RemoveFavorite(r.Context(), memberID, animeID); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"animeId":  animeID,
		"memberId": memberID,
		"favorite": false,
	})
}

func (h *Handler) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/anime", h.SearchAnime)
	mux.HandleFunc("GET /api/anime/{id}", h.GetAnime)
	mux.HandleFunc("GET /api/anime/{id}/reviews", h.ListReviews)
	mux.HandleFunc("GET /api/reviews", h.ListReviews)
	mux.HandleFunc("GET /api/genres", h.Genres)
	mux.HandleFunc("POST /api/auth/register", h.Register)
	mux.HandleFunc("POST /api/auth/login", h.Login)

	login := func(handler http.HandlerFunc) http.Handler {
		return mw.RequireLogin(h.Tickets, handler)
	}
	mux.Handle("GET /api/reviews/mine", login(h.ListMyReviews))
	mux.Handle("PUT /api/auth/password", login(h.ChangePassword))
	mux.Handle("POST /api/reviews", login(h.SaveReview))
	mux.Handle("DELETE /api/reviews/{id}", login(h.DeleteReview))
	admin := func(handler http.HandlerFunc) http.Handler {
		return mw.RequireLogin(h.Tickets, mw.RequireRole("admin", handler))
	}
	mux.Handle("GET /api/watchlist", login(h.ListWatchlist))
	mux.Handle("POST /api/watchlist", login(h.SetWatchlistEntry))
	mux.Handle("DELETE /api/watchlist/{animeId}", login(h.DeleteWatchlistEntry))
	mux.Handle("GET /api/favorites", mw.OptionalLogin(h.Tickets, http.HandlerFunc(h.ListFavorites)))
	mux.Handle("POST /api/favorites", login(h.AddFavorite))
	mux.Handle("DELETE /api/favorites/{animeId}", login(h.RemoveFavorite))

	mux.Handle("GET /api/admin/stats", admin(h.AdminStats))
	mux.Handle("GET /api/admin/members", admin(h.AdminMembers))
	mux.Handle("PATCH /api/admin/members/{id}/role", admin(h.AdminSetRole))
	mux.Handle("GET /api/admin/anime", admin(h.AdminAnimeList))
	mux.Handle("GET /api/admin/anime/{id}", admin(h.AdminGetAnime))
	mux.Handle("POST /api/admin/anime", admin(h.AdminCreateAnime))
	mux.Handle("PUT /api/admin/anime/{id}", admin(h.AdminUpdateAnime))
	mux.Handle("DELETE /api/admin/anime/{id}", admin(h.AdminDeleteAnime))
	mux.Handle("DELETE /api/admin/reviews/{id}", admin(h.AdminDeleteReview))
	return mux
}

func decodeJSON(r *http.Request, destination any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain one JSON value")
	}
	return nil
}

func writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "ไม่พบรายการนี้")
	case errors.Is(err, store.ErrInvalidAnimeID):
		writeError(w, http.StatusBadRequest, "BAD_ANIME_ID", "animeId ต้องเป็นจำนวนเต็มบวก")
	case errors.Is(err, store.ErrInvalidMemberID):
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบ")
	case errors.Is(err, store.ErrInvalidReview):
		writeError(w, http.StatusBadRequest, "INVALID_REVIEW", "รีวิวต้องมีอย่างน้อย 10 ตัวอักษร")
	case errors.Is(err, store.ErrInvalidReviewScore):
		writeError(w, http.StatusBadRequest, "INVALID_REVIEW_SCORE", "คะแนนรีวิวต้องอยู่ระหว่าง 1 ถึง 10")
	case errors.Is(err, store.ErrInvalidStatus), errors.Is(err, store.ErrInvalidProgress):
		writeError(w, http.StatusBadRequest, "INVALID_WATCHLIST_ENTRY", "สถานะหรือความคืบหน้าของ watchlist ไม่ถูกต้อง")
	default:
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์")
	}
}
