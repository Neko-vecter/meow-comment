package captcha

import (
	"bytes"
	"encoding/base64"
	"image/png"
	"strings"
	"testing"
	"time"
)

func TestNewAndVerifyConsumesCaptcha(t *testing.T) {
	store := NewStore(time.Minute)
	defer store.Close()

	challengeID, imageData, err := store.New()
	if err != nil {
		t.Fatalf("create captcha: %v", err)
	}

	decoded, err := base64.StdEncoding.DecodeString(imageData)
	if err != nil {
		t.Fatalf("decode captcha image: %v", err)
	}
	if _, err := png.Decode(bytes.NewReader(decoded)); err != nil {
		t.Fatalf("decode PNG image: %v", err)
	}

	store.mu.Lock()
	code := store.items[challengeID].code
	store.mu.Unlock()

	if !store.VerifyAndConsume(challengeID, strings.ToLower(code)) {
		t.Fatal("expected captcha to be accepted")
	}
	if store.VerifyAndConsume(challengeID, code) {
		t.Fatal("expected captcha to be one-time use")
	}
}

func TestExpiredCaptchaIsRejected(t *testing.T) {
	store := NewStore(time.Minute)
	defer store.Close()

	store.mu.Lock()
	store.items["expired"] = entry{
		code:      "AB12",
		expiresAt: time.Now().Add(-time.Second),
	}
	store.mu.Unlock()

	if store.VerifyAndConsume("expired", "AB12") {
		t.Fatal("expected expired captcha to be rejected")
	}
}
