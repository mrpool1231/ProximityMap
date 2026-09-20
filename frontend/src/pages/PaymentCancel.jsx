import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Compass, Undo2 } from "lucide-react";

export default function PaymentCancel() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-4" data-testid="payment-cancel-page">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-center backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
          <Compass size={12} /> MapApp
        </div>
        <Undo2 size={36} className="mx-auto mb-4 text-amber-400" />
        <h1 className="font-heading text-xl font-semibold">Checkout cancelled</h1>
        <p className="mt-2 text-sm text-slate-400">No charge was made. Your map and analysis are right where you left them.</p>
        <Button asChild className="mt-6 h-10 w-full bg-sky-500 text-slate-950 hover:bg-sky-400" data-testid="back-to-map-button">
          <Link to="/">Back to the map</Link>
        </Button>
      </div>
    </div>
  );
}
