import type { MeowCommentsMessages } from "../i18n";
import type { MeowCommentsConfig } from "./config";
import type { CaptchaState, StatusMessage } from "./data";

export interface View {
    root: HTMLElement;
    nameInput: HTMLInputElement;
    emailInput: HTMLInputElement;
    textarea: HTMLTextAreaElement;
    sendButton: HTMLButtonElement;
    notifyWrap: HTMLElement;
    loading: HTMLElement;
}

export interface DialogView {
    wrap: HTMLElement;
    image: HTMLImageElement;
    input: HTMLInputElement;
    confirmButton: HTMLButtonElement;
}

export interface State {
    isDarkMode: boolean;
    messages: MeowCommentsMessages;
    rememberUser: boolean;
    captchaMode: NonNullable<MeowCommentsConfig["captcha"]>;
    name: string;
    email: string;
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
