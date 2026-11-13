package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"aniwatchlist/backend/mw"
	"aniwatchlist/backend/store"
)

// adminStore is implemented by the project's store. Keeping the admin
// operations separate from WatchlistStore lets handlers that only need
// member-owned lists remain small.
type adminStore interface {
	Stats(ctx context.Context) (store.AdminStats, error)
	ListMembers(ctx context.Context) ([]store.Member, error)
	UpdateMemberRole(ctx context.Context, id int64, role string) (store.Member, error)
	ListGenres(ctx context.Context) ([]string, error)
	AdminGetAnime(ctx context.Context, id int) (store.Anime, error)
	CreateAnime(ctx context.Context, anime store.Anime) (store.Anime, error)
	UpdateAnime(ctx context.Context, id int, anime store.Anime) (store.Anime, error)
	DeleteAnime(ctx context.Context, id int) error
}

func (h *Handler) adminStore(w http.ResponseWriter) (adminStore, bool) {
	admin, ok := h.Store.(adminStore)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "ADMIN_STORE_UNAVAILABLE", "ระบบจัดการข้อมูลยังไม่พร้อมใช้งาน")
	}
	return admin, ok
}

// AdminStats returns catalog and member-owned data counts for the dashboard.
func (h *Handler) AdminStats(w http.ResponseWriter, r *http.Request) {
	admin, ok := h.adminStore(w)
	if !ok {
		return
	}
	stats, err := admin.Stats(r.Context())
	if err != nil {
		internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

// AdminMembers returns member profiles without password hashes.
func (h *Handler) AdminMembers(w http.ResponseWriter, r *http.Request) {
	admin, ok := h.adminStore(w)
	if !ok {
		return
	}
	items, err := admin.ListMembers(r.Context())
	if err != nil {
		internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

type roleRequest struct {
	Role string `json:"role"`
}

// AdminSetRole changes another member's role. Admins cannot demote themselves.
func (h *Handler) AdminSetRole(w http.ResponseWriter, r *http.Request) {
	admin, ok := h.adminStore(w)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "BAD_ID", "เลขสมาชิกต้องเป็นจำนวนเต็มบวก")
		return
	}
	var req roleRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", "ข้อมูลคำขอไม่ถูกต้อง")
		return
	}
	if req.Role != "member" && req.Role != "admin" {
		writeError(w, http.StatusBadRequest, "BAD_ROLE", "role ต้องเป็น member หรือ admin")
		return
	}
	if memberID, _ := mw.MemberID(r.Context()); memberID == id {
		writeError(w, http.StatusBadRequest, "SELF_ROLE", "เปลี่ยนบทบาทของตัวเองไม่ได้ ให้ผู้ดูแลคนอื่นทำแทน")
		return
	}

	member, err := admin.UpdateMemberRole(r.Context(), id, req.Role)
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "MEMBER_NOT_FOUND", "ไม่พบสมาชิกคนนี้")
	case errors.Is(err, store.ErrInvalidRole):
		writeError(w, http.StatusBadRequest, "BAD_ROLE", "role ต้องเป็น member หรือ admin")
	case err != nil:
		internal(w, err)
	default:
		writeJSON(w, http.StatusOK, member)
	}
}

// Genres returns genres present in the locally cached AniList catalog.
func (h *Handler) Genres(w http.ResponseWriter, r *http.Request) {
	admin, ok := h.adminStore(w)
	if !ok {
		return
	}
	items, err := admin.ListGenres(r.Context())
	if err != nil {
		internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

type animeRequest struct {
	store.Anime
}

func cleanOptional(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// validateAnime normalizes and validates AniList-shaped metadata before it is
// stored in the local catalog cache.
func validateAnime(anime *store.Anime) (string, string) {
	for _, title := range []**string{&anime.Title.Romaji, &anime.Title.English, &anime.Title.Native, &anime.Title.UserPreferred} {
		*title = cleanOptional(*title)
		if *title != nil && utf8.RuneCountInString(**title) > 255 {
			return "BAD_TITLE", "ชื่ออนิเมะต้องยาวไม่เกิน 255 ตัวอักษร"
		}
	}
	if anime.Title.Romaji == nil && anime.Title.English == nil && anime.Title.Native == nil && anime.Title.UserPreferred == nil {
		return "MISSING_TITLE", "ต้องมีชื่ออนิเมะอย่างน้อยหนึ่งภาษา"
	}

	anime.CoverImage.Large = strings.TrimSpace(anime.CoverImage.Large)
	anime.CoverImage.ExtraLarge = strings.TrimSpace(anime.CoverImage.ExtraLarge)
	if anime.CoverImage.Large == "" {
		anime.CoverImage.Large = anime.CoverImage.ExtraLarge
	}
	if anime.CoverImage.ExtraLarge == "" {
		anime.CoverImage.ExtraLarge = anime.CoverImage.Large
	}
	if anime.CoverImage.Large == "" {
		return "MISSING_COVER", "ต้องมี URL รูปปกอนิเมะ"
	}

	anime.BannerImage = cleanOptional(anime.BannerImage)
	anime.Description = cleanOptional(anime.Description)
	anime.CoverImage.Color = cleanOptional(anime.CoverImage.Color)
	genres := make([]string, 0, len(anime.Genres))
	seenGenres := make(map[string]struct{}, len(anime.Genres))
	for _, genre := range anime.Genres {
		genre = strings.TrimSpace(genre)
		if genre != "" {
			if utf8.RuneCountInString(genre) > 50 {
				return "BAD_GENRE", "ชื่อแนวอนิเมะต้องยาวไม่เกิน 50 ตัวอักษร"
			}
			if _, exists := seenGenres[strings.ToLower(genre)]; exists {
				continue
			}
			seenGenres[strings.ToLower(genre)] = struct{}{}
			genres = append(genres, genre)
		}
	}
	anime.Genres = genres
	if anime.Popularity < 0 {
		return "BAD_POPULARITY", "ค่า popularity ต้องไม่ติดลบ"
	}
	if anime.AverageScore != nil && (*anime.AverageScore < 0 || *anime.AverageScore > 100) {
		return "BAD_SCORE", "averageScore ต้องอยู่ระหว่าง 0 ถึง 100"
	}
	if anime.Episodes != nil && *anime.Episodes < 0 {
		return "BAD_EPISODES", "จำนวนตอนต้องไม่ติดลบ"
	}
	if !oneOf(anime.Status, "FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS") {
		return "BAD_STATUS", "สถานะอนิเมะไม่ถูกต้องตาม AniList"
	}
	if !oneOf(anime.Format, "TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC") {
		return "BAD_FORMAT", "รูปแบบอนิเมะไม่ถูกต้องตาม AniList"
	}
	return "", ""
}

func oneOf(value string, options ...string) bool {
	for _, option := range options {
		if value == option {
			return true
		}
	}
	return false
}

func (h *Handler) AdminGetAnime(w http.ResponseWriter, r *http.Request) {
	admin, ok := h.adminStore(w)
	if !ok {
		return
	}
	id, err := parseAnimeID(r.PathValue("id"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	anime, err := admin.AdminGetAnime(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "ANIME_NOT_FOUND", "ไม่พบอนิเมะเรื่องนี้ในแคตตาล็อก")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, anime)
}

func (h *Handler) AdminCreateAnime(w http.ResponseWriter, r *http.Request) {
	admin, ok := h.adminStore(w)
	if !ok {
		return
	}
	var req animeRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", "ข้อมูลคำขอไม่ถูกต้อง")
		return
	}
	if req.ID <= 0 {
		writeError(w, http.StatusBadRequest, "BAD_ANIME_ID", "ต้องระบุ AniList Media ID เป็นจำนวนเต็มบวก")
		return
	}
	if code, message := validateAnime(&req.Anime); code != "" {
		writeError(w, http.StatusBadRequest, code, message)
		return
	}
	anime, err := admin.CreateAnime(r.Context(), req.Anime)
	switch {
	case errors.Is(err, store.ErrAnimeExists):
		writeError(w, http.StatusConflict, "ANIME_EXISTS", "มีอนิเมะ AniList ID นี้ในแคตตาล็อกแล้ว")
	case errors.Is(err, store.ErrInvalidAnime):
		writeError(w, http.StatusBadRequest, "INVALID_ANIME", "ข้อมูลอนิเมะไม่ถูกต้อง")
	case err != nil:
		internal(w, err)
	default:
		writeJSON(w, http.StatusCreated, anime)
	}
}

func (h *Handler) AdminUpdateAnime(w http.ResponseWriter, r *http.Request) {
	admin, ok := h.adminStore(w)
	if !ok {
		return
	}
	id, err := parseAnimeID(r.PathValue("id"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	var req animeRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", "ข้อมูลคำขอไม่ถูกต้อง")
		return
	}
	if code, message := validateAnime(&req.Anime); code != "" {
		writeError(w, http.StatusBadRequest, code, message)
		return
	}
	anime, err := admin.UpdateAnime(r.Context(), id, req.Anime)
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "ANIME_NOT_FOUND", "ไม่พบอนิเมะเรื่องนี้ในแคตตาล็อก")
	case errors.Is(err, store.ErrInvalidAnime):
		writeError(w, http.StatusBadRequest, "INVALID_ANIME", "ข้อมูลอนิเมะไม่ถูกต้อง")
	case err != nil:
		internal(w, err)
	default:
		writeJSON(w, http.StatusOK, anime)
	}
}

func (h *Handler) AdminDeleteAnime(w http.ResponseWriter, r *http.Request) {
	admin, ok := h.adminStore(w)
	if !ok {
		return
	}
	id, err := parseAnimeID(r.PathValue("id"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if err := admin.DeleteAnime(r.Context(), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "ANIME_NOT_FOUND", "ไม่พบอนิเมะเรื่องนี้ในแคตตาล็อก")
		return
	} else if err != nil {
		internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
