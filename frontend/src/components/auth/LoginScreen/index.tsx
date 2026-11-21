import { type SubmitEvent, useEffect, useState } from "react";
import { Eye, EyeOff, Info, Moon, Sun } from "lucide-react";
import {
  getOIDCLoginURL,
  listOIDCLoginOptions,
  login,
} from "../../../api";
import { interpolate, useI18n } from "../../../i18n";
import { InlineAlert } from "../../InlineAlert";
import { readRememberPreference } from "../../../session";
import type { OIDCLoginOption, SessionResponse } from "../../../types";
import { getErrorMessage } from "../../../utils";
import "../auth.css";

interface LoginScreenProps {
  error: string;
  isDark: boolean;
  onLogin: (session: SessionResponse, remember: boolean) => void;
  onThemeToggle: () => void;
}

export function LoginScreen({ error, isDark, onLogin, onThemeToggle }: LoginScreenProps) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(readRememberPreference);
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oidcProviders, setOIDCProviders] = useState<OIDCLoginOption[]>([]);
  const isLayoutPreview =
    import.meta.env.DEV && import.meta.env.VITE_LAYOUT_PREVIEW === "true";

  useEffect(() => {
    let active = true;
    listOIDCLoginOptions()
      .then((providers) => {
        if (active) {
          setOIDCProviders(providers);
        }
      })
      .catch(() => {
        if (active) {
          setOIDCProviders([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setLoading(true);
    try {
      onLogin(await login(username, password), remember);
    } catch (requestError) {
      setFormError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <button aria-label={t.auth.theme} className="theme-toggle fixed top-4 right-4 z-10" onClick={onThemeToggle} type="button">{isDark ? <Sun /> : <Moon />}</button>
      <section className="login-panel">
        <div className="auth-brand"><div className="auth-logo">MC</div><strong>Meow Comment</strong></div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">{t.auth.username}<input autoComplete="username" autoFocus onChange={(event) => setUsername(event.target.value)} placeholder={t.auth.username} required value={username} /></label>
          <label className="auth-field">{t.auth.password}<div className="password-field"><input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} placeholder={t.auth.password} required type={showPassword ? "text" : "password"} value={password} /><button aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword} className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} type="button">{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
          <label className="remember-field"><input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" /><span>{t.auth.rememberMe}</span></label>
          {(formError || error) && <InlineAlert message={formError || error} tone="error" />}
          <button className="button button-primary button-wide" disabled={loading} type="submit">{loading ? t.auth.signingIn : t.auth.signIn}</button>
        </form>
        {oidcProviders.length > 0 && (
          <div className="oidc-login-options">
            <div className="oidc-login-divider"><span>{t.auth.orContinueWith}</span></div>
            {oidcProviders.map((provider) => (
              <button
                className="oidc-login-button"
                disabled={isLayoutPreview}
                key={provider.id}
                onClick={() => {
                  const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
                  window.location.assign(
                    getOIDCLoginURL(provider.id, remember, returnTo),
                  );
                }}
                type="button"
              >
                {interpolate(t.auth.loginVia, { provider: provider.name })}
              </button>
            ))}
          </div>
        )}
        <div className="auth-info"><Info /><span>{t.auth.managementConsole}</span></div>
      </section>
      <aside className="auth-preview" aria-label={t.app.name}>
        <div className="product-illustration"><div className="product-top" /><div className="product-screen"><span>MC</span><small>{t.auth.adminPreview}</small></div><div className="product-slot" /><div className="product-shadow" /></div>
        <h2>{t.app.name}</h2>
      </aside>
    </main>
  );
}
