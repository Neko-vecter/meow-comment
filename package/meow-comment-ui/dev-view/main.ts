import { init } from "../src/main";
import "./dev.scss";

const root = document.querySelector<HTMLElement>("#comment-preview");
if (!root) throw new Error("Comment preview mount element is missing.");

const controls = {
    theme: document.querySelector<HTMLSelectElement>('[data-control="theme"]'),
    locale: document.querySelector<HTMLSelectElement>('[data-control="locale"]'),
    captcha: document.querySelector<HTMLSelectElement>('[data-control="captcha"]'),
    baseUrl: document.querySelector<HTMLInputElement>('[data-control="base-url"]'),
    rememberUser: document.querySelector<HTMLInputElement>(
        '[data-control="remember-user"]',
    ),
};

const widget = init({
    el: root,
    locale: controls.locale?.value ?? "en",
    darkMode: "auto",
    captcha: "disabled",
    rememberUser: true,
});

function updatePreview() {
    const theme = controls.theme?.value ?? "auto";
    widget.update({
        darkMode: theme === "auto" ? "auto" : theme === "dark",
        locale: controls.locale?.value ?? "en",
        captcha:
            (controls.captcha?.value as "auto" | "disabled" | "required") ??
            "disabled",
        baseUrl: controls.baseUrl?.value.trim() || undefined,
        rememberUser: controls.rememberUser?.checked ?? true,
    });
}

for (const control of Object.values(controls)) {
    control?.addEventListener("input", updatePreview);
    control?.addEventListener("change", updatePreview);
}

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        for (const control of Object.values(controls)) {
            control?.removeEventListener("input", updatePreview);
            control?.removeEventListener("change", updatePreview);
        }
        widget.destroy();
    });
}
