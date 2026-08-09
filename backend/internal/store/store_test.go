package store

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"moew-comment/backend/internal/token"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()

	database, err := Open(filepath.Join(t.TempDir(), "comments.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() {
		_ = database.Close()
	})
	return database
}

func TestCommentsArePersistedAndSorted(t *testing.T) {
	database := openTestStore(t)
	now := time.Now().UTC()

	oldComment := Comment{
		ID:        "old",
		Username:  "old-user",
		CreatedAt: now.Add(-time.Minute),
	}
	newComment := Comment{
		ID:        "new",
		Username:  "new-user",
		CreatedAt: now,
	}

	if err := database.SaveComment(oldComment); err != nil {
		t.Fatalf("save old comment: %v", err)
	}
	if err := database.SaveComment(newComment); err != nil {
		t.Fatalf("save new comment: %v", err)
	}

	comments, err := database.ListComments()
	if err != nil {
		t.Fatalf("list comments: %v", err)
	}
	if len(comments) != 2 {
		t.Fatalf("expected 2 comments, got %d", len(comments))
	}
	if comments[0].ID != "new" || comments[1].ID != "old" {
		t.Fatalf("comments are not newest first: %#v", comments)
	}
}

func TestTokenCreateVerifyAndDelete(t *testing.T) {
	database := openTestStore(t)
	rawToken, err := token.Generate()
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	created, err := database.CreateToken("blog", rawToken)
	if err != nil {
		t.Fatalf("create token: %v", err)
	}
	if len(created.Hash) != 64 {
		t.Fatalf("expected SHA-256 hash, got %q", created.Hash)
	}

	valid, err := database.VerifyToken(rawToken)
	if err != nil || !valid {
		t.Fatalf("expected token to verify, valid=%v err=%v", valid, err)
	}

	if _, err := database.CreateToken("blog", rawToken); !errors.Is(err, ErrTokenNameExists) {
		t.Fatalf("expected duplicate name error, got %v", err)
	}

	tokens, err := database.ListTokens()
	if err != nil {
		t.Fatalf("list tokens: %v", err)
	}
	if len(tokens) != 1 || tokens[0].Name != "blog" || tokens[0].ID != created.ID {
		t.Fatalf("unexpected token list: %#v", tokens)
	}

	if err := database.DeleteToken("", created.ID); err != nil {
		t.Fatalf("delete token by id: %v", err)
	}
	valid, err = database.VerifyToken(rawToken)
	if err != nil || valid {
		t.Fatalf("expected deleted token to fail, valid=%v err=%v", valid, err)
	}
}
