package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

const (
	DefaultAdminListen         = "127.0.0.1:9101"
	DefaultAdminKeyFileUnix    = "/var/lib/meow-comment/admin.key"
	DefaultAdminKeyFileWindows = "admin.key"
)

type Config struct {
	Listen              string   `json:"listen"`
	AdminListen         string   `json:"admin_listen"`
	AdminKeyFile        string   `json:"admin_key_file"`
	DBPath              string   `json:"db_path"`
	ProxyIPHeader       string   `json:"proxy_ip_header"`
	RSSTitle            string   `json:"rss_title"`
	RSSLink             string   `json:"rss_link"`
	CaptchaEnabled      bool     `json:"captcha_enabled"`
	AllowedSitesEnabled bool     `json:"allowed_sites_enabled"`
	AllowedSites        []string `json:"allowed_sites"`
}

func Load(path string) (Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return Config{}, fmt.Errorf("open config: %w", err)
	}
	defer file.Close()

	var cfg Config
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&cfg); err != nil {
		return Config{}, fmt.Errorf("decode config: %w", err)
	}
	applyDefaults(&cfg)
	if !filepath.IsAbs(cfg.AdminKeyFile) {
		cfg.AdminKeyFile = filepath.Join(filepath.Dir(path), cfg.AdminKeyFile)
	}

	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func applyDefaults(cfg *Config) {
	if strings.TrimSpace(cfg.ProxyIPHeader) == "" {
		cfg.ProxyIPHeader = "X-Forwarded-For"
	}
	if strings.TrimSpace(cfg.AdminListen) == "" {
		cfg.AdminListen = DefaultAdminListen
	}
	if strings.TrimSpace(cfg.AdminKeyFile) == "" {
		cfg.AdminKeyFile = DefaultAdminKeyFile()
	}
}

func DefaultAdminKeyFile() string {
	if runtime.GOOS == "windows" {
		return DefaultAdminKeyFileWindows
	}
	return DefaultAdminKeyFileUnix
}

func (c Config) Validate() error {
	if strings.TrimSpace(c.Listen) == "" {
		return errors.New("listen is required")
	}
	if err := ValidateAdminListen(c.AdminListen); err != nil {
		return fmt.Errorf("admin_listen: %w", err)
	}
	if strings.TrimSpace(c.AdminKeyFile) == "" {
		return errors.New("admin_key_file is required")
	}
	if strings.TrimSpace(c.DBPath) == "" {
		return errors.New("db_path is required")
	}
	if strings.TrimSpace(c.RSSTitle) == "" {
		return errors.New("rss_title is required")
	}
	if err := validateURL(c.RSSLink); err != nil {
		return fmt.Errorf("rss_link: %w", err)
	}

	for _, site := range c.AllowedSites {
		if _, ok := normalizeOrigin(site); !ok {
			return fmt.Errorf("allowed_sites contains invalid origin: %q", site)
		}
	}

	if c.AllowedSitesEnabled && len(c.AllowedSites) == 0 {
		return errors.New("allowed_sites is required when allowed_sites_enabled is true")
	}

	return nil
}

func ValidateAdminListen(value string) error {
	host, port, err := net.SplitHostPort(strings.TrimSpace(value))
	if err != nil {
		return errors.New("must be a host:port address")
	}
	if net.ParseIP(host) == nil || (host != "127.0.0.1" && host != "::1") {
		return errors.New("must use the loopback address 127.0.0.1 or ::1")
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return errors.New("must use a valid TCP port")
	}
	return nil
}

// MigrateFile adds fields introduced after the original configuration format.
// It preserves existing values and returns true only when the file changed.
func MigrateFile(path string) (bool, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return false, fmt.Errorf("read config: %w", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(contents, &raw); err != nil {
		return false, fmt.Errorf("decode config: %w", err)
	}
	var cfg Config
	decoder := json.NewDecoder(bytes.NewReader(contents))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cfg); err != nil {
		return false, fmt.Errorf("decode config: %w", err)
	}
	if err := ensureDecoderEOF(decoder); err != nil {
		return false, fmt.Errorf("decode config: %w", err)
	}

	changed := false
	if _, ok := raw["admin_listen"]; !ok {
		adminListen, marshalErr := json.Marshal(DefaultAdminListen)
		if marshalErr != nil {
			return false, fmt.Errorf("encode admin_listen: %w", marshalErr)
		}
		raw["admin_listen"] = adminListen
		changed = true
	}
	if _, ok := raw["admin_key_file"]; !ok {
		defaultKeyFile, marshalErr := json.Marshal(DefaultAdminKeyFile())
		if marshalErr != nil {
			return false, fmt.Errorf("encode admin_key_file: %w", marshalErr)
		}
		raw["admin_key_file"] = defaultKeyFile
		changed = true
	}

	if !changed {
		applyDefaults(&cfg)
		if err := cfg.Validate(); err != nil {
			return false, err
		}
		return false, nil
	}

	// Validate the migrated result before touching the file.
	updated, err := json.Marshal(raw)
	if err != nil {
		return false, fmt.Errorf("encode config: %w", err)
	}
	var migrated Config
	decoder = json.NewDecoder(bytes.NewReader(updated))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&migrated); err != nil {
		return false, fmt.Errorf("decode migrated config: %w", err)
	}
	applyDefaults(&migrated)
	if err := migrated.Validate(); err != nil {
		return false, err
	}

	formatted, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return false, fmt.Errorf("format config: %w", err)
	}
	formatted = append(formatted, '\n')
	if err := replaceFile(path, formatted); err != nil {
		return false, err
	}
	return true, nil
}

func ensureDecoderEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return errors.New("multiple JSON values")
		}
		return err
	}
	return nil
}

func replaceFile(path string, contents []byte) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("stat config: %w", err)
	}
	directory := filepath.Dir(path)
	base := filepath.Base(path)
	temporary, err := os.CreateTemp(directory, "."+base+".migration-*")
	if err != nil {
		return fmt.Errorf("create temporary config: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(info.Mode().Perm()); err != nil {
		temporary.Close()
		return fmt.Errorf("set temporary config permissions: %w", err)
	}
	if _, err := temporary.Write(contents); err != nil {
		temporary.Close()
		return fmt.Errorf("write temporary config: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return fmt.Errorf("sync temporary config: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary config: %w", err)
	}

	if runtime.GOOS != "windows" {
		if err := os.Rename(temporaryPath, path); err != nil {
			return fmt.Errorf("replace config: %w", err)
		}
		return nil
	}

	backupPath := path + ".migration-backup"
	_ = os.Remove(backupPath)
	if err := os.Rename(path, backupPath); err != nil {
		return fmt.Errorf("move original config: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		_ = os.Rename(backupPath, path)
		return fmt.Errorf("replace config: %w", err)
	}
	if err := os.Remove(backupPath); err != nil {
		return fmt.Errorf("remove config backup: %w", err)
	}
	return nil
}

func validateURL(value string) error {
	u, err := url.Parse(strings.TrimSpace(value))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return errors.New("must be an absolute URL")
	}
	return nil
}

func normalizeOrigin(value string) (string, bool) {
	u, err := url.Parse(strings.TrimSpace(value))
	if err != nil || u.User != nil || u.Scheme == "" || u.Host == "" {
		return "", false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", false
	}

	return strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host), true
}

func AllowedOrigins(sites []string) map[string]struct{} {
	allowed := make(map[string]struct{}, len(sites))
	for _, site := range sites {
		if origin, ok := normalizeOrigin(site); ok {
			allowed[origin] = struct{}{}
		}
	}
	return allowed
}

func NormalizeOrigin(value string) (string, bool) {
	return normalizeOrigin(value)
}
