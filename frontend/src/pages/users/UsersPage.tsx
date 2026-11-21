import { Plus, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useOutletContext } from "react-router";
import {
    createOIDCProvider,
    createUser,
    getOIDCCallbackURL,
    listOIDCProviders,
    resetUserPassword,
    updateUserRole,
} from "../../api";
import { ADMIN_ROUTES } from "../../route-paths";
import type { AdminOutletContext } from "../../components/admin/admin-context";
import { DeletePrompt } from "../../components/DeletePrompt";
import { OIDCProviderDrawer } from "../../components/OIDCProviderDrawer";
import {
    DrawerCard,
    type DrawerCardGroup,
    type DrawerCardItem,
} from "../../components/DrawerCard";
import { EmptyState } from "../../components/EmptyState";
import { TableSkeleton } from "../../components/TableSkeleton";
import { TemporaryPasswordDialog } from "../../components/users/TemporaryPasswordDialog";
import { UserTable } from "../../components/users/UserTable";
import { interpolate, useI18n } from "../../i18n";
import type {
    CreatedUser,
    OIDCProvider,
    TemporaryPasswordUser,
    User,
    UserRole,
} from "../../types";
import { getErrorMessage, roleName } from "../../utils";

export default function UsersRoute() {
    const { t } = useI18n();
    const {
        deletingUserID,
        loading,
        onDeleteUser,
        onToggleUserForm,
        onUserCreated,
        onUserUpdated,
        onUsersDeleted,
        showUserForm,
        token,
        user,
        users,
    } = useOutletContext<AdminOutletContext>();
    const [query, setQuery] = useState("");
    const [createUserError, setCreateUserError] = useState("");
    const [createSection, setCreateSection] = useState<"user" | "oidc">("user");
    const [createOIDCError, setCreateOIDCError] = useState("");
    const [oidcProviders, setOIDCProviders] = useState<OIDCProvider[]>([]);
    const [oidcProvidersError, setOIDCProvidersError] = useState("");
    const [selectedOIDCProviderID, setSelectedOIDCProviderID] = useState<string | null>(null);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [selectedUserID, setSelectedUserID] = useState<string | null>(null);
    const [selectedUserSection, setSelectedUserSection] = useState<
        "permissions" | "settings"
    >("permissions");
    const [temporaryPasswordUser, setTemporaryPasswordUser] =
        useState<TemporaryPasswordUser | null>(null);
    const [resettingPasswordUserID, setResettingPasswordUserID] = useState<
        string | null
    >(null);
    const [resetPasswordError, setResetPasswordError] = useState("");
    const [roleUpdateError, setRoleUpdateError] = useState("");
    const [updatingRoleUserID, setUpdatingRoleUserID] = useState<string | null>(
        null,
    );

    useEffect(() => {
        if (user.role !== "admin") {
            return;
        }
        let active = true;
        listOIDCProviders(token)
            .then((providers) => {
                if (active) {
                    setOIDCProviders(providers);
                    setOIDCProvidersError("");
                }
            })
            .catch((requestError: unknown) => {
                if (active) {
                    setOIDCProvidersError(getErrorMessage(requestError));
                }
            });
        return () => {
            active = false;
        };
    }, [token, user.role]);

    const manageableUsers = useMemo(
        () => users.filter((item) => !item.oidc_provider_ids?.length),
        [users],
    );

    const filteredUsers = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return manageableUsers;
        }
        return manageableUsers.filter(
            (item) =>
                item.username.toLowerCase().includes(normalizedQuery) ||
                item.id.toLowerCase().includes(normalizedQuery) ||
                item.email?.toLowerCase().includes(normalizedQuery),
        );
    }, [manageableUsers, query]);

    const filteredOIDCProviders = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return oidcProviders;
        }
        return oidcProviders.filter(
            (provider) =>
                provider.name.toLowerCase().includes(normalizedQuery) ||
                provider.issuer.toLowerCase().includes(normalizedQuery) ||
                users.some(
                    (account) =>
                        account.oidc_provider_ids?.includes(provider.id) &&
                        [account.username, account.email ?? "", account.id]
                            .some((value) =>
                                value.toLowerCase().includes(normalizedQuery),
                            ),
                ),
        );
    }, [oidcProviders, query, users]);

    const oidcProviderAccountCounts = useMemo(
        () =>
            Object.fromEntries(
                oidcProviders.map((provider) => [
                    provider.id,
                    users.filter((account) =>
                        account.oidc_provider_ids?.includes(provider.id),
                    ).length,
                ]),
            ),
        [oidcProviders, users],
    );

    const selectedUser = selectedUserID
        ? users.find((item) => item.id === selectedUserID) ?? null
        : null;
    const selectedOIDCProvider = selectedOIDCProviderID
        ? oidcProviders.find((provider) => provider.id === selectedOIDCProviderID) ?? null
        : null;

    async function submitCreateUser(values: Record<string, string>) {
        setCreateUserError("");
        try {
            const role: Exclude<UserRole, "admin"> =
                values.role === "reviewer" ? "reviewer" : "viewer";
            const createdUser: CreatedUser = await createUser(
                token,
                values.username ?? "",
                role,
            );
            onUserCreated(createdUser);
        } catch (requestError) {
            setCreateUserError(getErrorMessage(requestError));
        }
    }

    function closeCreateUser() {
        setCreateUserError("");
        setCreateOIDCError("");
        onToggleUserForm();
    }

    async function submitCreateOIDC(values: Record<string, string>) {
        setCreateOIDCError("");
        try {
            const provider = await createOIDCProvider(token, {
                name: values.name ?? "",
                issuer: values.issuer ?? "",
                client_id: values.client_id ?? "",
                client_secret: values.client_secret ?? "",
                redirect_uri: getOIDCCallbackURL(),
            });
            setOIDCProviders((current) => [provider, ...current]);
            setSelectedOIDCProviderID(provider.id);
            onToggleUserForm();
        } catch (requestError) {
            setCreateOIDCError(getErrorMessage(requestError));
        }
    }

    async function confirmDeleteUser() {
        if (!userToDelete) {
            return;
        }
        await onDeleteUser(userToDelete);
        setUserToDelete(null);
    }

    async function resetSelectedUserPassword() {
        if (!selectedUser || selectedUser.id === user.id) {
            return;
        }

        setResettingPasswordUserID(selectedUser.id);
        setResetPasswordError("");
        try {
            const resetUser = await resetUserPassword(token, selectedUser.id);
            onUserUpdated(resetUser);
            setTemporaryPasswordUser(resetUser);
        } catch (requestError) {
            setResetPasswordError(getErrorMessage(requestError));
        } finally {
            setResettingPasswordUserID(null);
        }
    }

    async function submitRoleUpdate(values: Record<string, string>) {
        if (!selectedUser || selectedUser.role === "admin") {
            return;
        }

        const role: Exclude<UserRole, "admin"> =
            values.role === "reviewer" ? "reviewer" : "viewer";
        setRoleUpdateError("");
        if (role === selectedUser.role) {
            return;
        }

        setUpdatingRoleUserID(selectedUser.id);
        try {
            const updatedUser = await updateUserRole(
                token,
                selectedUser.id,
                role,
            );
            onUserUpdated(updatedUser);
        } catch (requestError) {
            setRoleUpdateError(getErrorMessage(requestError));
        } finally {
            setUpdatingRoleUserID(null);
        }
    }

    let selectedUserCards: DrawerCardGroup[] = [];
    if (selectedUser && selectedUserSection === "permissions") {
        selectedUserCards = [
            {
                id: "permissions",
                size: "compact",
                items: [
                    {
                        type: "field",
                        id: "username",
                        label: t.users.username,
                        value: selectedUser.username,
                        copyable: false,
                    },
                    {
                        type: "field",
                        id: "role",
                        label: t.users.role,
                        value: roleName(selectedUser.role),
                        copyable: false,
                    },
                    {
                        type: "checkbox",
                        id: "view-comments",
                        label: t.users.viewCommentsPermission,
                        checked: true,
                        disabled: true,
                    },
                    {
                        type: "checkbox",
                        id: "complete-comments",
                        label: t.users.completeCommentsPermission,
                        checked:
                            selectedUser.role === "admin" ||
                            selectedUser.role === "reviewer",
                        disabled: true,
                    },
                    {
                        type: "checkbox",
                        id: "manage-users",
                        label: t.users.manageUsersPermission,
                        checked: selectedUser.role === "admin",
                        disabled: true,
                    },
                    {
                        type: "content",
                        id: "permission-description",
                        label: t.users.permissionDetails,
                        value: t.users.permissionDescription,
                    },
                ],
            },
        ];
    } else if (selectedUser) {
        const items: DrawerCardItem[] = [
            {
                type: "field",
                id: "username",
                label: t.users.username,
                value: selectedUser.username,
                copyable: false,
            },
        ];

        if (selectedUser.role === "admin") {
            items.push(
                {
                    type: "field",
                    id: "role",
                    label: t.users.role,
                    value: roleName(selectedUser.role),
                    copyable: false,
                },
                {
                    type: "content",
                    id: "admin-role-note",
                    label: t.users.permissionDetails,
                    value: t.users.adminRoleCannotChange,
                },
            );
        } else {
            items.push({
                type: "select",
                id: "role",
                name: "role",
                label: t.users.role,
                value: selectedUser.role,
                options: [
                    { value: "viewer", label: t.roles.viewer },
                    { value: "reviewer", label: t.roles.reviewer },
                ],
            });
        }

        if (selectedUser.id !== user.id) {
            items.push({
                type: "action",
                id: "reset-password",
                label: t.auth.password,
                description: t.users.resetPasswordDescription,
                button: {
                    label: t.users.resetPassword,
                    loadingLabel: t.users.resettingPassword,
                    loading: resettingPasswordUserID === selectedUser.id,
                    onClick: resetSelectedUserPassword,
                    variant: "primary",
                },
                confirm: {
                    title: t.users.resetPassword,
                    description: interpolate(
                        t.users.resetPasswordConfirmation,
                        { username: selectedUser.username },
                    ),
                    cancelLabel: t.common.cancel,
                    confirmLabel: t.common.confirm,
                    pendingLabel: t.users.resettingPassword,
                },
            });
        }

        if (selectedUser.role !== "admin" && selectedUser.id !== user.id) {
            items.push({
                type: "action",
                id: "delete-user",
                label: t.users.deleteUserAction,
                button: {
                    label: t.common.delete,
                    onClick: () => setUserToDelete(selectedUser),
                    variant: "secondary",
                },
            });
        }

        selectedUserCards = [
            {
                id: "account-settings",
                size: "compact",
                items,
            },
        ];
    }

    if (user.role !== "admin") {
        return <Navigate replace to={ADMIN_ROUTES.overview} />;
    }

    return (
        <section className="identity-users-page">
            <div className="identity-toolbar">
                <label className="identity-search">
                    <Search aria-hidden="true" />
                    <span className="sr-only">{t.users.searchLabel}</span>
                    <input
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t.users.searchPlaceholder}
                        type="search"
                        value={query}
                    />
                </label>
                <div className="identity-toolbar-actions">
                <button
                    className="identity-action identity-action-link"
                    onClick={() => {
                        setCreateSection("user");
                        setCreateUserError("");
                        setCreateOIDCError("");
                        onToggleUserForm();
                    }}
                    type="button"
                >
                    <Plus />
                    {t.users.createNew}
                </button>
                </div>
            </div>
            {showUserForm && (
                <DrawerCard
                    actions={[
                        {
                            id: "cancel",
                            label: t.common.cancel,
                            onClick: closeCreateUser,
                            variant: "secondary",
                        },
                        {
                            id: "submit-create",
                            label:
                                createSection === "user"
                                    ? t.common.create
                                    : t.oidc.addSource,
                            loadingLabel:
                                createSection === "user"
                                    ? t.users.creating
                                    : t.common.saving,
                            type: "submit",
                            variant: "primary",
                        },
                    ]}
                    sections={[
                        { id: "user", label: t.oidc.userTab },
                        { id: "oidc", label: t.oidc.sourceTab },
                    ]}
                    activeSectionID={createSection}
                    sectionsLabel={t.users.createTitle}
                    onSectionChange={(sectionID) => {
                        if (sectionID === "user" || sectionID === "oidc") {
                            setCreateSection(sectionID);
                            setCreateUserError("");
                            setCreateOIDCError("");
                        }
                    }}
                    cards={createSection === "user"
                        ? [
                              {
                                  id: "account",
                                  items: [
                                      {
                                          type: "field",
                                          id: "username",
                                          name: "username",
                                          label: t.users.username,
                                          editable: true,
                                          value: "",
                                          placeholder: t.users.usernamePlaceholder,
                                          required: true,
                                          autoFocus: true,
                                      },
                                      {
                                          type: "select",
                                          id: "role",
                                          name: "role",
                                          label: t.users.role,
                                          value: "viewer",
                                          options: [
                                              { value: "viewer", label: t.roles.viewer },
                                              { value: "reviewer", label: t.roles.reviewer },
                                          ],
                                      },
                                      {
                                          type: "disclosure",
                                          id: "role-details",
                                          collapsedLabel: t.users.showMore,
                                          expandedLabel: t.users.hideMore,
                                          description: t.users.temporaryPasswordNote,
                                      },
                                  ],
                              },
                              {
                                  id: "permissions",
                                  items: [
                                      {
                                          type: "checkbox",
                                          id: "admin",
                                          label: t.users.admin,
                                          title: t.users.adminCliOnly,
                                          disabled: true,
                                      },
                                  ],
                              },
                          ]
                        : [
                              {
                                  id: "oidc-source",
                                  items: [
                                      {
                                          type: "field",
                                          id: "provider-name",
                                          name: "name",
                                          label: t.oidc.name,
                                          editable: true,
                                          required: true,
                                          autoFocus: true,
                                      },
                                      {
                                          type: "field",
                                          id: "provider-issuer",
                                          name: "issuer",
                                          label: t.oidc.issuer,
                                          editable: true,
                                          inputType: "url",
                                          placeholder: "https://identity.example.com",
                                          required: true,
                                      },
                                      {
                                          type: "field",
                                          id: "provider-client-id",
                                          name: "client_id",
                                          label: t.oidc.clientID,
                                          editable: true,
                                          required: true,
                                      },
                                      {
                                          type: "field",
                                          id: "provider-client-secret",
                                          name: "client_secret",
                                          label: t.oidc.clientSecret,
                                          editable: true,
                                          inputType: "password",
                                          required: true,
                                      },
                                      {
                                          type: "field",
                                          id: "provider-redirect-uri",
                                          label: t.oidc.callbackURL,
                                          value: getOIDCCallbackURL(),
                                      },
                                      {
                                          type: "content",
                                          id: "provider-hints",
                                          label: t.oidc.callbackURL,
                                          value: `${t.oidc.callbackHint} ${t.oidc.redirectScopes}`,
                                      },
                                  ],
                              },
                          ]}
                    closeLabel={t.common.close}
                    copyLabel={t.common.copy}
                    copiedLabel={t.common.copied}
                    onClose={closeCreateUser}
                    onSubmit={createSection === "user" ? submitCreateUser : submitCreateOIDC}
                    submitError={createSection === "user" ? createUserError : createOIDCError}
                    title={createSection === "user" ? t.users.createTitle : t.oidc.createTitle}
                />
            )}
            {oidcProvidersError && (
                <p className="identity-oauth-error" role="alert">
                    {oidcProvidersError}
                </p>
            )}
            {loading ? (
                <TableSkeleton />
            ) : filteredUsers.length === 0 &&
              filteredOIDCProviders.length === 0 ? (
                <EmptyState
                    icon={<Users />}
                    title={
                        manageableUsers.length === 0 && oidcProviders.length === 0
                            ? t.users.emptyTitle
                            : t.users.notFoundTitle
                    }
                    description={
                        manageableUsers.length === 0 && oidcProviders.length === 0
                            ? t.users.emptyDescription
                            : t.users.notFoundDescription
                    }
                />
            ) : (
                <UserTable
                    currentUserID={user.id}
                    onSelectProvider={(provider) => {
                        setSelectedUserID(null);
                        setSelectedOIDCProviderID(provider.id);
                    }}
                    onSelectUser={(target) => {
                        setSelectedOIDCProviderID(null);
                        setResetPasswordError("");
                        setRoleUpdateError("");
                        setSelectedUserID(target.id);
                        setSelectedUserSection("permissions");
                    }}
                    providerAccountCounts={oidcProviderAccountCounts}
                    providers={filteredOIDCProviders}
                    users={filteredUsers}
                />
            )}
            {selectedOIDCProvider && (
                <OIDCProviderDrawer
                    onClose={() => setSelectedOIDCProviderID(null)}
                    onProviderDeleted={(providerID) => {
                        setOIDCProviders((current) =>
                            current.filter((item) => item.id !== providerID),
                        );
                        setSelectedOIDCProviderID(null);
                    }}
                    onProviderUpdated={(updatedProvider) => {
                        setOIDCProviders((current) =>
                            current.map((item) =>
                                item.id === updatedProvider.id
                                    ? updatedProvider
                                    : item,
                            ),
                        );
                    }}
                    onUserUpdated={onUserUpdated}
                    onUsersDeleted={onUsersDeleted}
                    provider={selectedOIDCProvider}
                    token={token}
                    users={users}
                />
            )}
            {selectedUser && (
                <DrawerCard
                    key={selectedUser.id}
                    actions={[
                        {
                            id: "close",
                            label: t.common.close,
                            onClick: () => setSelectedUserID(null),
                            disabled:
                                updatingRoleUserID === selectedUser.id ||
                                resettingPasswordUserID === selectedUser.id,
                            variant: "secondary",
                        },
                        ...(selectedUserSection === "settings" &&
                        selectedUser.role !== "admin"
                            ? [
                                  {
                                      id: "save-role",
                                      label: t.users.updateRole,
                                      loadingLabel: t.users.updatingRole,
                                      loading:
                                          updatingRoleUserID === selectedUser.id,
                                      type: "submit" as const,
                                      variant: "primary" as const,
                                  },
                              ]
                            : []),
                    ]}
                    sections={[
                        {
                            id: "permissions",
                            label: t.users.viewCurrentPermissions,
                        },
                        { id: "settings", label: t.users.configureUser },
                    ]}
                    activeSectionID={selectedUserSection}
                    sectionsLabel={t.users.userSections}
                    onSectionChange={(sectionID) => {
                        if (
                            updatingRoleUserID !== selectedUser.id &&
                            (sectionID === "permissions" ||
                                sectionID === "settings")
                        ) {
                            setSelectedUserSection(sectionID);
                        }
                    }}
                    cards={selectedUserCards}
                    closeLabel={t.common.close}
                    copyLabel={t.common.copy}
                    copiedLabel={t.common.copied}
                    eyebrow={roleName(selectedUser.role)}
                    onClose={() => setSelectedUserID(null)}
                    onSubmit={
                        selectedUserSection === "settings" &&
                        selectedUser.role !== "admin"
                            ? submitRoleUpdate
                            : undefined
                    }
                    submitError={roleUpdateError || resetPasswordError}
                    title={selectedUser.username}
                />
            )}
            {temporaryPasswordUser && (
                <TemporaryPasswordDialog
                    onClose={() => setTemporaryPasswordUser(null)}
                    purpose="reset"
                    user={temporaryPasswordUser}
                />
            )}
            {userToDelete && (
                <DeletePrompt
                    cancelLabel={t.common.cancel}
                    confirmLabel={t.common.delete}
                    description={interpolate(t.errors.deleteUserConfirm, {
                        username: userToDelete.username,
                    })}
                    isPending={deletingUserID === userToDelete.id}
                    onCancel={() => setUserToDelete(null)}
                    onConfirm={confirmDeleteUser}
                    pendingLabel={t.common.deleting}
                    title={interpolate(t.users.deleteUser, {
                        username: userToDelete.username,
                    })}
                />
            )}
        </section>
    );
}
