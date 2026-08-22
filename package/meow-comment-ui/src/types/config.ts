import type { MeowCommentsMessages } from "../i18n";

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
