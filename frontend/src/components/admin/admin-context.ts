import type { Comment, CreatedUser, User } from "../../types";

export interface AdminOutletContext {
    comments: Comment[];
    commentPage: number;
    commentPageCount: number;
    commentPageSize: number;
    deletingUserID: string | null;
    loading: boolean;
    onDeleteUser: (user: User) => Promise<void>;
    onCommentPageChange: (page: number) => void;
    onCommentPageSizeChange: (pageSize: number) => void;
    onMarkCommentCompleted: (comment: Comment) => void;
    onToggleUserForm: () => void;
    onUserCreated: (user: CreatedUser) => void;
    onUserUpdated: (user: User) => void;
    onUsersDeleted: (userIDs: string[]) => void;
    showUserForm: boolean;
    token: string;
    totalComments: number;
    updatingCommentID: string | null;
    user: User;
    users: User[];
}
