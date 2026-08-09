package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

const oldConfig = `{
  "listen": "127.0.0.1:9100",
  "db_path": "/tmp/comments.db",
  "proxy_ip_header": "X-Forwarded-For",
  "rss_title": "Meow Comment RSS",
  "rss_link": "https://comment.example.test",
  "captcha_enabled": false,
  "allowed_sites_enabled": true,
  "allowed_sites": ["https://blog.example.test"]
}`

func TestLoadAppliesAdminDefaultsToOldConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(oldConfig), 0600); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.AdminListen != DefaultAdminListen {
		t.Fatalf("AdminListen = %q", cfg.AdminListen)
	}
	expectedKeyPath := DefaultAdminKeyFile()
	if !filepath.IsAbs(expectedKeyPath) {
		expectedKeyPath = filepath.Join(filepath.Dir(path), expectedKeyPath)
	}
	if cfg.AdminKeyFile != expectedKeyPath {
		t.Fatalf("AdminKeyFile = %q", cfg.AdminKeyFile)
	}
}

func TestMigrateFileAddsFieldsWithoutOverwritingExistingValues(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(oldConfig), 0600); err != nil {
		t.Fatal(err)
	}
	changed, err := MigrateFile(path)
	if err != nil {
		t.Fatalf("MigrateFile() error = %v", err)
	}
	if !changed {
		t.Fatal("MigrateFile() reported no change")
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() after migration error = %v", err)
	}
	expectedKeyPath := DefaultAdminKeyFile()
	if !filepath.IsAbs(expectedKeyPath) {
		expectedKeyPath = filepath.Join(filepath.Dir(path), expectedKeyPath)
	}
	if cfg.AdminListen != DefaultAdminListen || cfg.AdminKeyFile != expectedKeyPath {
		t.Fatalf("migrated admin settings = listen:%q key:%q", cfg.AdminListen, cfg.AdminKeyFile)
	}
	changed, err = MigrateFile(path)
	if err != nil {
		t.Fatalf("second MigrateFile() error = %v", err)
	}
	if changed {
		t.Fatal("second MigrateFile() changed an already migrated config")
	}

	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(contents, &raw); err != nil {
		t.Fatal(err)
	}
	if _, ok := raw["admin_listen"]; !ok {
		t.Fatal("admin_listen was not persisted")
	}
	if _, ok := raw["admin_key_file"]; !ok {
		t.Fatal("admin_key_file was not persisted")
	}
}

func TestValidateRejectsNonLoopbackAdminListen(t *testing.T) {
	cfg := Config{
		Listen:              "127.0.0.1:9100",
		AdminListen:         "0.0.0.0:9101",
		AdminKeyFile:        "admin.key",
		DBPath:              "/tmp/comments.db",
		RSSTitle:            "Meow Comment RSS",
		RSSLink:             "https://comment.example.test",
		AllowedSitesEnabled: false,
	}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate() accepted a non-loopback admin address")
	}
}
