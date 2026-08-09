package store

import (
	"crypto/subtle"
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
	commentsBucket = []byte("comments")
	tokensBucket   = []byte("rss_tokens")

	ErrTokenNameExists = errors.New("token name already exists")
	ErrTokenNotFound   = errors.New("token not found")
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
}

type Token struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Hash      string    `json:"hash"`
	CreatedAt time.Time `json:"created_at"`
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
