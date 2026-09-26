import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import MapView from "@/components/map/MapView";
import LayerSidebar from "@/components/map/LayerSidebar";
import ProximityPanel from "@/components/map/ProximityPanel";
import TopBar from "@/components/map/TopBar";
import Legend from "@/components/map/Legend";
import UpgradeDialog from "@/components/map/UpgradeDialog";

// Load secondary tools only when the workstation needs them. This keeps the
// initial map bundle smaller and lets the map/UI render before these features.
const UploadModal = lazy(() => import("@/components/map/UploadModal"));
const PrintReport = lazy(() => import("@/components/map/PrintReport"));
const AuthDialog = lazy(() => import("@/components/map/AuthDialog"));
const BrandingDialog = lazy(() => import("@/components/map/BrandingDialog"));
const AIAnalyst = lazy(() => import("@/components/map/AIAnalyst"));
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
import { ChevronLeft, ChevronRight } from "lucide-react";

const ALL_LAYERS = [...POI_LAYERS, ...ENV_LAYERS, ...CONCEPT_LAYERS];

const initialVisibility = () => {
  const v = {};
  ALL_LAYERS.forEach((l) => {
    v[l.id] = false;
  });
  return v;
};

const FREE_RADIUS_METERS = 152.4; // 500 ft

const initialOpacity = () => {
  const o = {};
  ALL_LAYERS.forEach((l) => (o[l.id] = 85));
  return o;
};

export default function MapWorkstation() {
  const [basemap, setBasemap] = useState("dark");
  const [view, setView] = useState({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
  const [pin, setPin] = useState(null);
  const [pins, setPins] = useState([]);
  const [activePinId, setActivePinId] = useState(null);
  const [radius, setRadius] = useState(FREE_RADIUS_METERS);
  const [clickPinMode, setClickPinMode] = useState(false);
  const [property, setProperty] = useState(null); // [[lat, lon], ...]
  const [propertyB, setPropertyB] = useState(null);
  const [drawPoints, setDrawPoints] = useState(null); // null = not drawing
  const [drawTarget, setDrawTarget] = useState("A");
  const [dataB, setDataB] = useState(null);
  const [loadingB, setLoadingB] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [locating, setLocating] = useState(false);
  const [mobileLayersOpen, setMobileLayersOpen] = useState(false);
  const [mobileAnalysisOpen, setMobileAnalysisOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(true);
  const [analysisOpen, setAnalysisOpen] = useState(true);

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
  const effectiveRadius = pro ? radius : FREE_RADIUS_METERS;

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
      if (s.radius) setRadius(pro ? s.radius : Math.min(s.radius, FREE_RADIUS_METERS));
      setPropertyB(s.propertyB?.length >= 3 ? s.propertyB : null);
      if (s.pins?.length) {
        setPins(s.pins);
        const active = s.activePinId && s.pins.find((p) => p.id === s.activePinId) ? s.activePinId : s.pins[0].id;
        const activePin = s.pins.find((p) => p.id === active);
        setActivePinId(active);
        setPin(activePin?.coords || s.pin || null);
        if (activePin?.coords) setView({ center: activePin.coords, zoom: s.zoom || 15 });
      } else if (s.property?.length >= 3) applyProperty(s.property, s.zoom || 16);
      else if (s.pin) {
        setPin(s.pin);
        setView({ center: s.pin, zoom: s.zoom || 15 });
      }
    },
    [applyProperty, pro]
  );

  useEffect(() => {
    // Let the map paint first. These are secondary data sources and should not
    // compete with the initial map/UI render.
    const run = () => {
      listCustomLayers()
        .then((rows) => setCustomLayers(rows.map((r) => ({ ...r, visible: true, opacity: 100 }))))
        .catch(() => {});
      fetchTrafficConfig().then(setTrafficCfg).catch(() => {});
    };
    const idle = window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 1200 }) : setTimeout(run, 150);
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
    return () => {
      if (window.cancelIdleCallback && typeof idle === "number") window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
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
    const timer = setTimeout(() => {
      fetchPOIs({ lat: pin[0], lon: pin[1], radius: Math.round(effectiveRadius + reach), categories: activePoiLayers })
        .then((d) => alive && setProximityData(property ? applyPropertyDistances(d, property, radius) : d))
        .catch(() => alive && toast.error("Live place data is unavailable right now"))
        .finally(() => alive && setLoadingPois(false));
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.[0], pin?.[1], effectiveRadius, activePoiLayers.join(","), property, retryTick]);

  // Property B (comparison) POIs
  useEffect(() => {
    if (!propertyB || activePoiLayers.length === 0) {
      setDataB(null);
      return;
    }
    let alive = true;
    setLoadingB(true);
    const [lat, lon] = propertyCentroid(propertyB);
    const timer = setTimeout(() => {
      fetchPOIs({ lat, lon, radius: Math.round(effectiveRadius + propertyReach(propertyB)), categories: activePoiLayers })
        .then((d) => alive && setDataB(applyPropertyDistances(d, propertyB, radius)))
        .catch(() => alive && toast.error("Property B: live place data unavailable"))
        .finally(() => alive && setLoadingB(false));
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyB, effectiveRadius, activePoiLayers.join(","), retryTick]);

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
  const selectAll = () => setVisibility(Object.fromEntries(ALL_LAYERS.map((l) => [l.id, l.id === "traffic" ? trafficCfg.enabled : true])));
  const hideAll = () => setVisibility(Object.fromEntries(ALL_LAYERS.map((l) => [l.id, false])));

  // Hard-enforce the Free radius limit at the state boundary. This protects
  // against sliders, presets, restored reports, or any other caller setting
  // a radius above 500 ft. Pro users retain the requested radius.
  useEffect(() => {
    if (!pro && radius > FREE_RADIUS_METERS) {
      setRadius(FREE_RADIUS_METERS);
    }
  }, [pro, radius]);

  const handleRadiusChange = useCallback((nextRadius) => {
    const safeRadius = Number.isFinite(nextRadius) ? nextRadius : FREE_RADIUS_METERS;
    if (!pro && safeRadius > FREE_RADIUS_METERS) {
      setRadius(FREE_RADIUS_METERS);
      setUpgrade({ reason: "An adjustable radius is a Pro feature. Free accounts are limited to 500 ft." });
      return;
    }
    setRadius(pro ? safeRadius : Math.min(safeRadius, FREE_RADIUS_METERS));
  }, [pro]);

  const placePin = (coords, zoom) => {
    setProperty(null);
    setPropertyB(null);
    if (pro) {
      const id = `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setPins((prev) => [...prev, { id, coords }]);
      setActivePinId(id);
    } else {
      setPins([]);
      setActivePinId(null);
    }
    setPin(coords);
    setView({ center: coords, zoom: zoom ?? view.zoom });
  };

  const selectPin = (id) => {
    const selected = pins.find((p) => p.id === id);
    if (!selected) return;
    setActivePinId(id);
    setPin(selected.coords);
    setProperty(null);
    setView({ center: selected.coords, zoom: Math.max(view.zoom, 15) });
  };

  const removePin = (id) => {
    setPins((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (id === activePinId) {
        const nextActive = next[0];
        setActivePinId(nextActive?.id ?? null);
        setPin(nextActive?.coords ?? null);
        if (nextActive) setView({ center: nextActive.coords, zoom: Math.max(view.zoom, 15) });
        else setProperty(null);
      }
      return next;
    });
  };

  const clearPins = () => {
    setPins([]);
    setActivePinId(null);
    setPin(null);
    setProperty(null);
    setPropertyB(null);
  };
  const onMapClick = (coords) => {
    if (Array.isArray(drawPoints)) {
      setDrawPoints([...drawPoints, coords]);
      return;
    }
    placePin(coords);
    setClickPinMode(false);
    toast.success(pro ? `Location ${pins.length + 1} added` : "Pin dropped", {
      description: `${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`,
    });
  };
  const onSearchSelect = (coords, label) => {
    placePin(coords, 15);
    toast.success("Location set", { description: label?.split(",").slice(0, 2).join(",") });
  };

  const onUseLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location is not supported by this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = [coords.latitude, coords.longitude];
        placePin(next, 16);
        setClickPinMode(false);
        toast.success("Current location set", { description: `${next[0].toFixed(4)}, ${next[1].toFixed(4)}` });
        setLocating(false);
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied"
          : error.code === error.POSITION_UNAVAILABLE
            ? "Your location is currently unavailable"
            : "Could not determine your location";
        toast.error(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
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
    pins: pro ? pins : [],
    activePinId: pro ? activePinId : null,
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
        // Only render POIs that are actually inside the active analysis radius.
        // Property comparisons can request a larger search envelope, so filter
        // here as the final visual guardrail.
        const visible = list.filter((f) => Number(f.distance_m) <= effectiveRadius + 0.5 && !seen.has(f.id));
        out[cat] = { features: [...(out[cat]?.features || []), ...visible] };
      }
    }
    return out;
  }, [proximityData, dataB, effectiveRadius]);

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
        onUpgrade={() => setUpgrade({ reason: "Unlock ProximityMap Pro" })}
        onSignIn={() => setAuthOpen(true)}
        onBranding={() => setBrandingOpen(true)}
        onToggleLayers={() => setMobileLayersOpen((v) => !v)}
        onToggleAnalysis={() => setMobileAnalysisOpen((v) => !v)}
      />
      <div className="flex flex-1 min-h-0">
        <div
          className={`relative shrink-0 overflow-visible transition-[width] duration-300 ease-in-out ${layersOpen ? "w-80" : "w-0"}`}
          data-testid="layers-panel-container"
        >
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
            mobileOpen={mobileLayersOpen}
            onMobileClose={() => setMobileLayersOpen(false)}
            desktopOpen={layersOpen}
          />
          <button
            type="button"
            onClick={() => setLayersOpen((v) => !v)}
            className={`absolute top-1/2 z-50 hidden h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-white/10 bg-[#0b0f17]/95 text-slate-300 shadow-xl backdrop-blur-xl transition-all duration-300 hover:bg-slate-800 hover:text-sky-300 md:flex ${layersOpen ? "right-0 translate-x-full" : "left-0"}`}
            aria-label={layersOpen ? "Collapse layer control" : "Open layer control"}
            title={layersOpen ? "Collapse layers" : "Open layers"}
            data-testid="toggle-layers-panel"
          >
            {layersOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </button>
        </div>
        <div className={`relative flex-1 min-w-0 ${capturing ? "map-capture-mode" : ""}`}>
          <MapView
            basemap={basemap}
            view={view}
            pin={pin}
            pins={pins}
            onMapClick={onMapClick}
            clickPinMode={clickPinMode}
            drawPoints={drawPoints}
            drawTarget={drawTarget}
            property={property}
            propertyB={propertyB}
            radius={effectiveRadius}
            layerData={layerData}
            layerVisibility={visibility}
            layerOpacity={opacity}
            customLayers={customLayers}
            onPoiClick={focusPoi}
            trafficTileUrl={trafficCfg.enabled ? TRAFFIC_TILE_URL : null}
          />
          <Legend visibility={visibility} counts={counts} customLayers={customLayers} />
          <Suspense fallback={null}>
            <AIAnalyst context={aiContext} pro={pro} onUpgrade={(reason) => setUpgrade({ reason })} />
          </Suspense>
          {capturing && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-amber-400/30 bg-slate-900/90 px-4 py-1.5 backdrop-blur-xl">
              <span className="font-mono text-xs uppercase tracking-widest text-amber-300" data-testid="capture-hint">
                {Array.isArray(drawPoints) ? "Click to place property corners" : "Click anywhere on the map"}
              </span>
            </div>
          )}
        </div>
        <div
          className={`relative shrink-0 overflow-visible transition-[width] duration-300 ease-in-out ${analysisOpen ? "w-96" : "w-0"}`}
          data-testid="analysis-panel-container"
        >
          <ProximityPanel
            pin={pin}
            pins={pins}
            activePinId={activePinId}
            onSelectPin={selectPin}
            onRemovePin={removePin}
            onClearPins={clearPins}
            pro={pro}
            radius={effectiveRadius}
            onRadiusChange={handleRadiusChange}
            onUpgrade={(reason) => setUpgrade({ reason })}
            onSearchSelect={onSearchSelect}
            clickPinMode={clickPinMode}
            setClickPinMode={setClickPinMode}
            proximityData={proximityData}
            loading={loadingPois}
            onFocusPoi={focusPoi}
            env={env}
            propertyTools={propertyTools}
            compare={{ propertyB, dataB, loadingB }}
            onRetry={() => setRetryTick((t) => t + 1)}
            onUseLocation={onUseLocation}
            locating={locating}
            visibility={visibility}
            mobileOpen={mobileAnalysisOpen}
            onMobileClose={() => setMobileAnalysisOpen(false)}
            desktopOpen={analysisOpen}
          />
          <button
            type="button"
            onClick={() => setAnalysisOpen((v) => !v)}
            className={`absolute top-1/2 z-50 hidden h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-white/10 bg-[#0b0f17]/95 text-slate-300 shadow-xl backdrop-blur-xl transition-all duration-300 hover:bg-slate-800 hover:text-amber-300 md:flex ${analysisOpen ? "left-0 -translate-x-full" : "right-0"}`}
            aria-label={analysisOpen ? "Collapse proximity analysis" : "Open proximity analysis"}
            title={analysisOpen ? "Collapse analysis" : "Open analysis"}
            data-testid="toggle-analysis-panel"
          >
            {analysisOpen ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>
      </div>
      <Suspense fallback={null}>
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
      </Suspense>
      <UpgradeDialog
        open={!!upgrade}
        onOpenChange={(v) => !v && setUpgrade(null)}
        reason={upgrade?.reason}
        onBeforeCheckout={() => pin && stashResumeState(snapshotState())}
      />
    </div>
  );
}
