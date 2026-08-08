import "./styles/main.scss";
import { findLocaleSet, type MeowCommentsMessages } from "./i18n";

export type { MeowCommentsMessages } from "./i18n";

export interface MeowCommentsConfig {
    /** Element selector or element used to mount MeowComments. */
    el: string | HTMLElement;
    /** Comment server URL only; the frontend appends `/api` automatically. */
    baseUrl?: string;
    /** Artalk-compatible dark mode switch. `auto` follows the system preference. */
    darkMode?: boolean | "auto";
    /** Locale such as `zh-Hans`, `en`, or `auto`. Unknown locales fall back to English. */
    locale?: string;
    /** Page path used to group comments, equivalent to Artalk's `pageKey`. */
    pageKey?: string;
    /** Override the page title sent to the one-way comment API. */
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

interface CaptchaState {
    uuid: string;
    image: string;
}

interface View {
    root: HTMLElement;
    nameInput: HTMLInputElement;
    emailInput: HTMLInputElement;
    linkInput: HTMLInputElement;
    textarea: HTMLTextAreaElement;
    sendButton: HTMLButtonElement;
    notifyWrap: HTMLElement;
    loading: HTMLElement;
}

interface DialogView {
    wrap: HTMLElement;
    image: HTMLImageElement;
    input: HTMLInputElement;
    confirmButton: HTMLButtonElement;
}

interface State {
    isDarkMode: boolean;
    messages: MeowCommentsMessages;
    rememberUser: boolean;
    captchaMode: NonNullable<MeowCommentsConfig["captcha"]>;
    name: string;
    email: string;
    link: string;
    comment: string;
    captchaCode: string;
    captcha: CaptchaState | null;
    captchaUnavailable: boolean;
    captchaLoading: boolean;
    captchaDialogOpen: boolean;
    captchaDialogError: string;
    captchaConfirming: boolean;
    isSubmitting: boolean;
    status: StatusMessage | null;
}

type Cleanup = () => void;

class RequestError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "RequestError";
        this.status = status;
    }
}

let instanceId = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function getResponseMessage(payload: unknown, fallback: string) {
    if (isRecord(payload) && typeof payload.message === "string") {
        return payload.message;
    }
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
    return window.location.pathname || "/";
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

function normalizeCaptchaResponse(value: CaptchaResponse): CaptchaState {
    if (!value.uuid || !value.captcha_base64) {
        throw new Error("Invalid verification response");
    }
    return { uuid: value.uuid, image: getCaptchaImage(value.captcha_base64) };
}

function resolveDarkMode(setting: MeowCommentsConfig["darkMode"]) {
    if (setting !== "auto") return setting === true;
    if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
    ) {
        return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getRootElement(el: string | HTMLElement) {
    if (typeof el === "string") {
        const root = document.querySelector<HTMLElement>(el);
        if (!root) throw new Error(`Element "${el}" not found.`);
        return root;
    }

    if (typeof HTMLElement !== "undefined" && el instanceof HTMLElement) {
        return el;
    }
    throw new Error("Please provide a valid `el` config for MeowComments.");
}

function query<T extends Element>(root: ParentNode, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`MeowComments UI element not found: ${selector}`);
    return element;
}

function renderView(): View {
    const root = document.createElement("section");
    root.className = "artalk";
    root.innerHTML = `
        <div class="atk-main-editor">
            <div class="atk-header">
                <label class="atk-field">
                    <span class="atk-sr-only" data-label="name"></span>
                    <input class="atk-input atk-name" type="text" name="name" autocomplete="name" maxlength="64" required>
                </label>
                <label class="atk-field">
                    <span class="atk-sr-only" data-label="email"></span>
                    <input class="atk-input atk-email" type="email" name="email" autocomplete="email" maxlength="254" required>
                </label>
                <label class="atk-field">
                    <span class="atk-sr-only" data-label="link"></span>
                    <input class="atk-input atk-link" type="url" name="link" autocomplete="url">
                </label>
            </div>
            <div class="atk-textarea-wrap">
                <textarea class="atk-textarea" name="comments" maxlength="10000" required></textarea>
            </div>
            <div class="atk-bottom">
                <div class="atk-item atk-bottom-left"></div>
                <div class="atk-item">
                    <button class="atk-send-btn" type="button"></button>
                </div>
            </div>
            <div class="atk-notify-wrap" aria-live="polite"></div>
            <div class="atk-loading" hidden>
                <div class="atk-loading-spinner" aria-hidden="true">
                    <svg viewBox="25 25 50 50" aria-hidden="true">
                        <circle cx="50" cy="50" r="20" fill="none" stroke-width="2" stroke-miterlimit="10"></circle>
                    </svg>
                </div>
            </div>
        </div>
    `;

    return {
        root,
        nameInput: query<HTMLInputElement>(root, ".atk-name"),
        emailInput: query<HTMLInputElement>(root, ".atk-email"),
        linkInput: query<HTMLInputElement>(root, ".atk-link"),
        textarea: query<HTMLTextAreaElement>(root, ".atk-textarea"),
        sendButton: query<HTMLButtonElement>(root, ".atk-send-btn"),
        notifyWrap: query<HTMLElement>(root, ".atk-notify-wrap"),
        loading: query<HTMLElement>(root, ".atk-loading"),
    };
}

export default class MeowComments {
    private readonly element: HTMLElement;
    private readonly view: View;
    private readonly statusId: string;
    private readonly cleanups: Cleanup[] = [];
    private config: MeowCommentsConfig;
    private state: State;
    private dialog: DialogView | null = null;
    private mediaCleanup: Cleanup | null = null;
    private statusTimer: number | null = null;
    private resizeTimer: number | null = null;
    private tabTimer: number | null = null;
    private destroyed = false;

    constructor(config: MeowCommentsConfig) {
        this.element = getRootElement(config.el);
        this.element.innerHTML = "";
        this.config = config;
        this.statusId = `meow-comments-status-${++instanceId}`;

        const rememberUser = config.rememberUser ?? true;
        const storedUser = rememberUser ? getStoredUser() : null;
        const initialComment = getStoredDraft();

        this.state = {
            isDarkMode: resolveDarkMode(config.darkMode),
            messages: this.getMessages(config),
            rememberUser,
            captchaMode: config.captcha ?? "auto",
            name: storedUser?.name ?? "",
            email: storedUser?.email ?? "",
            link: storedUser?.link ?? "",
            comment: initialComment,
            captchaCode: "",
            captcha: null,
            captchaUnavailable: config.captcha === "disabled",
            captchaLoading: false,
            captchaDialogOpen: false,
            captchaDialogError: "",
            captchaConfirming: false,
            isSubmitting: false,
            status: initialComment.trim()
                ? { kind: "info", text: this.getMessages(config).restoredMsg }
                : null,
        };

        this.view = renderView();
        this.element.append(this.view.root);
        this.bindEvents();
        this.setupDarkMode();
        this.syncView();

        if (this.state.status) this.scheduleStatusClear();
        this.queueTextareaResize();
    }

    static init(config: MeowCommentsConfig) {
        return new MeowComments(config);
    }

    getConf() {
        return this.config;
    }

    getEl() {
        return this.element;
    }

    update(config: Partial<MeowCommentsConfig>) {
        if (this.destroyed) return;

        const previousDarkMode = this.config.darkMode;
        const previousCaptchaMode = this.state.captchaMode;
        this.config = { ...this.config, ...config };
        this.state.messages = this.getMessages(this.config);
        this.state.rememberUser = this.config.rememberUser ?? true;
        this.state.captchaMode = this.config.captcha ?? "auto";
        if (this.state.captchaMode === "disabled") {
            this.state.captchaUnavailable = true;
        } else if (previousCaptchaMode === "disabled") {
            this.state.captchaUnavailable = false;
        }

        if (previousDarkMode !== this.config.darkMode) {
            this.setupDarkMode();
        }
        this.syncView();
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.mediaCleanup?.();
        this.mediaCleanup = null;
        for (const cleanup of this.cleanups.splice(0)) cleanup();
        if (this.statusTimer !== null) window.clearTimeout(this.statusTimer);
        if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
        if (this.tabTimer !== null) window.clearTimeout(this.tabTimer);
        this.statusTimer = null;
        this.resizeTimer = null;
        this.tabTimer = null;
        this.closeCaptchaDialog();
        this.element.innerHTML = "";
    }

    private getMessages(config: MeowCommentsConfig) {
        return { ...findLocaleSet(config.locale), ...config.messages };
    }

    private listen(target: EventTarget, type: string, listener: EventListener) {
        target.addEventListener(type, listener);
        this.cleanups.push(() => target.removeEventListener(type, listener));
    }

    private bindEvents() {
        this.listen(this.view.nameInput, "input", () => {
            this.state.name = this.view.nameInput.value;
        });
        this.listen(this.view.emailInput, "input", () => {
            this.state.email = this.view.emailInput.value;
        });
        this.listen(this.view.linkInput, "input", () => {
            this.state.link = this.view.linkInput.value;
        });
        this.listen(this.view.textarea, "input", () => {
            this.state.comment = this.view.textarea.value;
            saveStoredDraft(this.state.comment);
            this.queueTextareaResize();
        });
        this.listen(this.view.textarea, "keydown", (event) => {
            const keyboardEvent = event as KeyboardEvent;
            if (keyboardEvent.key !== "Tab") return;
            keyboardEvent.preventDefault();
            const textarea = this.view.textarea;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            this.state.comment = `${this.state.comment.slice(0, start)}\t${this.state.comment.slice(end)}`;
            textarea.value = this.state.comment;
            if (this.tabTimer !== null) window.clearTimeout(this.tabTimer);
            this.tabTimer = window.setTimeout(() => {
                this.tabTimer = null;
                textarea.selectionStart = start + 1;
                textarea.selectionEnd = start + 1;
                this.adaptTextareaHeight();
            });
            saveStoredDraft(this.state.comment);
        });
        this.listen(this.view.sendButton, "click", () => {
            void this.submitComment();
        });
    }

    private setupDarkMode() {
        this.mediaCleanup?.();
        this.mediaCleanup = null;

        if (
            this.config.darkMode !== "auto" ||
            typeof window.matchMedia !== "function"
        ) {
            this.state.isDarkMode = resolveDarkMode(this.config.darkMode);
            return;
        }

        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = (event: MediaQueryListEvent) => {
            this.state.isDarkMode = event.matches;
            this.syncView();
        };

        if (typeof media.addEventListener === "function") {
            media.addEventListener("change", onChange);
            this.mediaCleanup = () => media.removeEventListener("change", onChange);
        } else {
            media.addListener(onChange);
            this.mediaCleanup = () => media.removeListener(onChange);
        }
        this.state.isDarkMode = media.matches;
    }

    private syncView() {
        if (this.destroyed) return;

        this.view.root.classList.toggle("atk-dark-mode", this.state.isDarkMode);
        this.view.root.setAttribute("aria-label", this.state.messages.title);

        this.syncInput(this.view.nameInput, this.state.name, this.state.messages.name);
        this.syncInput(this.view.emailInput, this.state.email, this.state.messages.email);
        this.syncInput(this.view.linkInput, this.state.link, this.state.messages.link);
        this.view.textarea.value = this.state.comment;
        this.view.textarea.placeholder = this.state.messages.placeholder;
        this.view.textarea.setAttribute("aria-describedby", this.state.status ? this.statusId : "");
        this.view.sendButton.textContent = this.state.messages.send;
        this.view.loading.setAttribute("aria-label", this.state.messages.sending);
        this.view.loading.hidden = !this.state.isSubmitting;
        this.view.sendButton.disabled = this.state.isSubmitting || this.state.captchaLoading;
        this.renderStatus();
        if (this.state.captchaDialogOpen && !this.dialog) {
            this.renderCaptchaDialog();
        } else {
            this.syncCaptchaDialog();
        }
    }

    private syncInput(input: HTMLInputElement, value: string, label: string) {
        input.value = value;
        input.placeholder = label;
        input.setAttribute("aria-label", label);
        const labelElement = input.previousElementSibling;
        if (labelElement instanceof HTMLElement) labelElement.textContent = label;
    }

    private renderStatus() {
        while (this.view.notifyWrap.firstChild) {
            this.view.notifyWrap.firstChild.remove();
        }
        if (!this.state.status) return;

        const status = document.createElement("div");
        status.id = this.statusId;
        status.className = `atk-notify atk-fade-in atk-${this.state.status.kind}`;
        status.setAttribute(
            "role",
            this.state.status.kind === "error" ? "alert" : "status",
        );
        status.textContent = this.state.status.text;
        status.addEventListener("click", () => this.setStatus(null));
        this.view.notifyWrap.append(status);
    }

    private setStatus(status: StatusMessage | null) {
        if (this.destroyed) return;
        this.state.status = status;
        this.renderStatus();
        if (status) {
            this.scheduleStatusClear();
        } else if (this.statusTimer !== null) {
            window.clearTimeout(this.statusTimer);
            this.statusTimer = null;
        }
        this.view.textarea.setAttribute("aria-describedby", status ? this.statusId : "");
    }

    private scheduleStatusClear() {
        if (this.statusTimer !== null) window.clearTimeout(this.statusTimer);
        this.statusTimer = window.setTimeout(() => {
            this.statusTimer = null;
            this.setStatus(null);
        }, 3000);
    }

    private queueTextareaResize() {
        if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(() => {
            this.resizeTimer = null;
            this.adaptTextareaHeight();
        }, 80);
    }

    private adaptTextareaHeight() {
        const textarea = this.view.textarea;
        const diff = textarea.offsetHeight - textarea.clientHeight;
        textarea.style.height = "0px";
        textarea.style.height = `${textarea.scrollHeight + diff}px`;
    }

    private renderCaptchaDialog() {
        this.dialog?.wrap.remove();
        this.dialog = null;
        if (!this.state.captchaDialogOpen || !this.state.captcha) return;

        const wrap = document.createElement("div");
        wrap.className = "atk-layer-dialog-wrap";
        const dialog = document.createElement("div");
        dialog.className = "atk-layer-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");

        const content = document.createElement("div");
        content.className = "atk-layer-dialog-content";
        const title = document.createElement("span");
        title.className = "atk-sr-only";
        title.id = `${this.statusId}-captcha`;
        content.append(title);

        const body = document.createElement("span");
        body.className = "atk-captcha-body";
        const image = document.createElement("img");
        image.className = "atk-captcha-img";
        image.addEventListener("click", () => void this.handleRefreshCaptcha());
        body.append(image);
        const prompt = document.createElement("span");
        body.append(prompt);
        content.append(body);

        const input = document.createElement("input");
        input.className = "atk-captcha-input";
        input.type = "text";
        input.autocomplete = "off";
        input.maxLength = 8;
        input.autofocus = true;
        input.addEventListener("input", () => {
            this.state.captchaCode = input.value.toUpperCase();
            input.value = this.state.captchaCode;
            this.state.captchaDialogError = "";
            this.syncCaptchaDialog();
        });
        content.append(input);

        const actions = document.createElement("div");
        actions.className = "atk-layer-dialog-actions";
        const confirmButton = document.createElement("button");
        confirmButton.className = "atk-dialog-btn";
        confirmButton.type = "button";
        confirmButton.addEventListener("click", () => void this.handleCaptchaConfirm());
        const cancelButton = document.createElement("button");
        cancelButton.className = "atk-dialog-btn";
        cancelButton.type = "button";
        cancelButton.addEventListener("click", () => this.closeCaptchaDialog());
        actions.append(confirmButton, cancelButton);
        dialog.append(content, actions);
        wrap.append(dialog);
        this.view.root.append(wrap);

        this.dialog = { wrap, image, input, confirmButton };
        dialog.setAttribute("aria-labelledby", title.id);
        this.syncCaptchaDialog();
        input.focus();
    }

    private syncCaptchaDialog() {
        if (!this.dialog || !this.state.captcha) return;
        const title = query<HTMLElement>(this.dialog.wrap, ".atk-sr-only");
        const prompt = query<HTMLElement>(this.dialog.wrap, ".atk-captcha-body span");
        const cancelButton = query<HTMLButtonElement>(
            this.dialog.wrap,
            ".atk-layer-dialog-actions button:last-child",
        );
        title.textContent = this.state.messages.captcha;
        this.dialog.image.src = this.state.captcha.image;
        this.dialog.image.alt = this.state.messages.captcha;
        this.dialog.image.title = this.state.messages.reloadCaptcha;
        prompt.textContent = this.state.messages.captchaPrompt;
        this.dialog.input.value = this.state.captchaCode;
        this.dialog.input.placeholder = this.state.messages.captchaPlaceholder;
        this.dialog.input.setAttribute("aria-label", this.state.messages.captcha);
        this.dialog.confirmButton.textContent =
            this.state.captchaDialogError || this.state.messages.confirm;
        this.dialog.confirmButton.classList.toggle(
            "atk-dialog-error",
            Boolean(this.state.captchaDialogError),
        );
        cancelButton.textContent = this.state.messages.cancel;
    }

    private closeCaptchaDialog() {
        this.state.captchaDialogOpen = false;
        this.dialog?.wrap.remove();
        this.dialog = null;
    }

    private async loadCaptcha() {
        this.state.captchaLoading = true;
        this.setStatus(null);
        this.state.captchaDialogError = "";
        this.syncView();
        try {
            const response = await requestJson<CaptchaResponse>(
                getApiUrl(this.config.baseUrl ?? "", "/verification"),
            );
            if (this.destroyed) return "error" as const;
            this.state.captcha = normalizeCaptchaResponse(response);
            this.state.captchaCode = "";
            this.state.captchaUnavailable = false;
            this.state.captchaDialogOpen = true;
            this.renderCaptchaDialog();
            return "ready" as const;
        } catch (error) {
            if (
                this.state.captchaMode === "auto" &&
                error instanceof RequestError &&
                error.status === 404
            ) {
                this.state.captcha = null;
                this.state.captchaUnavailable = true;
                return "disabled" as const;
            }
            this.setStatus({
                kind: "error",
                text:
                    error instanceof TypeError
                        ? this.state.messages.networkFail
                        : this.state.messages.commentFail,
            });
            return "error" as const;
        } finally {
            this.state.captchaLoading = false;
            this.syncView();
        }
    }

    private async handleRefreshCaptcha() {
        if (!this.state.captchaLoading && !this.state.isSubmitting) {
            await this.loadCaptcha();
        }
    }

    private async submitComment() {
        if (this.destroyed || this.state.isSubmitting || this.state.captchaLoading) {
            return;
        }

        const trimmedName = this.state.name.trim();
        const trimmedEmail = this.state.email.trim();
        const trimmedComment = this.state.comment.trim();

        if (!trimmedComment) {
            this.view.textarea.focus();
            return;
        }
        if (!trimmedName || !trimmedEmail) {
            this.setStatus({ kind: "error", text: this.state.messages.required });
            return;
        }
        if (!isValidEmail(trimmedEmail)) {
            this.setStatus({
                kind: "error",
                text: this.state.messages.invalidEmail,
            });
            return;
        }

        let captchaRequired =
            this.state.captchaMode !== "disabled" &&
            !this.state.captchaUnavailable;
        if (captchaRequired) {
            if (!this.state.captcha) {
                const captchaResult = await this.loadCaptcha();
                if (this.destroyed) return;
                if (captchaResult !== "disabled") return;
                captchaRequired = false;
            }
            if (captchaRequired && !this.state.captchaCode.trim()) {
                this.state.captchaDialogError = this.state.messages.captchaRequired;
                this.state.captchaDialogOpen = true;
                this.renderCaptchaDialog();
                return;
            }
        }

        this.state.isSubmitting = true;
        this.setStatus(null);
        this.syncView();
        try {
            await requestJson<{ ok: boolean }>(
                getApiUrl(this.config.baseUrl ?? "", "/comment"),
                {
                    method: "POST",
                    body: JSON.stringify({
                        username: trimmedName,
                        email: trimmedEmail,
                        comments: this.state.comment,
                        source_path:
                            this.config.pageKey ?? getCurrentSourcePath(),
                        page_title:
                            this.config.pageTitle ?? getCurrentPageTitle(),
                        verification_uuid: this.state.captcha?.uuid ?? "",
                        verification_code: this.state.captchaCode.trim(),
                    }),
                },
            );
            if (this.destroyed) return;
            if (this.state.rememberUser) {
                saveStoredUser({
                    name: trimmedName,
                    email: trimmedEmail,
                    link: this.state.link,
                });
            }
            this.state.name = trimmedName;
            this.state.email = trimmedEmail;
            this.state.comment = "";
            this.state.captcha = null;
            this.state.captchaCode = "";
            this.closeCaptchaDialog();
            saveStoredDraft("");
            this.setStatus({ kind: "success", text: this.state.messages.success });
        } catch (error) {
            if (
                this.state.captchaMode !== "disabled" &&
                error instanceof RequestError &&
                error.status === 422
            ) {
                this.state.captcha = null;
                this.state.captchaCode = "";
                const captchaResult = await this.loadCaptcha();
                if (captchaResult === "ready") {
                    this.state.captchaDialogError = this.state.messages.captchaInvalid;
                    this.syncCaptchaDialog();
                }
                return;
            }
            this.setStatus({
                kind: "error",
                text:
                    error instanceof TypeError
                        ? this.state.messages.networkFail
                        : this.state.messages.commentFail,
            });
        } finally {
            this.state.isSubmitting = false;
            this.syncView();
        }
    }

    private async handleCaptchaConfirm() {
        if (
            this.state.captchaConfirming ||
            this.state.isSubmitting ||
            this.state.captchaLoading
        ) {
            return;
        }
        if (!this.state.captchaCode.trim()) {
            this.state.captchaDialogError = this.state.messages.captchaRequired;
            this.syncCaptchaDialog();
            return;
        }
        this.state.captchaConfirming = true;
        this.closeCaptchaDialog();
        await this.submitComment();
        this.state.captchaConfirming = false;
    }
}

export const init = MeowComments.init;
