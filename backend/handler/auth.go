package handler

import (
	"context"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"unicode/utf8"

	"aniwatchlist/backend/auth"
	"aniwatchlist/backend/store"
)

type memberStore interface {
	CreateMember(ctx context.Context, email, passwordHash, displayName string) (store.Member, error)
	MemberByEmail(ctx context.Context, email string) (store.Member, error)
}

type passwordStore interface {
	MemberPasswordHash(ctx context.Context, id int64) (string, error)
	UpdatePasswordHash(ctx context.Context, id int64, hash string) error
}

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) memberStore(w http.ResponseWriter) (memberStore, bool) {
	members, ok := h.Store.(memberStore)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "MEMBER_STORE_UNAVAILABLE", "ระบบสมาชิกยังไม่พร้อมใช้งาน")
	}
	return members, ok
}

func (h *Handler) issueToken(w http.ResponseWriter, member store.Member) (string, bool) {
	if h.Tickets == nil {
		writeError(w, http.StatusServiceUnavailable, "AUTH_UNAVAILABLE", "ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน")
		return "", false
	}
	token, err := h.Tickets.Issue(member.ID, member.Role)
	if err != nil {
		internal(w, err)
		return "", false
	}
	return token, true
}

func validateCredentials(req *credentials) (email, displayName string, ok bool) {
	email = strings.ToLower(strings.TrimSpace(req.Email))
	if len(email) > 255 {
		return "", "", false
	}
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || utf8.RuneCountInString(req.Password) < 4 || len([]byte(req.Password)) > 72 {
		return "", "", false
	}
	local, _, _ := strings.Cut(email, "@")
	displayName = strings.TrimSpace(local)
	if utf8.RuneCountInString(displayName) > 50 {
		displayName = string([]rune(displayName)[:50])
	}
	return email, displayName, displayName != ""
}

// Register accepts the email/password fields used by the frontend and derives
// a display name from the email address until profile editing is available.
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	members, ok := h.memberStore(w)
	if !ok {
		return
	}
	var req credentials
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", "ข้อมูลคำขอไม่ถูกต้อง")
		return
	}
	email, displayName, valid := validateCredentials(&req)
	if !valid {
		writeError(w, http.StatusBadRequest, "INVALID_CREDENTIALS", "กรุณากรอกอีเมลที่ถูกต้องและรหัสผ่าน 4 ถึง 72 ไบต์")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		internal(w, err)
		return
	}
	member, err := members.CreateMember(r.Context(), email, hash, displayName)
	if errors.Is(err, store.ErrEmailTaken) {
		writeError(w, http.StatusConflict, "EMAIL_TAKEN", "อีเมลนี้ถูกใช้งานแล้ว")
		return
	}
	if errors.Is(err, store.ErrInvalidMember) {
		writeError(w, http.StatusBadRequest, "INVALID_MEMBER", "ข้อมูลสมาชิกไม่ถูกต้อง")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	token, ok := h.issueToken(w, member)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "user": member})
}

// Login verifies a bcrypt password hash and returns the response shape used
// by AuthContext: { token, user }.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	members, ok := h.memberStore(w)
	if !ok {
		return
	}
	var req credentials
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", "ข้อมูลคำขอไม่ถูกต้อง")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || req.Password == "" || len([]byte(req.Password)) > 72 {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "อีเมลหรือรหัสผ่านไม่ถูกต้อง")
		return
	}
	member, err := members.MemberByEmail(r.Context(), email)
	if err != nil || !auth.CheckPassword(member.PasswordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "อีเมลหรือรหัสผ่านไม่ถูกต้อง")
		return
	}
	token, ok := h.issueToken(w, member)
	if !ok {
		return
	}
	member.PasswordHash = ""
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": member})
}

// ChangePassword verifies the current password before storing a new hash.
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	memberID, ok := memberIDFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบ")
		return
	}
	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_JSON", "ข้อมูลคำขอไม่ถูกต้อง")
		return
	}
	if utf8.RuneCountInString(req.NewPassword) < 4 || len([]byte(req.NewPassword)) > 72 {
		writeError(w, http.StatusBadRequest, "INVALID_NEW_PASSWORD", "รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษรและไม่เกิน 72 ไบต์")
		return
	}
	passwords, ok := h.Store.(passwordStore)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "PASSWORD_STORE_UNAVAILABLE", "ระบบเปลี่ยนรหัสผ่านยังไม่พร้อมใช้งาน")
		return
	}
	hash, err := passwords.MemberPasswordHash(r.Context(), int64(memberID))
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "ไม่พบบัญชีสมาชิก กรุณาเข้าสู่ระบบใหม่")
		} else {
			internal(w, err)
		}
		return
	}
	if !auth.CheckPassword(hash, req.CurrentPassword) {
		writeError(w, http.StatusUnauthorized, "CURRENT_PASSWORD_INVALID", "รหัสผ่านเดิมไม่ถูกต้อง")
		return
	}
	newHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		internal(w, err)
		return
	}
	if err := passwords.UpdatePasswordHash(r.Context(), int64(memberID), newHash); err != nil {
		internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
