package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	MinPasswordLength = 12
	MaxPasswordLength = 128

	passwordSaltLength = 16
	passwordKeyLength  = 32
	passwordMemory     = 64 * 1024
	passwordIterations = 3
	passwordThreads    = 2
)

var ErrInvalidPasswordHash = errors.New("invalid password hash")

// ValidatePassword applies the password policy used by both generated and
// user-selected passwords. The generated temporary password is returned only
// once by the create-user API.
func ValidatePassword(password string) error {
	if len(password) < MinPasswordLength {
		return fmt.Errorf("password must be at least %d characters", MinPasswordLength)
	}
	if len(password) > MaxPasswordLength {
		return fmt.Errorf("password must be at most %d characters", MaxPasswordLength)
	}
	return nil
}

func HashPassword(password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}

	salt := make([]byte, passwordSaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate password salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, passwordIterations, passwordMemory, passwordThreads, passwordKeyLength)
	return strings.Join([]string{
		"argon2id",
		"v=19",
		fmt.Sprintf("m=%d,t=%d,p=%d", passwordMemory, passwordIterations, passwordThreads),
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	}, "$"), nil
}

func VerifyPassword(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 5 || parts[0] != "argon2id" || parts[1] != "v=19" {
		return false, ErrInvalidPasswordHash
	}
	if parts[2] != fmt.Sprintf("m=%d,t=%d,p=%d", passwordMemory, passwordIterations, passwordThreads) {
		return false, ErrInvalidPasswordHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil || len(salt) != passwordSaltLength {
		return false, ErrInvalidPasswordHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(want) != passwordKeyLength {
		return false, ErrInvalidPasswordHash
	}
	if err := ValidatePassword(password); err != nil {
		return false, nil
	}
	got := argon2.IDKey([]byte(password), salt, passwordIterations, passwordMemory, passwordThreads, passwordKeyLength)
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

func GenerateTemporaryPassword() (string, error) {
	return generateRandomString(18)
}

func GenerateSessionToken() (string, error) {
	random, err := generateRandomString(32)
	if err != nil {
		return "", err
	}
	return "meow_comment_session_" + random, nil
}

func HashSessionToken(token string) string {
	digest := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(digest[:])
}

func generateRandomString(size int) (string, error) {
	random := make([]byte, size)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("generate random value: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(random), nil
}
