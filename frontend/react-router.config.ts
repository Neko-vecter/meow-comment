import type { Config } from "@react-router/dev/config";

export default {
    appDirectory: "src",
    // Authentication is browser-session based, so every route must be
    // resolved by the same client-side application entry.
    ssr: false,
} satisfies Config;
