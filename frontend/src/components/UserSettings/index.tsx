import { type SubmitEvent, useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { changePassword } from "../../api";
import { useI18n } from "../../i18n";
import type { SessionResponse, User } from "../../types";
import { getErrorMessage } from "../../utils";
import styles from "./UserSettings.module.css";

interface UserSettingsProps {
    onClose: () => void;
    onSessionChanged: (session: SessionResponse) => void;
    token: string;
    user: User;
}

export function UserSettings({
    onClose,
    onSessionChanged,
    token,
    user,
}: UserSettingsProps) {
    const { t } = useI18n();
    const titleId = useId();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

    const closePasswordDialog = useCallback(() => {
        setIsPasswordDialogOpen(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setError("");
    }, []);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape" && !isSubmitting) {
                if (isPasswordDialogOpen) {
                    closePasswordDialog();
                } else {
                    onClose();
                }
            }
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [closePasswordDialog, isPasswordDialogOpen, isSubmitting, onClose]);

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (newPassword.length < 12) {
            setError(t.errors.passwordTooShort);
            return;
        }
        if (newPassword.length > 128) {
            setError(t.errors.passwordTooLong);
            return;
        }
        if (newPassword !== confirmPassword) {
            setError(t.errors.passwordMismatch);
            return;
        }

        setIsSubmitting(true);
        try {
            const session = await changePassword(
                token,
                currentPassword,
                newPassword,
            );
            onSessionChanged(session);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setSuccess(t.accountSettings.passwordUpdated);
            setIsPasswordDialogOpen(false);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setIsSubmitting(false);
        }
    }

    const roleLabel =
        user.role === "admin"
            ? t.roles.administrator
            : user.role === "reviewer"
              ? t.roles.reviewer
              : t.roles.viewer;
    const hasPasswordLogin = user.authentication_methods.includes("password");

    return createPortal(
        <div className={styles.overlay}>
            <button
                aria-label={t.common.close}
                className={styles.scrim}
                disabled={isSubmitting}
                onClick={onClose}
                type="button"
            />
            <section
                aria-labelledby={titleId}
                aria-modal="true"
                className={styles.panel}
                role="dialog"
            >
                <header className={styles.header}>
                    <div>
                        <p className={styles.eyebrow}>{t.accountSettings.eyebrow}</p>
                        <h2 id={titleId}>{t.accountSettings.title}</h2>
                        <p className={styles.description}>
                            {t.accountSettings.description}
                        </p>
                    </div>
                    <button
                        aria-label={t.common.close}
                        className={styles.closeButton}
                        disabled={isSubmitting}
                        onClick={onClose}
                        type="button"
                    >
                        <X aria-hidden="true" />
                    </button>
                </header>

                <div className={styles.content}>
                    <section
                        aria-label={t.accountSettings.profile}
                        className={styles.profileCard}
                    >
                        <div className={styles.profileIdentity}>
                            <span className={styles.avatar} aria-hidden="true">
                                {user.username.slice(0, 1).toUpperCase()}
                            </span>
                            <div className={styles.profileHeading}>
                                <strong>{user.username}</strong>
                                <span className={styles.roleBadge}>
                                    {t.accountSettings.role}: {roleLabel}
                                </span>
                            </div>
                        </div>
                    </section>

                    <section
                        aria-labelledby={`${titleId}-security`}
                        className={styles.securitySection}
                    >
                        {hasPasswordLogin ? (
                            <>
                                <div className={styles.sectionHeading}>
                                    <h3 id={`${titleId}-security`}>
                                        {t.accountSettings.security}
                                    </h3>
                                    <p>{t.accountSettings.securityDescription}</p>
                                </div>
                                <button
                                    aria-haspopup="dialog"
                                    className={styles.securityAction}
                                    onClick={() => {
                                        setError("");
                                        setSuccess("");
                                        setIsPasswordDialogOpen(true);
                                    }}
                                    type="button"
                                >
                                    {t.auth.changePassword}
                                </button>
                            </>
                        ) : (
                            <div className={styles.sectionHeading}>
                                <h3 id={`${titleId}-security`}>
                                    {t.accountSettings.security}
                                </h3>
                                <p>{t.oidc.passwordManaged}</p>
                            </div>
                        )}
                        {success && (
                            <div className={styles.successMessage} role="status">
                                <CheckCircle2 aria-hidden="true" />
                                <span>{success}</span>
                            </div>
                        )}
                    </section>
                </div>
            </section>

            {hasPasswordLogin && isPasswordDialogOpen && (
                <div className={styles.passwordOverlay}>
                    <button
                        aria-label={t.common.close}
                        className={styles.scrim}
                        disabled={isSubmitting}
                        onClick={closePasswordDialog}
                        type="button"
                    />
                    <section
                        aria-labelledby={`${titleId}-password-title`}
                        aria-modal="true"
                        className={styles.passwordPanel}
                        role="dialog"
                    >
                        <header className={styles.passwordHeader}>
                            <div>
                                <h3 id={`${titleId}-password-title`}>
                                    {t.auth.changePassword}
                                </h3>
                                <p>{t.accountSettings.securityDescription}</p>
                            </div>
                            <button
                                aria-label={t.common.close}
                                className={styles.closeButton}
                                disabled={isSubmitting}
                                onClick={closePasswordDialog}
                                type="button"
                            >
                                <X aria-hidden="true" />
                            </button>
                        </header>
                        {error && (
                            <div className={styles.errorMessage} role="alert">
                                <AlertCircle aria-hidden="true" />
                                <span>{error}</span>
                            </div>
                        )}
                        <form className={styles.form} onSubmit={handleSubmit}>
                            <label className={styles.field}>
                                <span>{t.auth.currentPassword}</span>
                                <input
                                    autoComplete="current-password"
                                    autoFocus
                                    disabled={isSubmitting}
                                    onChange={(event) => {
                                        setCurrentPassword(event.target.value);
                                        setError("");
                                        setSuccess("");
                                    }}
                                    required
                                    type="password"
                                    value={currentPassword}
                                />
                            </label>
                            <label className={styles.field}>
                                <span>{t.auth.newPassword}</span>
                                <input
                                    autoComplete="new-password"
                                    disabled={isSubmitting}
                                    maxLength={128}
                                    minLength={12}
                                    onChange={(event) => {
                                        setNewPassword(event.target.value);
                                        setError("");
                                        setSuccess("");
                                    }}
                                    placeholder={t.auth.passwordPlaceholder}
                                    required
                                    type="password"
                                    value={newPassword}
                                />
                            </label>
                            <label className={styles.field}>
                                <span>{t.auth.confirmNewPassword}</span>
                                <input
                                    autoComplete="new-password"
                                    disabled={isSubmitting}
                                    maxLength={128}
                                    minLength={12}
                                    onChange={(event) => {
                                        setConfirmPassword(event.target.value);
                                        setError("");
                                        setSuccess("");
                                    }}
                                    required
                                    type="password"
                                    value={confirmPassword}
                                />
                            </label>
                            <p className={styles.passwordHint}>
                                {t.accountSettings.passwordPolicy}
                            </p>
                            <footer className={styles.actions}>
                                <button
                                    className={styles.cancelButton}
                                    disabled={isSubmitting}
                                    onClick={onClose}
                                    type="button"
                                >
                                    {t.common.cancel}
                                </button>
                                <button
                                    className={styles.saveButton}
                                    disabled={isSubmitting}
                                    type="submit"
                                >
                                    {isSubmitting
                                        ? t.common.saving
                                        : t.auth.changePassword}
                                </button>
                            </footer>
                        </form>
                    </section>
                </div>
            )}
        </div>,
        document.body,
    );
}
