package auth

import "golang.org/x/crypto/bcrypt"

// HashPassword creates a one-way bcrypt hash for storing in members.password_hash.
// Callers should never persist or log the plain-text password.
func HashPassword(plain string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// CheckPassword reports whether plain matches a bcrypt hash from the member store.
func CheckPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
