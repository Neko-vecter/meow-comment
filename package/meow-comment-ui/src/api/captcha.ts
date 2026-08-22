import type { CaptchaResponse, CaptchaState } from "../types";
import { requestJson } from "./request";

export function getApiUrl(baseUrl: string, path: string) {
    const serverUrl = baseUrl.trim().replace(/\/+$/, "");
    return `${serverUrl}/api${path}`;
}

function getCaptchaImage(value: string) {
    return value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
}

export function normalizeCaptchaResponse(value: CaptchaResponse): CaptchaState {
    if (!value.uuid || !value.captcha_base64) {
        throw new Error("Invalid verification response");
    }
    return { uuid: value.uuid, image: getCaptchaImage(value.captcha_base64) };
}

export async function requestCaptcha(baseUrl: string) {
    const response = await requestJson<CaptchaResponse>(
        getApiUrl(baseUrl, "/verification"),
    );
    return normalizeCaptchaResponse(response);
}
