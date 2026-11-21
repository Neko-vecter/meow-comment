package store

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"go.etcd.io/bbolt"

	"moew-comment/backend/internal/id"
	"moew-comment/backend/internal/token"
)

var (
	commentsBucket       = []byte("comments")
	tokensBucket         = []byte("rss_tokens")
	usersBucket          = []byte("users")
	sessionsBucket       = []byte("sessions")
	oidcProvidersBucket  = []byte("oidc_providers")
	oidcIdentitiesBucket = []byte("oidc_identities")

	ErrTokenNameExists        = errors.New("token name already exists")
	ErrTokenNotFound          = errors.New("token not found")
	ErrCommentNotFound        = errors.New("comment not found")
	ErrUserNameExists         = errors.New("username already exists")
	ErrUserNotFound           = errors.New("user not found")
	ErrAdminRoleImmutable     = errors.New("admin user role cannot be changed")
	ErrSessionNotFound        = errors.New("session not found")
	ErrSessionExpired         = errors.New("session expired")
	ErrOIDCProviderNotFound   = errors.New("OIDC provider not found")
	ErrOIDCProviderNameExists = errors.New("OIDC provider name already exists")
)

const (
	UserRoleAdmin    = "admin"
	UserRoleViewer   = "viewer"
	UserRoleReviewer = "reviewer"
)

type Store struct {
	db *bbolt.DB
}

type Comment struct {
	ID         string    `json:"id"`
	Username   string    `json:"username"`
	Email      string    `json:"email"`
	Comments   string    `json:"comments"`
	SourcePath string    `json:"source_path"`
	PageTitle  string    `json:"page_title"`
	UserAgent  string    `json:"user_agent"`
	IPAddress  string    `json:"ip_address"`
	Origin     string    `json:"origin"`
	Referer    string    `json:"referer"`
	CreatedAt  time.Time `json:"created_at"`
	Completed  bool      `json:"completed"`
}

type Token struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Hash      string    `json:"hash"`
	CreatedAt time.Time `json:"created_at"`
}

type User struct {
	ID                 string            `json:"id"`
	Username           string            `json:"username"`
	Email              string            `json:"email,omitempty"`
	Role               string            `json:"role"`
	OIDCProviderIDs    []string          `json:"oidc_provider_ids,omitempty"`
	PasswordHash       string            `json:"password_hash"`
	MustChangePassword bool              `json:"must_change_password"`
	TOTPSecret         string            `json:"totp_secret,omitempty"`
	FIDO2Credentials   []FIDO2Credential `json:"fido2_credentials,omitempty"`
	CreatedAt          time.Time         `json:"created_at"`
}

type OIDCProvider struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Issuer       string    `json:"issuer"`
	ClientID     string    `json:"client_id"`
	ClientSecret string    `json:"client_secret"`
	RedirectURI  string    `json:"redirect_uri"`
	CreatedAt    time.Time `json:"created_at"`
}

type OIDCIdentity struct {
	ProviderID  string    `json:"provider_id"`
	Subject     string    `json:"subject"`
	UserID      string    `json:"user_id"`
	Email       string    `json:"email,omitempty"`
	DisplayName string    `json:"display_name,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	LastLoginAt time.Time `json:"last_login_at"`
}

// FIDO2Credential is persisted as part of the user model so adding WebAuthn
// later does not require another user record format migration.
type FIDO2Credential struct {
	ID        string `json:"id"`
	PublicKey string `json:"public_key"`
	SignCount uint32 `json:"sign_count"`
}

type Session struct {
	TokenHash string    `json:"token_hash"`
	UserID    string    `json:"user_id"`
	ExpiresAt time.Time `json:"expires_at"`
}

func Open(path string) (*Store, error) {
	if directory := filepath.Dir(path); directory != "." {
		if err := os.MkdirAll(directory, 0700); err != nil {
			return nil, fmt.Errorf("create database directory: %w", err)
		}
	}

	db, err := bbolt.Open(path, 0600, nil)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := db.Update(func(tx *bbolt.Tx) error {
		if _, err := tx.CreateBucketIfNotExists(commentsBucket); err != nil {
			return err
		}
		_, err := tx.CreateBucketIfNotExists(tokensBucket)
		if err != nil {
			return err
		}
		if _, err := tx.CreateBucketIfNotExists(usersBucket); err != nil {
			return err
		}
		_, err = tx.CreateBucketIfNotExists(sessionsBucket)
		if err != nil {
			return err
		}
		if _, err := tx.CreateBucketIfNotExists(oidcProvidersBucket); err != nil {
			return err
		}
		_, err = tx.CreateBucketIfNotExists(oidcIdentitiesBucket)
		return err
	}); err != nil {
		db.Close()
		return nil, fmt.Errorf("initialize database: %w", err)
	}

	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) SaveComment(comment Comment) error {
	value, err := json.Marshal(comment)
	if err != nil {
		return fmt.Errorf("encode comment: %w", err)
	}

	return s.db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(commentsBucket).Put([]byte(comment.ID), value)
	})
}

func (s *Store) ListComments() ([]Comment, error) {
	comments := make([]Comment, 0)

	err := s.db.View(func(tx *bbolt.Tx) error {
		return tx.Bucket(commentsBucket).ForEach(func(_, value []byte) error {
			var comment Comment
			if err := json.Unmarshal(value, &comment); err != nil {
				return fmt.Errorf("decode comment: %w", err)
			}
			comments = append(comments, comment)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}

	sort.SliceStable(comments, func(left, right int) bool {
		return comments[left].CreatedAt.After(comments[right].CreatedAt)
	})

	return comments, nil
}

func (s *Store) UpdateCommentCompleted(idValue string, completed bool) (Comment, error) {
	idValue = strings.TrimSpace(idValue)
	var comment Comment
	err := s.db.Update(func(tx *bbolt.Tx) error {
		bucket := tx.Bucket(commentsBucket)
		key := []byte(idValue)
		value := bucket.Get(key)
		if value == nil {
			return ErrCommentNotFound
		}
		if err := json.Unmarshal(value, &comment); err != nil {
			return err
		}
		comment.Completed = completed
		updated, err := json.Marshal(comment)
		if err != nil {
			return err
		}
		return bucket.Put(key, updated)
	})
	if err != nil {
		return Comment{}, err
	}
	return comment, nil
}

func (s *Store) CreateToken(name, rawToken string) (Token, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Token{}, errors.New("token name is required")
	}
	if err := token.Validate(rawToken); err != nil {
		return Token{}, err
	}

	idValue, err := id.New()
	if err != nil {
		return Token{}, fmt.Errorf("generate token id: %w", err)
	}

	created := Token{
		ID:        idValue,
		Name:      name,
		Hash:      token.Hash(rawToken),
		CreatedAt: time.Now().UTC(),
	}
	value, err := json.Marshal(created)
	if err != nil {
		return Token{}, fmt.Errorf("encode token: %w", err)
	}

	err = s.db.Update(func(tx *bbolt.Tx) error {
		bucket := tx.Bucket(tokensBucket)
		var duplicate bool

		if err := bucket.ForEach(func(_, value []byte) error {
			var existing Token
			if err := json.Unmarshal(value, &existing); err != nil {
				return err
			}
			if existing.Name == name {
				duplicate = true
			}
			return nil
		}); err != nil {
			return err
		}
		if duplicate {
			return ErrTokenNameExists
		}

		return bucket.Put([]byte(created.ID), value)
	})
	if err != nil {
		return Token{}, err
	}

	return created, nil
}

func (s *Store) ListTokens() ([]Token, error) {
	tokens := make([]Token, 0)

	err := s.db.View(func(tx *bbolt.Tx) error {
		return tx.Bucket(tokensBucket).ForEach(func(_, value []byte) error {
			var stored Token
			if err := json.Unmarshal(value, &stored); err != nil {
				return fmt.Errorf("decode token: %w", err)
			}
			tokens = append(tokens, stored)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}

	sort.SliceStable(tokens, func(left, right int) bool {
		return tokens[left].CreatedAt.After(tokens[right].CreatedAt)
	})
	return tokens, nil
}

func (s *Store) VerifyToken(rawToken string) (bool, error) {
	hash := token.Hash(rawToken)
	valid := false

	err := s.db.View(func(tx *bbolt.Tx) error {
		return tx.Bucket(tokensBucket).ForEach(func(_, value []byte) error {
			var stored Token
			if err := json.Unmarshal(value, &stored); err != nil {
				return err
			}
			if subtle.ConstantTimeCompare([]byte(hash), []byte(stored.Hash)) == 1 {
				valid = true
			}
			return nil
		})
	})

	return valid, err
}

func (s *Store) DeleteToken(name, tokenID string) error {
	name = strings.TrimSpace(name)
	tokenID = strings.TrimSpace(tokenID)
	if (name == "") == (tokenID == "") {
		return errors.New("exactly one of name or id is required")
	}

	return s.db.Update(func(tx *bbolt.Tx) error {
		bucket := tx.Bucket(tokensBucket)
		var foundKey []byte

		if err := bucket.ForEach(func(key, value []byte) error {
			var stored Token
			if err := json.Unmarshal(value, &stored); err != nil {
				return err
			}
			if (name != "" && stored.Name == name) ||
				(tokenID != "" && stored.ID == tokenID) {
				foundKey = append([]byte(nil), key...)
			}
			return nil
		}); err != nil {
			return err
		}

		if foundKey == nil {
			return ErrTokenNotFound
		}
		return bucket.Delete(foundKey)
	})
}

func (s *Store) CreateUser(username, role, passwordHash string, mustChangePassword bool) (User, error) {
	username = normalizeUsername(username)
	if err := validateUsername(username); err != nil {
		return User{}, err
	}
	if role != UserRoleAdmin && role != UserRoleViewer && role != UserRoleReviewer {
		return User{}, errors.New("invalid user role")
	}
	if strings.TrimSpace(passwordHash) == "" {
		return User{}, errors.New("password hash is required")
	}

	idValue, err := id.New()
	if err != nil {
		return User{}, fmt.Errorf("generate user id: %w", err)
	}
	created := User{
		ID:                 idValue,
		Username:           username,
		Role:               role,
		PasswordHash:       passwordHash,
		MustChangePassword: mustChangePassword,
		CreatedAt:          time.Now().UTC(),
	}
	value, err := json.Marshal(created)
	if err != nil {
		return User{}, fmt.Errorf("encode user: %w", err)
	}

	err = s.db.Update(func(tx *bbolt.Tx) error {
		bucket := tx.Bucket(usersBucket)
		var duplicate bool
		if err := bucket.ForEach(func(_, value []byte) error {
			var existing User
			if err := json.Unmarshal(value, &existing); err != nil {
				return err
			}
			if normalizeUsername(existing.Username) == username {
				duplicate = true
			}
			return nil
		}); err != nil {
			return err
		}
		if duplicate {
			return ErrUserNameExists
		}
		return bucket.Put([]byte(created.ID), value)
	})
	if err != nil {
		return User{}, err
	}
	return created, nil
}

func (s *Store) GetUserByUsername(username string) (User, error) {
	username = normalizeUsername(username)
	var user User
	err := s.db.View(func(tx *bbolt.Tx) error {
		return tx.Bucket(usersBucket).ForEach(func(_, value []byte) error {
			var candidate User
			if err := json.Unmarshal(value, &candidate); err != nil {
				return err
			}
			if normalizeUsername(candidate.Username) == username {
				user = candidate
			}
			return nil
		})
	})
	if err != nil {
		return User{}, err
	}
	if user.ID == "" {
		return User{}, ErrUserNotFound
	}
	return user, nil
}

func (s *Store) GetUser(idValue string) (User, error) {
	var user User
	err := s.db.View(func(tx *bbolt.Tx) error {
		value := tx.Bucket(usersBucket).Get([]byte(strings.TrimSpace(idValue)))
		if value == nil {
			return ErrUserNotFound
		}
		return json.Unmarshal(value, &user)
	})
	return user, err
}

func (s *Store) ListUsers() ([]User, error) {
	users := make([]User, 0)
	err := s.db.View(func(tx *bbolt.Tx) error {
		return tx.Bucket(usersBucket).ForEach(func(_, value []byte) error {
			var user User
			if err := json.Unmarshal(value, &user); err != nil {
				return fmt.Errorf("decode user: %w", err)
			}
			users = append(users, user)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	sort.SliceStable(users, func(left, right int) bool {
		return users[left].CreatedAt.After(users[right].CreatedAt)
	})
	return users, nil
}

func (s *Store) CreateOIDCProvider(provider OIDCProvider) (OIDCProvider, error) {
	provider.Name = strings.TrimSpace(provider.Name)
	provider.Issuer = strings.TrimSpace(provider.Issuer)
	provider.ClientID = strings.TrimSpace(provider.ClientID)
	provider.RedirectURI = strings.TrimSpace(provider.RedirectURI)
	if provider.Name == "" || provider.Issuer == "" || provider.ClientID == "" ||
		provider.ClientSecret == "" || provider.RedirectURI == "" {
		return OIDCProvider{}, errors.New("provider name, issuer, client id, secret, and redirect uri are required")
	}
	idValue, err := id.New()
	if err != nil {
		return OIDCProvider{}, fmt.Errorf("generate OIDC provider id: %w", err)
	}
	provider.ID = idValue
	provider.CreatedAt = time.Now().UTC()
	value, err := json.Marshal(provider)
	if err != nil {
		return OIDCProvider{}, fmt.Errorf("encode OIDC provider: %w", err)
	}
	err = s.db.Update(func(tx *bbolt.Tx) error {
		bucket := tx.Bucket(oidcProvidersBucket)
		duplicate := false
		if err := bucket.ForEach(func(_, existingValue []byte) error {
			var existing OIDCProvider
			if err := json.Unmarshal(existingValue, &existing); err != nil {
				return err
			}
			if strings.EqualFold(existing.Name, provider.Name) {
				duplicate = true
			}
			return nil
		}); err != nil {
			return err
		}
		if duplicate {
			return ErrOIDCProviderNameExists
		}
		return bucket.Put([]byte(provider.ID), value)
	})
	if err != nil {
		return OIDCProvider{}, err
	}
	return provider, nil
}

func (s *Store) GetOIDCProvider(idValue string) (OIDCProvider, error) {
	var provider OIDCProvider
	err := s.db.View(func(tx *bbolt.Tx) error {
		value := tx.Bucket(oidcProvidersBucket).Get([]byte(strings.TrimSpace(idValue)))
		if value == nil {
			return ErrOIDCProviderNotFound
		}
		return json.Unmarshal(value, &provider)
	})
	return provider, err
}

func (s *Store) UpdateOIDCProvider(provider OIDCProvider) (OIDCProvider, error) {
	provider.ID = strings.TrimSpace(provider.ID)
	provider.Name = strings.TrimSpace(provider.Name)
	provider.Issuer = strings.TrimSpace(provider.Issuer)
	provider.ClientID = strings.TrimSpace(provider.ClientID)
	provider.ClientSecret = strings.TrimSpace(provider.ClientSecret)
	provider.RedirectURI = strings.TrimSpace(provider.RedirectURI)
	if provider.ID == "" || provider.Name == "" || provider.Issuer == "" ||
		provider.ClientID == "" || provider.ClientSecret == "" || provider.RedirectURI == "" {
		return OIDCProvider{}, errors.New("provider id, name, issuer, client id, secret, and redirect uri are required")
	}
	var updated OIDCProvider
	err := s.db.Update(func(tx *bbolt.Tx) error {
		bucket := tx.Bucket(oidcProvidersBucket)
		currentValue := bucket.Get([]byte(provider.ID))
		if currentValue == nil {
			return ErrOIDCProviderNotFound
		}
		var current OIDCProvider
		if err := json.Unmarshal(currentValue, &current); err != nil {
			return err
		}
		duplicate := false
		if err := bucket.ForEach(func(key, value []byte) error {
			if string(key) == provider.ID {
				return nil
			}
			var existing OIDCProvider
			if err := json.Unmarshal(value, &existing); err != nil {
				return err
			}
			if strings.EqualFold(existing.Name, provider.Name) {
				duplicate = true
			}
			return nil
		}); err != nil {
			return err
		}
		if duplicate {
			return ErrOIDCProviderNameExists
		}
		provider.CreatedAt = current.CreatedAt
		value, err := json.Marshal(provider)
		if err != nil {
			return fmt.Errorf("encode OIDC provider: %w", err)
		}
		if err := bucket.Put([]byte(provider.ID), value); err != nil {
			return err
		}
		updated = provider
		return nil
	})
	if err != nil {
		return OIDCProvider{}, err
	}
	return updated, nil
}

func (s *Store) DeleteOIDCProvider(idValue string) ([]string, []User, error) {
	idValue = strings.TrimSpace(idValue)
	if idValue == "" {
		return nil, nil, ErrOIDCProviderNotFound
	}
	var deletedUserIDs []string
	var updatedUsers []User
	err := s.db.Update(func(tx *bbolt.Tx) error {
		providers := tx.Bucket(oidcProvidersBucket)
		if providers.Get([]byte(idValue)) == nil {
			return ErrOIDCProviderNotFound
		}
		identities := tx.Bucket(oidcIdentitiesBucket)
		identityKeys := make([][]byte, 0)
		if err := identities.ForEach(func(key, value []byte) error {
			var identity OIDCIdentity
			if err := json.Unmarshal(value, &identity); err != nil {
				return err
			}
			if identity.ProviderID == idValue {
				identityKeys = append(identityKeys, append([]byte(nil), key...))
			}
			return nil
		}); err != nil {
			return err
		}
		for _, key := range identityKeys {
			if err := identities.Delete(key); err != nil {
				return err
			}
		}

		users := tx.Bucket(usersBucket)
		userEntries := make([]struct {
			key   []byte
			value []byte
		}, 0)
		if err := users.ForEach(func(key, value []byte) error {
			userEntries = append(userEntries, struct {
				key   []byte
				value []byte
			}{
				key:   append([]byte(nil), key...),
				value: append([]byte(nil), value...),
			})
			return nil
		}); err != nil {
			return err
		}
		for _, entry := range userEntries {
			var user User
			if err := json.Unmarshal(entry.value, &user); err != nil {
				return err
			}
			remaining := make([]string, 0, len(user.OIDCProviderIDs))
			removed := false
			for _, providerID := range user.OIDCProviderIDs {
				if providerID == idValue {
					removed = true
					continue
				}
				remaining = append(remaining, providerID)
			}
			if !removed {
				continue
			}
			if len(remaining) == 0 && user.Role != UserRoleAdmin {
				if err := users.Delete(entry.key); err != nil {
					return err
				}
				if err := deleteSessionsByUserTx(tx, user.ID); err != nil {
					return err
				}
				deletedUserIDs = append(deletedUserIDs, user.ID)
				continue
			}
			user.OIDCProviderIDs = remaining
			value, err := json.Marshal(user)
			if err != nil {
				return err
			}
			if err := users.Put(entry.key, value); err != nil {
				return err
			}
			updatedUsers = append(updatedUsers, user)
		}
		return providers.Delete([]byte(idValue))
	})
	if err != nil {
		return nil, nil, err
	}
	return deletedUserIDs, updatedUsers, nil
}

func (s *Store) ListOIDCProviders() ([]OIDCProvider, error) {
	providers := make([]OIDCProvider, 0)
	err := s.db.View(func(tx *bbolt.Tx) error {
		return tx.Bucket(oidcProvidersBucket).ForEach(func(_, value []byte) error {
			var provider OIDCProvider
			if err := json.Unmarshal(value, &provider); err != nil {
				return fmt.Errorf("decode OIDC provider: %w", err)
			}
			providers = append(providers, provider)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	sort.SliceStable(providers, func(left, right int) bool {
		return providers[left].CreatedAt.After(providers[right].CreatedAt)
	})
	return providers, nil
}

func (s *Store) LoginOIDCUser(providerID, subject, suggestedUsername, email string) (User, error) {
	providerID = strings.TrimSpace(providerID)
	subject = strings.TrimSpace(subject)
	email = strings.TrimSpace(email)
	suggestedUsername = normalizeUsername(suggestedUsername)
	if providerID == "" || subject == "" {
		return User{}, errors.New("OIDC provider and subject are required")
	}
	if err := validateUsername(suggestedUsername); err != nil {
		return User{}, err
	}
	newUserID, err := id.New()
	if err != nil {
		return User{}, fmt.Errorf("generate OIDC user id: %w", err)
	}
	now := time.Now().UTC()
	identity := OIDCIdentity{
		ProviderID:  providerID,
		Subject:     subject,
		UserID:      newUserID,
		Email:       email,
		DisplayName: suggestedUsername,
		CreatedAt:   now,
		LastLoginAt: now,
	}
	var result User
	err = s.db.Update(func(tx *bbolt.Tx) error {
		users := tx.Bucket(usersBucket)
		identities := tx.Bucket(oidcIdentitiesBucket)
		identityKey := oidcIdentityKey(providerID, subject)
		if existingValue := identities.Get(identityKey); existingValue != nil {
			var existingIdentity OIDCIdentity
			if err := json.Unmarshal(existingValue, &existingIdentity); err != nil {
				return err
			}
			userValue := users.Get([]byte(existingIdentity.UserID))
			if userValue != nil {
				if err := json.Unmarshal(userValue, &result); err != nil {
					return err
				}
				result.OIDCProviderIDs = appendUniqueString(result.OIDCProviderIDs, providerID)
				if email != "" {
					result.Email = email
				}
				updatedUser, err := json.Marshal(result)
				if err != nil {
					return err
				}
				if err := users.Put([]byte(result.ID), updatedUser); err != nil {
					return err
				}
				existingIdentity.Email = email
				existingIdentity.DisplayName = suggestedUsername
				existingIdentity.LastLoginAt = now
				updatedIdentity, err := json.Marshal(existingIdentity)
				if err != nil {
					return err
				}
				return identities.Put(identityKey, updatedIdentity)
			}
			if err := identities.Delete(identityKey); err != nil {
				return err
			}
		}

		username, err := uniqueUsername(users, suggestedUsername)
		if err != nil {
			return err
		}
		result = User{
			ID:              newUserID,
			Username:        username,
			Email:           email,
			Role:            UserRoleViewer,
			OIDCProviderIDs: []string{providerID},
			CreatedAt:       now,
		}
		userValue, err := json.Marshal(result)
		if err != nil {
			return err
		}
		if err := users.Put([]byte(result.ID), userValue); err != nil {
			return err
		}
		identity.UserID = result.ID
		createdIdentity, err := json.Marshal(identity)
		if err != nil {
			return err
		}
		return identities.Put(identityKey, createdIdentity)
	})
	if err != nil {
		return User{}, err
	}
	return result, nil
}

func uniqueUsername(bucket *bbolt.Bucket, suggested string) (string, error) {
	for suffix := 1; ; suffix++ {
		candidate := suggested
		if suffix > 1 {
			tail := fmt.Sprintf("-%d", suffix)
			maxBaseLength := 64 - len(tail)
			base := suggested
			if len(base) > maxBaseLength {
				base = strings.TrimRight(base[:maxBaseLength], "-_.")
			}
			candidate = base + tail
		}
		duplicate := false
		if err := bucket.ForEach(func(_, value []byte) error {
			var existing User
			if err := json.Unmarshal(value, &existing); err != nil {
				return err
			}
			if normalizeUsername(existing.Username) == candidate {
				duplicate = true
			}
			return nil
		}); err != nil {
			return "", err
		}
		if !duplicate {
			return candidate, nil
		}
	}
}

func appendUniqueString(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func oidcIdentityKey(providerID, subject string) []byte {
	return []byte(base64.RawURLEncoding.EncodeToString([]byte(providerID + "\x00" + subject)))
}

func (s *Store) UpdateUserRole(idValue, role string) error {
	idValue = strings.TrimSpace(idValue)
	if idValue == "" {
		return ErrUserNotFound
	}
	if role != UserRoleViewer && role != UserRoleReviewer {
		return errors.New("invalid user role")
	}
	return s.db.Update(func(tx *bbolt.Tx) error {
		bucket := tx.Bucket(usersBucket)
		key := []byte(idValue)
		value := bucket.Get(key)
		if value == nil {
			return ErrUserNotFound
		}
		var user User
		if err := json.Unmarshal(value, &user); err != nil {
			return err
		}
		if user.Role == UserRoleAdmin {
			return ErrAdminRoleImmutable
		}
		user.Role = role
		updated, err := json.Marshal(user)
		if err != nil {
			return err
		}
		return bucket.Put(key, updated)
	})
}

func (s *Store) UpdateUserPassword(idValue, passwordHash string, mustChangePassword bool) error {
	idValue = strings.TrimSpace(idValue)
	if idValue == "" || strings.TrimSpace(passwordHash) == "" {
		return errors.New("user id and password hash are required")
	}
	return s.db.Update(func(tx *bbolt.Tx) error {
		bucket := tx.Bucket(usersBucket)
		key := []byte(idValue)
		value := bucket.Get(key)
		if value == nil {
			return ErrUserNotFound
		}
		var user User
		if err := json.Unmarshal(value, &user); err != nil {
			return err
		}
		user.PasswordHash = passwordHash
		user.MustChangePassword = mustChangePassword
		updated, err := json.Marshal(user)
		if err != nil {
			return err
		}
		return bucket.Put(key, updated)
	})
}

func (s *Store) ResetUserPassword(idValue, passwordHash string) error {
	idValue = strings.TrimSpace(idValue)
	if idValue == "" || strings.TrimSpace(passwordHash) == "" {
		return errors.New("user id and password hash are required")
	}
	return s.db.Update(func(tx *bbolt.Tx) error {
		userBucket := tx.Bucket(usersBucket)
		key := []byte(idValue)
		value := userBucket.Get(key)
		if value == nil {
			return ErrUserNotFound
		}
		var user User
		if err := json.Unmarshal(value, &user); err != nil {
			return err
		}
		user.PasswordHash = passwordHash
		user.MustChangePassword = true
		updated, err := json.Marshal(user)
		if err != nil {
			return err
		}
		if err := userBucket.Put(key, updated); err != nil {
			return err
		}
		return deleteSessionsByUserTx(tx, idValue)
	})
}

func (s *Store) DeleteUser(idValue string) error {
	idValue = strings.TrimSpace(idValue)
	if idValue == "" {
		return ErrUserNotFound
	}
	return s.db.Update(func(tx *bbolt.Tx) error {
		userBucket := tx.Bucket(usersBucket)
		key := []byte(idValue)
		if userBucket.Get(key) == nil {
			return ErrUserNotFound
		}
		if err := userBucket.Delete(key); err != nil {
			return err
		}
		if err := deleteSessionsByUserTx(tx, idValue); err != nil {
			return err
		}
		identityBucket := tx.Bucket(oidcIdentitiesBucket)
		identityKeys := make([][]byte, 0)
		if err := identityBucket.ForEach(func(identityKey, value []byte) error {
			var identity OIDCIdentity
			if err := json.Unmarshal(value, &identity); err != nil {
				return err
			}
			if identity.UserID == idValue {
				identityKeys = append(identityKeys, append([]byte(nil), identityKey...))
			}
			return nil
		}); err != nil {
			return err
		}
		for _, identityKey := range identityKeys {
			if err := identityBucket.Delete(identityKey); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) CreateSession(session Session) error {
	session.TokenHash = strings.TrimSpace(session.TokenHash)
	session.UserID = strings.TrimSpace(session.UserID)
	if session.TokenHash == "" || session.UserID == "" || session.ExpiresAt.IsZero() {
		return errors.New("session token hash, user id, and expiry are required")
	}
	value, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("encode session: %w", err)
	}
	return s.db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(sessionsBucket).Put([]byte(session.TokenHash), value)
	})
}

func (s *Store) GetSession(tokenHash string) (Session, error) {
	tokenHash = strings.TrimSpace(tokenHash)
	var session Session
	err := s.db.View(func(tx *bbolt.Tx) error {
		value := tx.Bucket(sessionsBucket).Get([]byte(tokenHash))
		if value == nil {
			return ErrSessionNotFound
		}
		return json.Unmarshal(value, &session)
	})
	if err != nil {
		return Session{}, err
	}
	if !time.Now().UTC().Before(session.ExpiresAt) {
		return Session{}, ErrSessionExpired
	}
	return session, nil
}

func (s *Store) DeleteSession(tokenHash string) error {
	return s.db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(sessionsBucket).Delete([]byte(strings.TrimSpace(tokenHash)))
	})
}

func (s *Store) DeleteSessionsByUser(userID string) error {
	userID = strings.TrimSpace(userID)
	return s.db.Update(func(tx *bbolt.Tx) error {
		return deleteSessionsByUserTx(tx, userID)
	})
}

func deleteSessionsByUserTx(tx *bbolt.Tx, userID string) error {
	bucket := tx.Bucket(sessionsBucket)
	keys := make([][]byte, 0)
	if err := bucket.ForEach(func(key, value []byte) error {
		var session Session
		if err := json.Unmarshal(value, &session); err != nil {
			return err
		}
		if session.UserID == userID {
			keys = append(keys, append([]byte(nil), key...))
		}
		return nil
	}); err != nil {
		return err
	}
	for _, key := range keys {
		if err := bucket.Delete(key); err != nil {
			return err
		}
	}
	return nil
}

func normalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

func validateUsername(username string) error {
	if len(username) < 3 || len(username) > 64 {
		return errors.New("username must be between 3 and 64 characters")
	}
	for _, character := range username {
		if character >= 'a' && character <= 'z' ||
			character >= '0' && character <= '9' ||
			character == '-' || character == '_' || character == '.' {
			continue
		}
		return errors.New("username must contain only lowercase letters, numbers, dots, hyphens, and underscores")
	}
	return nil
}
