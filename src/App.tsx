import { FormEvent, useEffect, useState } from "react";
import { CalculatorPage } from "./pages/CalculatorPage.tsx";
import "./styles.css";

function ProductionAuthGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/auth/status", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((result: { enabled: boolean; authenticated: boolean }) => setAuthenticated(!result.enabled || result.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const response = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    if (!response.ok) { setError("Неверный токен или превышен лимит попыток."); return; }
    setToken(""); setAuthenticated(true);
  }
  if (authenticated === null) return <main className="auth-screen"><p>Проверка защищённой сессии…</p></main>;
  if (authenticated) return <>{children}</>;
  return <main className="auth-screen"><form className="auth-card" onSubmit={login}><h1>PROFiGYM</h1><p>Введите production-токен доступа. Токен обменивается на HttpOnly-сессию и не сохраняется в JavaScript.</p><label>Токен доступа<input autoFocus type="password" autoComplete="current-password" value={token} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setToken(event.target.value)} /></label>{error && <div role="alert" className="form-error">{error}</div>}<button type="submit" disabled={!token}>Войти</button></form></main>;
}

export default function App(): React.JSX.Element {
  return import.meta.env.PROD ? <ProductionAuthGate><CalculatorPage /></ProductionAuthGate> : <CalculatorPage />;
}
