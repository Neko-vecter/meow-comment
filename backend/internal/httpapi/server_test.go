package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"moew-comment/backend/internal/config"
	"moew-comment/backend/internal/store"
	"moew-comment/backend/internal/token"
)

const testOrigin = "https://blog.example.com"

func newTestApplication(t *testing.T, captchaEnabled, allowedSitesEnabled bool) (*Server, *store.Store) {
	t.Helper()

	database, err := store.Open(filepath.Join(t.TempDir(), "comments.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	cfg := config.Config{
		Listen:              "127.0.0.1:0",
		DBPath:              filepath.Join(t.TempDir(), "comments.db"),
		RSSTitle:            "Test RSS",
		RSSLink:             "https://comment.example.com",
		CaptchaEnabled:      captchaEnabled,
		AllowedSitesEnabled: allowedSitesEnabled,
		AllowedSites:        []string{testOrigin},
	}
	application := New(cfg, database)

	t.Cleanup(func() {
		application.Close()
		_ = database.Close()
	})
	return application, database
}

func TestCommentUsesCaptchaOnceAndStoresRequestMetadata(t *testing.T) {
	application, database := newTestApplication(t, true, true)
	fakeCaptcha := &testCaptcha{
		id:   "captcha-id",
		code: "AB12",
	}
	application.captchas = fakeCaptcha

	verificationRequest := httptest.NewRequest(http.MethodGet, "/api/verification", nil)
	verificationRequest.Header.Set("Origin", testOrigin)
	verificationRecorder := httptest.NewRecorder()
	application.Handler().ServeHTTP(verificationRecorder, verificationRequest)

	if verificationRecorder.Code != http.StatusOK {
		t.Fatalf("verification status: %d", verificationRecorder.Code)
	}
	var verification verificationResponse
	if err := json.Unmarshal(verificationRecorder.Body.Bytes(), &verification); err != nil {
		t.Fatalf("decode verification response: %v", err)
	}

	requestBody, err := json.Marshal(commentRequest{
		Username:         "小明",
		Email:            "xiaoming@example.com",
		Comments:         "这是一条<评论>。",
		SourcePath:       "/page/1",
		PageTitle:        "文章标题",
		VerificationUUID: verification.UUID,
		VerificationCode: fakeCaptcha.code,
	})
	if err != nil {
		t.Fatalf("encode comment: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/comment", bytes.NewReader(requestBody))
	request.RemoteAddr = "192.0.2.10:1234"
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", testOrigin)
	request.Header.Set("Referer", testOrigin+"/page/1")
	request.Header.Set("User-Agent", "test-agent")
	request.Header.Set("X-Real-IP", "203.0.113.10")
	recorder := httptest.NewRecorder()
	application.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("comment status: %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if recorder.Header().Get("Access-Control-Allow-Origin") != testOrigin {
		t.Fatalf("missing CORS origin: %q", recorder.Header().Get("Access-Control-Allow-Origin"))
	}

	comments, err := database.ListComments()
	if err != nil {
		t.Fatalf("list comments: %v", err)
	}
	if len(comments) != 1 {
		t.Fatalf("expected one comment, got %d", len(comments))
	}
	if comments[0].IPAddress != "203.0.113.10" || comments[0].UserAgent != "test-agent" {
		t.Fatalf("request metadata was not stored: %#v", comments[0])
	}
	if comments[0].Comments != "这是一条&lt;评论&gt;。" {
		t.Fatalf("comment HTML was not escaped: %q", comments[0].Comments)
	}

	secondRequest := httptest.NewRequest(http.MethodPost, "/api/comment", bytes.NewReader(requestBody))
	secondRequest.Header.Set("Content-Type", "application/json")
	secondRequest.Header.Set("Origin", testOrigin)
	secondRecorder := httptest.NewRecorder()
	application.Handler().ServeHTTP(secondRecorder, secondRequest)
	if secondRecorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected one-time captcha rejection, got %d", secondRecorder.Code)
	}
}

type testCaptcha struct {
	id       string
	code     string
	consumed bool
}

func (c *testCaptcha) Close() {}

func (c *testCaptcha) New() (string, string, error) {
	return c.id, "test-image", nil
}

func (c *testCaptcha) VerifyAndConsume(challengeID, value string) bool {
	if c.consumed || challengeID != c.id || !strings.EqualFold(value, c.code) {
		return false
	}
	c.consumed = true
	return true
}

func TestOriginValidationAndPreflight(t *testing.T) {
	application, _ := newTestApplication(t, false, true)

	options := httptest.NewRequest(http.MethodOptions, "/api/comment", nil)
	options.Header.Set("Origin", testOrigin)
	options.Header.Set("Access-Control-Request-Method", "POST")
	optionsRecorder := httptest.NewRecorder()
	application.Handler().ServeHTTP(optionsRecorder, options)

	if optionsRecorder.Code != http.StatusNoContent {
		t.Fatalf("preflight status: %d", optionsRecorder.Code)
	}
	if optionsRecorder.Header().Get("Access-Control-Allow-Origin") != testOrigin {
		t.Fatalf("preflight did not allow origin")
	}

	denied := httptest.NewRequest(http.MethodPost, "/api/comment", strings.NewReader("{}"))
	denied.Header.Set("Content-Type", "application/json")
	deniedRecorder := httptest.NewRecorder()
	application.Handler().ServeHTTP(deniedRecorder, denied)
	if deniedRecorder.Code != http.StatusForbidden {
		t.Fatalf("expected missing origin to be rejected, got %d", deniedRecorder.Code)
	}
}

func TestCaptchaCanBeDisabled(t *testing.T) {
	application, _ := newTestApplication(t, false, false)

	verification := httptest.NewRequest(http.MethodGet, "/api/verification", nil)
	verificationRecorder := httptest.NewRecorder()
	application.Handler().ServeHTTP(verificationRecorder, verification)
	if verificationRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected disabled captcha to return 404, got %d", verificationRecorder.Code)
	}

	body := `{"username":"user","email":"user@example.com","comments":"hello","source_path":"/page/1","page_title":"Page"}`
	request := httptest.NewRequest(http.MethodPost, "/api/comment", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	application.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected comment without captcha, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if recorder.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("expected wildcard CORS when site validation is disabled")
	}
}

func TestRSSRequiresTokenAndSortsComments(t *testing.T) {
	application, database := newTestApplication(t, false, true)
	rawToken, err := token.Generate()
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	if _, err := database.CreateToken("test", rawToken); err != nil {
		t.Fatalf("create RSS token: %v", err)
	}

	now := time.Now().UTC()
	comments := []store.Comment{
		{
			ID:         "old",
			Username:   "old-user",
			PageTitle:  "Old page",
			Email:      "old@example.com",
			Comments:   "old comment",
			SourcePath: "/old",
			CreatedAt:  now.Add(-time.Minute),
		},
		{
			ID:         "new",
			Username:   "new-user",
			PageTitle:  "New page",
			Email:      "new@example.com",
			Comments:   "new <comment>",
			SourcePath: "/new",
			CreatedAt:  now,
		},
	}
	for _, comment := range comments {
		if err := database.SaveComment(comment); err != nil {
			t.Fatalf("save comment: %v", err)
		}
	}

	denied := httptest.NewRequest(http.MethodGet, "/api/rss?token=wrong", nil)
	deniedRecorder := httptest.NewRecorder()
	application.Handler().ServeHTTP(deniedRecorder, denied)
	if deniedRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected invalid token to be rejected, got %d", deniedRecorder.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/rss?token="+rawToken, nil)
	recorder := httptest.NewRecorder()
	application.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("RSS status: %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Header().Get("Content-Type"), "application/rss+xml") {
		t.Fatalf("unexpected RSS content type: %q", recorder.Header().Get("Content-Type"))
	}

	body, err := io.ReadAll(recorder.Result().Body)
	if err != nil {
		t.Fatalf("read RSS body: %v", err)
	}
	text := string(body)
	if strings.Index(text, "new-user | New page") > strings.Index(text, "old-user | Old page") {
		t.Fatal("RSS comments are not newest first")
	}
	if !strings.Contains(text, "/new\n<br />\nnew-user | new@example.com\n<br />\nnew <comment>") {
		t.Fatalf("RSS comment content order is incorrect: %s", text)
	}
}
