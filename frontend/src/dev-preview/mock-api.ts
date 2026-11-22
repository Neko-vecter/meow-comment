import type {
    Comment,
    CommentListResponse,
    CreatedUser,
    OIDCLoginOption,
    OIDCProvider,
    OIDCProviderDeleteResult,
    SessionResponse,
    TemporaryPasswordUser,
    User,
} from "../types";

export const previewAdminUser: User = {
    id: "preview-admin",
    username: "dev-admin",
    role: "admin",
    must_change_password: false,
    authentication_methods: ["password"],
    created_at: "2026-09-01T12:00:00Z",
};

const initialUsers: User[] = [
    previewAdminUser,
    {
        id: "preview-user-maya",
        username: "maya-reader",
        role: "viewer",
        must_change_password: true,
        authentication_methods: ["password"],
        created_at: "2026-09-28T14:20:00Z",
    },
    {
        id: "preview-user-studio",
        username: "studio-editor",
        role: "viewer",
        must_change_password: false,
        authentication_methods: ["password"],
        created_at: "2026-09-24T09:15:00Z",
    },
    {
        id: "preview-user-archive",
        username: "archive-reader",
        role: "viewer",
        must_change_password: false,
        authentication_methods: ["password"],
        created_at: "2026-09-19T17:40:00Z",
    },
    {
        id: "preview-user-oidc",
        username: "alex-reader",
        email: "alex@example.test",
        role: "reviewer",
        must_change_password: false,
        authentication_methods: ["oidc"],
        oidc_provider_ids: ["preview-oidc-workspace"],
        created_at: "2026-09-18T11:12:00Z",
    },
];

let oidcProviders: OIDCProvider[] = [
    {
        id: "preview-oidc-workspace",
        name: "Workspace login",
        issuer: "https://identity.example.test",
        client_id: "meow-comment-preview",
        redirect_uri: "https://admin.example.test/api/admin/auth/oidc/callback",
        created_at: "2026-09-18T10:00:00Z",
    },
];

const initialComments: Comment[] = [
    {
        id: "preview-comment-1",
        username: "Mina Chen",
        email: "mina@example.com",
        comments:
            "The **examples** in this article helped me finally understand how the pieces fit together.\n\nThank you for writing it! [Related guide](https://link).",
        source_path: "/notes/designing-for-the-web",
        page_title: "Designing for the Web",
        created_at: "2026-09-29T15:30:00Z",
        completed: false,
    },
    {
        id: "preview-comment-2",
        username: "Alex Morgan",
        email: "alex@example.com",
        comments:
            "Would you consider adding a follow-up about keyboard navigation and focus states?\n\nI especially found `:focus-visible` useful.\n\n> The focus ring should be easy to see.",
        source_path: "/guides/accessibility",
        page_title: "A Practical Accessibility Checklist",
        created_at: "2026-09-29T12:08:00Z",
        completed: true,
    },
    {
        id: "preview-comment-3",
        username: "Jun Park",
        email: "",
        comments:
            "I tried this with a small project over the weekend.\n\n1. Start with a small scope.\n2. Keep the interface predictable.\n3. Refine after testing.\n\nIt was much easier to maintain than my first attempt.",
        source_path: "/journal/small-tools",
        page_title: "Small Tools, Thoughtfully Made",
        created_at: "2026-09-28T21:42:00Z",
        completed: false,
    },
    {
        id: "preview-comment-4",
        username: "Riley",
        email: "riley@example.com",
        comments: "A clear explanation. I bookmarked this for later.\n\n**One small note:** the code example also works with `npm run build`.",
        source_path: "/notes/working-with-color",
        page_title: "Working with Color",
        created_at: "2026-09-28T16:05:00Z",
        completed: true,
    },
    {
        id: "preview-comment-5",
        username: "Sam Rivera",
        email: "sam@example.com",
        comments:
            "The before-and-after comparison makes the trade-offs much easier to see.",
        source_path: "/guides/interface-details",
        page_title: "Details That Make an Interface Feel Finished",
        created_at: "2026-09-27T10:18:00Z",
        completed: false,
    },
    {
        id: "preview-comment-6",
        username: "",
        email: "",
        comments:
            "I found a typo in the second section: `recieve` should be `receive`.",
        source_path: "/notes/editorial-process",
        page_title: "A Calm Editorial Process",
        created_at: "2026-09-26T08:52:00Z",
        completed: true,
    },
    {
        id: "preview-comment-7",
        username: "Taylor Brooks",
        email: "taylor@example.com",
        comments:
            "This was exactly the reference I needed while updating our internal guide.",
        source_path: "/guides/content-systems",
        page_title: "Building a Content System",
        created_at: "2026-09-25T19:27:00Z",
        completed: false,
    },
];

let users = [...initialUsers];
let comments = [...initialComments];
let nextUserNumber = 1;
let nextOIDCProviderNumber = 1;

function parseBody(body: BodyInit | null | undefined) {
    if (typeof body !== "string") {
        return {} as Record<string, unknown>;
    }
    return JSON.parse(body) as Record<string, unknown>;
}

export async function requestPreviewApi<T>(
    path: string,
    init?: RequestInit,
): Promise<T> {
    const url = new URL(path, "http://layout-preview.local");
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.pathname === "/api/admin/auth/password" && method === "POST") {
        const body = parseBody(init?.body);
        const currentPassword = String(body.current_password ?? "");
        const newPassword = String(body.new_password ?? "");
        if (!currentPassword) {
            throw new Error("The current password is required.");
        }
        if (newPassword.length < 12 || newPassword.length > 128) {
            throw new Error("The new password must be 12–128 characters.");
        }

        const session: SessionResponse = {
            access_token: "dev-layout-preview",
            token_type: "Bearer",
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            user: previewAdminUser,
        };
        return session as T;
    }

    if (url.pathname === "/api/admin/comments" && method === "GET") {
        const limit = Number(url.searchParams.get("limit") ?? 50);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const response: CommentListResponse = {
            items: comments.slice(offset, offset + limit),
            total: comments.length,
            limit,
            offset,
        };
        return response as T;
    }

    if (url.pathname === "/api/admin/auth/oidc/providers" && method === "GET") {
        const options: OIDCLoginOption[] = oidcProviders.map(({ id, name }) => ({
            id,
            name,
        }));
        return options as T;
    }

    if (url.pathname === "/api/admin/oidc/providers" && method === "GET") {
        return [...oidcProviders] as T;
    }

    if (url.pathname === "/api/admin/oidc/providers" && method === "POST") {
        const body = parseBody(init?.body);
        const created: OIDCProvider = {
            id: `preview-oidc-created-${nextOIDCProviderNumber}`,
            name: String(body.name ?? "").trim(),
            issuer: String(body.issuer ?? "").trim(),
            client_id: String(body.client_id ?? "").trim(),
            redirect_uri: String(body.redirect_uri ?? ""),
            created_at: new Date().toISOString(),
        };
        nextOIDCProviderNumber += 1;
        oidcProviders = [created, ...oidcProviders];
        return created as T;
    }

    const oidcProviderMatch = url.pathname.match(
        /^\/api\/admin\/oidc\/providers\/([^/]+)$/,
    );
    if (oidcProviderMatch && method === "PATCH") {
        const providerID = decodeURIComponent(oidcProviderMatch[1]);
        const existing = oidcProviders.find((item) => item.id === providerID);
        if (!existing) {
            throw new Error("The preview OIDC source was not found.");
        }
        const body = parseBody(init?.body);
        const updated: OIDCProvider = {
            ...existing,
            name: String(body.name ?? existing.name).trim(),
            issuer: String(body.issuer ?? existing.issuer).trim(),
            client_id: String(body.client_id ?? existing.client_id).trim(),
            redirect_uri: String(body.redirect_uri ?? existing.redirect_uri).trim(),
        };
        oidcProviders = oidcProviders.map((item) =>
            item.id === providerID ? updated : item,
        );
        return updated as T;
    }

    if (oidcProviderMatch && method === "DELETE") {
        const providerID = decodeURIComponent(oidcProviderMatch[1]);
        if (!oidcProviders.some((item) => item.id === providerID)) {
            throw new Error("The preview OIDC source was not found.");
        }
        const deletedUserIDs: string[] = [];
        const updatedUsers: User[] = [];
        users = users.flatMap((item) => {
            if (!item.oidc_provider_ids?.includes(providerID)) {
                return [item];
            }
            const remainingProviderIDs = item.oidc_provider_ids.filter(
                (id) => id !== providerID,
            );
            if (remainingProviderIDs.length === 0 && item.role !== "admin") {
                deletedUserIDs.push(item.id);
                return [];
            }
            const authenticationMethods = item.authentication_methods.filter(
                (methodName) => methodName !== "oidc",
            );
            if (remainingProviderIDs.length > 0) {
                authenticationMethods.push("oidc");
            }
            const updated: User = {
                ...item,
                oidc_provider_ids: remainingProviderIDs,
                authentication_methods: authenticationMethods,
            };
            updatedUsers.push(updated);
            return [updated];
        });
        oidcProviders = oidcProviders.filter((item) => item.id !== providerID);
        const result: OIDCProviderDeleteResult = {
            deleted_user_ids: deletedUserIDs,
            updated_users: updatedUsers,
        };
        return result as T;
    }

    if (url.pathname === "/api/admin/users" && method === "GET") {
        return [...users] as T;
    }

    if (url.pathname === "/api/admin/users" && method === "POST") {
        const body = parseBody(init?.body);
        const username = String(body.username ?? "").trim();
        if (!username) {
            throw new Error("A username is required in layout preview mode.");
        }

        const createdUser: CreatedUser = {
            id: `preview-user-created-${nextUserNumber}`,
            username,
            role: body.role === "reviewer" ? "reviewer" : "viewer",
            must_change_password: true,
            authentication_methods: ["password"],
            created_at: new Date().toISOString(),
            temporary_password: `Preview-Only-${String(nextUserNumber).padStart(4, "0")}!`,
        };
        nextUserNumber += 1;
        users = [...users, createdUser];
        return createdUser as T;
    }

    const commentMatch = url.pathname.match(
        /^\/api\/admin\/comments\/([^/]+)$/,
    );
    if (commentMatch && method === "PATCH") {
        const commentID = decodeURIComponent(commentMatch[1]);
        const body = parseBody(init?.body);
        const existing = comments.find((comment) => comment.id === commentID);
        if (!existing || typeof body.completed !== "boolean") {
            throw new Error("The preview comment could not be updated.");
        }

        const updated = { ...existing, completed: body.completed };
        comments = comments.map((comment) =>
            comment.id === commentID ? updated : comment,
        );
        return updated as T;
    }

    const resetPasswordMatch = url.pathname.match(
        /^\/api\/admin\/users\/([^/]+)\/password$/,
    );
    if (resetPasswordMatch && method === "POST") {
        const userID = decodeURIComponent(resetPasswordMatch[1]);
        const existing = users.find((user) => user.id === userID);
        if (!existing || existing.id === previewAdminUser.id) {
            throw new Error("The preview user password could not be reset.");
        }

        const updated: TemporaryPasswordUser = {
            ...existing,
            must_change_password: true,
            temporary_password: `Preview-Reset-${String(nextUserNumber).padStart(4, "0")}!`,
        };
        nextUserNumber += 1;
        users = users.map((user) => (user.id === userID ? updated : user));
        return updated as T;
    }

    const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (userMatch && method === "PATCH") {
        const userID = decodeURIComponent(userMatch[1]);
        const body = parseBody(init?.body);
        const existing = users.find((user) => user.id === userID);
        if (
            !existing ||
            existing.role === "admin" ||
            (body.role !== "viewer" && body.role !== "reviewer")
        ) {
            throw new Error("The preview user role could not be updated.");
        }

        const updatedRole: User["role"] =
            body.role === "reviewer" ? "reviewer" : "viewer";
        const updated = { ...existing, role: updatedRole };
        users = users.map((user) => (user.id === userID ? updated : user));
        return updated as T;
    }

    if (userMatch && method === "DELETE") {
        const userID = decodeURIComponent(userMatch[1]);
        const existing = users.find((user) => user.id === userID);
        if (!existing || existing.role === "admin") {
            throw new Error("The preview user could not be deleted.");
        }
        users = users.filter((user) => user.id !== userID);
        return undefined as T;
    }

    throw new Error(
        `No layout preview response is defined for ${method} ${url.pathname}.`,
    );
}
