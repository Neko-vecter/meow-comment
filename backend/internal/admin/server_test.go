package admin

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"moew-comment/backend/internal/store"
)

func TestHandlerRequiresAdminKeyAndManagesTokens(t *testing.T) {
	database, err := store.Open(filepath.Join(t.TempDir(), "comments.db"))
	if err != nil {
		t.Fatalf("store.Open() error = %v", err)
	}
	defer database.Close()

	key, err := GenerateKey()
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	server := httptest.NewServer(NewHandler(database, key))
	defer server.Close()

	unauthorizedRequest, err := http.NewRequest(http.MethodPost, server.URL+TokenPath, strings.NewReader(`{"name":"blog"}`))
	if err != nil {
		t.Fatal(err)
	}
	unauthorizedResponse, err := http.DefaultClient.Do(unauthorizedRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer unauthorizedResponse.Body.Close()
	if unauthorizedResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorizedResponse.StatusCode)
	}

	createRequest, err := http.NewRequest(http.MethodPost, server.URL+TokenPath, strings.NewReader(`{"name":"blog"}`))
	if err != nil {
		t.Fatal(err)
	}
	createRequest.Header.Set("Authorization", "Bearer "+key)
	createRequest.Header.Set("Content-Type", "application/json")
	createResponse, err := http.DefaultClient.Do(createRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d", createResponse.StatusCode)
	}
	body, err := io.ReadAll(createResponse.Body)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), "hash") {
		t.Fatalf("response leaked token hash: %q", body)
	}
	var created CreatedToken
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatal(err)
	}
	if created.Name != "blog" || created.ID == "" || created.Token == "" {
		t.Fatalf("unexpected create response: %+v", created)
	}
	valid, err := database.VerifyToken(created.Token)
	if err != nil || !valid {
		t.Fatalf("created token verification = valid:%t error:%v", valid, err)
	}

	deleteRequest, err := http.NewRequest(http.MethodDelete, server.URL+TokenPath+"?name=blog", nil)
	if err != nil {
		t.Fatal(err)
	}
	deleteRequest.Header.Set("Authorization", "Bearer "+key)
	deleteResponse, err := http.DefaultClient.Do(deleteRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d", deleteResponse.StatusCode)
	}
	valid, err = database.VerifyToken(created.Token)
	if err != nil || valid {
		t.Fatalf("deleted token verification = valid:%t error:%v", valid, err)
	}
}
