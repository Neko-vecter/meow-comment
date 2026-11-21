import { Trash2 } from "lucide-react";
import {
    useEffect,
    useId,
    useRef,
    type MouseEvent,
    type SyntheticEvent,
} from "react";
import styles from "./DeletePrompt.module.css";

interface DeletePromptProps {
    cancelLabel: string;
    confirmLabel: string;
    description: string;
    isPending?: boolean;
    onCancel: () => void;
    onConfirm: () => void | Promise<void>;
    pendingLabel?: string;
    title: string;
}

export function DeletePrompt({
    cancelLabel,
    confirmLabel,
    description,
    isPending = false,
    onCancel,
    onConfirm,
    pendingLabel,
    title,
}: DeletePromptProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const id = useId();

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) {
            return;
        }

        dialog.showModal();
        return () => dialog.close();
    }, []);

    function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
        event.preventDefault();
        if (!isPending) {
            onCancel();
        }
    }

    function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
        if (event.target === event.currentTarget && !isPending) {
            onCancel();
        }
    }

    return (
        <dialog
            aria-describedby={`${id}-description`}
            aria-labelledby={`${id}-title`}
            className={styles.dialog}
            onClick={handleBackdropClick}
            onCancel={handleCancel}
            ref={dialogRef}
        >
            <div className={styles.content}>
                <div className={styles.heading}>
                    <span aria-hidden="true" className={styles.icon}>
                        <Trash2 />
                    </span>
                    <h2 id={`${id}-title`}>{title}</h2>
                </div>
                <p id={`${id}-description`} className={styles.description}>
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
        </dialog>
    );
}
