package mw

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type authContextKey uint8

const (
	memberIDKey authContextKey = iota
	roleKey
)

// TokenParser verifies a bearer token and returns the authenticated member ID
// and role.
type TokenParser interface {
	Parse(token string) (int64, string, error)
}

// WithIdentity stores claims only after a trusted token parser has verified
// them.
func WithIdentity(ctx context.Context, memberID int64, role string) context.Context {
	ctx = context.WithValue(ctx, memberIDKey, memberID)
	return context.WithValue(ctx, roleKey, role)
}

func MemberID(ctx context.Context) (int64, bool) {
	id, ok := ctx.Value(memberIDKey).(int64)
	return id, ok && id > 0
}

func Role(ctx context.Context) string {
	role, _ := ctx.Value(roleKey).(string)
	return role
}

func authError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{"code": code, "message": message},
	})
}

// RequireLogin attaches a verified identity to the request context.
func RequireLogin(parser TokenParser, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if parser == nil {
			authError(w, http.StatusServiceUnavailable, "AUTH_UNAVAILABLE", "ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน")
			return
		}
		parts := strings.Fields(r.Header.Get("Authorization"))
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			authError(w, http.StatusUnauthorized, "NO_TOKEN", "กรุณาเข้าสู่ระบบก่อน")
			return
		}
		memberID, role, err := parser.Parse(parts[1])
		if err != nil || memberID <= 0 || (role != "member" && role != "admin") {
			authError(w, http.StatusUnauthorized, "BAD_TOKEN", "ตั๋วไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่")
			return
		}
		next.ServeHTTP(w, r.WithContext(WithIdentity(r.Context(), memberID, role)))
	})
}

// OptionalLogin verifies a supplied bearer token but allows requests without
// one to continue anonymously. It is used for public favorite counts.
func OptionalLogin(parser TokenParser, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := strings.TrimSpace(r.Header.Get("Authorization"))
		if header == "" {
			next.ServeHTTP(w, r)
			return
		}
		if parser == nil {
			authError(w, http.StatusServiceUnavailable, "AUTH_UNAVAILABLE", "ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน")
			return
		}
		parts := strings.Fields(header)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			authError(w, http.StatusUnauthorized, "BAD_TOKEN", "ตั๋วไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่")
			return
		}
		memberID, role, err := parser.Parse(parts[1])
		if err != nil || memberID <= 0 || (role != "member" && role != "admin") {
			authError(w, http.StatusUnauthorized, "BAD_TOKEN", "ตั๋วไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่")
			return
		}
		next.ServeHTTP(w, r.WithContext(WithIdentity(r.Context(), memberID, role)))
	})
}

// RequireRole enforces an authenticated role, returning 401 when identity is
// missing and 403 when the role is insufficient.
func RequireRole(role string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := MemberID(r.Context()); !ok {
			authError(w, http.StatusUnauthorized, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบก่อน")
			return
		}
		if Role(r.Context()) != role {
			authError(w, http.StatusForbidden, "FORBIDDEN", "ต้องเป็น "+role+" เท่านั้น")
			return
		}
		next.ServeHTTP(w, r)
	})
}
