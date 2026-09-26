import { useState } from "react";
import { POI_LAYERS, ENV_LAYERS, CONCEPT_LAYERS } from "@/lib/mapConfig";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Upload, Trash2, Layers } from "lucide-react";

function LayerRow({ layer, visible, opacity, count, onToggle, onOpacity, warning }) {
  const Icon = layer.icon;
  return (
    <div className="group flex flex-col gap-2 rounded-lg border border-white/5 bg-slate-900/50 px-3 py-2.5 transition-colors hover:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ background: `${layer.color}22`, border: `1px solid ${layer.color}55` }}
          >
            <Icon size={14} color={layer.color} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-100">{layer.label}</div>
            {layer.note && <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">{layer.note}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {typeof count === "number" && visible && (
            <Badge variant="outline" className="border-white/10 bg-slate-800/60 font-mono text-[10px] text-slate-300">
              {count}
            </Badge>
          )}
          <Switch
            checked={visible}
            onCheckedChange={onToggle}
            data-testid={`layer-toggle-${layer.id}`}
          />
        </div>
      </div>
      {visible && (
        <div className="flex items-center gap-2 pl-9">
          <span className="w-6 text-[10px] font-mono text-slate-500">{opacity}%</span>
          <Slider
            value={[opacity]}
            min={5}
            max={100}
            step={5}
            onValueChange={(v) => onOpacity(v[0])}
            className="flex-1"
            data-testid={`layer-opacity-slider-${layer.id}`}
          />
        </div>
      )}
      {visible && warning && (
        <div className="ml-9 rounded-md border border-amber-400/30 bg-amber-400/5 px-2 py-1 text-[10px] text-amber-200" data-testid={`layer-warning-${layer.id}`}>
          {warning}
        </div>
      )}
    </div>
  );
}

function Group({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="mb-2 flex w-full items-center justify-between text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 hover:text-sky-400 transition-colors"
      >
        <span>{title}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && <div className="mb-4 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

export default function LayerSidebar({
  visibility,
  opacity,
  counts,
  onToggle,
  onOpacityChange,
  onSelectAll,
  onHideAll,
  onOpenUpload,
  customLayers,
  onToggleCustom,
  onDeleteCustom,
  onCustomOpacity,
  trafficEnabled,
}) {
  return (
    <aside
      className="flex h-full w-80 shrink-0 flex-col border-r border-white/5 bg-[#0b0f17]/95 backdrop-blur-xl"
      data-testid="layer-sidebar"
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-sky-400" />
          <h2 className="font-heading text-sm font-semibold tracking-wide">Layer Control</h2>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:bg-slate-800 hover:text-sky-400"
            onClick={onSelectAll}
            data-testid="select-all-button"
          >
            Show all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:bg-slate-800 hover:text-amber-400"
            onClick={onHideAll}
            data-testid="hide-all-button"
          >
            Hide all
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <Group title="Points of Interest">
          {POI_LAYERS.map((l) => (
            <LayerRow
              key={l.id}
              layer={l}
              visible={!!visibility[l.id]}
              opacity={opacity[l.id] ?? 85}
              count={counts?.[l.id]}
              onToggle={(v) => onToggle(l.id, v)}
              onOpacity={(v) => onOpacityChange(l.id, v)}
            />
          ))}
        </Group>

        <Group title="Environment">
          {ENV_LAYERS.map((l) => (
            <LayerRow
              key={l.id}
              layer={l}
              visible={!!visibility[l.id]}
              opacity={opacity[l.id] ?? 85}
              onToggle={(v) => onToggle(l.id, v)}
              onOpacity={(v) => onOpacityChange(l.id, v)}
            />
          ))}
        </Group>

        <Group title="Urban" defaultOpen={false}>
          {CONCEPT_LAYERS.map((l) => (
            <LayerRow
              key={l.id}
              layer={l}
              visible={!!visibility[l.id]}
              opacity={opacity[l.id] ?? 60}
              onToggle={(v) => onToggle(l.id, v)}
              onOpacity={(v) => onOpacityChange(l.id, v)}
              warning={l.id === "traffic" && !trafficEnabled ? "Live traffic needs a TomTom key — set TOMTOM_API_KEY on the backend." : undefined}
            />
          ))}
        </Group>

        <Group title="Custom Overlays">
          {(customLayers || []).length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">
              Upload GeoJSON or CSV to render your own data as a live overlay.
            </div>
          )}
          {(customLayers || []).map((cl) => (
            <div key={cl.id} className="rounded-lg border border-white/5 bg-slate-900/50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-3 w-3 rounded-full" style={{ background: cl.color, boxShadow: `0 0 12px ${cl.color}88` }} />
                  <div className="truncate text-sm font-medium">{cl.name}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={cl.visible}
                    onCheckedChange={(v) => onToggleCustom(cl.id, v)}
                    data-testid={`custom-layer-toggle-${cl.id}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                    onClick={() => onDeleteCustom(cl.id)}
                    data-testid={`custom-layer-delete-${cl.id}`}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
              {cl.visible && (
                <div className="mt-2 flex items-center gap-2 pl-5">
                  <span className="w-6 text-[10px] font-mono text-slate-500">{cl.opacity ?? 100}%</span>
                  <Slider
                    value={[cl.opacity ?? 100]}
                    min={10}
                    max={100}
                    step={5}
                    onValueChange={(v) => onCustomOpacity(cl.id, v[0])}
                    className="flex-1"
                  />
                </div>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            className="mt-1 h-9 w-full justify-center border-dashed border-white/15 bg-transparent text-slate-300 hover:border-sky-400/50 hover:bg-sky-400/5 hover:text-sky-300"
            onClick={onOpenUpload}
            data-testid="custom-upload-button"
          >
            <Upload size={14} className="mr-2" />
            Upload custom layer
          </Button>
        </Group>
      </div>
    </aside>
  );
}
