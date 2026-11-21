package admin

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"moew-comment/backend/internal/config"
	"moew-comment/backend/internal/store"
)

const (
	OIDCProvidersPath       = "/api/admin/oidc/providers"
	OIDCLoginOptionsPath    = "/api/admin/auth/oidc/providers"
	OIDCCallbackPath        = "/api/admin/auth/oidc/callback"
	OIDCExchangePath        = "/api/admin/auth/oidc/exchange"
	OIDCLoginPathPrefix     = "/api/admin/auth/oidc/"
	oidcStateCookiePrefix   = "meow_oidc_state_"
	oidcStateLifetime       = 10 * time.Minute
	oidcTicketLifetime      = time.Minute
	oidcDiscoveryTimeout    = 10 * time.Second
	maxOIDCProviderBodySize = 16 << 10
)

type OIDCProviderInput struct {
	Name         string `json:"name"`
	Issuer       string `json:"issuer"`
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RedirectURI  string `json:"redirect_uri"`
}

type OIDCProviderSummary struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Issuer      string    `json:"issuer"`
	ClientID    string    `json:"client_id"`
	RedirectURI string    `json:"redirect_uri"`
	CreatedAt   time.Time `json:"created_at"`
}

type OIDCLoginOption struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type OIDCProviderDeleteResult struct {
	DeletedUserIDs []string      `json:"deleted_user_ids"`
	UpdatedUsers   []UserSummary `json:"updated_users"`
}

type oidcFlow struct {
	mu           sync.Mutex
	transactions map[string]oidcTransaction
	tickets      map[string]oidcTicket
}

type oidcTransaction struct {
	ProviderID   string
	Nonce        string
	PKCEVerifier string
	ReturnURL    string
	Remember     bool
	ExpiresAt    time.Time
}

type oidcTicket struct {
	Session   SessionResponse
	Remember  bool
	ExpiresAt time.Time
}

type oidcUserClaims struct {
	Subject           string `json:"sub"`
	Email             string `json:"email"`
	Name              string `json:"name"`
	PreferredUsername string `json:"preferred_username"`
}

func deriveOIDCSecretKey(adminKey string) []byte {
	key := sha256.Sum256([]byte("meow-comment OIDC client secret v1\x00" + adminKey))
	return key[:]
}

func newOIDCFlow() *oidcFlow {
	return &oidcFlow{
		transactions: make(map[string]oidcTransaction),
		tickets:      make(map[string]oidcTicket),
	}
}

func (s *Service) CreateOIDCProvider(input OIDCProviderInput) (OIDCProviderSummary, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.Issuer = strings.TrimSpace(input.Issuer)
	input.ClientID = strings.TrimSpace(input.ClientID)
	input.RedirectURI = strings.TrimSpace(input.RedirectURI)
	if input.Name == "" || len(input.Name) > 80 {
		return OIDCProviderSummary{}, errors.New("provider name must be between 1 and 80 characters")
	}
	if input.ClientID == "" || len(input.ClientID) > 512 {
		return OIDCProviderSummary{}, errors.New("client id is required")
	}
	if input.ClientSecret == "" || len(input.ClientSecret) > 4096 {
		return OIDCProviderSummary{}, errors.New("client secret is required")
	}
	if err := validateOIDCIssuer(input.Issuer); err != nil {
		return OIDCProviderSummary{}, err
	}
	if err := validateOIDCURL(input.RedirectURI); err != nil {
		return OIDCProviderSummary{}, fmt.Errorf("redirect uri: %w", err)
	}
	redirectURL, _ := url.Parse(input.RedirectURI)
	if redirectURL.Path != OIDCCallbackPath || redirectURL.RawQuery != "" || redirectURL.Fragment != "" {
		return OIDCProviderSummary{}, fmt.Errorf("redirect uri path must be %s and cannot include a query or fragment", OIDCCallbackPath)
	}
	if len(s.secretKey) == 0 {
		return OIDCProviderSummary{}, errors.New("OIDC secret encryption is unavailable")
	}
	if _, err := discoverOIDCProvider(input.Issuer); err != nil {
		return OIDCProviderSummary{}, fmt.Errorf("discover OIDC issuer: %w", err)
	}
	encrypted, err := encryptOIDCSecret(s.secretKey, input.ClientSecret)
	if err != nil {
		return OIDCProviderSummary{}, err
	}
	created, err := s.database.CreateOIDCProvider(store.OIDCProvider{
		Name:         input.Name,
		Issuer:       input.Issuer,
		ClientID:     input.ClientID,
		ClientSecret: encrypted,
		RedirectURI:  input.RedirectURI,
	})
	if err != nil {
		return OIDCProviderSummary{}, err
	}
	return summarizeOIDCProvider(created), nil
}

func (s *Service) ListOIDCProviders() ([]OIDCProviderSummary, error) {
	providers, err := s.database.ListOIDCProviders()
	if err != nil {
		return nil, err
	}
	summaries := make([]OIDCProviderSummary, 0, len(providers))
	for _, provider := range providers {
		summaries = append(summaries, summarizeOIDCProvider(provider))
	}
	return summaries, nil
}

func (s *Service) UpdateOIDCProvider(providerID string, input OIDCProviderInput) (OIDCProviderSummary, error) {
	current, err := s.database.GetOIDCProvider(providerID)
	if err != nil {
		return OIDCProviderSummary{}, err
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Issuer = strings.TrimSpace(input.Issuer)
	input.ClientID = strings.TrimSpace(input.ClientID)
	input.RedirectURI = strings.TrimSpace(input.RedirectURI)
	if input.Name == "" || len(input.Name) > 80 {
		return OIDCProviderSummary{}, errors.New("provider name must be between 1 and 80 characters")
	}
	if input.ClientID == "" || len(input.ClientID) > 512 {
		return OIDCProviderSummary{}, errors.New("client id is required")
	}
	if err := validateOIDCIssuer(input.Issuer); err != nil {
		return OIDCProviderSummary{}, err
	}
	if err := validateOIDCURL(input.RedirectURI); err != nil {
		return OIDCProviderSummary{}, fmt.Errorf("redirect uri: %w", err)
	}
	redirectURL, _ := url.Parse(input.RedirectURI)
	if redirectURL.Path != OIDCCallbackPath || redirectURL.RawQuery != "" || redirectURL.Fragment != "" {
		return OIDCProviderSummary{}, fmt.Errorf("redirect uri path must be %s and cannot include a query or fragment", OIDCCallbackPath)
	}
	if _, err := discoverOIDCProvider(input.Issuer); err != nil {
		return OIDCProviderSummary{}, fmt.Errorf("discover OIDC issuer: %w", err)
	}

	encryptedSecret := current.ClientSecret
	if input.ClientSecret != "" {
		if len(input.ClientSecret) > 4096 {
			return OIDCProviderSummary{}, errors.New("client secret cannot exceed 4096 characters")
		}
		encryptedSecret, err = encryptOIDCSecret(s.secretKey, input.ClientSecret)
		if err != nil {
			return OIDCProviderSummary{}, err
		}
	}
	updated, err := s.database.UpdateOIDCProvider(store.OIDCProvider{
		ID:           current.ID,
		Name:         input.Name,
		Issuer:       input.Issuer,
		ClientID:     input.ClientID,
		ClientSecret: encryptedSecret,
		RedirectURI:  input.RedirectURI,
		CreatedAt:    current.CreatedAt,
	})
	if err != nil {
		return OIDCProviderSummary{}, err
	}
	return summarizeOIDCProvider(updated), nil
}

func (s *Service) DeleteOIDCProvider(providerID string) (OIDCProviderDeleteResult, error) {
	deletedUserIDs, updatedUsers, err := s.database.DeleteOIDCProvider(providerID)
	if err != nil {
		return OIDCProviderDeleteResult{}, err
	}
	result := OIDCProviderDeleteResult{
		DeletedUserIDs: deletedUserIDs,
		UpdatedUsers:   make([]UserSummary, 0, len(updatedUsers)),
	}
	for _, user := range updatedUsers {
		result.UpdatedUsers = append(result.UpdatedUsers, summarizeUser(user))
	}
	return result, nil
}

func (s *Service) ListOIDCLoginOptions() ([]OIDCLoginOption, error) {
	providers, err := s.database.ListOIDCProviders()
	if err != nil {
		return nil, err
	}
	options := make([]OIDCLoginOption, 0, len(providers))
	for _, provider := range providers {
		options = append(options, OIDCLoginOption{ID: provider.ID, Name: provider.Name})
	}
	return options, nil
}

func summarizeOIDCProvider(provider store.OIDCProvider) OIDCProviderSummary {
	return OIDCProviderSummary{
		ID:          provider.ID,
		Name:        provider.Name,
		Issuer:      provider.Issuer,
		ClientID:    provider.ClientID,
		RedirectURI: provider.RedirectURI,
		CreatedAt:   provider.CreatedAt,
	}
}

func (s *Service) getOIDCProvider(providerID string) (store.OIDCProvider, error) {
	provider, err := s.database.GetOIDCProvider(providerID)
	if err != nil {
		return store.OIDCProvider{}, err
	}
	if len(s.secretKey) == 0 {
		return store.OIDCProvider{}, errors.New("OIDC secret encryption key is unavailable")
	}
	provider.ClientSecret, err = decryptOIDCSecret(s.secretKey, provider.ClientSecret)
	if err != nil {
		return store.OIDCProvider{}, err
	}
	return provider, nil
}

func encryptOIDCSecret(key []byte, secret string) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("initialize OIDC secret encryption: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("initialize OIDC secret encryption: %w", err)
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate OIDC secret nonce: %w", err)
	}
	sealed := aead.Seal(nonce, nonce, []byte(secret), []byte("meow-comment-oidc-secret-v1"))
	return "enc:v1:" + base64.RawStdEncoding.EncodeToString(sealed), nil
}

func decryptOIDCSecret(key []byte, encrypted string) (string, error) {
	if !strings.HasPrefix(encrypted, "enc:v1:") {
		return "", errors.New("stored OIDC client secret has an unsupported format")
	}
	sealed, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(encrypted, "enc:v1:"))
	if err != nil {
		return "", errors.New("stored OIDC client secret is invalid")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("initialize OIDC secret decryption: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("initialize OIDC secret decryption: %w", err)
	}
	if len(sealed) < aead.NonceSize() {
		return "", errors.New("stored OIDC client secret is invalid")
	}
	nonce, ciphertext := sealed[:aead.NonceSize()], sealed[aead.NonceSize():]
	secret, err := aead.Open(nil, nonce, ciphertext, []byte("meow-comment-oidc-secret-v1"))
	if err != nil {
		return "", errors.New("stored OIDC client secret cannot be decrypted")
	}
	return string(secret), nil
}

func validateOIDCIssuer(issuer string) error {
	if err := validateOIDCURL(issuer); err != nil {
		return fmt.Errorf("issuer: %w", err)
	}
	u, _ := url.Parse(issuer)
	if u.RawQuery != "" || u.Fragment != "" {
		return errors.New("issuer cannot include a query or fragment")
	}
	return nil
}

func validateOIDCURL(value string) error {
	u, err := url.Parse(strings.TrimSpace(value))
	if err != nil || u.Host == "" || u.User != nil {
		return errors.New("must be an absolute URL without user information")
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && isLoopbackHost(u.Hostname())) {
		return errors.New("must use HTTPS (HTTP is allowed only for localhost testing)")
	}
	return nil
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func discoverOIDCProvider(issuer string) (*oidc.Provider, error) {
	ctx, cancel := context.WithTimeout(context.Background(), oidcDiscoveryTimeout)
	defer cancel()
	ctx = oidc.ClientContext(ctx, newOIDCHTTPClient())
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, err
	}
	endpoint := provider.Endpoint()
	for _, value := range []string{endpoint.AuthURL, endpoint.TokenURL} {
		if value == "" {
			return nil, errors.New("issuer discovery did not provide authorization and token endpoints")
		}
		if err := validateOIDCURL(value); err != nil {
			return nil, fmt.Errorf("issuer discovery returned an unsafe endpoint: %w", err)
		}
	}
	return provider, nil
}

func newOIDCHTTPClient() *http.Client {
	return &http.Client{
		Timeout: oidcDiscoveryTimeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func (h *handler) handleOIDCProviderCollection(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.authenticate(w, r)
	if !ok || !h.requireAdmin(w, principal) {
		return
	}
	if principal.kind == authKindSession && principal.user.MustChangePassword {
		passwordChangeRequired(w)
		return
	}
	switch r.Method {
	case http.MethodGet:
		providers, err := h.service.ListOIDCProviders()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "list_failed", "list OIDC providers failed")
			return
		}
		writeJSON(w, http.StatusOK, providers)
	case http.MethodPost:
		var input OIDCProviderInput
		if !decodeJSON(w, r, maxOIDCProviderBodySize, &input) {
			return
		}
		created, err := h.service.CreateOIDCProvider(input)
		if err != nil {
			if errors.Is(err, store.ErrOIDCProviderNameExists) {
				writeError(w, http.StatusConflict, "provider_name_exists", "an OIDC source with this name already exists")
				return
			}
			writeError(w, http.StatusBadRequest, "create_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, created)
	default:
		methodNotAllowed(w)
	}
}

func (h *handler) handleOIDCProviderByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.authenticate(w, r)
	if !ok || !h.requireAdmin(w, principal) {
		return
	}
	if principal.kind == authKindSession && principal.user.MustChangePassword {
		passwordChangeRequired(w)
		return
	}
	providerID, ok := pathID(r.URL.Path, OIDCProvidersPath)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_provider_id", "OIDC source id is invalid")
		return
	}
	switch r.Method {
	case http.MethodPatch:
		var input OIDCProviderInput
		if !decodeJSON(w, r, maxOIDCProviderBodySize, &input) {
			return
		}
		updated, err := h.service.UpdateOIDCProvider(providerID, input)
		if err != nil {
			if errors.Is(err, store.ErrOIDCProviderNotFound) {
				writeError(w, http.StatusNotFound, "provider_not_found", "OIDC source not found")
				return
			}
			if errors.Is(err, store.ErrOIDCProviderNameExists) {
				writeError(w, http.StatusConflict, "provider_name_exists", "an OIDC source with this name already exists")
				return
			}
			writeError(w, http.StatusBadRequest, "update_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, updated)
	case http.MethodDelete:
		result, err := h.service.DeleteOIDCProvider(providerID)
		if err != nil {
			if errors.Is(err, store.ErrOIDCProviderNotFound) {
				writeError(w, http.StatusNotFound, "provider_not_found", "OIDC source not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "delete_failed", "delete OIDC source failed")
			return
		}
		writeJSON(w, http.StatusOK, result)
	default:
		methodNotAllowed(w)
	}
}

func (h *handler) handleOIDCLoginOptions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	options, err := h.service.ListOIDCLoginOptions()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list_failed", "list OIDC sources failed")
		return
	}
	writeJSON(w, http.StatusOK, options)
}

func (h *handler) handleOIDCLogin(w http.ResponseWriter, r *http.Request, providerID string) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	provider, err := h.service.getOIDCProvider(providerID)
	if errors.Is(err, store.ErrOIDCProviderNotFound) {
		writeError(w, http.StatusNotFound, "provider_not_found", "OIDC source not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "provider_unavailable", "OIDC source is not available")
		return
	}
	returnURL, err := validatedOIDCReturnURL(r.URL.Query().Get("return_to"), provider.RedirectURI, h.allowedOrigins)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_return_url", "login return URL is not allowed")
		return
	}
	discovery, err := discoverOIDCProvider(provider.Issuer)
	if err != nil {
		writeError(w, http.StatusBadGateway, "provider_unavailable", "OIDC source discovery failed")
		return
	}
	state, err := generateOIDCRandomValue(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "login_failed", "OIDC login could not be started")
		return
	}
	nonce, err := generateOIDCRandomValue(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "login_failed", "OIDC login could not be started")
		return
	}
	transaction := oidcTransaction{
		ProviderID:   provider.ID,
		Nonce:        nonce,
		PKCEVerifier: oauth2.GenerateVerifier(),
		ReturnURL:    returnURL,
		Remember:     r.URL.Query().Get("remember") == "true",
		ExpiresAt:    time.Now().Add(oidcStateLifetime),
	}
	h.service.oidc.putTransaction(state, transaction)
	callback, _ := url.Parse(provider.RedirectURI)
	http.SetCookie(w, &http.Cookie{
		Name:     oidcStateCookiePrefix + state,
		Value:    state,
		Path:     OIDCCallbackPath,
		MaxAge:   int(oidcStateLifetime.Seconds()),
		HttpOnly: true,
		Secure:   callback.Scheme == "https",
		SameSite: http.SameSiteLaxMode,
	})
	config := oauth2.Config{
		ClientID:     provider.ClientID,
		ClientSecret: provider.ClientSecret,
		RedirectURL:  provider.RedirectURI,
		Endpoint:     discovery.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}
	authorizationURL := config.AuthCodeURL(
		state,
		oidc.Nonce(nonce),
		oauth2.S256ChallengeOption(transaction.PKCEVerifier),
	)
	http.Redirect(w, r, authorizationURL, http.StatusFound)
}

func (h *handler) handleOIDCCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	state := r.URL.Query().Get("state")
	if state == "" || len(state) > 256 {
		writeError(w, http.StatusBadRequest, "invalid_state", "OIDC login state is invalid")
		return
	}
	cookieName := oidcStateCookiePrefix + state
	cookie, err := r.Cookie(cookieName)
	if err != nil || cookie.Value != state {
		writeError(w, http.StatusBadRequest, "invalid_state", "OIDC login state is invalid")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: OIDCCallbackPath, MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	transaction, ok := h.service.oidc.takeTransaction(state)
	if !ok {
		writeError(w, http.StatusBadRequest, "expired_state", "OIDC login state has expired")
		return
	}
	if r.URL.Query().Get("error") != "" {
		h.redirectOIDCError(w, r, transaction.ReturnURL)
		return
	}
	provider, err := h.service.getOIDCProvider(transaction.ProviderID)
	if err != nil {
		h.redirectOIDCError(w, r, transaction.ReturnURL)
		return
	}
	discovery, err := discoverOIDCProvider(provider.Issuer)
	if err != nil {
		h.redirectOIDCError(w, r, transaction.ReturnURL)
		return
	}
	config := oauth2.Config{
		ClientID:     provider.ClientID,
		ClientSecret: provider.ClientSecret,
		RedirectURL:  provider.RedirectURI,
		Endpoint:     discovery.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}
	ctx, cancel := context.WithTimeout(r.Context(), oidcDiscoveryTimeout)
	defer cancel()
	ctx = oidc.ClientContext(ctx, newOIDCHTTPClient())
	token, err := config.Exchange(ctx, r.URL.Query().Get("code"), oauth2.VerifierOption(transaction.PKCEVerifier))
	if err != nil {
		h.redirectOIDCError(w, r, transaction.ReturnURL)
		return
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		h.redirectOIDCError(w, r, transaction.ReturnURL)
		return
	}
	idToken, err := discovery.VerifierContext(ctx, &oidc.Config{ClientID: provider.ClientID}).Verify(ctx, rawIDToken)
	if err != nil || idToken.Nonce != transaction.Nonce {
		h.redirectOIDCError(w, r, transaction.ReturnURL)
		return
	}
	var claims oidcUserClaims
	if err := idToken.Claims(&claims); err != nil {
		h.redirectOIDCError(w, r, transaction.ReturnURL)
		return
	}
	if claims.Subject != "" && claims.Subject != idToken.Subject {
		h.redirectOIDCError(w, r, transaction.ReturnURL)
		return
	}
	if discovery.UserInfoEndpoint() != "" {
		userInfo, userInfoErr := discovery.UserInfo(ctx, oauth2.StaticTokenSource(token))
		if userInfoErr == nil {
			if userInfo.Subject != idToken.Subject {
				h.redirectOIDCError(w, r, transaction.ReturnURL)
				return
			}
			var userInfoClaims oidcUserClaims
			if userInfo.Claims(&userInfoClaims) == nil {
				if claims.Email == "" {
					claims.Email = userInfoClaims.Email
				}
				if claims.Name == "" {
					claims.Name = userInfoClaims.Name
				}
				if claims.PreferredUsername == "" {
					claims.PreferredUsername = userInfoClaims.PreferredUsername
				}
			}
		}
	}
	username := oidcUsername(claims, idToken.Subject, provider.ID)
	user, err := h.service.database.LoginOIDCUser(provider.ID, idToken.Subject, username, claims.Email)
	if err != nil {
		h.redirectOIDCError(w, r, transaction.ReturnURL)
		return
	}
	session, err := h.service.newSessionResponse(user)
	if err != nil {
		h.redirectOIDCError(w, r, transaction.ReturnURL)
		return
	}
	ticket, err := generateOIDCRandomValue(32)
	if err != nil {
		h.redirectOIDCError(w, r, transaction.ReturnURL)
		return
	}
	h.service.oidc.putTicket(ticket, oidcTicket{Session: session, Remember: transaction.Remember, ExpiresAt: time.Now().Add(oidcTicketLifetime)})
	h.redirectOIDCResult(w, r, transaction.ReturnURL, "oidc_ticket", ticket)
}

func (h *handler) handleOIDCExchange(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var request struct {
		Ticket string `json:"ticket"`
	}
	if !decodeJSON(w, r, 4<<10, &request) {
		return
	}
	ticket, ok := h.service.oidc.takeTicket(request.Ticket)
	if !ok {
		writeError(w, http.StatusUnauthorized, "ticket_invalid", "OIDC login ticket is invalid or expired")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": ticket.Session, "remember": ticket.Remember})
}

func (h *handler) redirectOIDCError(w http.ResponseWriter, r *http.Request, returnURL string) {
	h.redirectOIDCResult(w, r, returnURL, "oidc_error", "login_failed")
}

func (h *handler) redirectOIDCResult(w http.ResponseWriter, r *http.Request, returnURL, key, value string) {
	target, err := url.Parse(returnURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "login_failed", "OIDC login could not be completed")
		return
	}
	fragment := url.Values{}
	fragment.Set(key, value)
	target.Fragment = fragment.Encode()
	http.Redirect(w, r, target.String(), http.StatusFound)
}

func validatedOIDCReturnURL(raw, redirectURI string, allowedOrigins map[string]struct{}) (string, error) {
	if strings.TrimSpace(raw) == "" {
		target, err := url.Parse(redirectURI)
		if err != nil {
			return "", err
		}
		target.Path = "/login"
		target.RawQuery = ""
		target.Fragment = ""
		return target.String(), nil
	}
	target, err := url.Parse(raw)
	if err != nil || target.User != nil || target.Host == "" || (target.Scheme != "https" && target.Scheme != "http") {
		return "", errors.New("return url must be absolute HTTP(S)")
	}
	origin, ok := config.NormalizeOrigin(target.Scheme + "://" + target.Host)
	if !ok {
		return "", errors.New("return url origin is invalid")
	}
	if len(allowedOrigins) > 0 {
		if _, ok := allowedOrigins[origin]; !ok {
			return "", errors.New("return url origin is not allowed")
		}
	} else {
		callback, err := url.Parse(redirectURI)
		if err != nil {
			return "", err
		}
		callbackOrigin, ok := config.NormalizeOrigin(callback.Scheme + "://" + callback.Host)
		if !ok || origin != callbackOrigin {
			return "", errors.New("return url must match the callback origin")
		}
	}
	target.Fragment = ""
	if target.Path == "" {
		target.Path = "/"
	}
	return target.String(), nil
}

func oidcUsername(claims oidcUserClaims, subject, providerID string) string {
	base := strings.ToLower(strings.TrimSpace(claims.PreferredUsername))
	if base == "" {
		base = strings.ToLower(strings.TrimSpace(strings.SplitN(claims.Email, "@", 2)[0]))
	}
	if base == "" {
		base = strings.ToLower(strings.TrimSpace(claims.Name))
	}
	var sanitized strings.Builder
	lastSeparator := false
	for _, character := range base {
		allowed := character >= 'a' && character <= 'z' || character >= '0' && character <= '9' || character == '.' || character == '_' || character == '-'
		if allowed {
			sanitized.WriteRune(character)
			lastSeparator = false
			continue
		}
		if sanitized.Len() > 0 && !lastSeparator {
			sanitized.WriteByte('-')
			lastSeparator = true
		}
	}
	username := strings.Trim(sanitized.String(), "-_.")
	if len(username) > 64 {
		username = strings.TrimRight(username[:64], "-_.")
	}
	if len(username) >= 3 {
		return username
	}
	digest := sha256.Sum256([]byte(providerID + "\x00" + subject))
	return "oidc-" + base64.RawURLEncoding.EncodeToString(digest[:6])
}

func generateOIDCRandomValue(size int) (string, error) {
	value := make([]byte, size)
	if _, err := io.ReadFull(rand.Reader, value); err != nil {
		return "", fmt.Errorf("generate OIDC random value: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func (flow *oidcFlow) putTransaction(state string, transaction oidcTransaction) {
	flow.mu.Lock()
	defer flow.mu.Unlock()
	flow.pruneExpiredLocked(time.Now())
	flow.transactions[state] = transaction
}

func (flow *oidcFlow) takeTransaction(state string) (oidcTransaction, bool) {
	flow.mu.Lock()
	defer flow.mu.Unlock()
	transaction, ok := flow.transactions[state]
	delete(flow.transactions, state)
	if !ok || !time.Now().Before(transaction.ExpiresAt) {
		return oidcTransaction{}, false
	}
	return transaction, true
}

func (flow *oidcFlow) putTicket(value string, ticket oidcTicket) {
	flow.mu.Lock()
	defer flow.mu.Unlock()
	flow.pruneExpiredLocked(time.Now())
	flow.tickets[value] = ticket
}

func (flow *oidcFlow) takeTicket(value string) (oidcTicket, bool) {
	flow.mu.Lock()
	defer flow.mu.Unlock()
	ticket, ok := flow.tickets[value]
	delete(flow.tickets, value)
	if !ok || !time.Now().Before(ticket.ExpiresAt) {
		return oidcTicket{}, false
	}
	return ticket, true
}

func (flow *oidcFlow) pruneExpiredLocked(now time.Time) {
	for state, transaction := range flow.transactions {
		if !now.Before(transaction.ExpiresAt) {
			delete(flow.transactions, state)
		}
	}
	for ticket, record := range flow.tickets {
		if !now.Before(record.ExpiresAt) {
			delete(flow.tickets, ticket)
		}
	}
}
