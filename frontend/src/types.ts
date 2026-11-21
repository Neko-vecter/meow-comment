export type UserRole = "admin" | "reviewer" | "viewer";
export type Theme = "auto" | "light" | "dark";

export interface User {
    id: string;
    username: string;
    email?: string;
    role: UserRole;
    oidc_provider_ids?: string[];
    must_change_password: boolean;
    authentication_methods: string[];
    created_at: string;
}

export interface OIDCProvider {
    id: string;
    name: string;
    issuer: string;
    client_id: string;
    redirect_uri: string;
    created_at: string;
}

export interface OIDCProviderDeleteResult {
    deleted_user_ids: string[];
    updated_users: User[];
}

export interface OIDCLoginOption {
    id: string;
    name: string;
}

export interface SessionResponse {
    access_token: string;
    token_type: string;
    expires_at: string;
    user: User;
}

export interface TemporaryPasswordUser extends User {
    temporary_password: string;
}

export type CreatedUser = TemporaryPasswordUser;

export interface Comment {
    id: string;
    username: string;
    email: string;
    comments: string;
    source_path: string;
    page_title: string;
    created_at: string;
    completed: boolean;
}

export interface CommentListResponse {
    items: Comment[];
    total: number;
    limit: number;
    offset: number;
}
