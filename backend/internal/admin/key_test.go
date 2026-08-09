package admin

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerateKeyFormat(t *testing.T) {
	key, err := GenerateKey()
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	if !strings.HasPrefix(key, KeyPrefix) {
		t.Fatalf("key %q does not start with %q", key, KeyPrefix)
	}
	if err := ValidateKey(key); err != nil {
		t.Fatalf("ValidateKey() error = %v", err)
	}
	if err := ValidateKey("wrong_key"); err == nil {
		t.Fatal("ValidateKey() accepted an invalid key")
	}
}

func TestLoadOrCreateKeyPreservesExistingKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "admin.key")

	first, err := LoadOrCreateKey(path)
	if err != nil {
		t.Fatalf("first LoadOrCreateKey() error = %v", err)
	}
	second, err := LoadOrCreateKey(path)
	if err != nil {
		t.Fatalf("second LoadOrCreateKey() error = %v", err)
	}
	if first != second {
		t.Fatalf("key changed between loads: %q != %q", first, second)
	}
	if contents, err := os.ReadFile(path); err != nil || strings.TrimSpace(string(contents)) != first {
		t.Fatalf("key file does not contain the generated key: contents=%q error=%v", contents, err)
	}
}
