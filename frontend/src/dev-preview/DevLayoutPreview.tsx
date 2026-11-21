import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "../components/admin/AdminShell";
import { LoginScreen } from "../components/auth/LoginScreen";
import { readStoredTheme, THEME_KEY } from "../session";
import type { Theme } from "../types";
import { previewAdminUser } from "./mock-api";

function readSystemDarkMode() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function DevLayoutPreview({ showLogin = false }: { showLogin?: boolean }) {
    const [theme, setTheme] = useState<Theme>(readStoredTheme);
    const [systemDarkMode, setSystemDarkMode] =
        useState(readSystemDarkMode);
    const isDark = theme === "dark" || (theme === "auto" && systemDarkMode);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", isDark);
        localStorage.setItem(THEME_KEY, theme);
    }, [isDark, theme]);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleSystemThemeChange = (event: MediaQueryListEvent) => {
            setSystemDarkMode(event.matches);
        };

        mediaQuery.addEventListener("change", handleSystemThemeChange);
        return () => {
            mediaQuery.removeEventListener("change", handleSystemThemeChange);
        };
    }, []);

    const noOperation = useCallback(() => {}, []);
    const toggleTheme = useCallback(() => {
        setTheme((current) =>
            current === "auto"
                ? "dark"
                : current === "dark"
                  ? "light"
                  : "auto",
        );
    }, []);

    if (showLogin) {
        return (
            <LoginScreen
                error=""
                isDark={isDark}
                onLogin={noOperation}
                onThemeToggle={toggleTheme}
            />
        );
    }

    return (
        <AdminShell
            onLogout={noOperation}
            onSessionChanged={noOperation}
            onSessionExpired={noOperation}
            onThemeChange={setTheme}
            theme={theme}
            token="dev-layout-preview"
            user={previewAdminUser}
        />
    );
}
