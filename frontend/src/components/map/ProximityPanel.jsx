import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MapPin, Search, Crosshair, Loader2, Target, ChevronRight, CloudRain, Wind, Mountain, AlertTriangle, LocateFixed, X } from "lucide-react";
import { geocode } from "@/lib/api";
import { LAYER_BY_ID } from "@/lib/mapConfig";
import PropertyTools from "@/components/map/PropertyTools";
import CompareScorecard from "@/components/map/CompareScorecard";
import { toast } from "sonner";

function fmtDist(m) {
  if (m < 1609.344) {
    const ft = m * 3.28084;
    return `${Math.round(ft).toLocaleString()} ft`;
  }
  return `${(m / 1609.344).toFixed(2)} mi`;
}

function fmtRadius(m) {
  if (m < 1609.344) return `${Math.round(m * 3.28084).toLocaleString()} ft`;
  return `${(m / 1609.344).toFixed(2)} mi`;
}

const RADIUS_PRESETS = [
  { label: "500 ft", value: 152.4 },
  { label: "1,000 ft", value: 304.8 },
  { label: "2,000 ft", value: 609.6 },
  { label: "¼ mi", value: 402.336 },
  { label: "½ mi", value: 804.672 },
  { label: "1 mi", value: 1609.344 },
];

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
  pins = [],
  activePinId,
  onSelectPin,
  onRemovePin,
  onClearPins,
  pro = false,
  radius,
  onRadiusChange,
  onUpgrade,
  onSearchSelect,
  clickPinMode,
  setClickPinMode,
  proximityData,
  loading,
  onFocusPoi,
  env,
  propertyTools,
  compare,
  onRetry,
  onUseLocation,
  locating,
  visibility,
  mobileOpen = false,
  onMobileClose,
  desktopOpen = true,
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
      className={`${mobileOpen
        ? "absolute inset-y-0 right-0 z-30 flex h-full w-[min(92vw,24rem)] shrink-0 flex-col border-l border-white/5 bg-[#0b0f17]/98 shadow-2xl backdrop-blur-xl md:relative md:w-96"
        : "flex h-full w-96 shrink-0 flex-col border-l border-white/5 bg-[#0b0f17]/95 backdrop-blur-xl"} transition-transform duration-300 ease-in-out ${mobileOpen || desktopOpen ? "translate-x-0" : "translate-x-full"}`}
      data-testid="proximity-panel"
    >
      <div className="border-b border-white/5 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-amber-400" />
          <h2 className="font-heading text-sm font-semibold tracking-wide">Proximity Analysis</h2>
          <Button size="icon" variant="ghost" className="ml-auto h-7 w-7 text-slate-400 md:hidden" onClick={onMobileClose} aria-label="Close analysis">
            <X size={14} />
          </Button>
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

        <div className="grid grid-cols-2 gap-2">
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
            {clickPinMode ? (pro ? "Add location…" : "Drop pin…") : (pro ? "Add pin" : "Drop pin")}
          </Button>
          <Button
            variant="outline"
            onClick={onUseLocation}
            disabled={locating}
            className="h-9 border-white/10 bg-transparent text-slate-200 hover:border-sky-400/50 hover:bg-sky-400/5 hover:text-sky-300"
            data-testid="use-location-button"
          >
            {locating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <LocateFixed size={14} className="mr-2" />}
            {locating ? "Locating…" : "My location"}
          </Button>
        </div>

        {pro && pins.length > 0 && (
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-sky-300">Pro locations</span>
              <Badge className="border border-sky-500/20 bg-sky-500/10 text-sky-300">{pins.length}</Badge>
            </div>
            <div className="space-y-1.5">
              {pins.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${p.id === activePinId ? "border-sky-400/40 bg-sky-400/10" : "border-white/5 bg-slate-900/40"}`}>
                  <button type="button" onClick={() => onSelectPin(p.id)} className="min-w-0 flex-1 text-left">
                    <span className="block text-[10px] font-mono uppercase tracking-widest text-slate-400">Location {i + 1}</span>
                    <span className="block truncate font-mono text-[10px] text-slate-200">{p.coords[0].toFixed(5)}, {p.coords[1].toFixed(5)}</span>
                  </button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-500 hover:text-red-300" onClick={() => onRemovePin(p.id)} aria-label={`Remove location ${i + 1}`}>
                    <X size={12} />
                  </Button>
                </div>
              ))}
            </div>
            {pins.length > 1 && (
              <Button type="button" variant="outline" size="sm" onClick={onClearPins} className="mt-2 h-7 w-full border-white/10 bg-transparent text-[10px] text-slate-400 hover:text-slate-200">
                Clear all locations
              </Button>
            )}
          </div>
        )}
        {!pro && pin && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-200/80">
            Pro unlocks multiple locations on the same map.
          </div>
        )}

        <PropertyTools {...propertyTools} />
      </div>

      <div className="border-b border-white/5 px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Buffer radius</span>
          <span className="font-mono text-sm font-semibold text-sky-400" data-testid="radius-value">
            {fmtRadius(pro ? radius : 609.6)}
          </span>
        </div>
        <Slider
          value={[pro ? radius : Math.min(radius, 609.6)]}
          min={100}
          max={pro ? 16093 : 609.6}
          step={10}
          onValueChange={(v) => onRadiusChange(pro ? v[0] : Math.min(v[0], 609.6))}
          data-testid="radius-slider"
        />
        <div className="mt-1 flex justify-between text-[10px] font-mono text-slate-600">
          <span>328 ft</span>
          <span>{pro ? "10 mi" : "2,000 ft · Free limit"}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {(pro ? RADIUS_PRESETS : [RADIUS_PRESETS[2]]).map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRadiusChange(preset.value)}
              className={`h-7 border-white/10 bg-slate-900/60 px-2 text-[10px] font-mono ${
                Math.abs(radius - preset.value) < 1 ? "border-sky-400/50 bg-sky-400/10 text-sky-300" : "text-slate-400 hover:border-sky-400/40 hover:text-sky-300"
              }`}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        {!pro && (
          <button
            type="button"
            onClick={() => onUpgrade?.("Unlock an adjustable radius with Pro — Free is limited to 2,000 ft.")}
            className="mt-3 w-full rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-left text-[10px] text-slate-400 hover:border-sky-400/40 hover:text-sky-300"
          >
            <span className="font-semibold text-sky-300">Pro:</span> adjustable radius up to 10 miles.
          </button>
        )}
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

              {(visibility?.weather || visibility?.air_quality || visibility?.elevation) && (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Environmental data</div>
                  {visibility?.weather && (
                    <EnvStat
                      icon={CloudRain}
                      label="Temperature"
                      value={currentWeather?.temperature_2m}
                      unit="°C"
                      color="#8B5CF6"
                    />
                  )}
                  {visibility?.air_quality && (
                    <EnvStat
                      icon={Wind}
                      label="US AQI"
                      value={currentAqi?.us_aqi}
                      unit=""
                      color="#06B6D4"
                    />
                  )}
                  {visibility?.elevation && (
                    <EnvStat
                      icon={Mountain}
                      label="Elevation"
                      value={elevation != null ? Math.round(elevation) : null}
                      unit="m"
                      color="#84CC16"
                    />
                  )}
                </div>
              )}

              {compare?.propertyB && proximityData && <CompareScorecard dataA={proximityData} dataB={compare.dataB} loadingB={compare.loadingB} />}

              {loading && (
                <div className="flex items-center justify-center py-6 text-slate-400">
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  <span className="text-sm">Fetching POIs…</span>
                </div>
              )}

              {!loading && proximityData?.unavailable?.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3" data-testid="poi-unavailable-banner">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
                  <div className="flex-1 text-xs text-amber-100">
                    Live place data unavailable for {proximityData.unavailable.map((c) => LAYER_BY_ID[c]?.label || c).join(", ")}. Nothing was substituted.
                    <button onClick={onRetry} className="ml-2 font-mono text-[10px] uppercase tracking-widest text-amber-300 underline-offset-2 hover:underline" data-testid="poi-retry-button">
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {!loading && proximityData?.categories && (
                <div className="space-y-3">
                  {proximityData.total > 0 && (
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500" data-testid="poi-source">
                      Live place data · straight-line distances
                    </div>
                  )}
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
                  {(!proximityData || proximityData.total === 0) && !loading && !proximityData?.unavailable?.length && (
                    <div className="rounded-lg border border-white/5 bg-slate-900/40 p-3 text-center text-xs text-slate-400" data-testid="poi-empty">
                      No matching places in OpenStreetMap within this buffer. Enable more layers or widen the radius.
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