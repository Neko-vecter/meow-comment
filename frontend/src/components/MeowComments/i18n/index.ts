import en from "./en.json";
import zhHans from "./zh-Hans.json";

export type MeowCommentsMessages = typeof en;

// Built-in locales follow Artalk's internal locale map and are bundled with the component.
export const internal = {
    en,
    "zh-Hans": zhHans,
} satisfies Record<string, MeowCommentsMessages>;

export function findLocaleSet(locale?: string): MeowCommentsMessages {
    const requested =
        locale === "auto" || !locale
            ? typeof navigator === "undefined"
                ? "en"
                : navigator.language
            : locale;
    const normalized = requested.replace("_", "-").toLowerCase();

    if (normalized === "zh" || normalized.startsWith("zh-")) {
        return internal["zh-Hans"];
    }

    return internal.en;
}
