import type { SessionResponse, Theme } from "./types";

export const SESSION_KEY = "meow-comment-admin-session";
export const PERSISTENT_SESSION_KEY = "meow-comment-admin-session-persistent";
export const REMEMBER_KEY = "meow-comment-admin-remember";
export const THEME_KEY = "meow-comment-theme";

export function readStoredTheme(): Theme {
    if (typeof window === "undefined") {
        return "auto";
    }
    const storedTheme = localStorage.getItem(THEME_KEY);
    return storedTheme === "auto" ||
        storedTheme === "light" ||
        storedTheme === "dark"
        ? storedTheme
        : "auto";
}

export function readStoredToken() {
    if (typeof window === "undefined") {
        return null;
    }
    return (
        sessionStorage.getItem(SESSION_KEY) ??
        localStorage.getItem(PERSISTENT_SESSION_KEY)
    );
}

export function saveToken(token: string, remember: boolean) {
    if (typeof window === "undefined") {
        return;
    }
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(PERSISTENT_SESSION_KEY);
    localStorage.setItem(REMEMBER_KEY, String(remember));
    (remember ? localStorage : sessionStorage).setItem(
        remember ? PERSISTENT_SESSION_KEY : SESSION_KEY,
        token,
    );
}

export function clearToken() {
    if (typeof window === "undefined") {
        return;
    }
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(PERSISTENT_SESSION_KEY);
    localStorage.removeItem(REMEMBER_KEY);
}

export function readRememberPreference() {
    if (typeof window === "undefined") {
        return false;
    }
    return localStorage.getItem(REMEMBER_KEY) === "true";
}

export function persistSession(session: SessionResponse, remember: boolean) {
    saveToken(session.access_token, remember);
}
