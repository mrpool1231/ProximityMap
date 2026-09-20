import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle, Compass } from "lucide-react";
import { paymentStatus } from "@/lib/api";
import { setLicense } from "@/lib/license";
import { useAuth } from "@/context/AuthContext";

const MAX_POLLS = 8;

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = useState("checking"); // checking | paid | pending | error
  const polls = useRef(0);
  const { refresh } = useAuth();

  useEffect(() => {
    if (!sessionId) {
      setState("error");
      return;
    }
    let timer;
    const poll = async () => {
      try {
        const s = await paymentStatus(sessionId);
        if (s.payment_status === "paid") {
          setLicense(sessionId);
          refresh();
          setState("paid");
          return;
        }
        if (["expired", "failed"].includes(s.payment_status)) {
          setState("error");
          return;
        }
      } catch {
        setState("error");
        return;
      }
      polls.current += 1;
      if (polls.current >= MAX_POLLS) setState("pending");
      else timer = setTimeout(poll, 2000);
    };
    poll();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-4" data-testid="payment-success-page">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-center backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
          <Compass size={12} /> MapApp
        </div>
        {state === "checking" && (
          <>
            <Loader2 size={36} className="mx-auto mb-4 animate-spin text-sky-400" />
            <h1 className="font-heading text-xl font-semibold">Confirming your payment…</h1>
            <p className="mt-2 text-sm text-slate-400">This usually takes a few seconds.</p>
          </>
        )}
        {state === "paid" && (
          <>
            <CheckCircle2 size={40} className="mx-auto mb-4 text-emerald-400" />
            <h1 className="font-heading text-2xl font-bold" data-testid="payment-paid-title">You're Pro now</h1>
            <p className="mt-2 text-sm text-slate-400">PDF briefs and share links are unlocked on this device.</p>
          </>
        )}
        {state === "pending" && (
          <>
            <Loader2 size={36} className="mx-auto mb-4 text-amber-400" />
            <h1 className="font-heading text-xl font-semibold">Payment is processing</h1>
            <p className="mt-2 text-sm text-slate-400">We'll unlock Pro as soon as Stripe confirms. Check back shortly.</p>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle size={40} className="mx-auto mb-4 text-red-400" />
            <h1 className="font-heading text-xl font-semibold">We couldn't confirm that payment</h1>
            <p className="mt-2 text-sm text-slate-400">If you were charged, contact support with your session ID.</p>
          </>
        )}
        <Button asChild className="mt-6 h-10 w-full bg-sky-500 text-slate-950 hover:bg-sky-400" data-testid="back-to-map-button">
          <Link to="/">Back to the map</Link>
        </Button>
      </div>
    </div>
  );
}
