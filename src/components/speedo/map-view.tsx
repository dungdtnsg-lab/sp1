import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Circle, Map as LeafletMap, Marker, Polyline } from "leaflet";
import { Compass, Crosshair, FastForward, Layers, Pause, Play, Square } from "lucide-react";
import { camerasInView } from "@/lib/speedo/cameras";
import { formatDuration, speedColor } from "@/lib/speedo/helpers";
import { seekReplay, setReplayRate, stopReplay, toggleReplayPlay } from "@/lib/speedo/replay";
import { HCMC, useSpeedo } from "@/lib/speedo/store";
import type { MapStyle } from "@/lib/speedo/types";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

const TILES: Record<MapStyle, { url: string; attr: string; maxZoom: number; label: string }> = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: "&copy; OpenStreetMap",
    maxZoom: 19,
    label: "Đường",
  },
  sat: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Esri",
    maxZoom: 19,
    label: "Vệ tinh",
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attr: "&copy; OSM &copy; CARTO",
    maxZoom: 20,
    label: "Đêm",
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attr: "&copy; OpenTopoMap",
    maxZoom: 17,
    label: "Địa hình",
  },
};

export function MapView() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const userRef = useRef<Marker | null>(null);
  const startRef = useRef<Marker | null>(null);
  const accRef = useRef<Circle | null>(null);
  const segsRef = useRef<Polyline[]>([]);
  const camRef = useRef<Marker[]>([]);
  const replaySegs = useRef<Polyline[]>([]);
  const drawn = useRef(0);
  const fittedReplay = useRef<string | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const tileRef = useRef<import("leaflet").TileLayer | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const lastCoord = useSpeedo((s) => s.lastCoord);
  const lastFix = useSpeedo((s) => s.lastFix);
  const segments = useSpeedo((s) => s.segments);
  const headingFollow = useSpeedo((s) => s.headingFollow);
  const mapFollow = useSpeedo((s) => s.mapFollow);
  const tab = useSpeedo((s) => s.tab);
  const trackView = useSpeedo((s) => s.trackView);
  const replayTrip = useSpeedo((s) => s.replayTrip);
  const replayIndex = useSpeedo((s) => s.replayIndex);
  const cameraAlert = useSpeedo((s) => s.cameraAlert);
  const mapStyle = useSpeedo((s) => s.mapStyle);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([HCMC.lat, HCMC.lon], 16);
      L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
      map.on("dragstart", () => useSpeedo.getState().setMapFollow(false));
      mapRef.current = map;
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      setMapReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
      tileRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    const spec = TILES[mapStyle];
    const next = L.tileLayer(spec.url, { maxZoom: spec.maxZoom, attribution: spec.attr });
    next.addTo(map);
    if (tileRef.current) map.removeLayer(tileRef.current);
    tileRef.current = next;
  }, [mapStyle, mapReady]);

  useEffect(() => {
    if (tab === "track" && trackView === "map") {
      setTimeout(() => {
        const map = mapRef.current;
        const L = LRef.current;
        if (!map) return;
        map.invalidateSize();
        const trip = useSpeedo.getState().replayTrip;
        if (trip && L && trip.logs.length > 1) {
          const bounds = L.latLngBounds(trip.logs.map((p) => [p.lat, p.lon] as [number, number]));
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28] });
        }
      }, 120);
    }
  }, [tab, trackView, replayTrip]);

  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    const origin = lastCoord ?? { lat: HCMC.lat, lon: HCMC.lon };
    const nearby = camerasInView(origin.lat, origin.lon, 10);
    for (const m of camRef.current) map.removeLayer(m);
    camRef.current = nearby.map((cam) => {
      const hot = cameraAlert?.id === cam.id;
      const marker = L.marker([cam.lat, cam.lon], {
        icon: L.divIcon({
          className: "",
          html: `<div class="cam-marker${hot ? " is-hot" : ""}" title="${cam.name}"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        zIndexOffset: hot ? 600 : 200,
      }).addTo(map);
      marker.bindTooltip(`${cam.name} · ${cam.limit} km/h`, {
        direction: "top",
        offset: [0, -8],
        opacity: 0.95,
      });
      return marker;
    });
  }, [lastCoord, cameraAlert, replayTrip, replayIndex, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L || !replayTrip) {
      if (map) {
        for (const p of replaySegs.current) map.removeLayer(p);
      }
      replaySegs.current = [];
      fittedReplay.current = null;
      return;
    }
    if (fittedReplay.current !== replayTrip.id) {
      for (const p of replaySegs.current) map.removeLayer(p);
      replaySegs.current = [];
      const logs = replayTrip.logs;
      for (let i = 1; i < logs.length; i++) {
        const a = logs[i - 1];
        const b = logs[i];
        replaySegs.current.push(
          L.polyline(
            [
              [a.lat, a.lon],
              [b.lat, b.lon],
            ],
            {
              color: speedColor(b.speed),
              weight: 5.5,
              opacity: 0.92,
              lineCap: "round",
              lineJoin: "round",
            },
          ).addTo(map),
        );
      }
      const bounds = L.latLngBounds(logs.map((p) => [p.lat, p.lon] as [number, number]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28] });
      fittedReplay.current = replayTrip.id;
    }
    const point = replayTrip.logs[replayIndex] ?? replayTrip.logs[0];
    const heading = point.heading || 0;
    const navHtml = `<div style="transform: rotate(${heading}deg); width:24px; height:24px; display:flex; align-items:center; justify-content:center;">
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:18px solid #f97316;filter:drop-shadow(0 0 5px #c2410c);"></div>
    </div>`;
    const icon = L.divIcon({
      className: "user-nav-puck",
      html: navHtml,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    const latLng: [number, number] = [point.lat, point.lon];
    if (!userRef.current) {
      userRef.current = L.marker(latLng, { icon }).addTo(map);
    } else {
      userRef.current.setLatLng(latLng);
      userRef.current.setIcon(icon);
    }
    map.panTo(latLng, { animate: true, duration: 0.2 });
  }, [replayTrip, replayIndex, mapReady]);

  useEffect(() => {
    if (replayTrip) return;
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L || !lastCoord || !lastFix) return;
    const latLng: [number, number] = [lastCoord.lat, lastCoord.lon];
    const heading = lastFix.heading || 0;
    const navHtml = `<div style="transform: rotate(${heading}deg); width:24px; height:24px; display:flex; align-items:center; justify-content:center;">
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:18px solid #38bdf8;filter:drop-shadow(0 0 5px #0284c7);"></div>
    </div>`;
    const icon = L.divIcon({
      className: "user-nav-puck",
      html: navHtml,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    if (!startRef.current) {
      startRef.current = L.marker(latLng, {
        icon: L.divIcon({
          className: "start-map-marker",
          html: '<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2.5px solid #ffffff;box-shadow:0 0 8px #22c55e;"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      }).addTo(map);
    }
    if (!userRef.current) {
      userRef.current = L.marker(latLng, { icon }).addTo(map);
      accRef.current = L.circle(latLng, {
        radius: lastFix.accuracy,
        color: "#38bdf8",
        fillColor: "#38bdf8",
        fillOpacity: 0.12,
        weight: 1,
      }).addTo(map);
      map.setView(latLng, 16);
    } else {
      userRef.current.setLatLng(latLng);
      userRef.current.setIcon(icon);
      accRef.current?.setLatLng(latLng);
      accRef.current?.setRadius(lastFix.accuracy);
      if (mapFollow) {
        map.setView(latLng, map.getZoom(), { animate: true, duration: 0.35 });
      }
    }
  }, [lastCoord, lastFix, headingFollow, mapFollow, replayTrip]);

  useEffect(() => {
    if (replayTrip) return;
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    if (segments.length < drawn.current) {
      for (const poly of segsRef.current) map.removeLayer(poly);
      segsRef.current = [];
      drawn.current = 0;
      startRef.current && map.removeLayer(startRef.current);
      startRef.current = null;
    }
    for (let i = drawn.current; i < segments.length; i++) {
      const seg = segments[i];
      const poly = L.polyline(
        [
          [seg.from.lat, seg.from.lon],
          [seg.to.lat, seg.to.lon],
        ],
        {
          color: speedColor(seg.speed),
          weight: 5.5,
          opacity: 0.92,
          lineCap: "round",
          lineJoin: "round",
        },
      ).addTo(map);
      segsRef.current.push(poly);
    }
    drawn.current = segments.length;
  }, [segments, replayTrip]);

  function recenter() {
    const map = mapRef.current;
    useSpeedo.getState().setMapFollow(true);
    const trip = useSpeedo.getState().replayTrip;
    if (map && trip) {
      const p = trip.logs[useSpeedo.getState().replayIndex] ?? trip.logs[0];
      map.setView([p.lat, p.lon], map.getZoom() || 16);
      return;
    }
    const coord = useSpeedo.getState().lastCoord;
    if (map && coord) map.setView([coord.lat, coord.lon], map.getZoom() || 16);
  }

  return (
    <div className="relative min-h-[240px] flex-1 overflow-hidden rounded-lg border border-border">
      <div ref={mapEl} className="h-full min-h-[240px] w-full bg-bg" />
      <div className="absolute inset-x-1.5 top-1.5 z-10 rounded-md border border-border bg-bg/90 px-1.5 py-1 text-[10px] backdrop-blur-sm">
        <div className="mb-1 flex items-center gap-1 font-bold text-muted">
          <Layers className="size-3" />
          <span>Chế độ bản đồ</span>
        </div>
        <div className="mb-1 flex gap-1">
          {(Object.keys(TILES) as MapStyle[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => useSpeedo.getState().setMapStyle(id)}
              className={cn(
                "flex-1 rounded-sm py-1 text-center text-[9.5px] font-bold",
                mapStyle === id ? "bg-accent text-fg" : "bg-elevated text-slate-300",
              )}
            >
              {TILES[id].label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <span className="flex-1 rounded-sm bg-ok py-0.5 text-center font-bold text-bg">{"<20"}</span>
          <span className="flex-1 rounded-sm bg-cyan py-0.5 text-center font-bold text-bg">20-40</span>
          <span className="flex-1 rounded-sm bg-warn py-0.5 text-center font-bold text-bg">40-60</span>
          <span className="flex-1 rounded-sm bg-accent py-0.5 text-center font-bold text-bg">60-80</span>
          <span className="flex-1 rounded-sm bg-danger py-0.5 text-center font-bold text-fg">{">80"}</span>
        </div>
      </div>
      {replayTrip && <ReplayBar />}
      <div className="absolute right-2 bottom-2 z-10 flex flex-col gap-1.5">
        <MapBtn
          title="Chế độ xoay la bàn dẫn đường"
          active={headingFollow}
          onClick={() => useSpeedo.getState().toggleHeadingFollow()}
        >
          <Compass className="size-4" />
        </MapBtn>
        <MapBtn title="Giữ vị trí giữa bản đồ" active={mapFollow} onClick={recenter}>
          <Crosshair className="size-4" />
        </MapBtn>
      </div>
    </div>
  );
}

function ReplayBar() {
  const trip = useSpeedo((s) => s.replayTrip);
  const index = useSpeedo((s) => s.replayIndex);
  const playing = useSpeedo((s) => s.replayPlaying);
  const rate = useSpeedo((s) => s.replayRate);
  if (!trip) return null;
  const point = trip.logs[index] ?? trip.logs[0];
  const pct = trip.logs.length > 1 ? (index / (trip.logs.length - 1)) * 100 : 0;
  return (
    <div className="absolute inset-x-1.5 bottom-12 z-20 rounded-md border border-border bg-bg/92 px-2 py-1.5 backdrop-blur-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-bold text-accent">{trip.title}</div>
          <div className="font-mono text-[10px] text-muted">
            {point.speed.toFixed(0)} km/h · {formatDuration(index * 5000)}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => toggleReplayPlay()}
            className="grid size-8 place-items-center rounded-md bg-accent text-fg"
            title={playing ? "Tạm dừng" : "Phát"}
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          {([1, 2, 4] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReplayRate(r)}
              className={cn(
                "rounded px-1.5 py-1 text-[10px] font-bold",
                rate === r ? "bg-fg text-bg" : "bg-elevated text-muted",
              )}
            >
              {r}x
            </button>
          ))}
          <button
            type="button"
            title="Tua nhanh"
            onClick={() => setReplayRate(rate === 4 ? 1 : 4)}
            className="grid size-8 place-items-center rounded-md border border-border text-muted"
          >
            <FastForward className="size-3.5" />
          </button>
          <button
            type="button"
            title="Đóng"
            onClick={() => stopReplay()}
            className="grid size-8 place-items-center rounded-md border border-danger/40 text-rose-300"
          >
            <Square className="size-3" />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(1, trip.logs.length - 1)}
        value={index}
        onChange={(e) => seekReplay(Number(e.target.value))}
        className="w-full accent-orange-500"
        aria-label="Tiến trình hành trình"
        style={{ backgroundSize: `${pct}% 100%` }}
      />
    </div>
  );
}

function MapBtn({
  children,
  title,
  onClick,
  active,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-md border text-base text-fg shadow-md backdrop-blur-sm ${
        active ? "border-cyan bg-cyan/30" : "border-border bg-elevated/90"
      }`}
    >
      {children}
    </button>
  );
}
