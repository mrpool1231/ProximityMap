import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { PenTool, Upload, Check, X, Trash2, Hexagon, Scale } from "lucide-react";
import { propertyArea, extractOutline } from "@/lib/geo";
import { toast } from "sonner";

function fmtArea(m2) {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString()} m²`;
}

function readOutline(file, onOutline, inputEl) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const outline = extractOutline(JSON.parse(reader.result));
      if (!outline || outline.length < 3) throw new Error("No polygon found in file");
      onOutline(outline);
    } catch (e) {
      toast.error(`Outline upload failed: ${e.message}`);
    }
  };
  reader.readAsText(file);
  if (inputEl) inputEl.value = "";
}

function OutlineRow({ id, label, accent, outline, onDraw, onUpload, onClear }) {
  const fileRef = useRef(null);
  return (
    <div className="flex items-center gap-2" data-testid={`outline-row-${id}`}>
      <span className={`w-4 font-mono text-xs font-bold ${accent}`}>{label}</span>
      <Button variant="outline" onClick={onDraw} className="h-8 flex-1 border-white/10 bg-transparent text-xs text-slate-200 hover:border-amber-400/50 hover:bg-amber-400/5 hover:text-amber-300" data-testid={`draw-property-button${id === "B" ? "-b" : ""}`}>
        <PenTool size={13} className="mr-1.5" /> Draw
      </Button>
      <Button variant="outline" onClick={() => fileRef.current?.click()} className="h-8 flex-1 border-white/10 bg-transparent text-xs text-slate-200 hover:border-sky-400/50 hover:bg-sky-400/5 hover:text-sky-300" data-testid={`upload-property-button${id === "B" ? "-b" : ""}`}>
        <Upload size={13} className="mr-1.5" /> Upload
      </Button>
      {outline && (
        <Button variant="ghost" onClick={onClear} className="h-8 w-8 p-0 text-slate-500 hover:bg-red-500/10 hover:text-red-400" data-testid={`clear-property-button${id === "B" ? "-b" : ""}`}>
          <Trash2 size={13} />
        </Button>
      )}
      <input ref={fileRef} type="file" accept=".json,.geojson" className="hidden" onChange={(e) => readOutline(e.target.files?.[0], onUpload, fileRef.current)} data-testid={`property-file-input${id === "B" ? "-b" : ""}`} />
    </div>
  );
}

export default function PropertyTools({ property, propertyB, drawPoints, drawTarget, onStartDraw, onFinishDraw, onCancelDraw, onOutline, onClear }) {
  const drawing = Array.isArray(drawPoints);
  const targetLabel = drawTarget === "B" ? "Property B" : "Property";

  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/40 p-3" data-testid="property-tools">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hexagon size={13} className="text-amber-400" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Property outline</span>
        </div>
        {property && (
          <span className="font-mono text-[10px] text-amber-300" data-testid="property-area">
            {property.length} pts · {fmtArea(propertyArea(property))}
          </span>
        )}
      </div>

      {drawing ? (
        <div className="space-y-2">
          <div className={`rounded-md border px-2.5 py-1.5 text-xs ${drawTarget === "B" ? "border-teal-400/30 bg-teal-400/5 text-teal-200" : "border-amber-400/30 bg-amber-400/5 text-amber-200"}`} data-testid="draw-hint">
            {targetLabel}: click the map to add corners · <span className="font-mono">{drawPoints.length}</span> placed
          </div>
          <div className="flex gap-2">
            <Button onClick={onFinishDraw} disabled={drawPoints.length < 3} className={`h-8 flex-1 text-slate-950 ${drawTarget === "B" ? "bg-teal-400 hover:bg-teal-300" : "bg-amber-500 hover:bg-amber-400"}`} data-testid="finish-draw-button">
              <Check size={13} className="mr-1.5" /> Finish outline
            </Button>
            <Button variant="ghost" onClick={onCancelDraw} className="h-8 text-slate-400 hover:bg-slate-800" data-testid="cancel-draw-button">
              <X size={13} />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <OutlineRow id="A" label={propertyB ? "A" : ""} accent="text-amber-300" outline={property} onDraw={() => onStartDraw("A")} onUpload={(o) => onOutline("A", o)} onClear={() => onClear("A")} />
          {property && (
            <>
              <OutlineRow id="B" label="B" accent="text-teal-300" outline={propertyB} onDraw={() => onStartDraw("B")} onUpload={(o) => onOutline("B", o)} onClear={() => onClear("B")} />
              {propertyB ? (
                <p className="flex items-center gap-1.5 text-[11px] text-slate-500" data-testid="compare-active-note">
                  <Scale size={11} className="text-teal-300" /> Comparing A vs B · {propertyB.length} pts · {fmtArea(propertyArea(propertyB))}
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">Buffer and distances are measured from the property line. Add outline B to compare two properties.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
