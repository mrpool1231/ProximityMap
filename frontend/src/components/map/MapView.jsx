import { MapContainer, TileLayer, Marker, Circle, Polygon, Polyline, CircleMarker, GeoJSON, useMap, useMapEvents } from "react-leaflet";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { BASEMAPS, LAYER_BY_ID } from "@/lib/mapConfig";
import { propertyBuffer } from "@/lib/geo";
import { renderToStaticMarkup } from "react-dom/server";
import { MapPin } from "lucide-react";

// Fix default marker icons for CRA/webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function makePoiIcon(color, IconComp) {
  const html = renderToStaticMarkup(
    <div className="poi-marker" style={{ background: color }}>
      <IconComp size={12} color="#0b0f17" strokeWidth={2.75} />
    </div>
  );
  return L.divIcon({ html, className: "", iconSize: [24, 24], iconAnchor: [12, 12] });
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function makePinIcon() {
  const html = `<div class="pin-marker-wrap"><span class="pin-pulse"></span><span class="pin-marker-dot"></span></div>`;
  return L.divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });
}

function MapClickHandler({ onClick, enabled }) {
  const map = useMap();
  useEffect(() => {
    if (enabled) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [enabled, map]);
  useMapEvents({
    click(e) {
      if (enabled) onClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function Recenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.75 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.[0], center?.[1], zoom]);
  return null;
}

const PROPERTY_STYLE = { color: "#F59E0B", weight: 2, fillColor: "#F59E0B", fillOpacity: 0.18 };
const PROPERTY_B_STYLE = { color: "#2DD4BF", weight: 2, fillColor: "#2DD4BF", fillOpacity: 0.18 };
const BUFFER_STYLE = { color: "#38BDF8", weight: 1.5, fillColor: "#38BDF8", fillOpacity: 0.08, dashArray: "4 6" };
const BUFFER_B_STYLE = { color: "#2DD4BF", weight: 1.5, fillColor: "#2DD4BF", fillOpacity: 0.06, dashArray: "4 6" };

export function BufferOverlay({ pin, radius, property, variant = "A" }) {
  const buffer = useMemo(() => (property ? propertyBuffer(property, radius) : null), [property, radius]);
  const isB = variant === "B";
  if (property) {
    return (
      <>
        <GeoJSON key={`${variant}-${radius}-${property.length}-${property[0]}`} data={buffer} style={isB ? BUFFER_B_STYLE : BUFFER_STYLE} />
        <Polygon positions={property} pathOptions={isB ? PROPERTY_B_STYLE : PROPERTY_STYLE} />
      </>
    );
  }
  return pin && radius > 0 ? <Circle center={pin} radius={radius} pathOptions={BUFFER_STYLE} /> : null;
}

const PoiMarker = memo(function PoiMarker({ feature, layerId, meta, opacity, icon, onPoiClick }) {
  const handleClick = useCallback(() => onPoiClick?.({ ...feature, layer: meta }), [feature, meta, onPoiClick]);
  return (
    <Marker
      position={[feature.lat, feature.lon]}
      icon={icon}
      opacity={opacity}
      eventHandlers={{ click: handleClick }}
    />
  );
});

export default function MapView({
  basemap = "dark",
  view,
  pin,
  pins = [],
  onMapClick,
  clickPinMode,
  drawPoints,
  drawTarget,
  property,
  propertyB,
  radius,
  layerData, // { [layerId]: { features: [...] } }
  layerVisibility,
  layerOpacity,
  customLayers,
  onPoiClick,
  trafficTileUrl,
}) {
  const bm = BASEMAPS[basemap] || BASEMAPS.dark;
  const iconCache = useRef({});

  const getIcon = (layerId, color, IconComp) => {
    const key = `${layerId}-${color}`;
    if (!iconCache.current[key]) iconCache.current[key] = makePoiIcon(color, IconComp);
    return iconCache.current[key];
  };

  const pinIcon = useMemo(() => makePinIcon(), []);
  const drawing = Array.isArray(drawPoints);
  const drawColor = drawTarget === "B" ? "#2DD4BF" : "#F59E0B";

  return (
    <MapContainer
      center={view.center}
      zoom={view.zoom}
      className="h-full w-full"
      zoomControl={true}
      preferCanvas={true}
      data-testid="map-container"
    >
      <TileLayer key={basemap} url={bm.url} attribution={bm.attribution} className={bm.className || ""} />
      {bm.overlay && <TileLayer key={`${basemap}-overlay`} url={bm.overlay} zIndex={350} />}
      {trafficTileUrl && layerVisibility.traffic && (
        <TileLayer
          key="traffic"
          url={trafficTileUrl}
          opacity={(layerOpacity.traffic ?? 60) / 100}
          zIndex={400}
          maxZoom={22}
          attribution='Traffic &copy; <a href="https://www.tomtom.com/">TomTom</a>'
        />
      )}

      <Recenter center={view.center} zoom={view.zoom} />
      <MapClickHandler enabled={clickPinMode || drawing} onClick={onMapClick} />

      {(pins.length ? pins : (pin ? [{ id: "active", coords: pin }] : [])).map((p) => (
        <Marker key={p.id} position={p.coords} icon={pinIcon} />
      ))}
      {(pins.length ? pins : (pin ? [{ id: "active", coords: pin }] : [])).map((p) => (
        <BufferOverlay key={`buffer-${p.id}`} pin={p.coords} radius={radius} />
      ))}
      {!pins.length && <BufferOverlay pin={pin} radius={radius} property={property} />}
      {propertyB && <BufferOverlay radius={radius} property={propertyB} variant="B" />}

      {drawing && drawPoints.length > 0 && (
        <>
          <Polyline positions={drawPoints.length > 2 ? [...drawPoints, drawPoints[0]] : drawPoints} pathOptions={{ color: drawColor, weight: 2, dashArray: "6 4" }} />
          {drawPoints.map((p, i) => (
            <CircleMarker key={i} center={p} radius={5} pathOptions={{ color: "#0b0f17", fillColor: drawColor, fillOpacity: 1, weight: 1.5 }} />
          ))}
        </>
      )}

      {Object.entries(layerData || {}).map(([lid, data]) => {
        if (!layerVisibility[lid] || !data?.features?.length) return null;
        const meta = LAYER_BY_ID[lid];
        if (!meta) return null;
        const IconComp = meta.icon || MapPin;
        const opacity = (layerOpacity[lid] ?? 100) / 100;
        const icon = getIcon(lid, meta.color, IconComp);
        return data.features.map((f) => (
          <PoiMarker
            key={`${lid}-${f.id}`}
            feature={f}
            layerId={lid}
            meta={meta}
            icon={icon}
            opacity={opacity}
            onPoiClick={onPoiClick}
          />
        ));
      })}

      {customLayers?.map(
        (cl) =>
          cl.visible && (
            <GeoJSON
              key={cl.id}
              data={cl.geojson}
              style={{ color: cl.color, weight: 2, fillOpacity: 0.35 * ((cl.opacity ?? 100) / 100), opacity: (cl.opacity ?? 100) / 100 }}
              pointToLayer={(feature, latlng) =>
                L.circleMarker(latlng, {
                  radius: 6,
                  fillColor: cl.color,
                  color: "#0b0f17",
                  weight: 1.5,
                  fillOpacity: (cl.opacity ?? 100) / 100,
                })
              }
              onEachFeature={(feature, layer) => {
                const props = feature.properties || {};
                const html = `<div class="text-sm"><div class="font-semibold text-sky-400">${escapeHtml(cl.name)}</div>${Object.entries(props)
                  .slice(0, 6)
                  .map(([k, v]) => `<div><span class="text-slate-400">${escapeHtml(k)}:</span> ${escapeHtml(v)}</div>`)
                  .join("")}</div>`;
                layer.bindPopup(html);
              }}
            />
          )
      )}
    </MapContainer>
  );
}
