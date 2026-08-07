package httpapi

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"moew-comment/backend/internal/captcha"
	"moew-comment/backend/internal/config"
	"moew-comment/backend/internal/id"
	"moew-comment/backend/internal/store"
)

const (
	maxRequestBody  = 64 * 1024
	verificationTTL = 5 * time.Minute
)

type Server struct {
	cfg      config.Config
	db       *store.Store
	captchas captchaService
	allowed  map[string]struct{}
}

type captchaService interface {
	Close()
	New() (string, string, error)
	VerifyAndConsume(string, string) bool
}

type commentRequest struct {
	Username         string `json:"username"`
	Email            string `json:"email"`
	Comments         string `json:"comments"`
	SourcePath       string `json:"source_path"`
	PageTitle        string `json:"page_title"`
	VerificationUUID string `json:"verification_uuid"`
	VerificationCode string `json:"verification_code"`
}

type verificationResponse struct {
	UUID          string `json:"uuid"`
	CaptchaBase64 string `json:"captcha_base64"`
}

type successResponse struct {
	OK bool `json:"ok"`
}

type errorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func New(cfg config.Config, db *store.Store) *Server {
	return &Server{
		cfg:      cfg,
		db:       db,
		captchas: captcha.NewStore(verificationTTL),
		allowed:  config.AllowedOrigins(cfg.AllowedSites),
	}
}

func (s *Server) Close() {
	s.captchas.Close()
}

func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(s.handle)
}

func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/rss" {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
			return
		}
		s.handleRSS(w, r)
		return
	}

	if r.Method == http.MethodOptions {
		s.handleOptions(w, r)
		return
	}

	origin, allowed := s.requestOrigin(r)
	if !allowed {
		writeError(w, http.StatusForbidden, "invalid_origin", "request origin is not allowed")
		return
	}
	s.setCORSHeaders(w, origin)

	switch r.URL.Path {
	case "/api/verification":
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
			return
		}
		s.handleVerification(w)
	case "/api/comment":
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
			return
		}
		s.handleComment(w, r)
	default:
		writeError(w, http.StatusNotFound, "not_found", "not found")
	}
}

func (s *Server) handleOptions(w http.ResponseWriter, r *http.Request) {
	origin, allowed := s.requestOrigin(r)
	if !allowed {
		writeError(w, http.StatusForbidden, "invalid_origin", "request origin is not allowed")
		return
	}
	s.setCORSHeaders(w, origin)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) requestOrigin(r *http.Request) (string, bool) {
	if !s.cfg.AllowedSitesEnabled {
		return normalizeRequestOrigin(r), true
	}

	originHeader := strings.TrimSpace(r.Header.Get("Origin"))
	refererHeader := strings.TrimSpace(r.Header.Get("Referer"))

	var origin string
	if originHeader != "" {
		var ok bool
		origin, ok = config.NormalizeOrigin(originHeader)
		if !ok {
			return "", false
		}
	}

	if refererHeader != "" {
		refererOrigin, ok := config.NormalizeOrigin(refererHeader)
		if !ok {
			return "", false
		}
		if origin != "" && origin != refererOrigin {
			return "", false
		}
		origin = refererOrigin
	}

	if origin == "" {
		return "", false
	}
	if _, ok := s.allowed[origin]; !ok {
		return "", false
	}

	return origin, true
}

func normalizeRequestOrigin(r *http.Request) string {
	if origin, ok := config.NormalizeOrigin(r.Header.Get("Origin")); ok {
		return origin
	}
	if origin, ok := config.NormalizeOrigin(r.Header.Get("Referer")); ok {
		return origin
	}
	return ""
}

func (s *Server) setCORSHeaders(w http.ResponseWriter, origin string) {
	if !s.cfg.AllowedSitesEnabled {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	} else if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Add("Vary", "Origin")
	}

	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func (s *Server) handleVerification(w http.ResponseWriter) {
	if !s.cfg.CaptchaEnabled {
		writeError(w, http.StatusNotFound, "captcha_disabled", "captcha is disabled")
		return
	}

	challengeID, image, err := s.captchas.New()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "captcha_error", "failed to create captcha")
		return
	}

	writeJSON(w, http.StatusOK, verificationResponse{
		UUID:          challengeID,
		CaptchaBase64: image,
	})
}

func (s *Server) handleComment(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBody)

	var request commentRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid JSON request")
		return
	}
	if err := ensureSingleJSONValue(decoder); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "request must contain one JSON object")
		return
	}

	if err := validateCommentRequest(request, s.cfg.CaptchaEnabled); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}

	if s.cfg.CaptchaEnabled &&
		!s.captchas.VerifyAndConsume(request.VerificationUUID, request.VerificationCode) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_verification", "captcha is invalid or expired")
		return
	}

	commentID, err := id.New()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to generate comment id")
		return
	}

	comment := store.Comment{
		ID:         commentID,
		Username:   strings.TrimSpace(request.Username),
		Email:      strings.TrimSpace(request.Email),
		Comments:   request.Comments,
		SourcePath: strings.TrimSpace(request.SourcePath),
		PageTitle:  strings.TrimSpace(request.PageTitle),
		UserAgent:  r.UserAgent(),
		IPAddress:  clientIP(r),
		Origin:     r.Header.Get("Origin"),
		Referer:    r.Header.Get("Referer"),
		CreatedAt:  time.Now().UTC(),
	}

	if err := s.db.SaveComment(comment); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to save comment")
		return
	}

	writeJSON(w, http.StatusCreated, successResponse{OK: true})
}

func (s *Server) handleRSS(w http.ResponseWriter, r *http.Request) {
	valid, err := s.db.VerifyToken(r.URL.Query().Get("token"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to verify token")
		return
	}
	if !valid {
		writeError(w, http.StatusUnauthorized, "invalid_token", "invalid RSS token")
		return
	}

	comments, err := s.db.ListComments()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to read comments")
		return
	}

	feed := buildRSS(s.cfg, comments)
	w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(feed)
}

func validateCommentRequest(request commentRequest, captchaEnabled bool) error {
	if !validText(request.Username, 64) {
		return errors.New("username is required and must be at most 64 characters")
	}
	if !validEmail(request.Email) {
		return errors.New("email is invalid")
	}
	if !validText(request.Comments, 10000) {
		return errors.New("comments is required and must be at most 10000 characters")
	}
	if !validSourcePath(request.SourcePath) {
		return errors.New("source_path must be an internal path")
	}
	if !validText(request.PageTitle, 256) {
		return errors.New("page_title is required and must be at most 256 characters")
	}
	if captchaEnabled {
		if strings.TrimSpace(request.VerificationUUID) == "" ||
			strings.TrimSpace(request.VerificationCode) == "" {
			return errors.New("verification fields are required")
		}
	}
	return nil
}

func validText(value string, maximum int) bool {
	trimmed := strings.TrimSpace(value)
	return trimmed != "" && utf8.RuneCountInString(trimmed) <= maximum
}

func validEmail(value string) bool {
	value = strings.TrimSpace(value)
	parsed, err := mail.ParseAddress(value)
	return err == nil && parsed.Address == value && utf8.RuneCountInString(value) <= 254
}

func validSourcePath(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" || !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") {
		return false
	}
	if strings.ContainsAny(value, "\r\n") {
		return false
	}

	parsed, err := url.Parse(value)
	return err == nil && !parsed.IsAbs() && parsed.Host == ""
}

func ensureSingleJSONValue(decoder *json.Decoder) error {
	var extra interface{}
	if err := decoder.Decode(&extra); err != io.EOF {
		return fmt.Errorf("unexpected data after JSON object")
	}
	return nil
}

func clientIP(r *http.Request) string {
	if value := strings.TrimSpace(r.Header.Get("X-Real-IP")); value != "" {
		return value
	}

	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func buildRSS(cfg config.Config, comments []store.Comment) []byte {
	var output bytes.Buffer
	output.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	output.WriteString("<rss version=\"2.0\">\n")
	output.WriteString("  <channel>\n")
	output.WriteString("    <title>")
	output.WriteString(escapeXML(cfg.RSSTitle))
	output.WriteString("</title>\n")
	output.WriteString("    <link>")
	output.WriteString(escapeXML(cfg.RSSLink))
	output.WriteString("</link>\n")
	output.WriteString("    <description>Meow comments</description>\n")

	for _, comment := range comments {
		output.WriteString("    <item>\n")
		output.WriteString("      <title>")
		output.WriteString(escapeXML(comment.Username + " | " + comment.PageTitle))
		output.WriteString("</title>\n")
		output.WriteString("      <guid isPermaLink=\"false\">")
		output.WriteString(escapeXML(comment.ID))
		output.WriteString("</guid>\n")
		output.WriteString("      <pubDate>")
		output.WriteString(comment.CreatedAt.UTC().Format(time.RFC1123Z))
		output.WriteString("</pubDate>\n")
		output.WriteString("      <description>")
		output.WriteString(cdata(strings.Join([]string{
			comment.SourcePath,
			"<br />",
			comment.Username + " | " + comment.Email,
			"<br />",
			comment.Comments,
		}, "\n")))
		output.WriteString("</description>\n")
		output.WriteString("    </item>\n")
	}

	output.WriteString("  </channel>\n")
	output.WriteString("</rss>\n")
	return output.Bytes()
}

func escapeXML(value string) string {
	var escaped bytes.Buffer
	_ = xml.EscapeText(&escaped, []byte(value))
	return escaped.String()
}

func cdata(value string) string {
	const cdataEnd = "]" + "]>"

	value = strings.ReplaceAll(value, "]]>", "]]]]><![CDATA[>")
	return "<![CDATA[" + value + cdataEnd
}

func writeJSON(w http.ResponseWriter, status int, value interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorResponse{
		Code:    code,
		Message: message,
	})
}
