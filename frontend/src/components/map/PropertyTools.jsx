import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { PenTool, Upload, Check, X, Trash2, Hexagon } from "lucide-react";
import { propertyArea, extractOutline } from "@/lib/geo";
import { toast } from "sonner";

function fmtArea(m2) {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString()} m²`;
}

export default function PropertyTools({ property, drawPoints, onStartDraw, onFinishDraw, onCancelDraw, onOutline, onClear }) {
  const fileRef = useRef(null);
  const drawing = Array.isArray(drawPoints);

  const handleFile = (file) => {
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
    if (fileRef.current) fileRef.current.value = "";
  };

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
          <div className="rounded-md border border-amber-400/30 bg-amber-400/5 px-2.5 py-1.5 text-xs text-amber-200" data-testid="draw-hint">
            Click the map to add corners · <span className="font-mono">{drawPoints.length}</span> placed
          </div>
          <div className="flex gap-2">
            <Button
              onClick={onFinishDraw}
              disabled={drawPoints.length < 3}
              className="h-8 flex-1 bg-amber-500 text-slate-950 hover:bg-amber-400"
              data-testid="finish-draw-button"
            >
              <Check size={13} className="mr-1.5" /> Finish outline
            </Button>
            <Button variant="ghost" onClick={onCancelDraw} className="h-8 text-slate-400 hover:bg-slate-800" data-testid="cancel-draw-button">
              <X size={13} />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onStartDraw}
            className="h-8 flex-1 border-white/10 bg-transparent text-xs text-slate-200 hover:border-amber-400/50 hover:bg-amber-400/5 hover:text-amber-300"
            data-testid="draw-property-button"
          >
            <PenTool size={13} className="mr-1.5" /> Draw
          </Button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="h-8 flex-1 border-white/10 bg-transparent text-xs text-slate-200 hover:border-sky-400/50 hover:bg-sky-400/5 hover:text-sky-300"
            data-testid="upload-property-button"
          >
            <Upload size={13} className="mr-1.5" /> Upload
          </Button>
          {property && (
            <Button
              variant="ghost"
              onClick={onClear}
              className="h-8 w-8 p-0 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
              data-testid="clear-property-button"
            >
              <Trash2 size={13} />
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".json,.geojson"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
            data-testid="property-file-input"
          />
        </div>
      )}
      {property && !drawing && (
        <p className="mt-2 text-[11px] text-slate-500">Buffer and distances are measured from the property line.</p>
      )}
    </div>
  );
}
