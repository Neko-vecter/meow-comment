import type { MeowCommentsMessages } from "../i18n";

export type MeowCommentsToolbarItem =
    | "bold"
    | "italic"
    | "underline"
    | "strike"
    | "code"
    | "codeBlock"
    | "blockquote"
    | "bulletList"
    | "orderedList"
    | "emoji";

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
    /** Toolbar buttons in display order. Set to false to hide the toolbar. */
    toolbar?: MeowCommentsToolbarItem[] | false;
    /** Override toolbar glyphs with plain text; HTML is never inserted. */
    toolbarIcons?: Partial<Record<MeowCommentsToolbarItem, string>>;
    messages?: Partial<MeowCommentsMessages>;
}
