package adminclient

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"moew-comment/backend/internal/admin"
	"moew-comment/backend/internal/store"
)

func TestClientManagesTokensThroughAdminHTTP(t *testing.T) {
	database, err := store.Open(filepath.Join(t.TempDir(), "comments.db"))
	if err != nil {
		t.Fatalf("store.Open() error = %v", err)
	}
	defer database.Close()
	key, err := admin.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(admin.NewHandler(database, key))
	defer server.Close()

	client, err := New(strings.TrimPrefix(server.URL, "http://"), key)
	if err != nil {
		t.Fatal(err)
	}
	created, err := client.CreateToken(context.Background(), "client")
	if err != nil {
		t.Fatalf("CreateToken() error = %v", err)
	}
	listed, err := client.ListTokens(context.Background())
	if err != nil {
		t.Fatalf("ListTokens() error = %v", err)
	}
	if len(listed) != 1 || listed[0].ID != created.ID || listed[0].Name != created.Name {
		t.Fatalf("unexpected listed tokens: %+v", listed)
	}
	if err := client.DeleteToken(context.Background(), "", created.ID); err != nil {
		t.Fatalf("DeleteToken() error = %v", err)
	}
}

func TestClientRejectsRemoteAdminAddress(t *testing.T) {
	key, err := admin.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := New("192.0.2.1:9101", key); err == nil {
		t.Fatal("New() accepted a non-loopback admin address")
	}
}
