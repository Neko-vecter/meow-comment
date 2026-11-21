package admin

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"moew-comment/backend/internal/auth"
	"moew-comment/backend/internal/store"
)

const (
	LoginPath           = "/api/admin/auth/login"
	MePath              = "/api/admin/auth/me"
	PasswordPath        = "/api/admin/auth/password"
	LogoutPath          = "/api/admin/auth/logout"
	UsersPath           = "/api/admin/users"
	CommentsPath        = "/api/admin/comments"
	VersionPath         = "/api/admin/version"
	sessionTTL          = 24 * time.Hour
	defaultCommentLimit = 50
	maxCommentLimit     = 200
)

var ErrInvalidCredentials = errors.New("invalid credentials")

// Version is set at build time with -ldflags.
var Version = "backend-unknown"

type UserSummary struct {
	ID                    string    `json:"id"`
	Username              string    `json:"username"`
	Email                 string    `json:"email,omitempty"`
	Role                  string    `json:"role"`
	OIDCProviderIDs       []string  `json:"oidc_provider_ids,omitempty"`
	MustChangePassword    bool      `json:"must_change_password"`
	AuthenticationMethods []string  `json:"authentication_methods"`
	CreatedAt             time.Time `json:"created_at"`
}

type CreatedUser struct {
	UserSummary
	TemporaryPassword string `json:"temporary_password"`
}

type ResetPasswordResponse struct {
	UserSummary
	TemporaryPassword string `json:"temporary_password"`
}

type SessionResponse struct {
	AccessToken string      `json:"access_token"`
	TokenType   string      `json:"token_type"`
	ExpiresAt   time.Time   `json:"expires_at"`
	User        UserSummary `json:"user"`
}

type CommentSummary struct {
	ID         string    `json:"id"`
	Username   string    `json:"username"`
	Email      string    `json:"email"`
	Comments   string    `json:"comments"`
	SourcePath string    `json:"source_path"`
	PageTitle  string    `json:"page_title"`
	CreatedAt  time.Time `json:"created_at"`
	Completed  bool      `json:"completed"`
}

type CommentListResponse struct {
	Items  []CommentSummary `json:"items"`
	Total  int              `json:"total"`
	Limit  int              `json:"limit"`
	Offset int              `json:"offset"`
}

type authKind uint8

const (
	authKindKey authKind = iota + 1
	authKindSession
)

type principal struct {
	kind        authKind
	user        store.User
	sessionHash string
}

type handler struct {
	service        *Service
	adminKey       string
	allowedOrigins map[string]struct{}
	allowAnyOrigin bool
}

func newHandler(service *Service, key string, allowedOrigins []string) http.Handler {
	origins := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			origins[origin] = struct{}{}
		}
	}
	return &handler{
		service:        service,
		adminKey:       strings.TrimSpace(key),
		allowedOrigins: origins,
		allowAnyOrigin: len(origins) == 0,
	}
}

// NewWebHandler exposes only the browser-facing management API. It is mounted
// by the public HTTP server; the local admin handler remains the only place
// where the admin key and token management API are reachable.
func NewWebHandler(database *store.Store, allowedOrigins []string, adminKeys ...string) http.Handler {
	service := NewService(database, adminKeys...)
	management := newHandler(service, "", allowedOrigins)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == TokenPath {
			writeError(w, http.StatusNotFound, "not_found", "not found")
			return
		}
		management.ServeHTTP(w, r)
	})
}

func newCLIHandler(service *Service, key string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !authorized(r, key) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "valid admin authorization is required")
			return
		}
		if strings.HasPrefix(r.URL.Path, UsersPath+"/") {
			if r.Method != http.MethodDelete {
				methodNotAllowed(w)
				return
			}
			handleDeleteCLIUser(service, w, r)
			return
		}
		switch r.URL.Path {
		case TokenPath:
			switch r.Method {
			case http.MethodGet:
				handleListTokens(service, w)
			case http.MethodPost:
				handleCreateToken(service, w, r)
			case http.MethodDelete:
				handleDeleteToken(service, w, r)
			default:
				methodNotAllowed(w)
			}
		case UsersPath:
			switch r.Method {
			case http.MethodGet:
				handleListCLIUsers(service, w)
			case http.MethodPost:
				handleCreateCLIUser(service, w, r)
			default:
				methodNotAllowed(w)
			}
		default:
			writeError(w, http.StatusNotFound, "not_found", "not found")
		}
	})
}

func handleListCLIUsers(service *Service, w http.ResponseWriter) {
	users, err := service.ListUsers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list_failed", "list users failed")
		return
	}
	response := make([]UserSummary, 0, len(users))
	for _, user := range users {
		response = append(response, summarizeUser(user))
	}
	writeJSON(w, http.StatusOK, response)
}

func handleCreateCLIUser(service *Service, w http.ResponseWriter, r *http.Request) {
	var request struct {
		Username string `json:"username"`
		Role     string `json:"role"`
	}
	if !decodeJSON(w, r, 4<<10, &request) {
		return
	}
	if strings.TrimSpace(request.Role) != store.UserRoleAdmin {
		writeError(w, http.StatusBadRequest, "invalid_role", "CLI can only create admin users")
		return
	}
	created, err := service.CreateUser(request.Username, store.UserRoleAdmin)
	if err != nil {
		if errors.Is(err, store.ErrUserNameExists) {
			writeError(w, http.StatusConflict, "username_exists", "username already exists")
			return
		}
		writeError(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func handleDeleteCLIUser(service *Service, w http.ResponseWriter, r *http.Request) {
	idValue, ok := pathID(r.URL.Path, UsersPath)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_user_id", "user id is required")
		return
	}
	if _, err := service.database.GetUser(idValue); err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user_not_found", "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "delete_failed", "delete user failed")
		return
	}
	if err := service.database.DeleteUser(idValue); err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user_not_found", "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "delete_failed", "delete user failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !h.allowOrigin(w, r) {
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.URL.Path == OIDCProvidersPath {
		h.handleOIDCProviderCollection(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, OIDCProvidersPath+"/") {
		h.handleOIDCProviderByID(w, r)
		return
	}
	if r.URL.Path == OIDCLoginOptionsPath {
		h.handleOIDCLoginOptions(w, r)
		return
	}
	if r.URL.Path == OIDCCallbackPath {
		h.handleOIDCCallback(w, r)
		return
	}
	if r.URL.Path == OIDCExchangePath {
		h.handleOIDCExchange(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, OIDCLoginPathPrefix) {
		loginPath := strings.TrimPrefix(r.URL.Path, OIDCLoginPathPrefix)
		if strings.HasSuffix(loginPath, "/login") {
			providerID, err := url.PathUnescape(strings.TrimSuffix(loginPath, "/login"))
			if err != nil || strings.TrimSpace(providerID) == "" || strings.Contains(providerID, "/") {
				writeError(w, http.StatusBadRequest, "invalid_provider_id", "OIDC source id is invalid")
				return
			}
			h.handleOIDCLogin(w, r, providerID)
			return
		}
	}
	if strings.HasPrefix(r.URL.Path, UsersPath+"/") {
		userPath := strings.TrimPrefix(r.URL.Path, UsersPath+"/")
		userPathParts := strings.Split(userPath, "/")
		if len(userPathParts) == 2 && userPathParts[1] == "password" {
			h.handleUserPasswordReset(w, r)
			return
		}
		h.handleUserByID(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, CommentsPath+"/") {
		h.handleCommentByID(w, r)
		return
	}

	switch r.URL.Path {
	case VersionPath:
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		writeJSON(w, http.StatusOK, struct {
			Version string `json:"version"`
		}{Version: Version})
	case LoginPath:
		if r.Method == http.MethodPost {
			h.handleLogin(w, r)
		} else {
			methodNotAllowed(w)
		}
	case MePath:
		if r.Method == http.MethodGet {
			h.handleMe(w, r)
		} else {
			methodNotAllowed(w)
		}
	case PasswordPath:
		if r.Method == http.MethodPost {
			h.handlePassword(w, r)
		} else {
			methodNotAllowed(w)
		}
	case LogoutPath:
		if r.Method == http.MethodPost {
			h.handleLogout(w, r)
		} else {
			methodNotAllowed(w)
		}
	case UsersPath:
		h.handleUsers(w, r)
	case CommentsPath:
		if r.Method == http.MethodGet {
			h.handleComments(w, r)
		} else {
			methodNotAllowed(w)
		}
	case TokenPath:
		h.handleTokens(w, r)
	default:
		writeError(w, http.StatusNotFound, "not_found", "not found")
	}
}

func (h *handler) allowOrigin(w http.ResponseWriter, r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	if !h.allowAnyOrigin {
		if _, ok := h.allowedOrigins[origin]; !ok {
			writeError(w, http.StatusForbidden, "invalid_origin", "request origin is not allowed")
			return false
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
	} else {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	}
	w.Header().Add("Vary", "Origin")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
	return true
}

func (h *handler) handleTokens(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, h.adminKey) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "valid admin authorization is required")
		return
	}
	switch r.Method {
	case http.MethodGet:
		handleListTokens(h.service, w)
	case http.MethodPost:
		handleCreateToken(h.service, w, r)
	case http.MethodDelete:
		handleDeleteToken(h.service, w, r)
	default:
		methodNotAllowed(w)
	}
}

func (h *handler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, 4<<10, &request) {
		return
	}
	user, err := h.service.Authenticate(request.Username, request.Password)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "username or password is incorrect")
		return
	}
	response, err := h.service.newSessionResponse(user)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "login_failed", "login failed")
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *handler) handleMe(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.authenticate(w, r)
	if !ok {
		return
	}
	if principal.kind == authKindKey {
		writeError(w, http.StatusForbidden, "user_session_required", "a user session is required")
		return
	}
	writeJSON(w, http.StatusOK, map[string]UserSummary{"user": summarizeUser(principal.user)})
}

func (h *handler) handlePassword(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.authenticate(w, r)
	if !ok {
		return
	}
	if principal.kind != authKindSession {
		writeError(w, http.StatusForbidden, "user_session_required", "a user session is required")
		return
	}
	if principal.user.PasswordHash == "" {
		writeError(w, http.StatusForbidden, "password_not_enabled", "this account uses an external identity provider")
		return
	}
	var request struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if !decodeJSON(w, r, 4<<10, &request) {
		return
	}
	if err := h.service.ChangePassword(principal.user, request.CurrentPassword, request.NewPassword); err != nil {
		switch {
		case errors.Is(err, ErrInvalidCredentials):
			writeError(w, http.StatusUnauthorized, "invalid_credentials", "current password is incorrect")
		case errors.Is(err, auth.ErrInvalidPasswordHash):
			writeError(w, http.StatusInternalServerError, "password_change_failed", "password change failed")
		default:
			writeError(w, http.StatusBadRequest, "password_change_failed", err.Error())
		}
		return
	}
	if err := h.service.database.DeleteSessionsByUser(principal.user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "password_change_failed", "password change failed")
		return
	}
	updated, err := h.service.database.GetUser(principal.user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password_change_failed", "password change failed")
		return
	}
	response, err := h.service.newSessionResponse(updated)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password_change_failed", "password change failed")
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *handler) handleLogout(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.authenticate(w, r)
	if !ok {
		return
	}
	if principal.kind == authKindSession {
		if err := h.service.database.DeleteSession(principal.sessionHash); err != nil {
			writeError(w, http.StatusInternalServerError, "logout_failed", "logout failed")
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) handleUsers(w http.ResponseWriter, r *http.Request) {
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
		users, err := h.service.ListUsers()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "list_failed", "list users failed")
			return
		}
		response := make([]UserSummary, 0, len(users))
		for _, user := range users {
			response = append(response, summarizeUser(user))
		}
		writeJSON(w, http.StatusOK, response)
	case http.MethodPost:
		var request struct {
			Username string `json:"username"`
			Role     string `json:"role"`
		}
		if !decodeJSON(w, r, 4<<10, &request) {
			return
		}
		role := strings.TrimSpace(request.Role)
		if role == "" {
			role = store.UserRoleViewer
		}
		if principal.kind == authKindSession && role == store.UserRoleAdmin {
			writeError(w, http.StatusForbidden, "invalid_role", "web users cannot create admin users")
			return
		}
		if role != store.UserRoleAdmin && role != store.UserRoleViewer && role != store.UserRoleReviewer {
			writeError(w, http.StatusBadRequest, "invalid_role", "role must be admin, viewer, or reviewer")
			return
		}
		created, err := h.service.CreateUser(request.Username, role)
		if err != nil {
			if errors.Is(err, store.ErrUserNameExists) {
				writeError(w, http.StatusConflict, "username_exists", "username already exists")
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

func (h *handler) handleUserByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.authenticate(w, r)
	if !ok || !h.requireAdmin(w, principal) {
		return
	}
	if principal.kind == authKindSession && principal.user.MustChangePassword {
		passwordChangeRequired(w)
		return
	}
	if r.Method != http.MethodPatch && r.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}
	idValue, ok := pathID(r.URL.Path, UsersPath)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_user_id", "user id is required")
		return
	}
	if r.Method == http.MethodPatch {
		h.handleUserRoleUpdate(w, r, idValue)
		return
	}
	target, err := h.service.database.GetUser(idValue)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user_not_found", "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "delete_failed", "delete user failed")
		return
	}
	if target.Role == store.UserRoleAdmin {
		writeError(w, http.StatusBadRequest, "cannot_delete_admin", "admin users cannot be deleted")
		return
	}
	if principal.kind == authKindSession && principal.user.ID == target.ID {
		writeError(w, http.StatusBadRequest, "cannot_delete_self", "the current user cannot be deleted")
		return
	}
	if err := h.service.database.DeleteUser(target.ID); err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user_not_found", "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "delete_failed", "delete user failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) handleUserRoleUpdate(w http.ResponseWriter, r *http.Request, userID string) {
	var request struct {
		Role string `json:"role"`
	}
	if !decodeJSON(w, r, 4<<10, &request) {
		return
	}
	role := strings.TrimSpace(request.Role)
	if role != store.UserRoleViewer && role != store.UserRoleReviewer {
		writeError(w, http.StatusBadRequest, "invalid_role", "role must be viewer or reviewer")
		return
	}
	if err := h.service.database.UpdateUserRole(userID, role); err != nil {
		switch {
		case errors.Is(err, store.ErrUserNotFound):
			writeError(w, http.StatusNotFound, "user_not_found", "user not found")
		case errors.Is(err, store.ErrAdminRoleImmutable):
			writeError(w, http.StatusBadRequest, "cannot_change_admin_role", "admin user role cannot be changed")
		default:
			writeError(w, http.StatusInternalServerError, "role_update_failed", "update user role failed")
		}
		return
	}
	updated, err := h.service.database.GetUser(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "role_update_failed", "update user role failed")
		return
	}
	writeJSON(w, http.StatusOK, summarizeUser(updated))
}

func (h *handler) handleUserPasswordReset(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.authenticate(w, r)
	if !ok || !h.requireAdmin(w, principal) {
		return
	}
	if principal.kind == authKindSession && principal.user.MustChangePassword {
		passwordChangeRequired(w)
		return
	}
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	userPath := strings.TrimSuffix(r.URL.Path, "/password")
	userID, ok := pathID(userPath, UsersPath)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_user_id", "user id is required")
		return
	}
	target, err := h.service.database.GetUser(userID)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user_not_found", "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "reset_failed", "reset password failed")
		return
	}
	if principal.kind == authKindSession && principal.user.ID == target.ID {
		writeError(w, http.StatusBadRequest, "cannot_reset_self", "the current user cannot reset their own password")
		return
	}

	reset, err := h.service.ResetUserPassword(target.ID)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user_not_found", "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "reset_failed", "reset password failed")
		return
	}
	writeJSON(w, http.StatusOK, reset)
}

func (h *handler) handleComments(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.authenticate(w, r)
	if !ok {
		return
	}
	if principal.kind == authKindSession && principal.user.MustChangePassword {
		passwordChangeRequired(w)
		return
	}
	comments, err := h.service.database.ListComments()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list_failed", "list comments failed")
		return
	}
	limit := parseCommentLimit(r.URL.Query().Get("limit"))
	offset := parseCommentOffset(r.URL.Query().Get("offset"))
	if offset > len(comments) {
		offset = len(comments)
	}
	end := offset + limit
	if end > len(comments) {
		end = len(comments)
	}
	items := make([]CommentSummary, 0, end-offset)
	for _, comment := range comments[offset:end] {
		items = append(items, summarizeComment(comment))
	}
	writeJSON(w, http.StatusOK, CommentListResponse{Items: items, Total: len(comments), Limit: limit, Offset: offset})
}

func (h *handler) handleCommentByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := h.authenticate(w, r)
	if !ok || !h.requireReviewer(w, principal) {
		return
	}
	if principal.kind == authKindSession && principal.user.MustChangePassword {
		passwordChangeRequired(w)
		return
	}
	if r.Method != http.MethodPatch {
		methodNotAllowed(w)
		return
	}
	idValue, ok := pathID(r.URL.Path, CommentsPath)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_comment_id", "comment id is required")
		return
	}
	var request struct {
		Completed *bool `json:"completed"`
	}
	if !decodeJSON(w, r, 4<<10, &request) {
		return
	}
	if request.Completed == nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "completed is required")
		return
	}
	comment, err := h.service.database.UpdateCommentCompleted(idValue, *request.Completed)
	if err != nil {
		if errors.Is(err, store.ErrCommentNotFound) {
			writeError(w, http.StatusNotFound, "comment_not_found", "comment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "update_failed", "update comment failed")
		return
	}
	writeJSON(w, http.StatusOK, summarizeComment(comment))
}

func (h *handler) authenticate(w http.ResponseWriter, r *http.Request) (principal, bool) {
	const prefix = "Bearer "
	authorization := r.Header.Get("Authorization")
	if !strings.HasPrefix(authorization, prefix) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "valid authorization is required")
		return principal{}, false
	}
	rawToken := strings.TrimSpace(strings.TrimPrefix(authorization, prefix))
	if rawToken == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "valid authorization is required")
		return principal{}, false
	}
	if KeysEqual(h.adminKey, rawToken) {
		return principal{kind: authKindKey}, true
	}
	sessionHash := auth.HashSessionToken(rawToken)
	session, err := h.service.database.GetSession(sessionHash)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "session_invalid", "session is invalid or expired")
		return principal{}, false
	}
	user, err := h.service.database.GetUser(session.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "session_invalid", "session user is invalid")
		return principal{}, false
	}
	return principal{kind: authKindSession, user: user, sessionHash: sessionHash}, true
}

func (h *handler) requireAdmin(w http.ResponseWriter, principal principal) bool {
	if principal.kind == authKindKey || principal.user.Role == store.UserRoleAdmin {
		return true
	}
	writeError(w, http.StatusForbidden, "forbidden", "administrator access is required")
	return false
}

func (h *handler) requireReviewer(w http.ResponseWriter, principal principal) bool {
	if principal.kind == authKindKey ||
		principal.user.Role == store.UserRoleAdmin ||
		principal.user.Role == store.UserRoleReviewer {
		return true
	}
	writeError(w, http.StatusForbidden, "forbidden", "reviewer or administrator access is required")
	return false
}

func (s *Service) CreateUser(username, role string) (CreatedUser, error) {
	temporaryPassword, err := auth.GenerateTemporaryPassword()
	if err != nil {
		return CreatedUser{}, fmt.Errorf("generate temporary password: %w", err)
	}
	passwordHash, err := auth.HashPassword(temporaryPassword)
	if err != nil {
		return CreatedUser{}, err
	}
	created, err := s.database.CreateUser(username, role, passwordHash, true)
	if err != nil {
		return CreatedUser{}, err
	}
	return CreatedUser{UserSummary: summarizeUser(created), TemporaryPassword: temporaryPassword}, nil
}

func (s *Service) ResetUserPassword(userID string) (ResetPasswordResponse, error) {
	target, err := s.database.GetUser(userID)
	if err != nil {
		return ResetPasswordResponse{}, err
	}
	temporaryPassword, err := auth.GenerateTemporaryPassword()
	if err != nil {
		return ResetPasswordResponse{}, fmt.Errorf("generate temporary password: %w", err)
	}
	passwordHash, err := auth.HashPassword(temporaryPassword)
	if err != nil {
		return ResetPasswordResponse{}, err
	}
	if err := s.database.ResetUserPassword(target.ID, passwordHash); err != nil {
		return ResetPasswordResponse{}, err
	}
	updated, err := s.database.GetUser(target.ID)
	if err != nil {
		return ResetPasswordResponse{}, err
	}
	return ResetPasswordResponse{
		UserSummary:       summarizeUser(updated),
		TemporaryPassword: temporaryPassword,
	}, nil
}

func (s *Service) Authenticate(username, password string) (store.User, error) {
	user, err := s.database.GetUserByUsername(username)
	if err != nil {
		return store.User{}, ErrInvalidCredentials
	}
	valid, err := auth.VerifyPassword(password, user.PasswordHash)
	if err != nil || !valid {
		return store.User{}, ErrInvalidCredentials
	}
	return user, nil
}

func (s *Service) ListUsers() ([]store.User, error) {
	return s.database.ListUsers()
}

func (s *Service) ChangePassword(user store.User, currentPassword, newPassword string) error {
	valid, err := auth.VerifyPassword(currentPassword, user.PasswordHash)
	if err != nil {
		return err
	}
	if !valid {
		return ErrInvalidCredentials
	}
	passwordHash, err := auth.HashPassword(newPassword)
	if err != nil {
		return err
	}
	return s.database.UpdateUserPassword(user.ID, passwordHash, false)
}

func (s *Service) newSessionResponse(user store.User) (SessionResponse, error) {
	rawToken, err := auth.GenerateSessionToken()
	if err != nil {
		return SessionResponse{}, err
	}
	expiresAt := time.Now().UTC().Add(sessionTTL)
	if err := s.database.CreateSession(store.Session{
		TokenHash: auth.HashSessionToken(rawToken),
		UserID:    user.ID,
		ExpiresAt: expiresAt,
	}); err != nil {
		return SessionResponse{}, err
	}
	return SessionResponse{AccessToken: rawToken, TokenType: "Bearer", ExpiresAt: expiresAt, User: summarizeUser(user)}, nil
}

func summarizeUser(user store.User) UserSummary {
	methods := make([]string, 0, 3)
	if user.PasswordHash != "" {
		methods = append(methods, "password")
	}
	if len(user.OIDCProviderIDs) > 0 {
		methods = append(methods, "oidc")
	}
	if user.TOTPSecret != "" {
		methods = append(methods, "totp")
	}
	if len(user.FIDO2Credentials) > 0 {
		methods = append(methods, "fido2")
	}
	return UserSummary{
		ID: user.ID, Username: user.Username, Email: user.Email, Role: user.Role,
		OIDCProviderIDs:       user.OIDCProviderIDs,
		MustChangePassword:    user.MustChangePassword,
		AuthenticationMethods: methods, CreatedAt: user.CreatedAt,
	}
}

func summarizeComment(comment store.Comment) CommentSummary {
	return CommentSummary{
		ID: comment.ID, Username: comment.Username, Email: comment.Email,
		Comments: comment.Comments, SourcePath: comment.SourcePath,
		PageTitle: comment.PageTitle, CreatedAt: comment.CreatedAt,
		Completed: comment.Completed,
	}
}

func pathID(path, prefix string) (string, bool) {
	rawID := strings.TrimPrefix(path, prefix+"/")
	if rawID == "" || strings.Contains(rawID, "/") {
		return "", false
	}
	idValue, err := url.PathUnescape(rawID)
	if err != nil || strings.TrimSpace(idValue) == "" {
		return "", false
	}
	return strings.TrimSpace(idValue), true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, maxBytes int64, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "request body must be JSON")
		return false
	}
	if err := ensureJSONEOF(decoder); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "request body must contain one JSON object")
		return false
	}
	return true
}

func parseCommentLimit(value string) int {
	if value == "" {
		return defaultCommentLimit
	}
	limit, err := strconv.Atoi(value)
	if err != nil || limit < 1 {
		return defaultCommentLimit
	}
	if limit > maxCommentLimit {
		return maxCommentLimit
	}
	return limit
}

func parseCommentOffset(value string) int {
	if value == "" {
		return 0
	}
	offset, err := strconv.Atoi(value)
	if err != nil || offset < 0 {
		return 0
	}
	return offset
}

func passwordChangeRequired(w http.ResponseWriter) {
	writeError(w, http.StatusForbidden, "password_change_required", "password must be changed before using this API")
}

func methodNotAllowed(w http.ResponseWriter) {
	writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
}
