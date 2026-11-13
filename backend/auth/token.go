package auth

import (
	"errors"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims contains the AniWatchlist member role and standard JWT claims.
type Claims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

// Issuer signs and verifies authentication tokens for AniWatchlist members.
type Issuer struct {
	Secret []byte
	TTL    time.Duration
}

// Issue creates a signed token for a member.
func (i *Issuer) Issue(memberID int64, role string) (string, error) {
	if memberID <= 0 {
		return "", errors.New("member ID must be positive")
	}
	if role != "member" && role != "admin" {
		return "", errors.New("invalid member role")
	}
	if len(i.Secret) == 0 {
		return "", errors.New("JWT secret is required")
	}
	if i.TTL <= 0 {
		return "", errors.New("JWT TTL must be positive")
	}

	now := time.Now()
	claims := Claims{
		Role: role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(memberID, 10),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(i.TTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(i.Secret)
}

// Parse validates a token and returns its AniWatchlist member ID and role.
func (i *Issuer) Parse(tokenString string) (int64, string, error) {
	if len(i.Secret) == 0 {
		return 0, "", errors.New("JWT secret is required")
	}

	var claims Claims
	token, err := jwt.ParseWithClaims(tokenString, &claims,
		func(token *jwt.Token) (any, error) {
			return i.Secret, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return 0, "", err
	}
	if token == nil || !token.Valid {
		return 0, "", errors.New("invalid token")
	}

	memberID, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || memberID <= 0 {
		return 0, "", errors.New("bad subject")
	}
	if claims.Role != "member" && claims.Role != "admin" {
		return 0, "", errors.New("bad role")
	}
	return memberID, claims.Role, nil
}
