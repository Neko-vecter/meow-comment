import { ApiError } from "./api";
import { getTranslations } from "./i18n";
import type { User } from "./types";

export function getErrorMessage(error: unknown) {
    if (error instanceof ApiError || error instanceof Error) {
        return error.message;
    }
    return getTranslations().errors.operationFailed;
}

export function formatDate(value: string) {
    return new Intl.DateTimeFormat(getTranslations().locale, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

export function roleName(role: User["role"]) {
    const t = getTranslations();
    switch (role) {
        case "admin":
            return t.roles.administrator;
        case "reviewer":
            return t.roles.reviewer;
        default:
            return t.roles.viewer;
    }
}

export function handleDataError(
    error: unknown,
    onSessionExpired: () => void,
    setError: (message: string) => void,
) {
    if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
    }
    setError(getErrorMessage(error));
}
