import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Compass, KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import { authApi, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const inputCls = "h-10 border-white/10 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 focus-visible:ring-sky-400/40";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    setError("");
    try {
      await authApi.resetPassword(token, password);
      await refresh();
      setDone(true);
      setTimeout(() => navigate("/"), 1800);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, err.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-4" data-testid="reset-password-page">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/60 p-8 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
          <Compass size={12} /> MapApp
        </div>
        {done ? (
          <div className="text-center" data-testid="reset-done">
            <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-400" />
            <h1 className="font-heading text-xl font-semibold">Password updated</h1>
            <p className="mt-1 text-sm text-slate-400">You're signed in — taking you back to the map.</p>
          </div>
        ) : !token ? (
          <div data-testid="reset-missing-token">
            <h1 className="font-heading text-xl font-semibold">Invalid reset link</h1>
            <p className="mt-2 text-sm text-slate-400">This link is missing its token. Request a new one from the sign-in dialog.</p>
            <Button asChild className="mt-4 w-full bg-sky-500 text-slate-950 hover:bg-sky-400"><Link to="/">Back to MapApp</Link></Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3" data-testid="reset-form">
            <h1 className="font-heading text-xl font-semibold">Choose a new password</h1>
            <Input type="password" required minLength={8} placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} data-testid="reset-password-input" />
            <Input type="password" required minLength={8} placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} data-testid="reset-confirm-input" />
            {error && <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" data-testid="reset-error">{error}</p>}
            <Button type="submit" disabled={busy} className="h-10 w-full bg-sky-500 text-slate-950 hover:bg-sky-400" data-testid="reset-submit-button">
              {busy ? <Loader2 size={14} className="mr-2 animate-spin" /> : <KeyRound size={14} className="mr-2" />} Set new password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
