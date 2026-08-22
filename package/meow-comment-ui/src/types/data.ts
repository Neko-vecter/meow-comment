export interface CaptchaResponse {
    uuid: string;
    captcha_base64: string;
}

export interface StoredUser {
    name: string;
    email: string;
}

export interface StatusMessage {
    kind: "success" | "error" | "info";
    text: string;
}

export interface CaptchaState {
    uuid: string;
    image: string;
}
