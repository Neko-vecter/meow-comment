import en, { type MeowCommentsMessages } from "./en";
import zhHans from "./zh-Hans";

export type { MeowCommentsMessages } from "./en";

export const internal = {
    en,
    "en-US": en,
    "zh-Hans": zhHans,
    "zh-CN": zhHans,
};

export function findLocaleSet(locale?: string): MeowCommentsMessages {
    const requested =
        locale === "auto" || !locale
            ? typeof navigator === "undefined"
                ? "en"
                : navigator.language
            : locale;
    const normalized = requested.replace(/_/g, "-").toLowerCase();

    if (normalized === "zh" || normalized.startsWith("zh-")) {
        return internal["zh-Hans"];
    }

    return internal.en;
}
