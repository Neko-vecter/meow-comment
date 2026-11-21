import { useId, type ReactNode } from "react";
import styles from "./ConfirmPrompt.module.css";

export interface ConfirmPromptProps {
    id: string;
    title: ReactNode;
    description: ReactNode;
    cancelLabel: string;
    confirmLabel: string;
    pendingLabel?: string;
    isPending?: boolean;
    onCancel: () => void;
    onConfirm: () => void | Promise<void>;
}

export function ConfirmPrompt({
    id,
    title,
    description,
    cancelLabel,
    confirmLabel,
    pendingLabel,
    isPending = false,
    onCancel,
    onConfirm,
}: ConfirmPromptProps) {
    const promptId = useId();
    const titleId = `${promptId}-title`;
    const descriptionId = `${promptId}-description`;

    return (
        <div
            aria-describedby={descriptionId}
            aria-labelledby={titleId}
            aria-modal="false"
            className={styles.prompt}
            id={id}
            role="dialog"
        >
            <p className={styles.title} id={titleId}>
                {title}
            </p>
            <p className={styles.description} id={descriptionId}>
                {description}
            </p>
            <div className={styles.actions}>
                <button
                    autoFocus
                    className={styles.cancelButton}
                    disabled={isPending}
                    onClick={onCancel}
                    type="button"
                >
                    {cancelLabel}
                </button>
                <button
                    className={styles.confirmButton}
                    disabled={isPending}
                    onClick={onConfirm}
                    type="button"
                >
                    {isPending ? pendingLabel ?? confirmLabel : confirmLabel}
                </button>
            </div>
        </div>
    );
}
