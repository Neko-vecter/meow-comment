// Establish Tailwind's layer order before component stylesheets are loaded.
import "./App.css";
import { lazy, Suspense } from "react";
import { useLocation } from "react-router";
import AuthenticatedApp from "./AuthenticatedApp";

const isLayoutPreviewEnabled =
    import.meta.env.DEV &&
    import.meta.env.VITE_LAYOUT_PREVIEW === "true";

const DevLayoutPreview = import.meta.env.DEV
    ? lazy(() => import("./dev-preview/DevLayoutPreview"))
    : null;

export default function App() {
    const location = useLocation();
    const showLoginPreview =
        new URLSearchParams(location.search).get("preview") === "login";

    if (isLayoutPreviewEnabled && DevLayoutPreview) {
        return (
            <Suspense fallback={null}>
                <DevLayoutPreview showLogin={showLoginPreview} />
            </Suspense>
        );
    }

    return <AuthenticatedApp />;
}
