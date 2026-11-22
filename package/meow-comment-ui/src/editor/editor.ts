import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import {
    getApiUrl,
    RequestError,
    requestCaptcha,
    requestJson,
} from "../api";
import {
    getCurrentPageTitle,
    getCurrentSourcePath,
    getRootElement,
    resolveDarkMode,
} from "../config";
import {
    renderCaptchaDialog,
    syncCaptchaDialog as syncCaptchaDialogView,
} from "../components/dialog";
import { getStoredDraft, getStoredUser, saveStoredDraft, saveStoredUser } from "../lib/storage";
import { isValidEmail } from "../lib/utils";
import type {
    DialogView,
    MeowCommentsConfig,
    State,
    StatusMessage,
    View,
    MeowCommentsToolbarItem,
} from "../types";
import { findLocaleSet } from "../i18n";
import { renderToolbar, resolveToolbarItems } from "./toolbar";
import { renderView } from "./ui";

type Cleanup = () => void;

let instanceId = 0;

export default class MeowComments {
    private readonly element: HTMLElement;
    private readonly view: View;
    private readonly editor: Editor;
    private readonly statusId: string;
    private readonly cleanups: Cleanup[] = [];
    private config: MeowCommentsConfig;
    private state: State;
    private dialog: DialogView | null = null;
    private mediaCleanup: Cleanup | null = null;
    private statusTimer: number | null = null;
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

        this.view = renderView(
            resolveToolbarItems(config.toolbar),
            config.toolbarIcons,
        );
        this.element.append(this.view.root);
        this.editor = new Editor({
            element: this.view.editorMount,
            extensions: [StarterKit, Underline, Markdown],
            content: this.state.comment,
            contentType: "markdown",
            editorProps: {
                attributes: {
                    "aria-label": this.state.messages.placeholder,
                    "aria-required": "true",
                    "data-placeholder": this.state.messages.placeholder,
                },
            },
            onUpdate: ({ editor }) => {
                this.state.comment = editor.getMarkdown();
                saveStoredDraft(this.state.comment);
            },
            onSelectionUpdate: () => this.syncToolbar(),
        });
        const editorElement = this.editor.view.dom;
        editorElement.classList.add("atk-textarea", "atk-prosemirror");
        editorElement.style.minHeight = "140px";
        editorElement.style.boxSizing = "border-box";
        this.listen(this.view.editorMount, "mousedown", (event) => {
            if (event.target === this.view.editorMount) this.editor.commands.focus();
        });
        this.bindEvents();
        this.setupDarkMode();
        this.syncView();

        if (this.state.status) this.scheduleStatusClear();
        this.syncToolbar();
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
        const previousToolbarItems = resolveToolbarItems(this.config.toolbar);
        const previousToolbarIcons = { ...this.config.toolbarIcons };
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
        const nextToolbarItems = resolveToolbarItems(this.config.toolbar);
        const nextToolbarIcons = this.config.toolbarIcons ?? {};
        if (
            !sameToolbarItems(previousToolbarItems, nextToolbarItems) ||
            !sameToolbarIcons(previousToolbarIcons, nextToolbarIcons)
        ) {
            renderToolbar(this.view.toolbar, nextToolbarItems, nextToolbarIcons);
            this.syncToolbar();
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
        this.statusTimer = null;
        this.closeCaptchaDialog();
        this.editor.destroy();
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
        this.listen(this.view.toolbar, "mousedown", (event) => {
            if ((event.target as HTMLElement).closest("button")) event.preventDefault();
        });
        this.listen(this.view.toolbar, "click", (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
            if (button) this.applyToolbarAction(button.dataset.action ?? "");
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
        this.editor.view.dom.setAttribute("aria-label", this.state.messages.placeholder);
        this.editor.view.dom.setAttribute("data-placeholder", this.state.messages.placeholder);
        this.editor.view.dom.setAttribute("aria-describedby", this.state.status ? this.statusId : "");
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
        this.syncToolbar();
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
        this.editor.view.dom.setAttribute("aria-describedby", status ? this.statusId : "");
    }

    private scheduleStatusClear() {
        if (this.statusTimer !== null) window.clearTimeout(this.statusTimer);
        this.statusTimer = window.setTimeout(() => {
            this.statusTimer = null;
            this.setStatus(null);
        }, 3000);
    }

    private applyToolbarAction(action: string) {
        const chain = this.editor.chain().focus();
        switch (action) {
            case "bold": chain.toggleBold().run(); break;
            case "italic": chain.toggleItalic().run(); break;
            case "underline": chain.toggleUnderline().run(); break;
            case "strike": chain.toggleStrike().run(); break;
            case "code": chain.toggleCode().run(); break;
            case "codeBlock": chain.toggleCodeBlock().run(); break;
            case "bulletList": chain.toggleBulletList().run(); break;
            case "orderedList": chain.toggleOrderedList().run(); break;
            case "blockquote": chain.toggleBlockquote().run(); break;
            case "emoji": chain.insertContent("🙂").run(); break;
            default: return;
        }
        this.syncToolbar();
    }

    private syncToolbar() {
        const states = [
            ["bold", "bold"], ["italic", "italic"], ["strike", "strike"],
            ["underline", "underline"], ["code", "code"], ["codeBlock", "codeBlock"],
            ["bulletList", "bulletList"],
            ["orderedList", "orderedList"], ["blockquote", "blockquote"],
        ] as const;
        for (const [action, markOrNode] of states) {
            const button = this.view.toolbar.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
            if (!button) continue;
            const active = this.editor.isActive(markOrNode);
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        }
    }

    private renderCaptchaDialog() {
        this.dialog?.wrap.remove();
        this.dialog = null;
        const captcha = this.state.captcha;
        if (!this.state.captchaDialogOpen || !captcha) return;

        this.dialog = renderCaptchaDialog(
            this.view.root,
            this.statusId,
            {
                onRefresh: () => this.handleRefreshCaptcha(),
                onInput: (value) => {
                    this.state.captchaCode = value.toUpperCase();
                    this.state.captchaDialogError = "";
                    this.syncCaptchaDialog();
                },
                onConfirm: () => this.handleCaptchaConfirm(),
                onCancel: () => this.closeCaptchaDialog(),
            },
        );
        this.syncCaptchaDialog();
        this.dialog.input.focus();
    }

    private syncCaptchaDialog() {
        if (!this.dialog || !this.state.captcha) return;
        syncCaptchaDialogView(
            this.dialog,
            this.state.captcha,
            this.state.messages,
            this.state.captchaCode,
            this.state.captchaDialogError,
        );
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
            const captcha = await requestCaptcha(this.config.baseUrl ?? "");
            if (this.destroyed) return "error" as const;
            this.state.captcha = captcha;
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
            this.editor.commands.focus();
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
                });
            }
            this.state.name = trimmedName;
            this.state.email = trimmedEmail;
            this.state.comment = "";
            this.editor.commands.clearContent();
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

function sameToolbarItems(
    first: MeowCommentsToolbarItem[],
    second: MeowCommentsToolbarItem[],
) {
    return first.length === second.length && first.every((item, index) => item === second[index]);
}

function sameToolbarIcons(
    first: Partial<Record<MeowCommentsToolbarItem, string>>,
    second: Partial<Record<MeowCommentsToolbarItem, string>>,
) {
    const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
    return [...keys].every((key) =>
        first[key as MeowCommentsToolbarItem] === second[key as MeowCommentsToolbarItem],
    );
}
