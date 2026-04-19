/**
 * LOCWISE — Step 4: Interactive Map + Address Search
 *
 * AI Acknowledgement:
 * This file was developed with AI assistance (Claude by Anthropic) for:
 *  - Adding the autoAdvance flag so address search bypasses the manual pin step
 *    (root cause: search called onPin without the flag, user still had to click "Continue")
 *  - Wiring Nominatim geocoding (OpenStreetMap, AU-restricted) for suburb/address lookup
 *  - Fixing the HUD banner to show green confirmation when pin is set
 *
 * How it works:
 *  - Two ways to pin: click on map (no auto-advance) or search address (auto-advances to Step 5)
 *  - Nominatim geocoding is rate-limited to 1 req/s by OSM policy — debounce is 500ms
 *  - FlyTo animation handled by inner FlyController component (can't call map methods outside)
 *  - onPin(pos, true) triggers both setPin in Index.tsx and setStep(5) after analysis completes
 */

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, useMapEvents, useMap, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Step4Props {
  initialCenter: { lat: number; lng: number };
  pin: { lat: number; lng: number } | null;
  onPin: (pos: { lat: number; lng: number }, autoAdvance?: boolean) => void;
}

const pinIcon = L.divIcon({
  className: "site-intel-pin",
  html: `
    <div style="position:relative; width:32px; height:32px;">
      <div style="position:absolute; inset:0; border-radius:50%; background:hsl(12 78% 48% / 0.25); animation:pulse-ring 1.6s ease-out infinite;"></div>
      <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:18px; height:18px; background:hsl(12 78% 48%); border:2.5px solid hsl(38 30% 96%); border-radius:50%; box-shadow:0 4px 12px hsl(215 40% 10% / 0.3);"></div>
      <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:5px; height:5px; background:hsl(38 30% 96%); border-radius:50%;"></div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

interface GeoSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

// Flies to a new center whenever flyTarget changes
const FlyTo = ({ center }: { center: { lat: number; lng: number } }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo([center.lat, center.lng], 15, { duration: 1.2 });
  }, [center.lat, center.lng, map]);
  return null;
};

const ClickHandler = ({ onPin }: { onPin: (p: { lat: number; lng: number }) => void }) => {
  useMapEvents({
    click: (e) => onPin({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
};

export const Step4Map = ({ initialCenter, pin, onPin }: Step4Props) => {
  // flyTarget drives the FlyTo animation — updated by both parent center changes and in-map search
  const [flyTarget, setFlyTarget] = useState(initialCenter);
  const [searchVal, setSearchVal] = useState("");
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  // Keep flyTarget in sync when parent selects a new suburb (Step3City)
  useEffect(() => {
    setFlyTarget(initialCenter);
  }, [initialCenter.lat, initialCenter.lng]);

  // Debounced autocomplete — restrict to Australia
  useEffect(() => {
    if (searchVal.length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchVal)}&format=json&limit=5&countrycodes=au`
        );
        const data: GeoSuggestion[] = await res.json();
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchVal]);

  const applyLocation = (lat: number, lng: number, label: string) => {
    const pos = { lat, lng };
    setFlyTarget(pos);
    onPin(pos, true);   // address search → drop pin + auto-advance
    setSearchVal(label.split(",")[0]);
    setSuggestions([]);
  };

  const handleSelect = (s: GeoSuggestion) =>
    applyLocation(parseFloat(s.lat), parseFloat(s.lon), s.display_name);

  const handleSubmit = async () => {
    if (!searchVal.trim()) return;
    setSearching(true);
    setSuggestions([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchVal)}&format=json&limit=1&countrycodes=au`
      );
      const data: GeoSuggestion[] = await res.json();
      if (data.length > 0) {
        applyLocation(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name);
      }
    } catch {}
    setSearching(false);
  };

  return (
    <div className="space-y-4">
      {/* In-map geocoding search — pins the searched location directly */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchVal}
              onChange={(e) => { setSearchVal(e.target.value); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Search address to fly & pin — e.g. 123 George St Sydney"
              className="w-full h-10 px-3 font-mono text-xs border border-border-strong bg-paper text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ink"
            />
            {suggestions.length > 0 && (
              <div className="absolute z-[500] top-full left-0 right-0 border border-border-strong bg-card shadow-lg mt-1">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(s)}
                    className="w-full text-left px-3 py-2.5 hover:bg-paper-deep border-b border-border last:border-0 transition-colors"
                  >
                    <div className="font-mono text-xs text-ink truncate">
                      {s.display_name.split(",")[0]}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate">
                      {s.display_name}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!searchVal.trim() || searching}
            className="h-10 px-4 font-mono text-[10px] uppercase tracking-widest bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {searching ? "…" : "Pin →"}
          </button>
        </div>
      </div>

      <div className="map-frame relative h-[520px] crosshair-cursor overflow-hidden">
        <MapContainer
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={13}
          scrollWheelZoom
          className="absolute inset-0"
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · CartoDB'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <FlyTo center={flyTarget} />
          <ClickHandler onPin={onPin} />
          {pin && <Marker position={[pin.lat, pin.lng]} icon={pinIcon} />}
        </MapContainer>

        {/* HUD overlays */}
        <div className="pointer-events-none absolute top-4 left-4 right-4 flex items-start justify-between z-[400]">
          <div className={`px-3 py-2 font-mono text-[10px] uppercase tracking-widest shadow-ink ${pin ? "bg-signal-green text-background" : "bg-ink text-background"}`}>
            {pin ? "✓ Location pinned — analysing…" : "◎ Search address or click map to pin"}
          </div>
          {pin && (
            <div className="bg-background border border-border-strong px-3 py-2 font-mono text-[10px] tabular-nums shadow-paper">
              <div className="text-muted-foreground">PINNED</div>
              <div className="text-ink font-semibold">
                {pin.lat.toFixed(5)}°, {pin.lng.toFixed(5)}°
              </div>
            </div>
          )}
        </div>

        {!pin && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-[400]">
            <div className="size-24 border border-ink/30 border-dashed rounded-full flex items-center justify-center">
              <div className="size-2 bg-ink rounded-full animate-blink" />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-strong border border-border-strong">
        {[
          { l: "TILES",    v: "CartoDB Light" },
          { l: "ZOOM",     v: "13×" },
          { l: "PIN MODE", v: "Search or click" },
          { l: "STATUS",   v: pin ? "Locked" : "Awaiting input" },
        ].map((s) => (
          <div key={s.l} className="bg-paper px-3 py-2.5">
            <div className="data-tag">{s.l}</div>
            <div className="font-mono text-xs text-ink mt-0.5">{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
