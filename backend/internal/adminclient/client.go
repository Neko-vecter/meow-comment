package adminclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"moew-comment/backend/internal/admin"
	"moew-comment/backend/internal/config"
)

type Client struct {
	baseURL    string
	adminKey   string
	httpClient *http.Client
}

func New(address, adminKey string) (*Client, error) {
	address = strings.TrimSpace(address)
	adminKey = strings.TrimSpace(adminKey)
	if address == "" {
		return nil, errors.New("admin listen address is required")
	}
	if err := config.ValidateAdminListen(address); err != nil {
		return nil, err
	}
	if err := admin.ValidateKey(adminKey); err != nil {
		return nil, err
	}
	return &Client{
		baseURL:    "http://" + address,
		adminKey:   adminKey,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}, nil
}

func (c *Client) CreateToken(ctx context.Context, name string) (admin.CreatedToken, error) {
	payload, err := json.Marshal(map[string]string{"name": name})
	if err != nil {
		return admin.CreatedToken{}, fmt.Errorf("encode create request: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+admin.TokenPath, bytes.NewReader(payload))
	if err != nil {
		return admin.CreatedToken{}, fmt.Errorf("create request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.adminKey)
	request.Header.Set("Content-Type", "application/json")

	var response admin.CreatedToken
	if err := c.do(request, http.StatusCreated, &response); err != nil {
		return admin.CreatedToken{}, err
	}
	return response, nil
}

func (c *Client) ListTokens(ctx context.Context) ([]admin.TokenSummary, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+admin.TokenPath, nil)
	if err != nil {
		return nil, fmt.Errorf("list request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.adminKey)

	var response []admin.TokenSummary
	if err := c.do(request, http.StatusOK, &response); err != nil {
		return nil, err
	}
	return response, nil
}

func (c *Client) DeleteToken(ctx context.Context, name, id string) error {
	query := url.Values{}
	if strings.TrimSpace(name) != "" {
		query.Set("name", strings.TrimSpace(name))
	}
	if strings.TrimSpace(id) != "" {
		query.Set("id", strings.TrimSpace(id))
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.baseURL+admin.TokenPath+"?"+query.Encode(), nil)
	if err != nil {
		return fmt.Errorf("delete request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.adminKey)
	return c.do(request, http.StatusNoContent, nil)
}

func (c *Client) do(request *http.Request, expectedStatus int, result any) error {
	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("admin request: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != expectedStatus {
		var failure struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		_ = json.NewDecoder(io.LimitReader(response.Body, 16<<10)).Decode(&failure)
		if failure.Message == "" {
			failure.Message = response.Status
		}
		if failure.Code != "" {
			return fmt.Errorf("admin request failed (%s): %s", failure.Code, failure.Message)
		}
		return fmt.Errorf("admin request failed: %s", failure.Message)
	}
	if result == nil {
		return nil
	}
	if err := json.NewDecoder(response.Body).Decode(result); err != nil {
		return fmt.Errorf("decode admin response: %w", err)
	}
	return nil
}
