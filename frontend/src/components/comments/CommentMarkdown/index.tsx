import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { useCallback, useState } from "react";
import { ExternalLinkDialog } from "../ExternalLinkDialog";
import styles from "./CommentMarkdown.module.css";

interface CommentMarkdownProps {
    source: string;
    compact?: boolean;
}

function transformCommentUrl(value: string) {
    try {
        const protocol = new URL(value).protocol.toLowerCase();
        return ["http:", "https:", "mailto:"].includes(protocol)
            ? value
            : undefined;
    } catch {
        return undefined;
    }
}

const components: Components = {
    img: () => null,
};

export function CommentMarkdown({
    source,
    compact = false,
}: CommentMarkdownProps) {
    const [pendingUrl, setPendingUrl] = useState<string | null>(null);
    const cancelExternalLink = useCallback(() => setPendingUrl(null), []);
    const confirmExternalLink = useCallback(() => {
        if (!pendingUrl) return;
        const safeUrl = transformCommentUrl(pendingUrl);
        if (safeUrl) window.open(safeUrl, "_blank", "noopener,noreferrer");
        setPendingUrl(null);
    }, [pendingUrl]);

    const markdownComponents: Components = {
        ...components,
        a: ({ href, children }) => {
            if (!href) return <span>{children}</span>;

            return (
                <a
                    href={href}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setPendingUrl(href);
                    }}
                    rel="noopener noreferrer nofollow"
                    referrerPolicy="no-referrer"
                    target="_blank"
                >
                    {children}
                </a>
            );
        },
    };

    return (
        <div className={`${styles.markdown} ${compact ? styles.compact : ""}`}>
            <ReactMarkdown
                components={markdownComponents}
                skipHtml
                urlTransform={transformCommentUrl}
            >
                {source}
            </ReactMarkdown>
            {pendingUrl && (
                <ExternalLinkDialog
                    onCancel={cancelExternalLink}
                    onConfirm={confirmExternalLink}
                    url={pendingUrl}
                />
            )}
        </div>
    );
}
