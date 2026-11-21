import type { Comment } from "../../../types";
import { formatDate } from "../../../utils";
import { useI18n } from "../../../i18n";
import "../../shared/tables.css";
import "./CommentTable.css";

interface CommentTableProps {
    comments: Comment[];
    onSelectComment: (comment: Comment) => void;
}

export function CommentTable({
    comments,
    onSelectComment,
}: CommentTableProps) {
    const { t } = useI18n();

    return (
        <div className="table-wrap comments-table-scroll">
            <table className="data-table comments-table">
                <thead>
                    <tr>
                        <th>{t.users.username}</th>
                        <th>{t.users.email}</th>
                        <th>{t.comments.commentContent}</th>
                        <th>{t.comments.sourcePage}</th>
                        <th>{t.users.status}</th>
                        <th>{t.comments.time}</th>
                    </tr>
                </thead>
                <tbody>
                    {comments.map((comment) => {
                        const username =
                            comment.username || t.comments.anonymousUser;

                        return (
                            <tr
                                aria-label={comment.comments}
                                className="comment-row"
                                key={comment.id}
                                onClick={() => onSelectComment(comment)}
                                onKeyDown={(event) => {
                                    if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                    ) {
                                        event.preventDefault();
                                        onSelectComment(comment);
                                    }
                                }}
                                tabIndex={0}
                            >
                                <td>
                                    <div className="user-cell">
                                        <div className="small-avatar">
                                            {username.slice(0, 1).toUpperCase()}
                                        </div>
                                        <strong>{username}</strong>
                                    </div>
                                </td>
                                <td className="email-cell">
                                    {comment.email || t.comments.noEmail}
                                </td>
                                <td>
                                    <div className="comment-content">
                                        <p>{comment.comments}</p>
                                    </div>
                                </td>
                                <td>
                                    <div className="source-cell">
                                        <strong>
                                            {comment.page_title ||
                                                t.comments.untitledPage}
                                        </strong>
                                        <span>{comment.source_path || "/"}</span>
                                    </div>
                                </td>
                                <td>
                                    <span
                                        className={
                                            comment.completed
                                                ? "status-badge"
                                                : "status-badge pending"
                                        }
                                    >
                                        {comment.completed
                                            ? t.comments.completed
                                            : t.comments.pending}
                                    </span>
                                </td>
                                <td className="date-cell">
                                    {formatDate(comment.created_at)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
