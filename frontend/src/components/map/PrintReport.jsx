import { createPortal } from "react-dom";
import { MapContainer, TileLayer, Marker, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Printer, X, Compass } from "lucide-react";
import { LAYER_BY_ID } from "@/lib/mapConfig";
import { propertyBuffer, bufferBounds } from "@/lib/geo";
import { BufferOverlay } from "@/components/map/MapView";

const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);

function Stat({ label, value, unit }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{label}</div>
      <div className="font-mono text-lg font-semibold text-slate-900">
        {value ?? "—"}
        {value != null && unit && <span className="ml-1 text-xs text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

export default function PrintReport({ open, onClose, pin, radius, property, proximityData, env }) {
  if (!open || !pin) return null;
  const bounds = property ? bufferBounds(propertyBuffer(property, radius)) : L.latLng(pin).toBounds(radius * 2.3);
  const w = env?.weather?.current;
  const a = env?.aqi?.current;
  const elev = env?.elev?.elevation?.[0];
  const cats = Object.entries(proximityData?.categories || {}).filter(([, l]) => l.length > 0);
  const pinIcon = L.divIcon({ html: `<div style="width:14px;height:14px;border-radius:999px;background:#0284c7;border:3px solid #fff;box-shadow:0 0 0 2px #0284c7"></div>`, className: "", iconSize: [14, 14], iconAnchor: [7, 7] });

  return createPortal(
    <div id="print-report" className="fixed inset-0 z-[100] overflow-auto bg-slate-100 text-slate-900" data-testid="print-report">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
        <span className="text-sm text-slate-600">Preview — use “Save as PDF” in the print dialog for a PDF brief.</span>
        <div className="flex gap-2">
          <Button onClick={() => window.print()} className="h-9 bg-sky-600 text-white hover:bg-sky-500" data-testid="print-now-button">
            <Printer size={14} className="mr-2" /> Print / Save PDF
          </Button>
          <Button variant="outline" onClick={onClose} className="h-9 border-slate-300 bg-white text-slate-700 hover:bg-slate-100" data-testid="close-report-button">
            <X size={14} />
          </Button>
        </div>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-10 py-8 print:px-0 print:py-0">
        <header className="mb-6 flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">
              <Compass size={12} /> GeoPulse Studio
            </div>
            <h1 className="font-heading text-3xl font-bold tracking-tight" data-testid="report-title">Property Brief</h1>
          </div>
          <div className="text-right font-mono text-xs text-slate-600">
            <div>{new Date().toLocaleString()}</div>
            <div>{pin[0].toFixed(5)}, {pin[1].toFixed(5)}</div>
            <div>Buffer {fmtDist(radius)} · {property ? "from property line" : "from center point"}</div>
          </div>
        </header>

        <div className="print-map mb-6 overflow-hidden rounded-xl border border-slate-300" style={{ height: 340 }}>
          <MapContainer bounds={bounds} className="h-full w-full" zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} keyboard={false} preferCanvas>
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" className="map-tiles-light" />
            <BufferOverlay pin={pin} radius={radius} property={property} />
            <Marker position={pin} icon={pinIcon} />
            {cats.flatMap(([cat, list]) =>
              list.map((p) => (
                <CircleMarker key={`${cat}-${p.id}`} center={[p.lat, p.lon]} radius={5} pathOptions={{ color: "#fff", weight: 1.5, fillColor: LAYER_BY_ID[cat]?.color, fillOpacity: 1 }} />
              ))
            )}
          </MapContainer>
        </div>

        <section className="mb-6 grid grid-cols-5 gap-2">
          <Stat label="Temperature" value={w?.temperature_2m} unit="°C" />
          <Stat label="Humidity" value={w?.relative_humidity_2m} unit="%" />
          <Stat label="Wind" value={w?.wind_speed_10m} unit="km/h" />
          <Stat label="US AQI" value={a?.us_aqi} />
          <Stat label="Elevation" value={elev != null ? Math.round(elev) : null} unit="m" />
        </section>

        <section className="mb-4 flex items-baseline justify-between">
          <h2 className="font-heading text-lg font-semibold">Nearby amenities</h2>
          <span className="font-mono text-xs text-slate-500" data-testid="report-total">{proximityData?.total ?? 0} places within buffer</span>
        </section>

        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          {cats.map(([cat, list]) => {
            const meta = LAYER_BY_ID[cat];
            return (
              <div key={cat} className="break-inside-avoid">
                <div className="mb-1.5 flex items-center gap-2 border-b border-slate-200 pb-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta?.color }} />
                  <span className="text-sm font-semibold">{meta?.label || cat}</span>
                  <span className="ml-auto font-mono text-xs text-slate-500">{list.length}</span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {list.slice(0, 10).map((p) => (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="py-1 pr-2 text-slate-700">{p.name}</td>
                        <td className="py-1 text-right font-mono text-slate-900">{fmtDist(p.distance_m)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {list.length > 10 && <div className="pt-1 font-mono text-[10px] text-slate-400">+ {list.length - 10} more</div>}
              </div>
            );
          })}
          {cats.length === 0 && <p className="col-span-2 text-sm text-slate-500">No amenity layers active. Enable POI layers to include them in the brief.</p>}
        </div>

        <footer className="mt-8 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
          Map data © OpenStreetMap contributors · Weather, air quality & elevation via Open-Meteo · Distances are straight-line{property ? " from the property boundary" : " from the analysis center"}.
        </footer>
      </article>
    </div>,
    document.body
  );
}
