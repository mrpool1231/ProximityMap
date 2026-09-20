import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Check, Loader2, Lock } from "lucide-react";
import { fetchProducts, createCheckout } from "@/lib/api";
import { toast } from "sonner";

export default function UpgradeDialog({ open, onOpenChange, reason, onBeforeCheckout }) {
  const [product, setProduct] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && !product) fetchProducts().then((p) => setProduct(p[0])).catch(() => {});
  }, [open, product]);

  const checkout = async () => {
    if (!product) return;
    setBusy(true);
    try {
      onBeforeCheckout?.();
      const { checkout_url } = await createCheckout(product.lookup_key);
      window.location.href = checkout_url;
    } catch {
      toast.error("Could not start checkout");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-[#0b0f17] text-slate-100" data-testid="upgrade-dialog">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 ring-1 ring-amber-400/30">
            <Lock size={18} className="text-amber-300" />
          </div>
          <DialogTitle className="font-heading text-xl">{reason || "This is a Pro feature"}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Unlock MapApp Pro once and keep it forever on this device — no account needed.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-400/10 to-transparent p-4">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-300" />
              <span className="font-heading font-semibold">{product?.name || "MapApp Pro"}</span>
            </div>
            <div className="font-mono text-2xl font-bold text-amber-300" data-testid="pro-price">
              {product ? `$${product.amount.toFixed(0)}` : "…"}
              <span className="ml-1 text-[10px] font-normal uppercase tracking-widest text-slate-400">one-time</span>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5">
            {(product?.features || ["Print-ready PDF property briefs", "Shareable report links", "Lifetime access"]).map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-200">
                <Check size={13} className="text-emerald-400" /> {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:bg-slate-800" data-testid="upgrade-cancel-button">
            Not now
          </Button>
          <Button onClick={checkout} disabled={busy || !product} className="bg-amber-500 text-slate-950 hover:bg-amber-400" data-testid="upgrade-checkout-button">
            {busy ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Sparkles size={14} className="mr-2" />}
            Unlock Pro
          </Button>
        </div>
        <p className="text-center text-[10px] text-slate-500">Secure checkout by Stripe · Test card 4242 4242 4242 4242</p>
      </DialogContent>
    </Dialog>
  );
}
