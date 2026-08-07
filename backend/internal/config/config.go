package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
)

type Config struct {
	Listen              string   `json:"listen"`
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
	if strings.TrimSpace(cfg.ProxyIPHeader) == "" {
		cfg.ProxyIPHeader = "X-Forwarded-For"
	}

	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func (c Config) Validate() error {
	if strings.TrimSpace(c.Listen) == "" {
		return errors.New("listen is required")
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
