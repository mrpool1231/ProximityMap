import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Trash2, ImageIcon, Save } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { authApi, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const FIELDS = [
  ["company", "Company / brokerage"],
  ["contact_name", "Contact name"],
  ["phone", "Phone"],
  ["email", "Contact email"],
  ["website", "Website"],
  ["tagline", "Tagline (shown under the logo)"],
];
const inputCls = "h-9 border-white/10 bg-slate-900/60 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-sky-400/40";

export default function BrandingDialog({ open, onOpenChange }) {
  const { user, setBranding } = useAuth();
  const branding = user?.branding || {};
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map(([k]) => [k, branding[k] || ""])));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const save = async () => {
    setSaving(true);
    try {
      setBranding(await authApi.updateBranding(form));
      toast.success("Brief branding saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      setBranding(await authApi.uploadLogo(file));
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail, "Upload failed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    try {
      setBranding(await authApi.deleteLogo());
    } catch {
      toast.error("Could not remove logo");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-[#0b0f17] text-slate-100" data-testid="branding-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Brief branding</DialogTitle>
          <DialogDescription className="text-slate-400">Your logo and contact details appear in the header of every PDF property brief.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 rounded-lg border border-white/5 bg-slate-900/40 p-3">
          <div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/95">
            {branding.logo_path ? (
              <img src={authApi.logoUrl(branding.logo_version)} alt="Logo" className="max-h-full max-w-full object-contain" data-testid="branding-logo-preview" />
            ) : (
              <ImageIcon size={20} className="text-slate-400" />
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} className="h-8 border-white/10 bg-transparent text-xs" data-testid="logo-upload-button">
              {uploading ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Upload size={12} className="mr-1.5" />} {branding.logo_path ? "Replace logo" : "Upload logo"}
            </Button>
            {branding.logo_path && (
              <Button variant="ghost" size="sm" onClick={removeLogo} className="h-7 text-xs text-slate-400 hover:text-red-400" data-testid="logo-remove-button">
                <Trash2 size={12} className="mr-1.5" /> Remove
              </Button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="logo-file-input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {FIELDS.map(([k, label]) => (
            <div key={k} className={k === "tagline" || k === "company" ? "col-span-2" : ""}>
              <label className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-slate-500">{label}</label>
              <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputCls} data-testid={`branding-${k}-input`} />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:bg-slate-800">Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-sky-500 text-slate-950 hover:bg-sky-400" data-testid="branding-save-button">
            {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
