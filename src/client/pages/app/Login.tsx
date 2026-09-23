import { useState } from "react";
import { Navigate, useNavigate, useSearchParams, Link } from "react-router-dom";
import { post } from "../../api";
import { useSession } from "../../session";
import { ErrorAlert } from "../../components/ui";

export function LoginPage() {
  const { me, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next")?.startsWith("/app") ? params.get("next")! : "/app";
  if (me?.user) return <Navigate to={next} replace />;
  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: "10vh" }}>
      <h1>Área de investigação</h1>
      <p className="muted">Acesso reservado a contas autorizadas explicitamente pelo autor.</p>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await post("/api/auth/login", { email, password });
            await refresh();
            navigate(next);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorAlert error={error} />
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Palavra-passe</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "A entrar…" : "Entrar"}
        </button>
      </form>
      <p style={{ marginTop: "1rem" }}>
        <Link to="/">← Site público</Link>
      </p>
    </main>
  );
}
