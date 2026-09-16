import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, FileJson, FileSpreadsheet, Sparkles } from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";
import { saveCustomLayer } from "@/lib/api";

const PRESET_COLORS = ["#38BDF8", "#F59E0B", "#10B981", "#EF4444", "#EC4899", "#A3E635", "#F472B6", "#22D3EE"];

const SAMPLE_GEOJSON = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-73.9857, 40.7484] }, properties: { name: "Empire State", type: "landmark" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-73.9776, 40.7527] }, properties: { name: "Bryant Park", type: "park" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-73.9903, 40.7359] }, properties: { name: "Union Square", type: "plaza" } },
  ],
};

function csvToGeoJSON(rows) {
  const features = [];
  for (const row of rows) {
    const lat = parseFloat(row.lat ?? row.latitude ?? row.Lat ?? row.LATITUDE);
    const lon = parseFloat(row.lon ?? row.lng ?? row.longitude ?? row.Lon ?? row.LONGITUDE);
    if (isNaN(lat) || isNaN(lon)) continue;
    const props = { ...row };
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: props });
  }
  return { type: "FeatureCollection", features };
}

export default function UploadModal({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#38BDF8");
  const [geojson, setGeojson] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setColor("#38BDF8");
    setGeojson(null);
    setPreview(null);
  };

  const handleFile = (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (ext === "csv") {
          const parsed = Papa.parse(reader.result, { header: true, skipEmptyLines: true });
          const gj = csvToGeoJSON(parsed.data);
          if (gj.features.length === 0) throw new Error("No valid lat/lon rows");
          setGeojson(gj);
          setPreview({ kind: "csv", count: gj.features.length, fileName: file.name });
        } else {
          const gj = JSON.parse(reader.result);
          const featureCount = Array.isArray(gj.features) ? gj.features.length : gj.type === "Feature" ? 1 : 0;
          if (featureCount === 0) throw new Error("Empty GeoJSON");
          setGeojson(gj);
          setPreview({ kind: "geojson", count: featureCount, fileName: file.name });
        }
        if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
      } catch (e) {
        toast.error(`Parse failed: ${e.message}`);
      }
    };
    reader.readAsText(file);
  };

  const loadSample = () => {
    setGeojson(SAMPLE_GEOJSON);
    setPreview({ kind: "sample", count: SAMPLE_GEOJSON.features.length, fileName: "sample-nyc.geojson" });
    if (!name) setName("Sample NYC Landmarks");
  };

  const submit = async () => {
    if (!geojson || !name.trim()) {
      toast.error("Add a name and a file first");
      return;
    }
    setBusy(true);
    try {
      const created = await saveCustomLayer({ name: name.trim(), color, geojson });
      toast.success(`Layer "${created.name}" added`);
      onCreated?.(created);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to save layer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg border-white/10 bg-[#0b0f17] text-slate-100">
        <DialogHeader>
          <DialogTitle className="font-heading">Upload custom overlay</DialogTitle>
          <DialogDescription className="text-slate-400">
            Drop a GeoJSON, JSON or CSV file. CSV needs <span className="font-mono text-sky-400">lat</span> and{" "}
            <span className="font-mono text-sky-400">lon</span> columns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-slate-900/40 px-4 py-8 text-center transition-colors hover:border-sky-400/50 hover:bg-sky-400/5"
            data-testid="upload-dropzone"
          >
            <Upload size={22} className="text-sky-400" />
            <div className="text-sm text-slate-200">Click to browse or drop file</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">.geojson · .json · .csv</div>
            <input
              type="file"
              accept=".json,.geojson,.csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
              data-testid="upload-file-input"
            />
          </label>

          <Button
            variant="ghost"
            onClick={loadSample}
            className="h-8 w-full text-xs text-slate-400 hover:bg-slate-800 hover:text-amber-300"
            data-testid="use-sample-button"
          >
            <Sparkles size={12} className="mr-1.5" />
            Use sample NYC landmarks
          </Button>

          {preview && (
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2.5">
              {preview.kind === "csv" ? (
                <FileSpreadsheet size={18} className="text-emerald-400" />
              ) : (
                <FileJson size={18} className="text-sky-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{preview.fileName}</div>
                <div className="text-[10px] font-mono text-slate-500">{preview.count} features parsed</div>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="layer-name" className="text-xs uppercase tracking-wider text-slate-400">
              Layer name
            </Label>
            <Input
              id="layer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My property portfolio"
              className="border-white/10 bg-slate-900/70 focus-visible:ring-sky-400"
              data-testid="layer-name-input"
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-xs uppercase tracking-wider text-slate-400">Marker color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-md transition-transform ${color === c ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-slate-950" : "opacity-80 hover:opacity-100"}`}
                  style={{ background: c }}
                  data-testid={`color-swatch-${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:bg-slate-800">
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={busy || !geojson || !name.trim()}
              className="bg-sky-500 text-slate-950 hover:bg-sky-400"
              data-testid="submit-layer-button"
            >
              {busy ? "Saving…" : "Add to map"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
