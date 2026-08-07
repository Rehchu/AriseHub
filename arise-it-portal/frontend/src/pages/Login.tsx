import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api";
import { LogoMark } from "../components/Logo";

const SSO_REASONS: Record<string,string> = {
  no_token: "No AriseHub session was sent. Try opening the portal from AriseHub again.",
  invalid_session: "Your AriseHub session has expired. Sign in to AriseHub again, then retry.",
  no_it_account: "Your AriseHub account has no active IT portal account. Ask IT to add you.",
  bad_request: "The sign-in hand-off was malformed. Please try again.",
};

export default function Login() {
  const ssoReason = new URLSearchParams(window.location.search).get("sso");
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    navigate("/", { replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950">
      {ssoReason && (

        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">

          {SSO_REASONS[ssoReason] ?? "Single sign-on did not complete. Please sign in."}

        </div>

      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-ink-800 rounded-xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <LogoMark size={44} />
          <div>
            <div className="font-display font-bold text-ink-900 dark:text-white leading-tight">ARISE IT</div>
            <div className="text-[11px] text-gray-500 tracking-wider leading-tight">PORTAL</div>
          </div>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        <div className="border-t pt-3 text-center text-sm space-y-1">
          <div>
            <Link to="/request" className="text-brand-600 hover:underline">
              Need help? Submit a request
            </Link>{" "}
            <span className="text-gray-400">— no account needed</span>
          </div>
          <div>
            <Link to="/go" className="text-brand-600 hover:underline">
              Have an access code?
            </Link>
          </div>
        </div>
        <div className="text-center text-[11px] text-gray-400 pt-1">Arise Church IT · Pineville, LA</div>
      </form>
    </div>
  );
}
