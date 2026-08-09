package admin

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const KeyPrefix = "meow_comment_"

func GenerateKey() (string, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("generate admin key: %w", err)
	}
	return KeyPrefix + base64.RawURLEncoding.EncodeToString(random), nil
}

func ValidateKey(value string) error {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, KeyPrefix) {
		return errors.New("admin key has an invalid prefix")
	}
	encoded := strings.TrimPrefix(value, KeyPrefix)
	decoded, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil || len(decoded) != 32 {
		return errors.New("admin key has an invalid payload")
	}
	return nil
}

func KeysEqual(expected, actual string) bool {
	expected = strings.TrimSpace(expected)
	actual = strings.TrimSpace(actual)
	if len(expected) != len(actual) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) == 1
}

func LoadKey(path string) (string, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return "", fmt.Errorf("read admin key: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("admin key file must not be a symbolic link")
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read admin key: %w", err)
	}
	key := strings.TrimSpace(string(contents))
	if err := ValidateKey(key); err != nil {
		return "", err
	}
	return key, nil
}

func LoadOrCreateKey(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("admin key file is required")
	}

	key, err := LoadKey(path)
	if err == nil {
		if chmodErr := os.Chmod(path, 0600); chmodErr != nil {
			return "", fmt.Errorf("protect admin key: %w", chmodErr)
		}
		return key, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}

	if directory := filepath.Dir(path); directory != "." {
		if err := os.MkdirAll(directory, 0700); err != nil {
			return "", fmt.Errorf("create admin key directory: %w", err)
		}
	}
	key, err = GenerateKey()
	if err != nil {
		return "", err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			return LoadOrCreateKey(path)
		}
		return "", fmt.Errorf("create admin key: %w", err)
	}
	if _, writeErr := file.WriteString(key + "\n"); writeErr != nil {
		file.Close()
		_ = os.Remove(path)
		return "", fmt.Errorf("write admin key: %w", writeErr)
	}
	if syncErr := file.Sync(); syncErr != nil {
		file.Close()
		return "", fmt.Errorf("sync admin key: %w", syncErr)
	}
	if closeErr := file.Close(); closeErr != nil {
		return "", fmt.Errorf("close admin key: %w", closeErr)
	}
	return key, nil
}
