import { useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import type { TemporaryPasswordUser } from "../../../types";
import { interpolate, useI18n } from "../../../i18n";
import "./TemporaryPasswordDialog.css";

interface TemporaryPasswordDialogProps {
    onClose: () => void;
    purpose?: "created" | "reset";
    user: TemporaryPasswordUser;
}

export function TemporaryPasswordDialog({
    onClose,
    purpose = "created",
    user,
}: TemporaryPasswordDialogProps) {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);
    const isReset = purpose === "reset";

    async function copyPassword() {
        await navigator.clipboard.writeText(user.temporary_password);
        setCopied(true);
    }

    return (
        <div className="modal-backdrop" role="presentation">
            <section
                aria-labelledby="temporary-password-title"
                aria-modal="true"
                className="modal"
                role="dialog"
            >
                <div className="modal-icon">
                    <Check />
                </div>
                <p className="eyebrow">
                    {isReset ? t.dialog.passwordResetEyebrow : t.dialog.accountCreated}
                </p>
                <h2 id="temporary-password-title">
                    {isReset ? t.dialog.passwordResetTitle : t.dialog.title}
                </h2>
                <p className="modal-description">
                    {interpolate(
                        isReset
                            ? t.dialog.passwordResetDescription
                            : t.dialog.description,
                        { username: user.username },
                    )}
                </p>
                <div className="temporary-password">
                    <code>{user.temporary_password}</code>
                    <button
                        aria-label={t.dialog.copyPassword}
                        className="copy-button"
                        onClick={() => void copyPassword()}
                        type="button"
                    >
                        {copied ? <Check /> : <Copy />}
                    </button>
                </div>
                <div className="modal-warning">
                    <ShieldCheck />
                    <span>{t.dialog.firstLoginWarning}</span>
                </div>
                <button
                    className="button button-primary button-wide"
                    onClick={onClose}
                    type="button"
                >
                    {t.dialog.savedSecurely}
                </button>
            </section>
        </div>
    );
}
