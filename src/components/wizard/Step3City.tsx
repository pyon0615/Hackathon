// Search powered by OpenStreetMap Nominatim (free, no API key required)
// Preset suburbs sourced from sydney_with_clean_categories.csv — top localities by POI count
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Step3Props {
  onConfirm: (city: string, lat: number, lng: number) => void;
  defaultCity?: string;
}

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

// Top Sydney localities by business count (from sydney_with_clean_categories.csv analysis)
// Sydney CBD: 72,195 | Surry Hills: 3,167 | Newtown: 1,603 | Parramatta: 3,297
// Chatswood: 3,220 | North Sydney: 2,738 | Bondi Junction: 2,004 | Marrickville: 1,863
const PRESETS = [
  { label: "Sydney CBD",      lat: -33.8688, lng: 151.2093, pois: "72K POIs" },
  { label: "Surry Hills",     lat: -33.8865, lng: 151.2094, pois: "3.2K POIs" },
  { label: "Parramatta",      lat: -33.8148, lng: 151.0017, pois: "3.3K POIs" },
  { label: "Chatswood",       lat: -33.7965, lng: 151.1822, pois: "3.2K POIs" },
  { label: "North Sydney",    lat: -33.8400, lng: 151.2069, pois: "2.7K POIs" },
  { label: "Newtown",         lat: -33.8979, lng: 151.1794, pois: "1.6K POIs" },
  { label: "Bondi Junction",  lat: -33.8914, lng: 151.2474, pois: "2.0K POIs" },
  { label: "Marrickville",    lat: -33.9115, lng: 151.1549, pois: "1.9K POIs" },
];

export const Step3City = ({ onConfirm, defaultCity }: Step3Props) => {
  const [value, setValue] = useState(defaultCity ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Fetch suggestions as user types (debounced 400ms)
  useEffect(() => {
    if (value.length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=5`
        );
        const data = await res.json();
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      }
    }, 400); // wait 400ms after user stops typing

    return () => clearTimeout(timer);
  }, [value]);

  const handleSelect = (s: Suggestion) => {
    setValue(s.display_name);
    setSuggestions([]); // close dropdown
    onConfirm(s.display_name, parseFloat(s.lat), parseFloat(s.lon));
  };

  const handleSearch = async () => {
    if (!value) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=1`
      );
      const data = await res.json();
      if (data.length === 0) {
        setError("Location not found. Try a different search.");
        setLoading(false);
        return;
      }
      const { lat, lon, display_name } = data[0];
      setValue(display_name);
      setSuggestions([]);
      onConfirm(display_name, parseFloat(lat), parseFloat(lon));
    } catch {
      setError("Search failed. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
        <div className="relative">
          <label className="data-tag block mb-2">Search for a city or address</label>
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="e.g. Williamsburg, Brooklyn or 123 Main St"
            className="h-14 text-lg font-display border-border-strong focus-visible:ring-ink rounded-none"
          />

          {/* Autocomplete dropdown */}
          {suggestions.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 border border-border-strong bg-card shadow-lg mt-1">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(s)}
                  className="w-full text-left px-4 py-3 hover:bg-paper-deep border-b border-border last:border-0 transition-colors"
                >
                  {/* Short name — bold */}
                  <div className="font-display font-semibold text-ink text-sm truncate">
                    {s.display_name.split(",")[0]}
                  </div>
                  {/* Full address — muted */}
                  <div className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
                    {s.display_name}
                  </div>
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="text-xs text-signal-red mt-2 font-mono">{error}</p>
          )}
        </div>

        <Button
          onClick={handleSearch}
          disabled={!value || loading}
          className="h-14 px-8 rounded-none font-mono text-xs uppercase tracking-widest bg-accent hover:bg-accent/90 text-accent-foreground shadow-[0_6px_18px_hsl(var(--accent)/0.30)] disabled:shadow-none"
        >
          {loading ? "Searching..." : "Open Map →"}
        </Button>
      </div>

      <div>
        <div className="data-tag mb-3">Top Sydney suburbs — pick one to jump straight to the map</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onConfirm(p.label, p.lat, p.lng)}
              className="group p-4 border-2 border-border bg-card text-left hover:border-accent hover:bg-accent/5 hover:shadow-paper transition-all"
            >
              <div className="font-display font-semibold text-ink">{p.label}</div>
              <div className="font-mono text-[10px] tabular-nums text-signal-green mt-1">
                {p.pois}
              </div>
              <div className="font-mono text-[9px] tabular-nums text-muted-foreground mt-0.5">
                {p.lat.toFixed(4)}°, {p.lng.toFixed(4)}°
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const PRESET_CITIES = PRESETS;