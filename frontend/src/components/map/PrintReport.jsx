import { createPortal } from "react-dom";
import { MapContainer, TileLayer, Marker, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Printer, X, Compass } from "lucide-react";
import { LAYER_BY_ID } from "@/lib/mapConfig";
import { propertyBuffer, bufferBounds } from "@/lib/geo";
import { BufferOverlay } from "@/components/map/MapView";
import { authApi } from "@/lib/api";
import AISummary from "@/components/map/AISummary";

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

export default function PrintReport({ open, onClose, pin, radius, property, propertyB, proximityData, dataB, env, branding, aiContext }) {
  if (!open || !pin) return null;
  const bufferA = property ? propertyBuffer(property, radius) : null;
  let bounds = bufferA ? bufferBounds(bufferA) : L.latLng(pin).toBounds(radius * 2.3);
  if (propertyB) bounds = L.latLngBounds(bounds).extend(L.latLngBounds(bufferBounds(propertyBuffer(propertyB, radius))));
  const w = env?.weather?.current;
  const a = env?.aqi?.current;
  const elev = env?.elev?.elevation?.[0];
  const cats = Object.entries(proximityData?.categories || {}).filter(([, l]) => l.length > 0);
  const catsB = Object.entries(dataB?.categories || {}).filter(([, l]) => l.length > 0);
  const hasBrand = branding && (branding.logo_path || branding.company || branding.contact_name);
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
        {hasBrand && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3" data-testid="report-branding">
            <div className="flex items-center gap-4">
              {branding.logo_path && <img src={authApi.logoUrl(branding.logo_version)} alt="" className="max-h-12 max-w-[140px] object-contain" data-testid="report-logo" />}
              <div>
                {branding.company && <div className="font-heading text-base font-bold">{branding.company}</div>}
                {branding.tagline && <div className="text-xs text-slate-500">{branding.tagline}</div>}
              </div>
            </div>
            <div className="text-right text-xs text-slate-600">
              {branding.contact_name && <div className="font-semibold text-slate-800">{branding.contact_name}</div>}
              {branding.phone && <div>{branding.phone}</div>}
              {branding.email && <div>{branding.email}</div>}
              {branding.website && <div>{branding.website}</div>}
            </div>
          </div>
        )}
        <header className="mb-6 flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">
              <Compass size={12} /> MapApp
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
            {propertyB && <BufferOverlay radius={radius} property={propertyB} variant="B" />}
            <Marker position={pin} icon={pinIcon} />
            {[...new Map([...cats, ...catsB].flatMap(([cat, list]) => list.map((p) => [`${cat}-${p.id}`, [cat, p]]))).entries()].map(([key, [cat, p]]) => (
              <CircleMarker key={key} center={[p.lat, p.lon]} radius={5} pathOptions={{ color: "#fff", weight: 1.5, fillColor: LAYER_BY_ID[cat]?.color, fillOpacity: 1 }} />
            ))}
          </MapContainer>
        </div>

        {propertyB && dataB && (
          <section className="mb-6 break-inside-avoid" data-testid="report-compare">
            <h2 className="mb-2 font-heading text-lg font-semibold">Property A vs Property B</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-left text-[10px] font-mono uppercase tracking-widest text-slate-500">
                  <th className="py-1">Category</th>
                  <th className="py-1 text-right text-amber-600">A · count / nearest</th>
                  <th className="py-1 text-right text-teal-600">B · count / nearest</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys({ ...proximityData?.categories, ...dataB.categories }).map((cat) => {
                  const la = proximityData?.categories?.[cat] || [];
                  const lb = dataB.categories?.[cat] || [];
                  return (
                    <tr key={cat} className="border-b border-slate-100">
                      <td className="py-1">{LAYER_BY_ID[cat]?.label || cat}</td>
                      <td className="py-1 text-right font-mono">{la.length} / {la[0] ? fmtDist(la[0].distance_m) : "—"}</td>
                      <td className="py-1 text-right font-mono">{lb.length} / {lb[0] ? fmtDist(lb[0].distance_m) : "—"}</td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td className="py-1">Total</td>
                  <td className="py-1 text-right font-mono">{proximityData?.total ?? 0}</td>
                  <td className="py-1 text-right font-mono">{dataB.total}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        <section className="mb-6 grid grid-cols-5 gap-2">
          <Stat label="Temperature" value={w?.temperature_2m} unit="°C" />
          <Stat label="Humidity" value={w?.relative_humidity_2m} unit="%" />
          <Stat label="Wind" value={w?.wind_speed_10m} unit="km/h" />
          <Stat label="US AQI" value={a?.us_aqi} />
          <Stat label="Elevation" value={elev != null ? Math.round(elev) : null} unit="m" />
        </section>

        <AISummary context={aiContext} />

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
