import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { BASEMAPS } from "@/lib/mapConfig";
import { Compass, Layers2, Share2, Printer, Loader2, Sparkles, Lock, PanelLeft, PanelRight } from "lucide-react";
import AccountMenu from "@/components/map/AccountMenu";

export default function TopBar({ basemap, setBasemap, pin, onShare, onPrint, sharing, isPro, onUpgrade, onSignIn, onBranding, onToggleLayers, onToggleAnalysis }) {
  return (
    <header
      className="relative z-40 flex h-14 items-center justify-between border-b border-white/5 bg-[#0b0f17]/95 px-2 sm:px-4 backdrop-blur-xl"
      data-testid="app-header"
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 border-white/10 bg-slate-900/60 text-slate-200 md:hidden"
          onClick={onToggleLayers}
          aria-label="Open layers"
        >
          <PanelLeft size={15} />
        </Button>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400/25 to-amber-400/25 ring-1 ring-white/10">
          <Compass size={18} className="text-sky-400" />
        </div>
        <div className="min-w-0">
          <div className="font-heading text-base font-bold tracking-tight" data-testid="app-title">
            Proximity<span className="text-sky-400">Map</span>
          </div>
          <div className="hidden text-[10px] font-mono uppercase tracking-widest text-slate-500 sm:block">
            Map · Layers · Proximity
          </div>
        </div>
        {pin && (
          <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 lg:flex">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Focus</span>
            <span className="font-mono text-xs text-slate-200">
              {pin[0].toFixed(4)}, {pin[1].toFixed(4)}
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {isPro ? (
          <span className="hidden items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-amber-300 md:flex" data-testid="pro-badge">
            <Sparkles size={11} /> Pro
          </span>
        ) : (
          <Button
            size="sm"
            onClick={onUpgrade}
            className="hidden h-9 bg-amber-500 text-slate-950 hover:bg-amber-400 sm:flex"
            data-testid="upgrade-button"
          >
            <Sparkles size={13} className="mr-2" />
            Go Pro
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={!pin || sharing}
          onClick={onShare}
          className="hidden h-9 border-white/10 bg-slate-900/60 text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-400/5 hover:text-emerald-300 disabled:opacity-40 sm:flex"
          data-testid="share-report-button"
        >
          {sharing ? <Loader2 size={13} className="mr-2 animate-spin" /> : isPro ? <Share2 size={13} className="mr-2" /> : <Lock size={13} className="mr-2 text-amber-400" />}
          Share
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!pin}
          onClick={onPrint}
          className="hidden h-9 border-white/10 bg-slate-900/60 text-slate-200 hover:border-amber-400/40 hover:bg-amber-400/5 hover:text-amber-300 disabled:opacity-40 sm:flex"
          data-testid="print-report-button"
        >
          {isPro ? <Printer size={13} className="mr-2" /> : <Lock size={13} className="mr-2 text-amber-400" />}
          Print brief
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 border-white/10 bg-slate-900/60 text-slate-200 md:hidden"
          onClick={onToggleAnalysis}
          aria-label="Open analysis"
        >
          <PanelRight size={15} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-white/10 bg-slate-900/60 text-slate-200 hover:border-sky-400/40 hover:bg-sky-400/5 hover:text-sky-300"
              data-testid="basemap-selector"
            >
              <Layers2 size={13} className="mr-2" />
              <span className="hidden sm:inline">{BASEMAPS[basemap]?.label}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-white/10 bg-[#0b0f17] text-slate-100">
            <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
              Basemap
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            {Object.entries(BASEMAPS).map(([id, bm]) => (
              <DropdownMenuItem
                key={id}
                onClick={() => setBasemap(id)}
                className="cursor-pointer text-sm text-slate-200 hover:bg-slate-800 focus:bg-slate-800 focus:text-sky-300"
                data-testid={`basemap-option-${id}`}
              >
                {bm.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <AccountMenu onSignIn={onSignIn} onBranding={onBranding} />
        <a href="/legal/terms" className="hidden font-mono text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-300 md:block" data-testid="legal-link">
          Legal
        </a>
      </div>
    </header>
  );
}
