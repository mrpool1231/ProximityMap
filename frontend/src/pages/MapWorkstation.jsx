import { useCallback, useEffect, useMemo, useState } from "react";
import MapView from "@/components/map/MapView";
import LayerSidebar from "@/components/map/LayerSidebar";
import ProximityPanel from "@/components/map/ProximityPanel";
import TopBar from "@/components/map/TopBar";
import Legend from "@/components/map/Legend";
import UploadModal from "@/components/map/UploadModal";
import { DEFAULT_CENTER, DEFAULT_ZOOM, POI_LAYERS, ENV_LAYERS, CONCEPT_LAYERS } from "@/lib/mapConfig";
import { fetchPOIs, listCustomLayers, deleteCustomLayer } from "@/lib/api";
import { toast } from "sonner";

const ALL_LAYERS = [...POI_LAYERS, ...ENV_LAYERS, ...CONCEPT_LAYERS];

const initialVisibility = () => {
  const v = {};
  ALL_LAYERS.forEach((l) => {
    v[l.id] = ["parks", "schools", "gas_stations"].includes(l.id);
  });
  return v;
};

const initialOpacity = () => {
  const o = {};
  ALL_LAYERS.forEach((l) => (o[l.id] = 85));
  return o;
};

export default function MapWorkstation() {
  const [basemap, setBasemap] = useState("dark");
  const [center] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pin, setPin] = useState(null);
  const [radius, setRadius] = useState(1500);
  const [clickPinMode, setClickPinMode] = useState(false);

  const [visibility, setVisibility] = useState(initialVisibility);
  const [opacity, setOpacity] = useState(initialOpacity);

  const [proximityData, setProximityData] = useState(null);
  const [loadingPois, setLoadingPois] = useState(false);

  const [customLayers, setCustomLayers] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);

  const activePoiLayers = useMemo(
    () => POI_LAYERS.filter((l) => visibility[l.id]).map((l) => l.id),
    [visibility]
  );

  // Load custom layers once
  useEffect(() => {
    listCustomLayers()
      .then((rows) => setCustomLayers(rows.map((r) => ({ ...r, visible: true, opacity: 100 }))))
      .catch(() => {});
  }, []);

  // Fetch POIs whenever pin / radius / visible POI categories change
  useEffect(() => {
    if (!pin || activePoiLayers.length === 0) {
      setProximityData(null);
      return;
    }
    let alive = true;
    setLoadingPois(true);
    fetchPOIs({ lat: pin[0], lon: pin[1], radius, categories: activePoiLayers })
      .then((d) => alive && setProximityData(d))
      .catch(() => alive && toast.error("POI fetch failed"))
      .finally(() => alive && setLoadingPois(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.[0], pin?.[1], radius, activePoiLayers.join(",")]);

  const onToggle = useCallback((id, v) => {
    setVisibility((prev) => ({ ...prev, [id]: v }));
  }, []);
  const onOpacityChange = useCallback((id, v) => {
    setOpacity((prev) => ({ ...prev, [id]: v }));
  }, []);
  const selectAll = () => setVisibility(Object.fromEntries(ALL_LAYERS.map((l) => [l.id, true])));
  const hideAll = () => setVisibility(Object.fromEntries(ALL_LAYERS.map((l) => [l.id, false])));

  const onMapClick = (coords) => {
    setPin(coords);
    setClickPinMode(false);
    toast.success("Pin dropped", { description: `${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}` });
  };
  const onSearchSelect = (coords, label) => {
    setPin(coords);
    setZoom(15);
    toast.success("Location set", { description: label?.split(",").slice(0, 2).join(",") });
  };

  const onCreatedCustom = (c) => setCustomLayers((prev) => [...prev, { ...c, visible: true, opacity: 100 }]);
  const onToggleCustom = (id, v) => setCustomLayers((prev) => prev.map((c) => (c.id === id ? { ...c, visible: v } : c)));
  const onCustomOpacity = (id, v) => setCustomLayers((prev) => prev.map((c) => (c.id === id ? { ...c, opacity: v } : c)));
  const onDeleteCustom = async (id) => {
    try {
      await deleteCustomLayer(id);
      setCustomLayers((prev) => prev.filter((c) => c.id !== id));
      toast.success("Layer removed");
    } catch {
      toast.error("Delete failed");
    }
  };

  const layerData = useMemo(() => {
    if (!proximityData?.categories) return {};
    const out = {};
    for (const [cat, list] of Object.entries(proximityData.categories)) {
      out[cat] = { features: list };
    }
    return out;
  }, [proximityData]);

  const counts = proximityData?.counts || {};

  const focusPoi = (poi) => {
    setPin([poi.lat, poi.lon]);
    setZoom(17);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0b0f17]">
      <TopBar basemap={basemap} setBasemap={setBasemap} pin={pin} />
      <div className="flex flex-1 min-h-0">
        <LayerSidebar
          visibility={visibility}
          opacity={opacity}
          counts={counts}
          onToggle={onToggle}
          onOpacityChange={onOpacityChange}
          onSelectAll={selectAll}
          onHideAll={hideAll}
          onOpenUpload={() => setUploadOpen(true)}
          customLayers={customLayers}
          onToggleCustom={onToggleCustom}
          onDeleteCustom={onDeleteCustom}
          onCustomOpacity={onCustomOpacity}
        />
        <div className="relative flex-1 min-w-0">
          <MapView
            basemap={basemap}
            center={center}
            zoom={zoom}
            pin={pin}
            onMapClick={onMapClick}
            clickPinMode={clickPinMode}
            radius={radius}
            layerData={layerData}
            layerVisibility={visibility}
            layerOpacity={opacity}
            customLayers={customLayers}
            onPoiClick={focusPoi}
          />
          <Legend visibility={visibility} counts={counts} customLayers={customLayers} />
          {clickPinMode && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-amber-400/30 bg-slate-900/90 px-4 py-1.5 backdrop-blur-xl">
              <span className="font-mono text-xs uppercase tracking-widest text-amber-300">Click anywhere on the map</span>
            </div>
          )}
        </div>
        <ProximityPanel
          pin={pin}
          radius={radius}
          onRadiusChange={setRadius}
          onSearchSelect={onSearchSelect}
          clickPinMode={clickPinMode}
          setClickPinMode={setClickPinMode}
          proximityData={proximityData}
          loading={loadingPois}
          onFocusPoi={focusPoi}
        />
      </div>
      <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} onCreated={onCreatedCustom} />
    </div>
  );
}
