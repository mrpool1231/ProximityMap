import { LAYER_BY_ID, POI_LAYERS, CONCEPT_LAYERS } from "@/lib/mapConfig";

export default function Legend({ visibility, counts, customLayers }) {
  const mapLayerIds = new Set([...POI_LAYERS, ...CONCEPT_LAYERS].map((l) => l.id));
  const active = Object.entries(visibility).filter(([k, v]) => v && mapLayerIds.has(k)).map(([k]) => k);
  if (active.length === 0 && (!customLayers || customLayers.filter((c) => c.visible).length === 0)) return null;
  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-4 z-20 max-w-md rounded-xl border border-white/10 bg-slate-900/85 px-3 py-2.5 backdrop-blur-xl"
      data-testid="legend"
    >
      <div className="mb-1.5 text-[9px] font-mono uppercase tracking-widest text-slate-400">Legend</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {active.map((id) => {
          const l = LAYER_BY_ID[id];
          if (!l) return null;
          return (
            <div key={id} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color, boxShadow: `0 0 8px ${l.color}88` }} />
              <span className="text-[11px] text-slate-200">{l.label}</span>
              {counts?.[id] != null && (
                <span className="font-mono text-[10px] text-slate-500">({counts[id]})</span>
              )}
            </div>
          );
        })}
        {(customLayers || []).filter((c) => c.visible).map((c) => (
          <div key={c.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}88` }} />
            <span className="text-[11px] text-slate-200">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
