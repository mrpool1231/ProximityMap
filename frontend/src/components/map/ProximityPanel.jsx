import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MapPin, Search, Crosshair, Loader2, Target, ChevronRight, CloudRain, Wind, Mountain } from "lucide-react";
import { geocode } from "@/lib/api";
import { LAYER_BY_ID } from "@/lib/mapConfig";
import PropertyTools from "@/components/map/PropertyTools";
import { toast } from "sonner";

function fmtDist(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}

function EnvStat({ icon: Icon, label, value, unit, color }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-slate-900/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color }} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className="font-mono text-sm font-semibold text-slate-100">
        {value ?? "—"}
        {unit && <span className="ml-0.5 text-[10px] text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

export default function ProximityPanel({
  pin,
  radius,
  onRadiusChange,
  onSearchSelect,
  clickPinMode,
  setClickPinMode,
  proximityData,
  loading,
  onFocusPoi,
  env,
  propertyTools,
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const runSearch = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await geocode(q);
      setResults(r);
      if (r.length === 0) toast.info("No matches found");
    } catch (e) {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const currentWeather = env?.weather?.current;
  const currentAqi = env?.aqi?.current;
  const elevation = env?.elev?.elevation?.[0];

  return (
    <aside
      className="flex h-full w-96 shrink-0 flex-col border-l border-white/5 bg-[#0b0f17]/95 backdrop-blur-xl"
      data-testid="proximity-panel"
    >
      <div className="border-b border-white/5 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-amber-400" />
          <h2 className="font-heading text-sm font-semibold tracking-wide">Proximity Analysis</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">Drop a pin or search an address to profile everything nearby.</p>
      </div>

      <div className="flex flex-col gap-3 border-b border-white/5 px-4 py-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Address, place, coordinates…"
              className="h-9 border-white/10 bg-slate-900/70 pl-8 text-sm placeholder:text-slate-500 focus-visible:ring-sky-400"
              data-testid="search-address-input"
            />
          </div>
          <Button
            onClick={runSearch}
            disabled={searching}
            className="h-9 bg-sky-500 text-slate-950 hover:bg-sky-400"
            data-testid="search-address-button"
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : "Search"}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-slate-900/70">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => {
                  onSearchSelect([r.lat, r.lon], r.display_name);
                  setResults([]);
                  setQ(r.display_name.split(",")[0]);
                }}
                className="flex w-full items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-left last:border-b-0 hover:bg-slate-800/70"
                data-testid={`search-result-${i}`}
              >
                <span className="line-clamp-2 text-xs text-slate-200">{r.display_name}</span>
                <ChevronRight size={12} className="shrink-0 text-slate-500" />
              </button>
            ))}
          </div>
        )}

        <Button
          variant={clickPinMode ? "default" : "outline"}
          onClick={() => setClickPinMode(!clickPinMode)}
          className={
            clickPinMode
              ? "h-9 bg-amber-500 text-slate-950 hover:bg-amber-400"
              : "h-9 border-white/10 bg-transparent text-slate-200 hover:border-amber-400/50 hover:bg-amber-400/5 hover:text-amber-300"
          }
          data-testid="drop-pin-button"
        >
          <Crosshair size={14} className="mr-2" />
          {clickPinMode ? "Click map to drop pin…" : "Drop pin on map"}
        </Button>

        <PropertyTools {...propertyTools} />
      </div>

      <div className="border-b border-white/5 px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Buffer radius</span>
          <span className="font-mono text-sm font-semibold text-sky-400" data-testid="radius-value">
            {radius >= 1000 ? `${(radius / 1000).toFixed(2)} km` : `${radius} m`}
          </span>
        </div>
        <Slider
          value={[radius]}
          min={100}
          max={10000}
          step={100}
          onValueChange={(v) => onRadiusChange(v[0])}
          data-testid="radius-slider"
        />
        <div className="mt-1 flex justify-between text-[10px] font-mono text-slate-600">
          <span>100 m</span>
          <span>10 km</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-4">
          {!pin && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
              <MapPin size={22} className="mx-auto mb-2 text-slate-600" />
              <p className="text-sm text-slate-400">No analysis center set.</p>
              <p className="mt-1 text-xs text-slate-600">Search or drop a pin to begin.</p>
            </div>
          )}

          {pin && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3" data-testid="proximity-summary-card">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Analysis center</span>
                  <Badge className="bg-sky-500/10 text-sky-400 hover:bg-sky-500/10 border border-sky-500/20 font-mono text-[10px]">
                    {loading ? "loading" : `${proximityData?.total ?? 0} POIs`}
                  </Badge>
                </div>
                <div className="font-mono text-[11px] text-slate-300">
                  {pin[0].toFixed(5)}, {pin[1].toFixed(5)}
                </div>
                <div className="mt-1 text-[10px] text-slate-500" data-testid="distance-mode">
                  {propertyTools?.property ? "Distances from property line" : "Distances from center point"}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Environmental</div>
                <EnvStat
                  icon={CloudRain}
                  label="Temperature"
                  value={currentWeather?.temperature_2m}
                  unit="°C"
                  color="#8B5CF6"
                />
                <EnvStat
                  icon={Wind}
                  label="US AQI"
                  value={currentAqi?.us_aqi}
                  unit=""
                  color="#06B6D4"
                />
                <EnvStat
                  icon={Mountain}
                  label="Elevation"
                  value={elevation != null ? Math.round(elevation) : null}
                  unit="m"
                  color="#84CC16"
                />
              </div>

              {loading && (
                <div className="flex items-center justify-center py-6 text-slate-400">
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  <span className="text-sm">Fetching POIs…</span>
                </div>
              )}

              {!loading && proximityData?.categories && (
                <div className="space-y-3">
                  {Object.entries(proximityData.categories)
                    .filter(([, list]) => list.length > 0)
                    .map(([cat, list]) => {
                      const meta = LAYER_BY_ID[cat];
                      const Icon = meta?.icon || MapPin;
                      return (
                        <div key={cat}>
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Icon size={13} style={{ color: meta?.color }} />
                              <span className="text-xs font-semibold text-slate-200">{meta?.label || cat}</span>
                            </div>
                            <Badge variant="outline" className="border-white/10 bg-slate-800/60 font-mono text-[10px] text-slate-300">
                              {list.length}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            {list.slice(0, 5).map((p, i) => (
                              <button
                                key={p.id}
                                onClick={() => onFocusPoi?.(p)}
                                className="flex w-full items-center justify-between gap-2 rounded-md border border-white/5 bg-slate-900/40 px-2.5 py-1.5 text-left hover:border-white/15 hover:bg-slate-800/60"
                                data-testid={`poi-distance-item-${cat}-${i}`}
                              >
                                <span className="line-clamp-1 text-xs text-slate-300">{p.name}</span>
                                <span className="shrink-0 font-mono text-[10px] text-sky-400">{fmtDist(p.distance_m)}</span>
                              </button>
                            ))}
                            {list.length > 5 && (
                              <div className="pl-2.5 text-[10px] font-mono text-slate-500">+ {list.length - 5} more</div>
                            )}
                          </div>
                          <Separator className="my-3 bg-white/5" />
                        </div>
                      );
                    })}
                  {(!proximityData || proximityData.total === 0) && !loading && (
                    <div className="rounded-lg border border-white/5 bg-slate-900/40 p-3 text-center text-xs text-slate-400">
                      No POIs in this radius yet. Enable more layers or widen the buffer.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
