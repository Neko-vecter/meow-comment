import type { MeowCommentsConfig } from "./types";

export type { MeowCommentsConfig } from "./types";

export function resolveDarkMode(setting: MeowCommentsConfig["darkMode"]) {
    if (setting !== "auto") return setting === true;
    if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
    ) {
        return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getRootElement(el: MeowCommentsConfig["el"]) {
    if (typeof el === "string") {
        const root = document.querySelector<HTMLElement>(el);
        if (!root) throw new Error(`Element "${el}" not found.`);
        return root;
    }

    if (typeof HTMLElement !== "undefined" && el instanceof HTMLElement) {
        return el;
    }
    throw new Error("Please provide a valid `el` config for MeowComments.");
}

export function getCurrentSourcePath() {
    if (typeof window === "undefined") return "/";
    return window.location.pathname || "/";
}

export function getCurrentPageTitle() {
    return typeof document === "undefined"
        ? "Comments"
        : document.title || "Comments";
}
