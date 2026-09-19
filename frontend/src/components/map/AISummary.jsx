import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RotateCcw } from "lucide-react";
import { streamAI } from "@/lib/ai";
import { toast } from "sonner";

export default function AISummary({ context }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    setText("");
    try {
      await streamAI("/ai/summary", { context }, (_, full) => setText(full));
    } catch (e) {
      toast.error(e.message || "Summary failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 break-inside-avoid" data-testid="ai-summary-section">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">Neighbourhood summary</h2>
        <Button onClick={generate} disabled={busy} variant="outline" size="sm" className="no-print h-8 border-sky-300 bg-sky-50 text-xs text-sky-800 hover:bg-sky-100" data-testid="ai-summary-button">
          {busy ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : text ? <RotateCcw size={12} className="mr-1.5" /> : <Sparkles size={12} className="mr-1.5" />}
          {text ? "Regenerate" : "Generate with ChatGPT"}
        </Button>
      </div>
      {text ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700" data-testid="ai-summary-text">
          {text}
        </p>
      ) : (
        <p className="no-print text-xs text-slate-400">Optional — adds an AI-written narrative of the area to the brief.</p>
      )}
    </section>
  );
}
