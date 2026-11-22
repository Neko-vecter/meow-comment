import { ExternalLink } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n";
import styles from "./ExternalLinkDialog.module.css";

interface ExternalLinkDialogProps {
    url: string;
    onCancel: () => void;
    onConfirm: () => void;
}

export function ExternalLinkDialog({
    url,
    onCancel,
    onConfirm,
}: ExternalLinkDialogProps) {
    const { t } = useI18n();
    const titleId = useId();
    const descriptionId = useId();
    const cancelButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const previousFocus = document.activeElement;
        cancelButtonRef.current?.focus();

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
            }
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            if (previousFocus instanceof HTMLElement) previousFocus.focus();
        };
    }, [onCancel]);

    return createPortal(
        <div
            className={styles.backdrop}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onCancel();
            }}
            role="presentation"
        >
            <section
                aria-describedby={descriptionId}
                aria-labelledby={titleId}
                aria-modal="true"
                className={styles.dialog}
                role="dialog"
            >
                <div className={styles.icon}>
                    <ExternalLink aria-hidden="true" />
                </div>
                <h2 id={titleId}>{t.dialog.externalLinkTitle}</h2>
                <p className={styles.description} id={descriptionId}>
                    {t.dialog.externalLinkWarning}
                </p>
                <span className={styles.destinationLabel}>
                    {t.dialog.externalLinkDestination}
                </span>
                <code className={styles.destination} title={url}>
                    {url}
                </code>
                <div className={styles.actions}>
                    <button
                        className={styles.cancelButton}
                        onClick={onCancel}
                        ref={cancelButtonRef}
                        type="button"
                    >
                        {t.common.cancel}
                    </button>
                    <button
                        className={styles.confirmButton}
                        onClick={onConfirm}
                        type="button"
                    >
                        {t.dialog.openExternalLink}
                    </button>
                </div>
            </section>
        </div>,
        document.body,
    );
}
