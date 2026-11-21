import { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { exchangeOIDCLogin, getCurrentUser, logout } from "./api";
import { AdminShell } from "./components/admin/AdminShell";
import { LoginScreen } from "./components/auth/LoginScreen";
import { PasswordChangeScreen } from "./components/auth/PasswordChangeScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { useI18n } from "./i18n";
import {
    clearToken,
    persistSession,
    readRememberPreference,
    readStoredTheme,
    readStoredToken,
    THEME_KEY,
} from "./session";
import type { SessionResponse, Theme, User } from "./types";
import { getErrorMessage } from "./utils";
import { ADMIN_ROUTES } from "./route-paths";

function readSystemDarkMode() {
    return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
    );
}

export default function AuthenticatedApp() {
    const { t } = useI18n();
    const location = useLocation();
    const isLoginRoute =
        location.pathname === ADMIN_ROUTES.login ||
        location.pathname === ADMIN_ROUTES.login.slice(0, -1);
    const [token, setToken] = useState<string | null>(() => readStoredToken());
    const [user, setUser] = useState<User | null>(null);
    const [theme, setTheme] = useState<Theme>(readStoredTheme);
    const [systemDarkMode, setSystemDarkMode] = useState(readSystemDarkMode);
    const [booting, setBooting] = useState(true);
    const [authError, setAuthError] = useState("");
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

        setSystemDarkMode(mediaQuery.matches);
        mediaQuery.addEventListener("change", handleSystemThemeChange);
        return () => {
            mediaQuery.removeEventListener("change", handleSystemThemeChange);
        };
    }, []);

    const handleSession = useCallback(
        (session: SessionResponse, remember = readRememberPreference()) => {
            persistSession(session, remember);
            setToken(session.access_token);
            setUser(session.user);
            setAuthError("");
        },
        [],
    );

    const clearSession = useCallback(() => {
        clearToken();
        setToken(null);
        setUser(null);
    }, []);

    const handleSessionExpired = useCallback(() => {
        setAuthError(t.errors.sessionExpired);
        clearSession();
    }, [clearSession, t]);

    useEffect(() => {
        let active = true;
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const oidcTicket = fragment.get("oidc_ticket");
        const oidcError = fragment.get("oidc_error");

        if (oidcTicket || oidcError) {
            window.history.replaceState(
                {},
                document.title,
                `${window.location.pathname}${window.location.search}`,
            );
            if (oidcError) {
                setAuthError(t.auth.oidcLoginFailed);
                setBooting(false);
                return;
            }

            setBooting(true);
            exchangeOIDCLogin(oidcTicket!)
                .then(({ session, remember }) => {
                    if (active) {
                        handleSession(session, remember);
                    }
                })
                .catch((error: unknown) => {
                    if (active) {
                        setAuthError(getErrorMessage(error));
                    }
                })
                .finally(() => {
                    if (active) {
                        setBooting(false);
                    }
                });
            return () => {
                active = false;
            };
        }

        const storedToken = readStoredToken();
        if (!storedToken) {
            setBooting(false);
            return () => {
                active = false;
            };
        }

        setBooting(true);
        setToken(storedToken);
        getCurrentUser(storedToken)
            .then((response) => {
                if (active) {
                    setUser(response.user);
                    setAuthError("");
                }
            })
            .catch(() => {
                if (active) {
                    clearSession();
                }
            })
            .finally(() => {
                if (active) {
                    setBooting(false);
                }
            });

        return () => {
            active = false;
        };
    }, [clearSession, handleSession, t.auth.oidcLoginFailed]);

    const handleLogout = useCallback(async () => {
        if (token) {
            try {
                await logout(token);
            } catch {
                // A local logout is still safe when the server session has expired.
            }
        }
        clearSession();
    }, [clearSession, token]);

    const toggleTheme = useCallback(() => {
        setTheme((current) =>
            current === "auto"
                ? "dark"
                : current === "dark"
                  ? "light"
                  : "auto",
        );
    }, []);

    const setThemeMode = useCallback((nextTheme: Theme) => {
        setTheme(nextTheme);
    }, []);

    if (booting) {
        return <LoadingScreen label={t.loading.restoringSession} />;
    }
    if (!token || !user) {
        if (!isLoginRoute) {
            return <Navigate replace to={ADMIN_ROUTES.login} />;
        }
        return (
            <LoginScreen
                error={authError}
                onLogin={handleSession}
                onThemeToggle={toggleTheme}
                isDark={isDark}
            />
        );
    }
    if (isLoginRoute) {
        return <Navigate replace to={ADMIN_ROUTES.overview} />;
    }
    if (user.must_change_password) {
        return (
            <PasswordChangeScreen
                onChanged={handleSession}
                onLogout={handleLogout}
                onThemeToggle={toggleTheme}
                isDark={isDark}
                token={token}
                user={user}
            />
        );
    }

    return (
        <AdminShell
            onLogout={handleLogout}
            onSessionChanged={handleSession}
            onSessionExpired={handleSessionExpired}
            onThemeChange={setThemeMode}
            theme={theme}
            token={token}
            user={user}
        />
    );
}
