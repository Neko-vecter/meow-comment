import { Check, CheckCircle2, Clock3, MessageCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { CommentPagination } from "../../components/comments/CommentPagination";
import { CommentTable } from "../../components/comments/CommentTable";
import type { AdminOutletContext } from "../../components/admin/admin-context";
import { DrawerCard } from "../../components/DrawerCard";
import { EmptyState } from "../../components/EmptyState";
import { TableSkeleton } from "../../components/TableSkeleton";
import { interpolate, useI18n } from "../../i18n";
import type { Comment } from "../../types";
import { formatDate } from "../../utils";

export default function OverviewRoute() {
    const { t } = useI18n();
    const [query, setQuery] = useState("");
    const [selectedCommentID, setSelectedCommentID] = useState<string | null>(
        null,
    );
    const [filter, setFilter] = useState<"all" | "pending" | "completed">(
        "all",
    );
    const {
        comments,
        commentPage,
        commentPageCount,
        commentPageSize,
        loading,
        onCommentPageChange,
        onCommentPageSizeChange,
        onMarkCommentCompleted,
        totalComments,
        updatingCommentID,
        user,
    } = useOutletContext<AdminOutletContext>();
    const canMarkCompleted = user.role === "admin" || user.role === "reviewer";
    const filteredComments = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return comments.filter((comment) => {
            const matchesFilter =
                filter === "all" ||
                (filter === "completed" && comment.completed) ||
                (filter === "pending" && !comment.completed);
            if (!matchesFilter) {
                return false;
            }
            if (!normalizedQuery) {
                return true;
            }

            return [
                comment.comments,
                comment.email,
                comment.page_title,
                comment.source_path,
                comment.username,
            ].some((value) => value.toLowerCase().includes(normalizedQuery));
        });
    }, [comments, filter, query]);
    const selectedComment = selectedCommentID
        ? comments.find((comment) => comment.id === selectedCommentID)
        : undefined;

    function selectComment(comment: Comment) {
        setSelectedCommentID(comment.id);
    }

    return (
        <section className="dashboard-page">
            <div className="identity-toolbar dashboard-toolbar">
                <label className="identity-search">
                    <Search aria-hidden="true" />
                    <span className="sr-only">{t.header.search}</span>
                    <input
                        aria-label={t.header.search}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t.common.search}
                        type="search"
                        value={query}
                    />
                </label>
                <div className="identity-toolbar-actions">
                    <button
                        aria-pressed={filter === "all"}
                        className={
                            filter === "all"
                                ? "identity-action is-active"
                                : "identity-action identity-action-link"
                        }
                        onClick={() => setFilter("all")}
                        type="button"
                    >
                        <MessageCircle aria-hidden="true" />
                        {t.dashboard.allComments}
                    </button>
                    <button
                        aria-pressed={filter === "pending"}
                        className={
                            filter === "pending"
                                ? "identity-action is-active"
                                : "identity-action identity-action-link"
                        }
                        onClick={() => setFilter("pending")}
                        type="button"
                    >
                        <Clock3 aria-hidden="true" />
                        {t.comments.pending}
                    </button>
                    <button
                        aria-pressed={filter === "completed"}
                        className={
                            filter === "completed"
                                ? "identity-action is-active"
                                : "identity-action identity-action-link"
                        }
                        onClick={() => setFilter("completed")}
                        type="button"
                    >
                        <CheckCircle2 aria-hidden="true" />
                        {t.comments.completed}
                    </button>
                </div>
                <span className="dashboard-toolbar-count">
                    {interpolate(t.dashboard.records, {
                        count: totalComments,
                    })}
                </span>
            </div>
            <div className="dashboard-list-heading">
                <div>
                    <h1>{t.dashboard.latestComments}</h1>
                    <p>{t.dashboard.sortNewest}</p>
                </div>
                <span>{t.dashboard.title}</span>
            </div>
            {loading ? (
                <TableSkeleton />
            ) : filteredComments.length === 0 ? (
                <EmptyState
                    icon={<MessageCircle />}
                    title={t.dashboard.noComments}
                    description={t.dashboard.noCommentsDescription}
                />
            ) : (
                <>
                    <CommentTable
                        comments={filteredComments}
                        onSelectComment={selectComment}
                    />
                    <CommentPagination
                        loading={loading}
                        onPageChange={onCommentPageChange}
                        onPageSizeChange={onCommentPageSizeChange}
                        page={commentPage}
                        pageCount={commentPageCount}
                        pageSize={commentPageSize}
                    />
                </>
            )}
            {selectedComment && (
                <DrawerCard
                    actions={[
                        {
                            id: "close",
                            label: t.common.close,
                            onClick: () => setSelectedCommentID(null),
                            variant: "secondary",
                        },
                        ...(canMarkCompleted
                            ? [
                                  {
                                      id: "mark-completed",
                                      label: selectedComment.completed
                                          ? t.comments.unmarkComplete
                                          : t.comments.markComplete,
                                      loading: updatingCommentID === selectedComment.id,
                                      loadingLabel: t.comments.saving,
                                      icon: <Check />,
                                      onClick: () =>
                                          onMarkCommentCompleted(selectedComment),
                                      disabled:
                                          updatingCommentID === selectedComment.id,
                                      variant: "primary" as const,
                                  },
                              ]
                            : []),
                    ]}
                    cards={[
                        {
                            id: "identity",
                            layout: "grid",
                            items: [
                                {
                                    id: "username",
                                    type: "field",
                                    label: t.users.username,
                                    value:
                                        selectedComment.username ||
                                        t.comments.anonymousUser,
                                    copyable: Boolean(selectedComment.username),
                                    span: "full",
                                },
                                {
                                    id: "email",
                                    type: "field",
                                    label: t.users.email,
                                    value:
                                        selectedComment.email ||
                                        t.comments.noEmail,
                                    copyable: Boolean(selectedComment.email),
                                    span: "full",
                                },
                            ],
                        },
                        {
                            id: "comment",
                            items: [
                                {
                                    id: "comment-content",
                                    type: "content",
                                    label: t.comments.commentContent,
                                    value: selectedComment.comments,
                                },
                            ],
                        },
                        {
                            id: "details",
                            size: "compact",
                            items: [
                                {
                                    id: "source-page",
                                    type: "field",
                                    label: t.comments.sourcePage,
                                    value:
                                        selectedComment.page_title ||
                                        t.comments.untitledPage,
                                    copyable: Boolean(selectedComment.page_title),
                                },
                                {
                                    id: "page-address",
                                    type: "field",
                                    label: t.comments.pageAddress,
                                    value: selectedComment.source_path || "/",
                                    copyable: Boolean(selectedComment.source_path),
                                },
                                {
                                    id: "created-at",
                                    type: "field",
                                    label: t.comments.time,
                                    value: formatDate(selectedComment.created_at),
                                },
                                {
                                    id: "status",
                                    type: "field",
                                    label: t.users.status,
                                    value: selectedComment.completed
                                        ? t.comments.completed
                                        : t.comments.pending,
                                },
                            ],
                        },
                    ]}
                    closeLabel={t.common.close}
                    copyLabel={t.common.copy}
                    copiedLabel={t.common.copied}
                    eyebrow={t.dashboard.title}
                    onClose={() => setSelectedCommentID(null)}
                    title={t.dashboard.latestComments}
                />
            )}
        </section>
    );
}
