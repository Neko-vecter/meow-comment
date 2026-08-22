import type { MeowCommentsMessages } from "../i18n";
import { query } from "../lib/dom";
import type { CaptchaState, DialogView } from "../types";

export interface CaptchaDialogHandlers {
    onRefresh: () => void | Promise<void>;
    onInput: (value: string) => void;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

export function renderCaptchaDialog(
    root: HTMLElement,
    statusId: string,
    handlers: CaptchaDialogHandlers,
): DialogView {
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
    title.id = `${statusId}-captcha`;
    content.append(title);

    const body = document.createElement("span");
    body.className = "atk-captcha-body";
    const image = document.createElement("img");
    image.className = "atk-captcha-img";
    image.addEventListener("click", () => void handlers.onRefresh());
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
    input.addEventListener("input", () => handlers.onInput(input.value));
    content.append(input);

    const actions = document.createElement("div");
    actions.className = "atk-layer-dialog-actions";
    const confirmButton = document.createElement("button");
    confirmButton.className = "atk-dialog-btn";
    confirmButton.type = "button";
    confirmButton.addEventListener("click", () => void handlers.onConfirm());
    const cancelButton = document.createElement("button");
    cancelButton.className = "atk-dialog-btn";
    cancelButton.type = "button";
    cancelButton.addEventListener("click", handlers.onCancel);
    actions.append(confirmButton, cancelButton);
    dialog.append(content, actions);
    wrap.append(dialog);
    root.append(wrap);

    const view = { wrap, image, input, confirmButton };
    dialog.setAttribute("aria-labelledby", title.id);
    return view;
}

export function syncCaptchaDialog(
    dialog: DialogView,
    captcha: CaptchaState,
    messages: MeowCommentsMessages,
    captchaCode: string,
    captchaDialogError: string,
) {
    const title = query<HTMLElement>(dialog.wrap, ".atk-sr-only");
    const prompt = query<HTMLElement>(dialog.wrap, ".atk-captcha-body span");
    const cancelButton = query<HTMLButtonElement>(
        dialog.wrap,
        ".atk-layer-dialog-actions button:last-child",
    );
    title.textContent = messages.captcha;
    dialog.image.src = captcha.image;
    dialog.image.alt = messages.captcha;
    dialog.image.title = messages.reloadCaptcha;
    prompt.textContent = messages.captchaPrompt;
    dialog.input.value = captchaCode;
    dialog.input.placeholder = messages.captchaPlaceholder;
    dialog.input.setAttribute("aria-label", messages.captcha);
    dialog.confirmButton.textContent =
        captchaDialogError || messages.confirm;
    dialog.confirmButton.classList.toggle(
        "atk-dialog-error",
        Boolean(captchaDialogError),
    );
    cancelButton.textContent = messages.cancel;
}
