import { getTranslations, interpolate } from "./i18n";
import type {
  Comment,
  CommentListResponse,
  CreatedUser,
  OIDCLoginOption,
  OIDCProvider,
  OIDCProviderDeleteResult,
  SessionResponse,
  TemporaryPasswordUser,
  User,
  UserRole,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const OIDC_CALLBACK_PATH = "/api/admin/auth/oidc/callback";

export async function getBackendVersion() {
  const response = await request<{ version: string }>("/api/admin/version");
  return response.version;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_LAYOUT_PREVIEW === "true"
  ) {
    const { requestPreviewApi } = await import("./dev-preview/mock-api");
    return requestPreviewApi<T>(path, init);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = interpolate(getTranslations().errors.requestFailed, {
      status: response.status,
    });
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) {
        message = body.message;
      }
    } catch {
      // Keep the HTTP fallback message when the server did not return JSON.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function login(username: string, password: string) {
  return request<SessionResponse>("/api/admin/auth/login", {
    body: JSON.stringify({ username, password }),
    method: "POST",
  });
}

export function listOIDCLoginOptions() {
  return request<OIDCLoginOption[]>("/api/admin/auth/oidc/providers");
}

export function listOIDCProviders(token: string) {
  return request<OIDCProvider[]>("/api/admin/oidc/providers", {
    headers: authHeaders(token),
  });
}

export function createOIDCProvider(
  token: string,
  input: {
    name: string;
    issuer: string;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
  },
) {
  return request<OIDCProvider>("/api/admin/oidc/providers", {
    body: JSON.stringify(input),
    headers: authHeaders(token),
    method: "POST",
  });
}

export function updateOIDCProvider(
  token: string,
  providerID: string,
  input: {
    name: string;
    issuer: string;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
  },
) {
  return request<OIDCProvider>(
    `/api/admin/oidc/providers/${encodeURIComponent(providerID)}`,
    {
      body: JSON.stringify(input),
      headers: authHeaders(token),
      method: "PATCH",
    },
  );
}

export function deleteOIDCProvider(token: string, providerID: string) {
  return request<OIDCProviderDeleteResult>(
    `/api/admin/oidc/providers/${encodeURIComponent(providerID)}`,
    {
      headers: authHeaders(token),
      method: "DELETE",
    },
  );
}

export function getOIDCCallbackURL() {
  const base = API_BASE || window.location.origin;
  return `${base}${OIDC_CALLBACK_PATH}`;
}

export function getOIDCLoginURL(
  providerID: string,
  remember: boolean,
  returnTo: string,
) {
  const base = API_BASE || window.location.origin;
  const url = new URL(
    `/api/admin/auth/oidc/${encodeURIComponent(providerID)}/login`,
    base,
  );
  url.searchParams.set("remember", String(remember));
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}

export function exchangeOIDCLogin(ticket: string) {
  return request<{ session: SessionResponse; remember: boolean }>(
    "/api/admin/auth/oidc/exchange",
    {
      body: JSON.stringify({ ticket }),
      method: "POST",
    },
  );
}

export function getCurrentUser(token: string) {
  return request<{ user: User }>("/api/admin/auth/me", {
    headers: authHeaders(token),
  });
}

export function changePassword(token: string, currentPassword: string, newPassword: string) {
  return request<SessionResponse>("/api/admin/auth/password", {
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    headers: authHeaders(token),
    method: "POST",
  });
}

export function logout(token: string) {
  return request<void>("/api/admin/auth/logout", {
    headers: authHeaders(token),
    method: "POST",
  });
}

export function listUsers(token: string) {
  return request<User[]>("/api/admin/users", { headers: authHeaders(token) });
}

export function createUser(
  token: string,
  username: string,
  role: Exclude<UserRole, "admin">,
) {
  return request<CreatedUser>("/api/admin/users", {
    body: JSON.stringify({ role, username }),
    headers: authHeaders(token),
    method: "POST",
  });
}

export function updateUserRole(
  token: string,
  userID: string,
  role: Exclude<UserRole, "admin">,
) {
  return request<User>(`/api/admin/users/${encodeURIComponent(userID)}`, {
    body: JSON.stringify({ role }),
    headers: authHeaders(token),
    method: "PATCH",
  });
}

export function resetUserPassword(token: string, userID: string) {
  return request<TemporaryPasswordUser>(
    `/api/admin/users/${encodeURIComponent(userID)}/password`,
    {
      headers: authHeaders(token),
      method: "POST",
    },
  );
}

export function deleteUser(token: string, userID: string) {
  return request<void>(`/api/admin/users/${encodeURIComponent(userID)}`, {
    headers: authHeaders(token),
    method: "DELETE",
  });
}

export function updateCommentCompleted(token: string, commentID: string, completed: boolean) {
  return request<Comment>(`/api/admin/comments/${encodeURIComponent(commentID)}`, {
    body: JSON.stringify({ completed }),
    headers: authHeaders(token),
    method: "PATCH",
  });
}

export function listComments(token: string, limit = 50, offset = 0) {
  return request<CommentListResponse>(`/api/admin/comments?limit=${limit}&offset=${offset}`, {
    headers: authHeaders(token),
  });
}
