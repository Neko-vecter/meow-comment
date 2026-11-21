import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import {
    deleteUser,
    listComments,
    listUsers,
    updateCommentCompleted,
} from "../../../api";
import { InlineAlert } from "../../InlineAlert";
import { TemporaryPasswordDialog } from "../../users/TemporaryPasswordDialog";
import type {
    Comment,
    CreatedUser,
    SessionResponse,
    Theme,
    User,
} from "../../../types";
import { ADMIN_ROUTES } from "../../../route-paths";
import { handleDataError } from "../../../utils";
import { AdminHeader } from "../AdminHeader";
import { AdminSidebar } from "../AdminSidebar";
import type { AdminOutletContext } from "../admin-context";
import "../admin.css";

const DEFAULT_COMMENT_PAGE_SIZE = 25;

interface AdminShellProps {
    onLogout: () => void;
    onSessionChanged: (session: SessionResponse) => void;
    onSessionExpired: () => void;
    onThemeChange: (theme: Theme) => void;
    theme: Theme;
    token: string;
    user: User;
}

export function AdminShell({
    onLogout,
    onSessionChanged,
    onSessionExpired,
    onThemeChange,
    theme,
    token,
    user,
}: AdminShellProps) {
    const location = useLocation();
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentTotal, setCommentTotal] = useState(0);
    const [commentPageSize, setCommentPageSize] = useState(
        DEFAULT_COMMENT_PAGE_SIZE,
    );
    const [commentOffset, setCommentOffset] = useState(0);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showUserForm, setShowUserForm] = useState(false);
    const [newUser, setNewUser] = useState<CreatedUser | null>(null);
    const [deletingUserID, setDeletingUserID] = useState<string | null>(null);
    const [updatingCommentID, setUpdatingCommentID] = useState<string | null>(
        null,
    );
    const usersRoutePath = ADMIN_ROUTES.users.slice(0, -1);
    const isUsersRoute =
        user.role === "admin" &&
        (location.pathname === usersRoutePath ||
            location.pathname.startsWith(ADMIN_ROUTES.users));
    const isDashboardRoute =
        location.pathname === ADMIN_ROUTES.overview ||
        location.pathname === ADMIN_ROUTES.overview.slice(0, -1);
    const isFullBleedRoute = isUsersRoute || isDashboardRoute;

    const refreshComments = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await listComments(
                token,
                commentPageSize,
                commentOffset,
            );
            setComments(response.items);
            setCommentTotal(response.total);
        } catch (requestError) {
            handleDataError(requestError, onSessionExpired, setError);
        } finally {
            setLoading(false);
        }
    }, [commentOffset, commentPageSize, onSessionExpired, token]);

    const commentPageCount = Math.max(
        1,
        Math.ceil(commentTotal / commentPageSize),
    );
    const commentPage = Math.floor(commentOffset / commentPageSize) + 1;

    const handleCommentPageChange = useCallback(
        (page: number) => {
            const nextPage = Math.min(Math.max(page, 1), commentPageCount);
            setCommentOffset((nextPage - 1) * commentPageSize);
        },
        [commentPageCount, commentPageSize],
    );

    const handleCommentPageSizeChange = useCallback((pageSize: number) => {
        setCommentPageSize(pageSize);
        setCommentOffset(0);
    }, []);

    const refreshUsers = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setUsers(await listUsers(token));
        } catch (requestError) {
            handleDataError(requestError, onSessionExpired, setError);
        } finally {
            setLoading(false);
        }
    }, [onSessionExpired, token]);

    const handleDeleteUser = useCallback(
        async (userToDelete: User) => {
            if (userToDelete.role === "admin") {
                return;
            }
            setDeletingUserID(userToDelete.id);
            setError("");
            try {
                await deleteUser(token, userToDelete.id);
                await refreshUsers();
            } catch (requestError) {
                handleDataError(requestError, onSessionExpired, setError);
            } finally {
                setDeletingUserID(null);
            }
        },
        [onSessionExpired, refreshUsers, token],
    );

    const handleMarkCommentCompleted = useCallback(
        async (comment: Comment) => {
            setUpdatingCommentID(comment.id);
            setError("");
            try {
                const updated = await updateCommentCompleted(
                    token,
                    comment.id,
                    !comment.completed,
                );
                setComments((current) =>
                    current.map((item) =>
                        item.id === updated.id ? updated : item,
                    ),
                );
            } catch (requestError) {
                handleDataError(requestError, onSessionExpired, setError);
            } finally {
                setUpdatingCommentID(null);
            }
        },
        [onSessionExpired, token],
    );

    const handleUserCreated = useCallback(
        (created: CreatedUser) => {
            setNewUser(created);
            setShowUserForm(false);
            void refreshUsers();
        },
        [refreshUsers],
    );

    const handleUserUpdated = useCallback((updatedUser: User) => {
        setUsers((current) =>
            current.map((item) =>
                item.id === updatedUser.id ? updatedUser : item,
            ),
        );
    }, []);

    const handleUsersDeleted = useCallback((userIDs: string[]) => {
        if (userIDs.length === 0) {
            return;
        }
        const deletedIDs = new Set(userIDs);
        setUsers((current) =>
            current.filter((item) => !deletedIDs.has(item.id)),
        );
    }, []);

    useEffect(() => {
        if (isUsersRoute) {
            void refreshUsers();
        } else {
            void refreshComments();
        }
    }, [isUsersRoute, refreshComments, refreshUsers]);

    const outletContext: AdminOutletContext = {
        comments,
        commentPage,
        commentPageCount,
        commentPageSize,
        deletingUserID,
        loading,
        onDeleteUser: handleDeleteUser,
        onCommentPageChange: handleCommentPageChange,
        onCommentPageSizeChange: handleCommentPageSizeChange,
        onMarkCommentCompleted: handleMarkCommentCompleted,
        onToggleUserForm: () => setShowUserForm((visible) => !visible),
        onUserCreated: handleUserCreated,
        onUserUpdated: handleUserUpdated,
        onUsersDeleted: handleUsersDeleted,
        showUserForm,
        token,
        totalComments: commentTotal,
        updatingCommentID,
        user,
        users,
    };

    return (
        <div className="app-shell">
            <div className="console-frame">
                <AdminHeader
                    onLogout={onLogout}
                    onSessionChanged={onSessionChanged}
                    onThemeChange={onThemeChange}
                    theme={theme}
                    token={token}
                    user={user}
                />
                <div className="console-body">
                    <AdminSidebar
                        role={user.role}
                    />
                    <main
                        className={
                            isFullBleedRoute
                                ? "main-content identity-main-content"
                                : "main-content"
                        }
                    >
                        <div
                            className={
                                isFullBleedRoute
                                    ? "content-wrap identity-content-wrap"
                                    : "content-wrap"
                            }
                        >
                            {error && (
                                <InlineAlert message={error} tone="error" />
                            )}
                            <Outlet context={outletContext} />
                        </div>
                    </main>
                </div>
            </div>
            {newUser && (
                <TemporaryPasswordDialog
                    onClose={() => setNewUser(null)}
                    user={newUser}
                />
            )}
        </div>
    );
}
