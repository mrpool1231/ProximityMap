import { MapContainer, TileLayer, Marker, Circle, GeoJSON, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { BASEMAPS, LAYER_BY_ID } from "@/lib/mapConfig";
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

function makePinIcon() {
  const html = `<div class="pin-marker-wrap"><span class="pin-pulse"></span><span class="pin-marker-dot"></span></div>`;
  return L.divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });
}

function MapClickHandler({ onClick, enabled }) {
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

export default function MapView({
  basemap = "dark",
  center,
  zoom,
  pin,
  onMapClick,
  clickPinMode,
  radius,
  layerData, // { [layerId]: { features: [...] } }
  layerVisibility,
  layerOpacity,
  customLayers,
  onPoiClick,
}) {
  const bm = BASEMAPS[basemap] || BASEMAPS.dark;
  const iconCache = useRef({});

  const getIcon = (layerId, color, IconComp) => {
    const key = `${layerId}-${color}`;
    if (!iconCache.current[key]) iconCache.current[key] = makePoiIcon(color, IconComp);
    return iconCache.current[key];
  };

  const pinIcon = useMemo(() => makePinIcon(), []);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="h-full w-full"
      zoomControl={true}
      preferCanvas={true}
      data-testid="map-container"
    >
      <TileLayer key={basemap} url={bm.url} attribution={bm.attribution} className={bm.className || ""} />

      <Recenter center={pin || center} zoom={zoom} />
      <MapClickHandler enabled={clickPinMode} onClick={onMapClick} />

      {pin && (
        <>
          <Marker position={pin} icon={pinIcon} />
          {radius > 0 && (
            <Circle
              center={pin}
              radius={radius}
              pathOptions={{
                color: "#38BDF8",
                weight: 1.5,
                fillColor: "#38BDF8",
                fillOpacity: 0.08,
                dashArray: "4 6",
              }}
            />
          )}
        </>
      )}

      {Object.entries(layerData || {}).map(([lid, data]) => {
        if (!layerVisibility[lid] || !data?.features?.length) return null;
        const meta = LAYER_BY_ID[lid];
        if (!meta) return null;
        const IconComp = meta.icon || MapPin;
        const opacity = (layerOpacity[lid] ?? 100) / 100;
        return data.features.map((f) => (
          <Marker
            key={`${lid}-${f.id}`}
            position={[f.lat, f.lon]}
            icon={getIcon(lid, meta.color, IconComp)}
            opacity={opacity}
            eventHandlers={{ click: () => onPoiClick?.({ ...f, layer: meta }) }}
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
                const html = `<div class="text-sm"><div class="font-semibold text-sky-400">${cl.name}</div>${Object.entries(props)
                  .slice(0, 6)
                  .map(([k, v]) => `<div><span class="text-slate-400">${k}:</span> ${v}</div>`)
                  .join("")}</div>`;
                layer.bindPopup(html);
              }}
            />
          )
      )}
    </MapContainer>
  );
}
