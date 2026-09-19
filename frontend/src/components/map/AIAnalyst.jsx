import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, X, Loader2, RotateCcw, Bot, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { getAISession, resetAISession, streamAI, freeUsed, bumpFreeUsed, FREE_QUESTIONS } from "@/lib/ai";
import { toast } from "sonner";

const SUGGESTIONS = ["Summarise this location in 3 sentences", "What's the closest school and how far is it?", "Is the air quality good here?", "Which property has better amenities?"];

export default function AIAnalyst({ context, pro, onUpgrade }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(getAISession);
  const listRef = useRef(null);
  const hasArea = !!context?.pin;
  const freeLeft = Math.max(0, FREE_QUESTIONS - freeUsed());

  useEffect(() => {
    if (!open) return;
    api
      .get(`/ai/history/${session}`)
      .then((r) => setMessages((prev) => (prev.length ? prev : r.data.messages)))
      .catch(() => {});
  }, [open, session]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ask = async (text) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    if (!pro && freeUsed() >= FREE_QUESTIONS) {
      onUpgrade("You've used your 3 free AI questions — Pro unlocks unlimited analyst chat");
      return;
    }
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "", streaming: true }]);
    try {
      await streamAI("/ai/chat", { session_id: session, message: q, context }, (_, full) =>
        setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, content: full } : msg)))
      );
      if (!pro) bumpFreeUsed();
    } catch (e) {
      toast.error(e.message || "AI request failed");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setMessages((m) => m.map((msg) => ({ ...msg, streaming: false })));
      setBusy(false);
    }
  };

  const clear = async () => {
    await api.delete(`/ai/history/${session}`).catch(() => {});
    setSession(resetAISession());
    setMessages([]);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-6 right-6 z-30 flex h-12 items-center gap-2 rounded-full border border-sky-400/30 bg-[#0b0f17]/90 px-4 font-heading text-sm font-semibold text-sky-200 shadow-[0_0_30px_rgba(56,189,248,0.25)] backdrop-blur-xl transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-sky-400/10"
        data-testid="ai-open-button"
      >
        <Sparkles size={16} className="text-sky-400" /> Ask the Analyst
      </button>
    );
  }

  return (
    <div className="absolute bottom-6 right-6 z-30 flex h-[520px] w-[380px] max-w-[calc(100%-3rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17]/95 shadow-2xl backdrop-blur-xl" data-testid="ai-panel">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-400/15 ring-1 ring-sky-400/30">
            <Bot size={14} className="text-sky-300" />
          </div>
          <div>
            <div className="font-heading text-sm font-semibold">GeoPulse Analyst</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{pro ? "ChatGPT · unlimited" : `ChatGPT · ${freeLeft} free left`}</div>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={clear} className="h-7 w-7 p-0 text-slate-500 hover:text-slate-200" title="New conversation" data-testid="ai-clear-button">
            <RotateCcw size={13} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-7 w-7 p-0 text-slate-500 hover:text-slate-200" data-testid="ai-close-button">
            <X size={14} />
          </Button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" data-testid="ai-messages">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">{hasArea ? "Ask anything about the area you're analysing — amenities, distances, environment, or how A compares to B." : "Drop a pin or draw a property first, then ask me about the neighbourhood."}</p>
            {hasArea && (
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="rounded-full border border-white/10 px-2.5 py-1 text-left text-[11px] text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-200" data-testid="ai-suggestion">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`ai-message-${m.role}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "rounded-br-sm bg-sky-500 text-slate-950" : "rounded-bl-sm border border-white/5 bg-slate-900/70 text-slate-200"}`}>
              {m.content || (m.streaming && <Loader2 size={14} className="animate-spin text-sky-300" />)}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="flex items-center gap-2 border-t border-white/5 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={hasArea ? "Ask about this location…" : "Set an analysis area first"}
          disabled={!hasArea || busy}
          className="h-10 flex-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/40 disabled:opacity-50"
          data-testid="ai-input"
        />
        <Button type="submit" disabled={!hasArea || busy || !input.trim()} className="h-10 w-10 bg-sky-500 p-0 text-slate-950 hover:bg-sky-400" data-testid="ai-send-button">
          {busy ? <Loader2 size={15} className="animate-spin" /> : !pro && freeLeft === 0 ? <Lock size={15} /> : <Send size={15} />}
        </Button>
      </form>
    </div>
  );
}
