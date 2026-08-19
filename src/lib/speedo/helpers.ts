import type { GpsLog, SavedTrip, Unit } from "./types";
import { HCMC } from "./types";

export function convertSpeed(kmh: number, unit: Unit) {
  if (unit === "mph") return kmh * 0.621371;
  if (unit === "knot") return kmh * 0.539957;
  return kmh;
}

export function unitLabel(unit: Unit) {
  return unit.toUpperCase();
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function formatClock(date = new Date()) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${d}/${m}/${y} ${h}:${min}:${s}`;
}

export function formatStartTime(date: Date) {
  const months = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];
  const d = date.getDate();
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${d} ${m}, ${y} ${h}:${min}:${s}`;
}

export function formatLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--/--/---- --:--:--";
  return formatClock(date);
}

export function formatLocalTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function cardinal(deg: number | null) {
  if (deg == null || Number.isNaN(deg)) return "N";
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
  return directions[Math.round((deg % 360) / 45)];
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function offsetLatLon(lat: number, lon: number, headingDeg: number, meters: number) {
  const R = 6371000;
  const d = meters / R;
  const brng = (headingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

export function speedColor(kmh: number) {
  if (kmh < 20) return "#22c55e";
  if (kmh < 40) return "#06b6d4";
  if (kmh < 60) return "#eab308";
  if (kmh < 80) return "#f97316";
  return "#ef4444";
}

export function gpsDotCount(accuracy: number) {
  if (accuracy > 30) return 1;
  if (accuracy > 20) return 2;
  if (accuracy > 12) return 3;
  if (accuracy > 6) return 4;
  return 5;
}

export function likelyNoGps() {
  if (typeof window === "undefined") return true;
  if (!window.isSecureContext) return true;
  if (!("geolocation" in navigator)) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return false;
}

export function haptic(type: "light" | "medium" = "light") {
  try {
    navigator.vibrate?.(type === "medium" ? 25 : 12);
  } catch {
    /* ignore */
  }
}

export function normalizeLogs(logs: GpsLog[]): GpsLog[] {
  return logs
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => ({
      time: p.time || new Date().toISOString(),
      lat: Number(p.lat),
      lon: Number(p.lon),
      alt: Number.isFinite(p.alt) ? p.alt : 0,
      speed: Number.isFinite(p.speed) ? p.speed : 0,
      heading: Number.isFinite(p.heading) ? p.heading : 0,
      accuracy: Number.isFinite(p.accuracy) ? p.accuracy : 0,
    }));
}

export function fileStem(title = "trip") {
  const normalized = String(title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return `${normalized || "trip"}_${Date.now()}`;
}

export function buildDemoTrip(): SavedTrip {
  const logs: GpsLog[] = [];
  let lat = HCMC.lat;
  let lon = HCMC.lon;
  let heading = 28;
  let speed = 34;
  const start = Date.now() - 18 * 60 * 1000;
  let distance = 0;
  let maxSpeed = 0;
  let stopped = 0;
  for (let i = 0; i < 80; i++) {
    heading = (heading + (i % 11 === 0 ? 18 : i % 7 === 0 ? -8 : 2) + 360) % 360;
    speed = Math.max(6, Math.min(82, speed + ((i * 13) % 11) - 5));
    if (i > 40 && i < 48) speed = 0.4;
    const step = offsetLatLon(lat, lon, heading, (speed * 5) / 3.6);
    if (speed >= 1) distance += haversineKm(lat, lon, step.lat, step.lon) * 1000;
    else stopped += 5000;
    lat = step.lat;
    lon = step.lon;
    maxSpeed = Math.max(maxSpeed, speed);
    logs.push({
      time: new Date(start + i * 5000).toISOString(),
      lat,
      lon,
      alt: 7 + Math.sin(i / 6) * 3,
      speed,
      heading,
      accuracy: 4.5,
    });
  }
  const speeds = logs.map((p) => p.speed);
  const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  return {
    id: "demo_phu_my_hung",
    title: "Mẫu — Phú Mỹ Hưng (xem lại được)",
    startedAt: logs[0].time,
    endedAt: logs[logs.length - 1].time,
    durationMs: 80 * 5000,
    stoppedDurationMs: stopped,
    distanceMeters: distance,
    maxSpeedKmh: maxSpeed,
    avgSpeedKmh: avg,
    logs,
  };
}
