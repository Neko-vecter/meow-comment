import {
    Bell,
    ChevronDown,
    ChevronRight,
    LogOut,
    Settings,
} from "lucide-react";
import packageInfo from "../../../../package.json";
import { useEffect, useRef, useState } from "react";
import { useI18n, type Locale } from "../../../i18n";
import type { SessionResponse, Theme, User } from "../../../types";
import { UserSettings } from "../../UserSettings";
import "../admin.css";

const FRONTEND_VERSION = packageInfo.version;

interface AdminHeaderProps {
    onLogout: () => void;
    onSessionChanged: (session: SessionResponse) => void;
    onThemeChange: (theme: Theme) => void;
    theme: Theme;
    token: string;
    user: User;
}

export function AdminHeader({
    onLogout,
    onSessionChanged,
    onThemeChange,
    theme,
    token,
    user,
}: AdminHeaderProps) {
    const { locale, setLocale, t } = useI18n();
    const [menuOpen, setMenuOpen] = useState(false);
    const [languageOpen, setLanguageOpen] = useState(false);
    const [themeOpen, setThemeOpen] = useState(false);
    const [userSettingsOpen, setUserSettingsOpen] = useState(false);
    const accountMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (
                accountMenuRef.current &&
                !accountMenuRef.current.contains(event.target as Node)
            ) {
                setMenuOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setMenuOpen(false);
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [menuOpen]);

    function selectLocale(nextLocale: Locale) {
        setLocale(nextLocale);
        setLanguageOpen(false);
    }

    function selectTheme(nextTheme: Theme) {
        onThemeChange(nextTheme);
        setThemeOpen(false);
    }

    const selectedLanguage =
        locale === "en"
            ? t.accountMenu.english
            : t.accountMenu.simplifiedChinese;
    const selectedTheme =
        theme === "auto"
            ? t.accountMenu.automatic
            : theme === "dark"
              ? t.accountMenu.dark
              : t.accountMenu.light;

    return (
        <header className="global-header">
            <div className="global-brand">
                <strong>{t.app.name}</strong>
            </div>
            <div className="global-actions">
                <button
                    aria-label={t.header.notifications}
                    className="header-icon"
                    type="button"
                >
                    <Bell />
                </button>
                <div className="account-menu" ref={accountMenuRef}>
                    <button
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        aria-label={`${t.header.account}: ${user.username}`}
                        className="account-menu-trigger"
                        onClick={() => setMenuOpen((open) => !open)}
                        type="button"
                    >
                        <span className="topbar-avatar">
                            {user.username.slice(0, 1).toUpperCase()}
                        </span>
                    </button>
                    {menuOpen && (
                        <div className="account-menu-popover" role="menu">
                            <div className="account-menu-identity">
                                <span className="topbar-avatar">
                                    {user.username.slice(0, 1).toUpperCase()}
                                </span>
                                <strong>{user.username}</strong>
                            </div>

                            <button
                                className="account-menu-settings-trigger"
                                onClick={() => {
                                    setMenuOpen(false);
                                    setLanguageOpen(false);
                                    setThemeOpen(false);
                                    setUserSettingsOpen(true);
                                }}
                                role="menuitem"
                                type="button"
                            >
                                <Settings aria-hidden="true" />
                                <span>{t.accountSettings.menuLabel}</span>
                            </button>

                            <div className="account-menu-preference">
                                <button
                                    aria-expanded={languageOpen}
                                    className="account-menu-preference-trigger"
                                    onClick={() => {
                                        setLanguageOpen((open) => !open);
                                        setThemeOpen(false);
                                    }}
                                    role="menuitem"
                                    type="button"
                                >
                                    <span>{t.accountMenu.language}</span>
                                    <span className="account-menu-current">
                                        {selectedLanguage}
                                    </span>
                                    {languageOpen ? (
                                        <ChevronDown aria-hidden="true" />
                                    ) : (
                                        <ChevronRight aria-hidden="true" />
                                    )}
                                </button>
                                {languageOpen && (
                                    <div className="account-menu-suboptions">
                                        <button
                                            aria-checked={locale === "en"}
                                            className={
                                                locale === "en"
                                                    ? "account-menu-suboption is-selected"
                                                    : "account-menu-suboption"
                                            }
                                            onClick={() => selectLocale("en")}
                                            role="menuitemradio"
                                            type="button"
                                        >
                                            {t.accountMenu.english}
                                        </button>
                                        <button
                                            aria-checked={locale === "zhHans"}
                                            className={
                                                locale === "zhHans"
                                                    ? "account-menu-suboption is-selected"
                                                    : "account-menu-suboption"
                                            }
                                            onClick={() =>
                                                selectLocale("zhHans")
                                            }
                                            role="menuitemradio"
                                            type="button"
                                        >
                                            {t.accountMenu.simplifiedChinese}
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="account-menu-preference">
                                <button
                                    aria-expanded={themeOpen}
                                    className="account-menu-preference-trigger"
                                    onClick={() => {
                                        setThemeOpen((open) => !open);
                                        setLanguageOpen(false);
                                    }}
                                    role="menuitem"
                                    type="button"
                                >
                                    <span>{t.accountMenu.theme}</span>
                                    <span className="account-menu-current">
                                        {selectedTheme}
                                    </span>
                                    {themeOpen ? (
                                        <ChevronDown aria-hidden="true" />
                                    ) : (
                                        <ChevronRight aria-hidden="true" />
                                    )}
                                </button>
                                {themeOpen && (
                                    <div className="account-menu-suboptions">
                                        {(
                                            [
                                                [
                                                    "auto",
                                                    t.accountMenu.automatic,
                                                ],
                                                ["dark", t.accountMenu.dark],
                                                ["light", t.accountMenu.light],
                                            ] as const
                                        ).map(([themeOption, label]) => (
                                            <button
                                                aria-checked={
                                                    theme === themeOption
                                                }
                                                className={
                                                    theme === themeOption
                                                        ? "account-menu-suboption is-selected"
                                                        : "account-menu-suboption"
                                                }
                                                key={themeOption}
                                                onClick={() =>
                                                    selectTheme(themeOption)
                                                }
                                                role="menuitemradio"
                                                type="button"
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="account-menu-divider" />
                            <div className="account-menu-version">
                                <span>{t.accountMenu.frontendVersion}</span>
                                <code>v{FRONTEND_VERSION}</code>
                            </div>
                            <button
                                className="account-menu-signout"
                                onClick={onLogout}
                                role="menuitem"
                                type="button"
                            >
                                <LogOut aria-hidden="true" />
                                {t.accountMenu.signOut}
                            </button>
                        </div>
                    )}
                </div>
            </div>
            {userSettingsOpen && (
                <UserSettings
                    onClose={() => setUserSettingsOpen(false)}
                    onSessionChanged={onSessionChanged}
                    token={token}
                    user={user}
                />
            )}
        </header>
    );
}
