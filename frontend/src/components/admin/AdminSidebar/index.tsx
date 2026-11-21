import { Info, MessageCircle, Users, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { NavLink } from "react-router";
import { getBackendVersion } from "../../../api";
import { ADMIN_ROUTES } from "../../../route-paths";
import type { UserRole } from "../../../types";
import { useI18n } from "../../../i18n";
import "../admin.css";

interface AdminSidebarProps {
    role: UserRole;
}

export function AdminSidebar({ role }: AdminSidebarProps) {
    const { t } = useI18n();
    const versionTitleId = useId();
    const [helpOpen, setHelpOpen] = useState(false);
    const [backendVersion, setBackendVersion] = useState("backend-unknown");

    useEffect(() => {
        if (!helpOpen) return;
        void getBackendVersion()
            .then(setBackendVersion)
            .catch(() => setBackendVersion("backend-unknown"));
    }, [helpOpen]);

    useEffect(() => {
        if (!helpOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setHelpOpen(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [helpOpen]);

    return (
        <aside className="sidebar sidebar-icons">
            <div className="sidebar-section-label">{t.navigation.overview}</div>
            <nav className="main-nav" aria-label={t.navigation.main}>
                <NavLink
                    aria-label={t.navigation.overview}
                    className={({ isActive }) =>
                        isActive ? "nav-item active" : "nav-item"
                    }
                    data-tooltip={t.navigation.overview}
                    to={ADMIN_ROUTES.overview}
                >
                    <MessageCircle />
                    <span>{t.navigation.overview}</span>
                </NavLink>
            </nav>
            <div className="sidebar-bottom">
                {role === "admin" && (
                    <NavLink
                        aria-label={t.navigation.users}
                        className={({ isActive }) =>
                            isActive ? "nav-item active" : "nav-item"
                        }
                        data-tooltip={t.navigation.users}
                        to={ADMIN_ROUTES.users}
                    >
                        <Users />
                        <span>{t.navigation.users}</span>
                    </NavLink>
                )}
                <button
                    aria-label={t.navigation.help}
                    className="help-item"
                    data-tooltip={t.navigation.help}
                    onClick={() => setHelpOpen(true)}
                    type="button"
                >
                    <Info />
                    <span>{t.navigation.help}</span>
                </button>
            </div>
            {helpOpen && (
                <div
                    className="help-version-backdrop"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setHelpOpen(false);
                    }}
                >
                    <section
                        aria-labelledby={versionTitleId}
                        aria-modal="true"
                        className="help-version-dialog"
                        role="dialog"
                    >
                        <header className="help-version-header">
                            <div>
                                <p className="help-version-eyebrow">
                                    {t.helpVersion.eyebrow}
                                </p>
                                <h2 id={versionTitleId}>
                                    {t.helpVersion.title}
                                </h2>
                            </div>
                            <button
                                aria-label={t.common.close}
                                className="help-version-close"
                                onClick={() => setHelpOpen(false)}
                                type="button"
                            >
                                <X aria-hidden="true" />
                            </button>
                        </header>
                        <div className="help-version-content">
                            <code>{__FRONTEND_VERSION__}</code>
                            <code>{backendVersion}</code>
                        </div>
                    </section>
                </div>
            )}
        </aside>
    );
}
