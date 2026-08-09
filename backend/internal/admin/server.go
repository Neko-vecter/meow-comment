package admin

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"moew-comment/backend/internal/store"
	"moew-comment/backend/internal/token"
)

const TokenPath = "/api/admin/tokens"

type CreatedToken struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Token string `json:"token"`
}

type Service struct {
	database *store.Store
}

func NewService(database *store.Store) *Service {
	return &Service{database: database}
}

func (s *Service) CreateToken(name string) (CreatedToken, error) {
	rawToken, err := token.Generate()
	if err != nil {
		return CreatedToken{}, fmt.Errorf("generate token: %w", err)
	}
	created, err := s.database.CreateToken(name, rawToken)
	if err != nil {
		return CreatedToken{}, err
	}
	return CreatedToken{ID: created.ID, Name: created.Name, Token: rawToken}, nil
}

func (s *Service) DeleteToken(name, id string) error {
	return s.database.DeleteToken(name, id)
}

func NewHandler(database *store.Store, key string) http.Handler {
	service := NewService(database)
	mux := http.NewServeMux()
	mux.HandleFunc(TokenPath, func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			handleCreateToken(service, w, r)
		case http.MethodDelete:
			handleDeleteToken(service, w, r)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		}
	})

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !authorized(r, key) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "valid admin authorization is required")
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func authorized(r *http.Request, key string) bool {
	const prefix = "Bearer "
	authorization := r.Header.Get("Authorization")
	if !strings.HasPrefix(authorization, prefix) {
		return false
	}
	return KeysEqual(key, strings.TrimSpace(strings.TrimPrefix(authorization, prefix)))
}

func handleCreateToken(service *Service, w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	var request struct {
		Name string `json:"name"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "request body must be JSON with a name")
		return
	}
	if err := ensureJSONEOF(decoder); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "request body must contain one JSON object")
		return
	}

	created, err := service.CreateToken(request.Name)
	if err != nil {
		if errors.Is(err, store.ErrTokenNameExists) {
			writeError(w, http.StatusConflict, "token_name_exists", "token name already exists")
			return
		}
		writeError(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func handleDeleteToken(service *Service, w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if (name == "") == (id == "") {
		writeError(w, http.StatusBadRequest, "invalid_request", "exactly one of name or id is required")
		return
	}
	if err := service.DeleteToken(name, id); err != nil {
		if errors.Is(err, store.ErrTokenNotFound) {
			writeError(w, http.StatusNotFound, "token_not_found", "token not found")
			return
		}
		writeError(w, http.StatusBadRequest, "delete_failed", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return errors.New("multiple JSON values")
		}
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}
