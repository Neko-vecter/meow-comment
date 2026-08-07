import { useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./styles.module.css";
import { findLocaleSet, type MeowCommentsMessages } from "./i18n";

export type { MeowCommentsMessages } from "./i18n";

export interface MeowCommentsConfig {
    /** Comment server URL only; the frontend appends `/api` automatically. */
    baseUrl?: string;
    /** Artalk-compatible dark mode switch. `auto` follows the system preference. */
    darkMode?: boolean | "auto";
    /** Locale such as `zh-Hans`, `en`, or `auto`. Unknown locales fall back to English. */
    locale?: string;
    /** Override the page metadata sent to the one-way comment API. */
    sourcePath?: string;
    pageTitle?: string;
    /** `auto` discovers whether the server requires a CAPTCHA on the first submit. */
    captcha?: "auto" | "required" | "disabled";
    rememberUser?: boolean;
    messages?: Partial<MeowCommentsMessages>;
}

interface CaptchaResponse {
    uuid: string;
    captcha_base64: string;
}

interface StoredUser {
    name: string;
    email: string;
    link: string;
}

interface StatusMessage {
    kind: "success" | "error" | "info";
    text: string;
}

class RequestError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "RequestError";
        this.status = status;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function getResponseMessage(payload: unknown, fallback: string) {
    if (isRecord(payload) && typeof payload.message === "string")
        return payload.message;
    return fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...init, headers });
    const payload: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
        throw new RequestError(
            response.status,
            getResponseMessage(
                payload,
                response.statusText || "Request failed",
            ),
        );
    }

    return payload as T;
}

function getStoredUser(): StoredUser | null {
    try {
        const raw = window.localStorage.getItem("meow-comments-user");
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (
            isRecord(parsed) &&
            typeof parsed.name === "string" &&
            typeof parsed.email === "string"
        ) {
            return {
                name: parsed.name,
                email: parsed.email,
                link: typeof parsed.link === "string" ? parsed.link : "",
            };
        }
    } catch {
        // Local storage can be unavailable in private browsing contexts.
    }
    return null;
}

function saveStoredUser(user: StoredUser) {
    try {
        window.localStorage.setItem("meow-comments-user", JSON.stringify(user));
    } catch {
        // Remembering user information is optional and must not block submission.
    }
}

function getStoredDraft() {
    try {
        return window.localStorage.getItem("ArtalkContent") || "";
    } catch {
        return "";
    }
}

function saveStoredDraft(content: string) {
    try {
        window.localStorage.setItem("ArtalkContent", content.trim());
    } catch {
        // Draft restoration is optional and must not block editing.
    }
}

function getApiUrl(baseUrl: string, path: string) {
    const serverUrl = baseUrl.trim().replace(/\/+$/, "");
    return `${serverUrl}/api${path}`;
}

function getCurrentSourcePath() {
    if (typeof window === "undefined") return "/";
    return `${window.location.pathname}${window.location.search}` || "/";
}

function getCurrentPageTitle() {
    return typeof document === "undefined"
        ? "Comments"
        : document.title || "Comments";
}

function getCaptchaImage(value: string) {
    return value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeCaptchaResponse(value: CaptchaResponse) {
    if (!value.uuid || !value.captcha_base64) {
        throw new Error("Invalid verification response");
    }
    return { uuid: value.uuid, image: getCaptchaImage(value.captcha_base64) };
}

function resolveDarkMode(setting: MeowCommentsConfig["darkMode"]) {
    if (setting !== "auto") return setting === true;
    return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
    );
}

export default function MeowComments({
    config = {},
}: {
    config?: MeowCommentsConfig;
}) {
    const [isDarkMode, setIsDarkMode] = useState(() =>
        resolveDarkMode(config.darkMode),
    );
    const messages = useMemo(
        () => ({ ...findLocaleSet(config.locale), ...config.messages }),
        [config.locale, config.messages],
    );
    const rememberUser = config.rememberUser ?? true;
    const baseUrl = config.baseUrl ?? "";
    const captchaMode = config.captcha ?? "auto";
    const statusId = useId();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [initialUser] = useState(() =>
        rememberUser ? getStoredUser() : null,
    );
    const [initialComment] = useState(getStoredDraft);

    const [name, setName] = useState(() => initialUser?.name ?? "");
    const [email, setEmail] = useState(() => initialUser?.email ?? "");
    const [link, setLink] = useState(() => initialUser?.link ?? "");
    const [comment, setComment] = useState(initialComment);
    const [captchaCode, setCaptchaCode] = useState("");
    const [captcha, setCaptcha] = useState<{
        uuid: string;
        image: string;
    } | null>(null);
    const [captchaUnavailable, setCaptchaUnavailable] = useState(
        captchaMode === "disabled",
    );
    const [captchaLoading, setCaptchaLoading] = useState(false);
    const [captchaDialogOpen, setCaptchaDialogOpen] = useState(false);
    const [captchaDialogError, setCaptchaDialogError] = useState("");
    const [captchaConfirming, setCaptchaConfirming] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<StatusMessage | null>(() =>
        initialComment.trim()
            ? { kind: "info", text: messages.restoredMsg }
            : null,
    );

    useEffect(() => {
        if (config.darkMode !== "auto") return;
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = (event: MediaQueryListEvent) =>
            setIsDarkMode(event.matches);
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, [config.darkMode]);

    const adaptTextareaHeight = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const diff = textarea.offsetHeight - textarea.clientHeight;
        textarea.style.height = "0px";
        textarea.style.height = `${textarea.scrollHeight + diff}px`;
    };

    useEffect(() => {
        if (!status) return;
        const timeout = window.setTimeout(() => setStatus(null), 3000);
        return () => window.clearTimeout(timeout);
    }, [status]);

    useEffect(() => {
        saveStoredDraft(comment);
        const timeout = window.setTimeout(adaptTextareaHeight, 80);
        return () => window.clearTimeout(timeout);
    }, [comment]);

    const loadCaptcha = async () => {
        setCaptchaLoading(true);
        setStatus(null);
        setCaptchaDialogError("");
        try {
            const response = await requestJson<CaptchaResponse>(
                getApiUrl(baseUrl, "/verification"),
            );
            setCaptcha(normalizeCaptchaResponse(response));
            setCaptchaCode("");
            setCaptchaUnavailable(false);
            setCaptchaDialogOpen(true);
            return "ready" as const;
        } catch (error) {
            if (
                captchaMode === "auto" &&
                error instanceof RequestError &&
                error.status === 404
            ) {
                setCaptcha(null);
                setCaptchaUnavailable(true);
                return "disabled" as const;
            }
            setStatus({
                kind: "error",
                text:
                    error instanceof TypeError
                        ? messages.networkFail
                        : messages.commentFail,
            });
            return "error" as const;
        } finally {
            setCaptchaLoading(false);
        }
    };

    const handleRefreshCaptcha = async () => {
        if (!captchaLoading && !isSubmitting) await loadCaptcha();
    };

    const submitComment = async () => {
        if (isSubmitting || captchaLoading) return;

        const trimmedName = name.trim();
        const trimmedEmail = email.trim();
        const trimmedComment = comment.trim();

        if (!trimmedComment) {
            textareaRef.current?.focus();
            return;
        }
        if (!trimmedName || !trimmedEmail) {
            setStatus({ kind: "error", text: messages.required });
            return;
        }
        if (!isValidEmail(trimmedEmail)) {
            setStatus({ kind: "error", text: messages.invalidEmail });
            return;
        }

        if (captchaMode !== "disabled" && !captchaUnavailable) {
            if (!captcha) {
                const captchaResult = await loadCaptcha();
                if (captchaResult !== "disabled") return;
            }
            if (!captchaCode.trim()) {
                setCaptchaDialogError(messages.captchaRequired);
                setCaptchaDialogOpen(true);
                return;
            }
        }

        setIsSubmitting(true);
        setStatus(null);
        try {
            await requestJson<{ ok: boolean }>(getApiUrl(baseUrl, "/comment"), {
                method: "POST",
                body: JSON.stringify({
                    username: trimmedName,
                    email: trimmedEmail,
                    comments: comment,
                    source_path: config.sourcePath ?? getCurrentSourcePath(),
                    page_title: config.pageTitle ?? getCurrentPageTitle(),
                    verification_uuid: captcha?.uuid ?? "",
                    verification_code: captchaCode.trim(),
                }),
            });
            if (rememberUser)
                saveStoredUser({
                    name: trimmedName,
                    email: trimmedEmail,
                    link,
                });
            setComment("");
            setCaptcha(null);
            setCaptchaCode("");
            setCaptchaDialogOpen(false);
            setStatus({ kind: "success", text: messages.success });
        } catch (error) {
            if (error instanceof RequestError && error.status === 422) {
                setCaptcha(null);
                setCaptchaCode("");
                const captchaResult = await loadCaptcha();
                if (captchaResult === "ready")
                    setCaptchaDialogError(messages.captchaInvalid);
                return;
            }
            setStatus({
                kind: "error",
                text:
                    error instanceof TypeError
                        ? messages.networkFail
                        : messages.commentFail,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCaptchaConfirm = async () => {
        if (captchaConfirming || isSubmitting || captchaLoading) return;
        if (!captchaCode.trim()) {
            setCaptchaDialogError(messages.captchaRequired);
            return;
        }
        setCaptchaConfirming(true);
        setCaptchaDialogOpen(false);
        await submitComment();
        setCaptchaConfirming(false);
    };

    return (
        <section
            className={`${styles.artalk}${isDarkMode ? ` ${styles.darkMode}` : ""}`}
            aria-label={messages.title}
        >
            <div className={styles.editor}>
                <div className={styles.header}>
                    <label className={styles.field}>
                        <span className={styles.srOnly}>{messages.name}</span>
                        <input
                            className={styles.input}
                            type="text"
                            name="name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder={messages.name}
                            autoComplete="name"
                            maxLength={64}
                            required
                        />
                    </label>
                    <label className={styles.field}>
                        <span className={styles.srOnly}>{messages.email}</span>
                        <input
                            className={styles.input}
                            type="email"
                            name="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder={messages.email}
                            autoComplete="email"
                            maxLength={254}
                            required
                        />
                    </label>
                    <label className={styles.field}>
                        <span className={styles.srOnly}>{messages.link}</span>
                        <input
                            className={styles.input}
                            type="url"
                            name="link"
                            value={link}
                            onChange={(event) => setLink(event.target.value)}
                            placeholder={messages.link}
                            autoComplete="url"
                        />
                    </label>
                </div>

                <div className={styles.textareaWrap}>
                    <textarea
                        ref={textareaRef}
                        className={styles.textarea}
                        name="comments"
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== "Tab") return;
                            event.preventDefault();
                            const textarea = event.currentTarget;
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;
                            const nextComment = `${comment.slice(0, start)}\t${comment.slice(end)}`;
                            setComment(nextComment);
                            window.setTimeout(() => {
                                textarea.selectionStart = start + 1;
                                textarea.selectionEnd = start + 1;
                                adaptTextareaHeight();
                            });
                        }}
                        placeholder={messages.placeholder}
                        maxLength={10000}
                        required
                        aria-describedby={status ? statusId : undefined}
                    />
                </div>

                <div className={styles.bottom}>
                    <div className={styles.bottomLeft}></div>
                    <div className={styles.bottomRight}>
                        <button
                            className={styles.sendButton}
                            type="button"
                            onClick={() => void submitComment()}
                        >
                            {messages.send}
                        </button>
                    </div>
                </div>

                <div className={styles.notifyWrap}>
                    {status && (
                        <div
                            id={statusId}
                            className={`${styles.notify} ${styles[status.kind]}`}
                            role={status.kind === "error" ? "alert" : "status"}
                            onClick={() => setStatus(null)}
                        >
                            {status.text}
                        </div>
                    )}
                </div>

                {isSubmitting && (
                    <div
                        className={styles.loading}
                        aria-label={messages.sending}
                    >
                        <div className={styles.loadingSpinner}>
                            <svg viewBox="25 25 50 50" aria-hidden="true">
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="20"
                                    fill="none"
                                    strokeWidth="2"
                                    strokeMiterlimit="10"
                                />
                            </svg>
                        </div>
                    </div>
                )}
            </div>

            {captchaDialogOpen && captcha && (
                <div className={styles.dialogWrap}>
                    <div
                        className={styles.dialog}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={`${statusId}-captcha`}
                    >
                        <div className={styles.dialogContent}>
                            <span
                                id={`${statusId}-captcha`}
                                className={styles.srOnly}
                            >
                                {messages.captcha}
                            </span>
                            <span className={styles.captchaBody}>
                                <img
                                    className={styles.captchaImage}
                                    src={captcha.image}
                                    alt={messages.captcha}
                                    onClick={() => void handleRefreshCaptcha()}
                                    title={messages.reloadCaptcha}
                                />
                                <span>{messages.captchaPrompt}</span>
                            </span>
                            <input
                                className={styles.captchaInput}
                                type="text"
                                value={captchaCode}
                                onChange={(event) => {
                                    setCaptchaCode(
                                        event.target.value.toUpperCase(),
                                    );
                                    setCaptchaDialogError("");
                                }}
                                placeholder={messages.captchaPlaceholder}
                                autoComplete="off"
                                maxLength={8}
                                autoFocus
                                aria-label={messages.captcha}
                            />
                        </div>
                        <div className={styles.dialogActions}>
                            <button
                                className={`${styles.dialogButton} ${captchaDialogError ? styles.dialogError : ""}`}
                                type="button"
                                onClick={() => void handleCaptchaConfirm()}
                            >
                                {captchaDialogError || messages.confirm}
                            </button>
                            <button
                                className={styles.dialogButton}
                                type="button"
                                onClick={() => setCaptchaDialogOpen(false)}
                            >
                                {messages.cancel}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
