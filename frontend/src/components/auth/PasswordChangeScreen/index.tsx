import { type SubmitEvent, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { changePassword } from "../../../api";
import { useI18n } from "../../../i18n";
import { InlineAlert } from "../../InlineAlert";
import type { SessionResponse, User } from "../../../types";
import { getErrorMessage } from "../../../utils";
import "../auth.css";

interface PasswordChangeScreenProps {
  onChanged: (session: SessionResponse) => void;
  isDark: boolean;
  onLogout: () => void;
  onThemeToggle: () => void;
  token: string;
  user: User;
}

export function PasswordChangeScreen({ isDark, onChanged, onLogout, onThemeToggle, token, user }: PasswordChangeScreenProps) {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 12) {
      setError(t.errors.passwordTooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.errors.passwordMismatch);
      return;
    }
    setLoading(true);
    try {
      onChanged(await changePassword(token, currentPassword, newPassword));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen password-screen">
      <button aria-label={t.auth.theme} className="theme-toggle fixed top-4 right-4 z-10" onClick={onThemeToggle} type="button">{isDark ? <Sun /> : <Moon />}</button>
      <section className="login-panel password-panel">
        <div className="brand-lockup"><div className="brand-mark">MC</div><div><span className="eyebrow">{t.auth.firstLogin}</span><strong>{t.auth.setYourPassword}</strong></div></div>
        <div className="login-heading"><h1>{t.auth.changePassword}</h1><p>{user.username}</p></div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>{t.auth.currentPassword}<input autoComplete="current-password" autoFocus onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} /></label>
          <label>{t.auth.newPassword}<input autoComplete="new-password" minLength={12} onChange={(event) => setNewPassword(event.target.value)} placeholder={t.auth.passwordPlaceholder} required type="password" value={newPassword} /></label>
          <label>{t.auth.confirmNewPassword}<input autoComplete="new-password" minLength={12} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} /></label>
          {error && <InlineAlert message={error} tone="error" />}
          <button className="button button-primary button-wide" disabled={loading} type="submit">{loading ? t.common.saving : t.common.saveAndContinue}</button>
        </form>
        <button className="text-button" onClick={onLogout} type="button">{t.auth.signOutAccount}</button>
      </section>
    </main>
  );
}
