import { useCallback, useEffect, useMemo, useState } from "react";
import MapView from "@/components/map/MapView";
import LayerSidebar from "@/components/map/LayerSidebar";
import ProximityPanel from "@/components/map/ProximityPanel";
import TopBar from "@/components/map/TopBar";
import Legend from "@/components/map/Legend";
import UploadModal from "@/components/map/UploadModal";
import PrintReport from "@/components/map/PrintReport";
import UpgradeDialog from "@/components/map/UpgradeDialog";
import AuthDialog from "@/components/map/AuthDialog";
import BrandingDialog from "@/components/map/BrandingDialog";
import AIAnalyst from "@/components/map/AIAnalyst";
import { buildAIContext } from "@/lib/ai";
import { useAuth } from "@/context/AuthContext";
import { DEFAULT_CENTER, DEFAULT_ZOOM, POI_LAYERS, ENV_LAYERS, CONCEPT_LAYERS } from "@/lib/mapConfig";
import {
  fetchPOIs,
  listCustomLayers,
  deleteCustomLayer,
  fetchTrafficConfig,
  saveReport,
  loadReport,
  fetchWeather,
  fetchAirQuality,
  fetchElevation,
  paymentStatus,
  TRAFFIC_TILE_URL,
} from "@/lib/api";
import { propertyCentroid, propertyReach, applyPropertyDistances } from "@/lib/geo";
import { getLicense, clearLicense, stashResumeState, popResumeState } from "@/lib/license";
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
  const [view, setView] = useState({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
  const [pin, setPin] = useState(null);
  const [radius, setRadius] = useState(1500);
  const [clickPinMode, setClickPinMode] = useState(false);
  const [property, setProperty] = useState(null); // [[lat, lon], ...]
  const [propertyB, setPropertyB] = useState(null);
  const [drawPoints, setDrawPoints] = useState(null); // null = not drawing
  const [drawTarget, setDrawTarget] = useState("A");
  const [dataB, setDataB] = useState(null);
  const [loadingB, setLoadingB] = useState(false);

  const [visibility, setVisibility] = useState(initialVisibility);
  const [opacity, setOpacity] = useState(initialOpacity);

  const [proximityData, setProximityData] = useState(null);
  const [loadingPois, setLoadingPois] = useState(false);
  const [env, setEnv] = useState(null);

  const [customLayers, setCustomLayers] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [trafficCfg, setTrafficCfg] = useState({ enabled: false });
  const [sharing, setSharing] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [upgrade, setUpgrade] = useState(null); // null | { reason }
  const [authOpen, setAuthOpen] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const { user } = useAuth();
  const pro = isPro || !!user?.is_pro;

  const activePoiLayers = useMemo(
    () => POI_LAYERS.filter((l) => visibility[l.id]).map((l) => l.id),
    [visibility]
  );

  const applyProperty = useCallback((latlngs, zoom = 16) => {
    const c = propertyCentroid(latlngs);
    setProperty(latlngs);
    setPin(c);
    setView({ center: c, zoom });
  }, []);

  const restoreReport = useCallback(
    (s) => {
      if (s.visible) setVisibility(Object.fromEntries(ALL_LAYERS.map((l) => [l.id, s.visible.includes(l.id)])));
      if (s.opacity) setOpacity((prev) => ({ ...prev, ...s.opacity }));
      if (s.basemap) setBasemap(s.basemap);
      if (s.radius) setRadius(s.radius);
      setPropertyB(s.propertyB?.length >= 3 ? s.propertyB : null);
      if (s.property?.length >= 3) applyProperty(s.property, s.zoom || 16);
      else if (s.pin) {
        setPin(s.pin);
        setView({ center: s.pin, zoom: s.zoom || 15 });
      }
    },
    [applyProperty]
  );

  useEffect(() => {
    listCustomLayers()
      .then((rows) => setCustomLayers(rows.map((r) => ({ ...r, visible: true, opacity: 100 }))))
      .catch(() => {});
    fetchTrafficConfig().then(setTrafficCfg).catch(() => {});
    const license = getLicense();
    if (license) {
      paymentStatus(license)
        .then((s) => {
          if (s.payment_status === "paid") setIsPro(true);
          else clearLicense();
        })
        .catch((e) => {
          if (e?.response?.status === 404) clearLicense();
        });
    }
    const resume = popResumeState();
    if (resume) {
      restoreReport(resume);
      return;
    }
    const id = new URLSearchParams(window.location.search).get("report");
    if (id) {
      loadReport(id)
        .then((r) => {
          restoreReport(r.state);
          toast.success("Shared report loaded");
        })
        .catch(() => toast.error("Shared report not found"));
    }
  }, [restoreReport]);

  // Fetch POIs whenever pin / radius / property / visible POI categories change
  useEffect(() => {
    if (!pin || activePoiLayers.length === 0) {
      setProximityData(null);
      return;
    }
    let alive = true;
    setLoadingPois(true);
    const reach = property ? propertyReach(property) : 0;
    fetchPOIs({ lat: pin[0], lon: pin[1], radius: Math.round(radius + reach), categories: activePoiLayers })
      .then((d) => alive && setProximityData(property ? applyPropertyDistances(d, property, radius) : d))
      .catch(() => alive && toast.error("POI fetch failed"))
      .finally(() => alive && setLoadingPois(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.[0], pin?.[1], radius, activePoiLayers.join(","), property]);

  // Property B (comparison) POIs
  useEffect(() => {
    if (!propertyB || activePoiLayers.length === 0) {
      setDataB(null);
      return;
    }
    let alive = true;
    setLoadingB(true);
    const [lat, lon] = propertyCentroid(propertyB);
    fetchPOIs({ lat, lon, radius: Math.round(radius + propertyReach(propertyB)), categories: activePoiLayers })
      .then((d) => alive && setDataB(applyPropertyDistances(d, propertyB, radius)))
      .catch(() => alive && toast.error("Property B POI fetch failed"))
      .finally(() => alive && setLoadingB(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyB, radius, activePoiLayers.join(",")]);

  useEffect(() => {
    if (!pin) return;
    let alive = true;
    Promise.all([fetchWeather(pin[0], pin[1]), fetchAirQuality(pin[0], pin[1]), fetchElevation(pin[0], pin[1])])
      .then(([w, a, e]) => alive && setEnv({ weather: w, aqi: a, elev: e }))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.[0], pin?.[1]]);

  const onToggle = useCallback((id, v) => setVisibility((prev) => ({ ...prev, [id]: v })), []);
  const onOpacityChange = useCallback((id, v) => setOpacity((prev) => ({ ...prev, [id]: v })), []);
  const selectAll = () => setVisibility(Object.fromEntries(ALL_LAYERS.map((l) => [l.id, true])));
  const hideAll = () => setVisibility(Object.fromEntries(ALL_LAYERS.map((l) => [l.id, false])));

  const placePin = (coords, zoom) => {
    setProperty(null);
    setPropertyB(null);
    setPin(coords);
    setView({ center: coords, zoom: zoom ?? view.zoom });
  };
  const onMapClick = (coords) => {
    if (Array.isArray(drawPoints)) {
      setDrawPoints([...drawPoints, coords]);
      return;
    }
    placePin(coords);
    setClickPinMode(false);
    toast.success("Pin dropped", { description: `${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}` });
  };
  const onSearchSelect = (coords, label) => {
    placePin(coords, 15);
    toast.success("Location set", { description: label?.split(",").slice(0, 2).join(",") });
  };

  const setOutline = (target, latlngs, zoom) => {
    if (target === "B") {
      setPropertyB(latlngs);
      setView({ center: propertyCentroid(latlngs), zoom: zoom ?? view.zoom });
    } else applyProperty(latlngs, zoom);
  };

  const propertyTools = {
    property,
    propertyB,
    drawPoints,
    drawTarget,
    onStartDraw: (target) => {
      setClickPinMode(false);
      setDrawTarget(target);
      setDrawPoints([]);
    },
    onCancelDraw: () => setDrawPoints(null),
    onFinishDraw: () => {
      if (drawPoints.length < 3) return;
      setOutline(drawTarget, drawPoints, view.zoom);
      setDrawPoints(null);
      toast.success(`Property ${drawTarget === "B" ? "B " : ""}outline set`, { description: `${drawPoints.length} corners` });
    },
    onOutline: (target, latlngs) => {
      setOutline(target, latlngs, 16);
      toast.success(`Property ${target === "B" ? "B " : ""}outline loaded`, { description: `${latlngs.length} vertices` });
    },
    onClear: (target) => {
      if (target === "B") setPropertyB(null);
      else {
        setProperty(null);
        setPropertyB(null);
      }
    },
  };

  const snapshotState = () => ({
    pin,
    radius,
    property,
    propertyB,
    basemap,
    zoom: view.zoom,
    visible: ALL_LAYERS.filter((l) => visibility[l.id]).map((l) => l.id),
    opacity,
  });

  const onShare = async () => {
    if (!pro) {
      setUpgrade({ reason: "Share links are a Pro feature" });
      return;
    }
    setSharing(true);
    try {
      const r = await saveReport(snapshotState());
      const url = `${window.location.origin}/?report=${r.id}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied", { description: url });
      } catch {
        toast.info("Share link ready", { description: url, duration: 10000 });
      }
      window.history.replaceState(null, "", `/?report=${r.id}`);
    } catch {
      toast.error("Could not create share link");
    } finally {
      setSharing(false);
    }
  };

  const onPrint = () => {
    if (!pro) {
      setUpgrade({ reason: "PDF property briefs are a Pro feature" });
      return;
    }
    setReportOpen(true);
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
    const out = {};
    for (const src of [proximityData, dataB]) {
      for (const [cat, list] of Object.entries(src?.categories || {})) {
        const seen = new Set((out[cat]?.features || []).map((f) => f.id));
        out[cat] = { features: [...(out[cat]?.features || []), ...list.filter((f) => !seen.has(f.id))] };
      }
    }
    return out;
  }, [proximityData, dataB]);

  const counts = proximityData?.counts || {};
  const focusPoi = (poi) => setView({ center: [poi.lat, poi.lon], zoom: 17 });
  const capturing = clickPinMode || Array.isArray(drawPoints);
  const aiContext = useMemo(
    () => buildAIContext({ pin, radius, property, propertyB, proximityData, dataB, env }),
    [pin, radius, property, propertyB, proximityData, dataB, env]
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0b0f17]">
      <TopBar
        basemap={basemap}
        setBasemap={setBasemap}
        pin={pin}
        onShare={onShare}
        onPrint={onPrint}
        sharing={sharing}
        isPro={pro}
        onUpgrade={() => setUpgrade({ reason: "Unlock GeoPulse Pro" })}
        onSignIn={() => setAuthOpen(true)}
        onBranding={() => setBrandingOpen(true)}
      />
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
          trafficEnabled={trafficCfg.enabled}
        />
        <div className={`relative flex-1 min-w-0 ${capturing ? "map-capture-mode" : ""}`}>
          <MapView
            basemap={basemap}
            view={view}
            pin={pin}
            onMapClick={onMapClick}
            clickPinMode={clickPinMode}
            drawPoints={drawPoints}
            drawTarget={drawTarget}
            property={property}
            propertyB={propertyB}
            radius={radius}
            layerData={layerData}
            layerVisibility={visibility}
            layerOpacity={opacity}
            customLayers={customLayers}
            onPoiClick={focusPoi}
            trafficTileUrl={trafficCfg.enabled ? TRAFFIC_TILE_URL : null}
          />
          <Legend visibility={visibility} counts={counts} customLayers={customLayers} />
          <AIAnalyst context={aiContext} pro={pro} onUpgrade={(reason) => setUpgrade({ reason })} />
          {capturing && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-amber-400/30 bg-slate-900/90 px-4 py-1.5 backdrop-blur-xl">
              <span className="font-mono text-xs uppercase tracking-widest text-amber-300" data-testid="capture-hint">
                {Array.isArray(drawPoints) ? "Click to place property corners" : "Click anywhere on the map"}
              </span>
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
          env={env}
          propertyTools={propertyTools}
          compare={{ propertyB, dataB, loadingB }}
        />
      </div>
      <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} onCreated={onCreatedCustom} />
      <PrintReport
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        pin={pin}
        radius={radius}
        property={property}
        propertyB={propertyB}
        proximityData={proximityData}
        dataB={dataB}
        env={env}
        branding={user?.branding}
        aiContext={aiContext}
      />
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      {brandingOpen && <BrandingDialog open onOpenChange={setBrandingOpen} />}
      <UpgradeDialog
        open={!!upgrade}
        onOpenChange={(v) => !v && setUpgrade(null)}
        reason={upgrade?.reason}
        onBeforeCheckout={() => pin && stashResumeState(snapshotState())}
      />
    </div>
  );
}
