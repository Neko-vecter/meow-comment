package token

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

const (
	Length = 128
	chars  = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
)

func Generate() (string, error) {
	result := make([]byte, Length)
	random := make([]byte, Length)

	if _, err := rand.Read(random); err != nil {
		return "", err
	}

	for index := range result {
		result[index] = chars[int(random[index])%len(chars)]
	}

	return string(result), nil
}

func Hash(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}

func Validate(value string) error {
	if len(value) != Length {
		return errors.New("token must be 128 characters")
	}
	for _, character := range value {
		if !isAlphaNumeric(character) {
			return errors.New("token must contain only letters and numbers")
		}
	}
	return nil
}

func isAlphaNumeric(character rune) bool {
	return character >= 'a' && character <= 'z' ||
		character >= 'A' && character <= 'Z' ||
		character >= '0' && character <= '9'
}
