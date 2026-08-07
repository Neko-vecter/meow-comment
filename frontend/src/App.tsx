import { useEffect } from "react";
import MeowCommentsClient from "./components/MeowCommentsCore";

function MeowComments() {
    const pageKey =
        typeof window === "undefined" ? "/" : window.location.pathname;
    const pageTitle =
        typeof document === "undefined" ? "Comments" : document.title;

    useEffect(() => {
        const meowComments = MeowCommentsClient.init({
            el: "#artalk-container",
            baseUrl: "http://127.0.0.1:8080",
            pageKey,
            pageTitle,
            locale: "en",
            captcha: "auto",
            darkMode: true,
        });

        return () => meowComments.destroy();
    }, [pageKey, pageTitle]);

    return <div id="artalk-container" />;
}

function App() {
    return <MeowComments />;
}

export default App;
