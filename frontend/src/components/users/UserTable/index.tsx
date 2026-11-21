import { KeyRound } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { OIDCProvider, User } from "../../../types";
import { roleName } from "../../../utils";
import { interpolate, useI18n } from "../../../i18n";
import "../../shared/tables.css";
import "./UserTable.css";

interface UserTableProps {
  currentUserID: string;
  onSelectProvider: (provider: OIDCProvider) => void;
  onSelectUser: (user: User) => void;
  providerAccountCounts: Record<string, number>;
  providers: OIDCProvider[];
  users: User[];
}

export function UserTable({
  currentUserID,
  onSelectProvider,
  onSelectUser,
  providerAccountCounts,
  providers,
  users,
}: UserTableProps) {
  const { t } = useI18n();

  function openUser(user: User) {
    onSelectUser(user);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, user: User) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openUser(user);
    }
  }

  function handleProviderRowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    provider: OIDCProvider,
  ) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectProvider(provider);
    }
  }

  function permissionLabels(user: User) {
    const labels = [t.users.viewCommentsPermission];
    if (user.role === "reviewer" || user.role === "admin") {
      labels.push(t.users.completeCommentsPermission);
    }
    if (user.role === "admin") {
      labels.push(t.users.manageUsersPermission);
    }
    return labels;
  }

  return (
    <div className="table-wrap identity-table-wrap">
      <table className="data-table identity-table">
        <thead>
          <tr>
            <th>{t.users.name}</th>
            <th>{t.users.status}</th>
            <th>{t.users.email}</th>
            <th>{t.users.lastActivity}</th>
            <th>{t.users.role}</th>
            <th>{t.users.permissions}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((item) => {
            const isCurrentUser = item.id === currentUserID;
            const isPending = item.must_change_password;
            return (
              <tr
                aria-label={interpolate(t.users.openUserDetails, {
                  username: item.username,
                })}
                className={isCurrentUser ? "identity-user-row is-current" : "identity-user-row"}
                key={item.id}
                onClick={() => openUser(item)}
                onKeyDown={(event) => handleRowKeyDown(event, item)}
                tabIndex={0}
              >
                <td>
                  <div className="identity-name-cell">
                    <div className={`identity-avatar${item.role === "admin" ? " is-admin" : ""}${isCurrentUser ? " is-current" : ""}`}>
                      {item.username.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <strong>{item.username}</strong>
                      <span>{isCurrentUser ? t.users.currentAccount : `${item.id.slice(0, 8)}…`}</span>
                    </div>
                    {isCurrentUser && <em className="is-current-account">{t.users.you}</em>}
                  </div>
                </td>
                <td>
                  <span className={isPending ? "identity-status is-pending" : "identity-status"}>
                    <i aria-hidden="true" />
                    {isPending ? t.users.pendingFirstLogin : t.users.active}
                  </span>
                </td>
                <td className="identity-muted">{item.email || "-"}</td>
                <td className="identity-muted">-</td>
                <td><span className={item.role === "admin" ? "identity-role is-owner" : "identity-role"}>{roleName(item.role)}</span></td>
                <td>
                  <div className="identity-permissions-summary">
                    {permissionLabels(item).map((label) => (
                      <span className="identity-permission-badge" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
          {providers.map((provider) => (
            <tr
              aria-label={interpolate(t.oidc.openProviderDetails, {
                provider: provider.name,
              })}
              className="identity-provider-row"
              key={`oidc-${provider.id}`}
              onClick={() => onSelectProvider(provider)}
              onKeyDown={(event) =>
                handleProviderRowKeyDown(event, provider)
              }
              tabIndex={0}
            >
              <td>
                <div className="identity-name-cell">
                  <div className="identity-avatar identity-avatar-provider">
                    <KeyRound aria-hidden="true" />
                  </div>
                  <div>
                    <strong>{provider.name}</strong>
                    <span>{provider.issuer}</span>
                  </div>
                </div>
              </td>
              <td>
                <span className="identity-status identity-status-provider">
                  <i aria-hidden="true" />
                  {t.oidc.sourceTab}
                </span>
              </td>
              <td className="identity-muted">-</td>
              <td className="identity-muted">-</td>
              <td>
                <span className="identity-role">{t.oidc.provider}</span>
              </td>
              <td>
                <div className="identity-permissions-summary">
                  <span className="identity-permission-badge">
                    {interpolate(t.oidc.providerAccountCount, {
                      count: providerAccountCounts[provider.id] ?? 0,
                    })}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
