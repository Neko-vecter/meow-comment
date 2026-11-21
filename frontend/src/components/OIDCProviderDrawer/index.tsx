import { deleteOIDCProvider, updateOIDCProvider, updateUserRole } from "../../api";
import {
    DrawerCard,
    type DrawerCardGroup,
} from "../DrawerCard";
import { useI18n } from "../../i18n";
import type { OIDCProvider, User, UserRole } from "../../types";
import { getErrorMessage } from "../../utils";
import { useState } from "react";

interface OIDCProviderDrawerProps {
    onClose: () => void;
    onProviderDeleted: (providerID: string) => void;
    onProviderUpdated: (provider: OIDCProvider) => void;
    onUserUpdated: (user: User) => void;
    onUsersDeleted: (userIDs: string[]) => void;
    provider: OIDCProvider;
    token: string;
    users: User[];
}

type ProviderSection = "permissions" | "config";

export function OIDCProviderDrawer({
    onClose,
    onProviderDeleted,
    onProviderUpdated,
    onUserUpdated,
    onUsersDeleted,
    provider,
    token,
    users,
}: OIDCProviderDrawerProps) {
    const { t } = useI18n();
    const [activeSection, setActiveSection] = useState<ProviderSection>("permissions");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const providerUsers = users.filter((user) =>
        user.oidc_provider_ids?.includes(provider.id),
    );

    async function saveRoles(values: Record<string, string>) {
        setError("");
        setSaving(true);
        try {
            for (const account of providerUsers) {
                const role: Exclude<UserRole, "admin"> =
                    values[`role-${account.id}`] === "reviewer"
                        ? "reviewer"
                        : "viewer";
                if (role === account.role || account.role === "admin") {
                    continue;
                }
                onUserUpdated(await updateUserRole(token, account.id, role));
            }
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setSaving(false);
        }
    }

    async function saveConfig(values: Record<string, string>) {
        setError("");
        setSaving(true);
        try {
            const updated = await updateOIDCProvider(token, provider.id, {
                name: values.name ?? "",
                issuer: values.issuer ?? "",
                client_id: values.client_id ?? "",
                client_secret: values.client_secret ?? "",
                redirect_uri: values.redirect_uri ?? "",
            });
            onProviderUpdated(updated);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setSaving(false);
        }
    }

    async function deleteProvider() {
        setError("");
        setDeleting(true);
        try {
            const result = await deleteOIDCProvider(token, provider.id);
            result.updated_users.forEach(onUserUpdated);
            onUsersDeleted(result.deleted_user_ids);
            onProviderDeleted(provider.id);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
            setDeleting(false);
        }
    }

    const accountItems = providerUsers.length
        ? providerUsers.map((account) => ({
              type: "select" as const,
              id: `role-${account.id}`,
              name: `role-${account.id}`,
              label: t.users.role,
              value: account.role,
              context: {
                  title: account.username,
                  description: account.email,
              },
              options: [
                  { value: "viewer", label: t.roles.viewer },
                  { value: "reviewer", label: t.roles.reviewer },
              ],
          }))
        : [
              {
                  type: "content" as const,
                  id: "empty-accounts",
                  label: t.oidc.userPermissionsSetting,
                  value: t.oidc.emptyAccounts,
              },
          ];

    const cards: DrawerCardGroup[] =
        activeSection === "permissions"
            ? [
                  {
                      id: "provider-accounts",
                      size: "compact",
                      items: accountItems,
                  },
              ]
            : [
                  {
                      id: "provider-settings",
                      size: "compact",
                      items: [
                          {
                              type: "field",
                              id: "provider-name",
                              name: "name",
                              label: t.oidc.name,
                              value: provider.name,
                              editable: true,
                              required: true,
                          },
                          {
                              type: "field",
                              id: "provider-issuer",
                              name: "issuer",
                              label: t.oidc.issuer,
                              value: provider.issuer,
                              editable: true,
                              inputType: "url",
                              required: true,
                          },
                          {
                              type: "field",
                              id: "provider-client-id",
                              name: "client_id",
                              label: t.oidc.clientID,
                              value: provider.client_id,
                              editable: true,
                              required: true,
                          },
                          {
                              type: "field",
                              id: "provider-client-secret",
                              name: "client_secret",
                              label: t.oidc.clientSecret,
                              value: "",
                              editable: true,
                              inputType: "password",
                              placeholder: t.oidc.clientSecretPlaceholder,
                          },
                          {
                              type: "field",
                              id: "provider-redirect-uri",
                              name: "redirect_uri",
                              label: t.oidc.callbackURL,
                              value: provider.redirect_uri,
                              editable: true,
                              inputType: "url",
                              required: true,
                          },
                          {
                              type: "content",
                              id: "provider-hints",
                              label: t.oidc.callbackURL,
                              value: `${t.oidc.callbackHint} ${t.oidc.redirectScopes}`,
                          },
                          {
                              type: "action",
                              id: "delete-provider",
                              label: t.oidc.deleteSource,
                              description: t.oidc.deleteSourceDescription,
                              button: {
                                  label: t.common.delete,
                                  loadingLabel: t.common.deleting,
                                  loading: deleting,
                                  disabled: saving,
                                  onClick: deleteProvider,
                                  variant: "secondary",
                              },
                              confirm: {
                                  title: t.oidc.deleteSource,
                                  description: t.oidc.deleteSourceConfirmation,
                                  cancelLabel: t.common.cancel,
                                  confirmLabel: t.common.delete,
                                  pendingLabel: t.common.deleting,
                              },
                          },
                      ],
                  },
              ];

    return (
        <DrawerCard
            actions={[
                {
                    id: "close",
                    label: t.common.close,
                    onClick: onClose,
                    disabled: saving || deleting,
                    variant: "secondary",
                },
                ...(activeSection === "permissions" && providerUsers.length > 0
                    ? [
                          {
                              id: "save-roles",
                              label: t.users.updateRole,
                              loadingLabel: t.users.updatingRole,
                              loading: saving,
                              disabled: deleting,
                              type: "submit" as const,
                              variant: "primary" as const,
                          },
                      ]
                    : activeSection === "config"
                      ? [
                            {
                                id: "save-config",
                                label: t.oidc.saveConfig,
                                loadingLabel: t.common.saving,
                                loading: saving,
                                disabled: deleting,
                                type: "submit" as const,
                                variant: "primary" as const,
                            },
                        ]
                      : []),
            ]}
            activeSectionID={activeSection}
            cards={cards}
            closeLabel={t.common.close}
            copyLabel={t.common.copy}
            copiedLabel={t.common.copied}
            eyebrow={t.oidc.provider}
            onClose={onClose}
            onSectionChange={(sectionID) => {
                if (sectionID === "permissions" || sectionID === "config") {
                    setError("");
                    setActiveSection(sectionID);
                }
            }}
            onSubmit={
                activeSection === "permissions" ? saveRoles : saveConfig
            }
            sections={[
                { id: "permissions", label: t.oidc.userPermissionsSetting },
                { id: "config", label: t.oidc.config },
            ]}
            sectionsLabel={t.oidc.provider}
            submitError={error}
            title={provider.name}
        />
    );
}
