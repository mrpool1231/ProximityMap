import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, LogIn, UserPlus, Mail, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatApiError, authApi } from "@/lib/api";
import { toast } from "sonner";

const inputCls = "h-10 border-white/10 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 focus-visible:ring-sky-400/40";

function ForgotForm({ onBack }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, err.message));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-3" data-testid="forgot-sent">
        <p className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
          If an account exists for <span className="font-mono">{email}</span>, a reset link is on its way. It expires in 1 hour.
        </p>
        <Button variant="ghost" onClick={onBack} className="w-full text-slate-400 hover:bg-slate-800" data-testid="forgot-back-button">
          <ArrowLeft size={13} className="mr-1.5" /> Back to sign in
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="forgot-form">
      <p className="text-sm text-slate-400">Enter your account email and we'll send you a link to choose a new password.</p>
      <Input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} data-testid="forgot-email-input" />
      {error && <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" data-testid="forgot-error">{error}</p>}
      <Button type="submit" disabled={busy} className="h-10 w-full bg-sky-500 text-slate-950 hover:bg-sky-400" data-testid="forgot-submit-button">
        {busy ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Mail size={14} className="mr-2" />} Send reset link
      </Button>
      <Button type="button" variant="ghost" onClick={onBack} className="w-full text-slate-400 hover:bg-slate-800" data-testid="forgot-back-button">
        <ArrowLeft size={13} className="mr-1.5" /> Back to sign in
      </Button>
    </form>
  );
}

function AuthForm({ mode, onDone, onForgot }) {
  const { login, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const u = mode === "login" ? await login(email, password) : await register(email, password, name);
      toast.success(mode === "login" ? `Welcome back, ${u.name}` : "Account created");
      onDone();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, err.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" data-testid={`${mode}-form`}>
      {mode === "register" && (
        <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} data-testid="auth-name-input" />
      )}
      <Input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} data-testid="auth-email-input" />
      <Input
        type="password"
        required
        minLength={8}
        placeholder={mode === "register" ? "Password (8+ characters)" : "Password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputCls}
        data-testid="auth-password-input"
      />
      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" data-testid="auth-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="h-10 w-full bg-sky-500 text-slate-950 hover:bg-sky-400" data-testid="auth-submit-button">
        {busy ? <Loader2 size={14} className="mr-2 animate-spin" /> : mode === "login" ? <LogIn size={14} className="mr-2" /> : <UserPlus size={14} className="mr-2" />}
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>
      {mode === "login" && (
        <button type="button" onClick={onForgot} className="w-full text-center text-xs text-slate-400 hover:text-sky-300" data-testid="forgot-password-link">
          Forgot your password?
        </button>
      )}
    </form>
  );
}

export default function AuthDialog({ open, onOpenChange, defaultTab = "login" }) {
  const [forgot, setForgot] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setForgot(false); }}>
      <DialogContent className="max-w-sm border-white/10 bg-[#0b0f17] text-slate-100" data-testid="auth-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{forgot ? "Reset your password" : "Your MapApp account"}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Sign in so your Pro pass and brief branding follow you to any device. By continuing you accept our{" "}
            <a href="/legal/terms" target="_blank" rel="noreferrer" className="underline hover:text-slate-200">Terms</a> and{" "}
            <a href="/legal/privacy" target="_blank" rel="noreferrer" className="underline hover:text-slate-200">Privacy Policy</a>.
          </DialogDescription>
        </DialogHeader>
        {forgot ? (
          <ForgotForm onBack={() => setForgot(false)} />
        ) : (
          <Tabs defaultValue={defaultTab}>
            <TabsList className="grid w-full grid-cols-2 bg-slate-900/60">
              <TabsTrigger value="login" data-testid="auth-tab-login">Sign in</TabsTrigger>
              <TabsTrigger value="register" data-testid="auth-tab-register">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="pt-3">
              <AuthForm mode="login" onDone={() => onOpenChange(false)} onForgot={() => setForgot(true)} />
            </TabsContent>
            <TabsContent value="register" className="pt-3">
              <AuthForm mode="register" onDone={() => onOpenChange(false)} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
