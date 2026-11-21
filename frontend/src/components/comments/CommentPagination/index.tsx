import { ChevronLeft, ChevronRight } from "lucide-react";
import { interpolate, useI18n } from "../../../i18n";
import "./CommentPagination.css";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

interface CommentPaginationProps {
    loading: boolean;
    page: number;
    pageCount: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
}

export function CommentPagination({
    loading,
    page,
    pageCount,
    pageSize,
    onPageChange,
    onPageSizeChange,
}: CommentPaginationProps) {
    const { t } = useI18n();

    return (
        <footer className="comment-pagination">
            <label className="comment-page-size">
                <span>{t.dashboard.pageSize}</span>
                <select
                    aria-label={t.dashboard.pageSize}
                    disabled={loading}
                    onChange={(event) =>
                        onPageSizeChange(Number(event.currentTarget.value))
                    }
                    value={pageSize}
                >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            </label>
            <div className="comment-pagination-nav">
                <button
                    aria-label={t.dashboard.previousPage}
                    className="comment-pagination-button"
                    disabled={loading || page <= 1}
                    onClick={() => onPageChange(page - 1)}
                    type="button"
                >
                    <ChevronLeft aria-hidden="true" />
                </button>
                <span aria-live="polite" className="comment-pagination-status">
                    {interpolate(t.dashboard.pageOf, {
                        page,
                        totalPages: pageCount,
                    })}
                </span>
                <button
                    aria-label={t.dashboard.nextPage}
                    className="comment-pagination-button"
                    disabled={loading || page >= pageCount}
                    onClick={() => onPageChange(page + 1)}
                    type="button"
                >
                    <ChevronRight aria-hidden="true" />
                </button>
            </div>
        </footer>
    );
}
