import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { en, type Translation } from "./en";
import { zhHans } from "./zhHans";

export type Locale = "en" | "zhHans";

export const LOCALE_KEY = "meow-comment-locale";

export const translations: Record<Locale, Translation> = {
    en,
    zhHans,
};

export function detectBrowserLocale(): Locale {
    if (
        typeof navigator !== "undefined" &&
        navigator.language.toLowerCase().startsWith("zh")
    ) {
        return "zhHans";
    }
    return "en";
}

export function readStoredLocale(): Locale {
    if (typeof window === "undefined") {
        return detectBrowserLocale();
    }
    const storedLocale = localStorage.getItem(LOCALE_KEY);
    if (storedLocale === "en" || storedLocale === "zhHans") {
        return storedLocale;
    }
    return detectBrowserLocale();
}

let activeLocale = readStoredLocale();

export function getTranslations() {
    return translations[activeLocale];
}

export function interpolate(
    message: string,
    values: Record<string, string | number>,
) {
    return message.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
        String(values[key] ?? ""),
    );
}

interface I18nContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: Translation;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

    const setLocale = useCallback((nextLocale: Locale) => {
        activeLocale = nextLocale;
        setLocaleState(nextLocale);
    }, []);

    useEffect(() => {
        activeLocale = locale;
        localStorage.setItem(LOCALE_KEY, locale);
        document.documentElement.lang = translations[locale].locale;
        document.title = translations[locale].app.title;
    }, [locale]);

    const value = useMemo(
        () => ({
            locale,
            setLocale,
            t: translations[locale],
        }),
        [locale, setLocale],
    );

    return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error("useI18n must be used inside I18nProvider");
    }
    return context;
}
