import type { StoredUser } from "../types";

export function getStoredUser(): StoredUser | null {
    try {
        const raw = window.localStorage.getItem("meow-comments-user");
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            "name" in parsed &&
            "email" in parsed &&
            typeof parsed.name === "string" &&
            typeof parsed.email === "string"
        ) {
            return {
                name: parsed.name,
                email: parsed.email,
            };
        }
    } catch {
        // Local storage can be unavailable in private browsing contexts.
    }
    return null;
}

export function saveStoredUser(user: StoredUser) {
    try {
        window.localStorage.setItem("meow-comments-user", JSON.stringify(user));
    } catch {
        // Remembering user information is optional and must not block submission.
    }
}

export function getStoredDraft() {
    try {
        return window.localStorage.getItem("ArtalkContent") || "";
    } catch {
        return "";
    }
}

export function saveStoredDraft(content: string) {
    try {
        window.localStorage.setItem("ArtalkContent", content.trim());
    } catch {
        // Draft restoration is optional and must not block editing.
    }
}
