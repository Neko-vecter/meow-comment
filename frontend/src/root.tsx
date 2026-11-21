import type { ReactNode } from "react";
import { Links, Meta, Scripts, ScrollRestoration } from "react-router";
import App from "./App";
import "./index.css";
import { getTranslations, I18nProvider } from "./i18n";

export function Layout({ children }: { children: ReactNode }) {
    return (
        <html lang={getTranslations().locale}>
            <head>
                <meta charSet="UTF-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                />
                <title>{getTranslations().app.title}</title>
                <Meta />
                <Links />
            </head>
            <body>
                {children}
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export default function Root() {
    return (
        <I18nProvider>
            <App />
        </I18nProvider>
    );
}
