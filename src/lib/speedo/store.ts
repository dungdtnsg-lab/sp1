import { create } from "zustand";
import {
  HCMC,
  LOCAL_TRIPS_KEY,
  MAX_SAVED_TRIPS,
  SPEED_LIMITS,
  SPEED_LIMIT_KEY,
  STOP_SPEED_THRESHOLD_KMH,
  TELEMETRY_SAMPLE_INTERVAL_MS,
  VOICE_KEY,
  type CameraAlert,
  type GpsFix,
  type GpsLog,
  type SavedTrip,
  type Satellite,
  type TabId,
  type TrackView,
  type Unit,
  type Vehicle,
} from "./types";
import { buildDemoTrip, formatStartTime, gpsDotCount, haversineKm } from "./helpers";
import { generateSatellites } from "./satellites";

type SpeedoState = {
  tracking: boolean;
  demo: boolean;
  hud: boolean;
  oled: boolean;
  wakeOn: boolean;
  audioAlert: boolean;
  voiceOn: boolean;
  headingFollow: boolean;
  mapFollow: boolean;
  unit: Unit;
  vehicle: Vehicle;
  tab: TabId;
  trackView: TrackView;
  speedLimitKmh: number;
  currentSpeedKmh: number;
  maxSpeedKmh: number;
  totalDistanceM: number;
  gpsDots: number;
  lastFix: GpsFix | null;
  lastCoord: { lat: number; lon: number } | null;
  startTimeLabel: string;
  clockLabel: string;
  banner: { kind: "good" | "warn"; text: string };
  logs: GpsLog[];
  speeds: number[];
  satellites: Satellite[];
  savedTrips: SavedTrip[];
  segments: { from: { lat: number; lon: number }; to: { lat: number; lon: number }; speed: number }[];
  sessionStartTime: number | null;
  trackingActiveStartedAt: number | null;
  totalTrackingDurationMs: number;
  stoppedDurationMs: number;
  stopStartedAt: number | null;
  isStoppedNow: boolean;
  nowMs: number;
  cameraAlert: CameraAlert | null;
  replayTrip: SavedTrip | null;
  replayIndex: number;
  replayPlaying: boolean;
  replayRate: 1 | 2 | 4;
  cloudSyncing: boolean;
  lastCloudSync: number | null;

  setTab: (tab: TabId) => void;
  setTrackView: (view: TrackView) => void;
  setUnit: (unit: Unit) => void;
  setVehicle: (vehicle: Vehicle) => void;
  toggleHud: () => void;
  toggleAudio: () => void;
  toggleVoice: () => void;
  toggleHeadingFollow: () => void;
  setMapFollow: (on: boolean) => void;
  cycleLimit: () => void;
  setOled: (on: boolean) => void;
  setWakeOn: (on: boolean) => void;
  applyFix: (fix: GpsFix) => void;
  beginTracking: (demo: boolean) => void;
  endTracking: () => SavedTrip | null;
  resetSession: () => void;
  tickClock: () => void;
  setBanner: (kind: "good" | "warn", text: string) => void;
  setGpsDots: (n: number) => void;
  setCameraAlert: (alert: CameraAlert | null) => void;
  loadTrips: () => void;
  persistTrip: (trip: SavedTrip) => boolean;
  mergeTrips: (trips: SavedTrip[]) => void;
  deleteTrip: (id: string) => void;
  durationMs: () => number;
  stoppedMs: () => number;
  beginReplay: (trip: SavedTrip) => void;
  endReplay: () => void;
  setReplayIndex: (index: number) => void;
  setReplayPlaying: (playing: boolean) => void;
  setReplayRate: (rate: 1 | 2 | 4) => void;
  setCloudSyncing: (v: boolean) => void;
  setLastCloudSync: (v: number | null) => void;
};

function loadLimit() {
  if (typeof window === "undefined") return 60;
  try {
    const n = Number(localStorage.getItem(SPEED_LIMIT_KEY));
    if ((SPEED_LIMITS as readonly number[]).includes(n)) return n;
  } catch {
    /* ignore */
  }
  return 60;
}

function loadVoice() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(VOICE_KEY) === "1";
  } catch {
    /* ignore */
  }
  return false;
}

function loadTripsFromDisk(): SavedTrip[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_TRIPS_KEY) || "[]") as SavedTrip[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    /* ignore */
  }
  const demo = [buildDemoTrip()];
  try {
    localStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(demo));
  } catch {
    /* ignore */
  }
  return demo;
}

export const useSpeedo = create<SpeedoState>()((set, get) => ({
  tracking: false,
  demo: false,
  hud: false,
  oled: false,
  wakeOn: true,
  audioAlert: true,
  voiceOn: loadVoice(),
  headingFollow: false,
  mapFollow: true,
  unit: "kmh",
  vehicle: "car",
  tab: "track",
  trackView: "map",
  speedLimitKmh: loadLimit(),
  currentSpeedKmh: 0,
  maxSpeedKmh: 0,
  totalDistanceM: 0,
  gpsDots: 0,
  lastFix: null,
  lastCoord: null,
  startTimeLabel: "--",
  clockLabel: "",
  banner: { kind: "warn", text: "GPS đang tắt — chạm BẬT GPS THEO DÕI" },
  logs: [],
  speeds: [],
  satellites: generateSatellites(10),
  savedTrips: [],
  segments: [],
  sessionStartTime: null,
  trackingActiveStartedAt: null,
  totalTrackingDurationMs: 0,
  stoppedDurationMs: 0,
  stopStartedAt: null,
  isStoppedNow: false,
  nowMs: Date.now(),
  cameraAlert: null,
  replayTrip: null,
  replayIndex: 0,
  replayPlaying: false,
  replayRate: 1,
  cloudSyncing: false,
  lastCloudSync: null,

  setTab: (tab) => set({ tab }),
  setTrackView: (trackView) => set({ trackView }),
  setUnit: (unit) => set({ unit }),
  setVehicle: (vehicle) => set({ vehicle }),
  toggleHud: () => set((s) => ({ hud: !s.hud })),
  toggleAudio: () => set((s) => ({ audioAlert: !s.audioAlert })),
  toggleVoice: () => {
    const voiceOn = !get().voiceOn;
    try {
      localStorage.setItem(VOICE_KEY, voiceOn ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ voiceOn });
  },
  toggleHeadingFollow: () => set((s) => ({ headingFollow: !s.headingFollow })),
  setMapFollow: (mapFollow) => set({ mapFollow }),
  cycleLimit: () => {
    const curr = get().speedLimitKmh;
    const idx = SPEED_LIMITS.indexOf(curr as (typeof SPEED_LIMITS)[number]);
    const next = SPEED_LIMITS[(idx + 1) % SPEED_LIMITS.length];
    try {
      localStorage.setItem(SPEED_LIMIT_KEY, String(next));
    } catch {
      /* ignore */
    }
    set({ speedLimitKmh: next });
  },
  setOled: (oled) => set({ oled }),
  setWakeOn: (wakeOn) => set({ wakeOn }),
  setBanner: (kind, text) => set({ banner: { kind, text } }),
  setGpsDots: (gpsDots) => set({ gpsDots }),
  setCameraAlert: (cameraAlert) => set({ cameraAlert }),
  setCloudSyncing: (cloudSyncing) => set({ cloudSyncing }),
  setLastCloudSync: (lastCloudSync) => set({ lastCloudSync }),

  tickClock: () => {
    const now = Date.now();
    const s = get();
    let stoppedDurationMs = s.stoppedDurationMs;
    let isStoppedNow = s.isStoppedNow;
    if (s.tracking && s.currentSpeedKmh < STOP_SPEED_THRESHOLD_KMH) {
      if (!s.stopStartedAt) {
        set({ stopStartedAt: now, isStoppedNow: true, nowMs: now });
        return;
      }
      isStoppedNow = true;
    }
    set({
      nowMs: now,
      stoppedDurationMs,
      isStoppedNow,
      satellites: generateSatellites(s.lastFix?.accuracy ?? 10, now),
    });
  },

  applyFix: (fix) => {
    const s = get();
    if (!s.tracking) return;
    const prev = s.currentSpeedKmh;
    let speed = prev * 0.2 + fix.speedKmh * 0.8;
    if (speed < 0.2) speed = 0;

    const now = fix.timestamp;
    let stopStartedAt = s.stopStartedAt;
    let stoppedDurationMs = s.stoppedDurationMs;
    let isStoppedNow = s.isStoppedNow;
    if (speed < STOP_SPEED_THRESHOLD_KMH) {
      if (!stopStartedAt) {
        stopStartedAt = now;
        isStoppedNow = true;
      }
    } else {
      if (stopStartedAt) stoppedDurationMs += now - stopStartedAt;
      stopStartedAt = null;
      isStoppedNow = false;
    }

    const maxSpeedKmh = Math.max(s.maxSpeedKmh, speed);
    let totalDistanceM = s.totalDistanceM;
    let segments = s.segments;
    if (s.lastCoord) {
      const distKm = haversineKm(s.lastCoord.lat, s.lastCoord.lon, fix.lat, fix.lon);
      if (distKm > 0.001) {
        totalDistanceM += distKm * 1000;
        segments = [
          ...s.segments.slice(-800),
          { from: s.lastCoord, to: { lat: fix.lat, lon: fix.lon }, speed },
        ];
      }
    }

    const lastSample = s.logs.at(-1);
    const shouldRecord =
      !lastSample || now - new Date(lastSample.time).getTime() >= TELEMETRY_SAMPLE_INTERVAL_MS;

    const log: GpsLog = {
      time: new Date(now).toISOString(),
      lat: fix.lat,
      lon: fix.lon,
      alt: fix.altitude,
      speed,
      heading: fix.heading,
      accuracy: fix.accuracy,
    };

    set({
      currentSpeedKmh: speed,
      maxSpeedKmh,
      totalDistanceM,
      lastFix: fix,
      lastCoord: { lat: fix.lat, lon: fix.lon },
      gpsDots: gpsDotCount(fix.accuracy),
      satellites: generateSatellites(fix.accuracy, now),
      segments,
      stopStartedAt,
      stoppedDurationMs,
      isStoppedNow,
      nowMs: now,
      logs: shouldRecord ? [...s.logs, log] : s.logs,
      speeds: shouldRecord ? [...s.speeds, speed] : s.speeds,
    });
  },

  beginTracking: (demo) => {
    const now = Date.now();
    const s = get();
    const sessionStartTime = s.sessionStartTime ?? now;
    set({
      tracking: true,
      demo,
      replayTrip: null,
      replayPlaying: false,
      cameraAlert: null,
      mapFollow: true,
      sessionStartTime,
      trackingActiveStartedAt: now,
      startTimeLabel: formatStartTime(new Date(sessionStartTime)),
      banner: {
        kind: "good",
        text: demo
          ? "Mô phỏng GPS — mở trên điện thoại để đo thật"
          : "GNSS Signal: Optimal • Background Active",
      },
    });
  },

  endTracking: () => {
    const s = get();
    if (!s.tracking) return null;
    const now = Date.now();
    let totalTrackingDurationMs = s.totalTrackingDurationMs;
    if (s.trackingActiveStartedAt) {
      totalTrackingDurationMs += Math.max(0, now - s.trackingActiveStartedAt);
    }
    let stoppedDurationMs = s.stoppedDurationMs;
    if (s.stopStartedAt) stoppedDurationMs += Math.max(0, now - s.stopStartedAt);

    set({
      tracking: false,
      demo: false,
      currentSpeedKmh: 0,
      gpsDots: 0,
      trackingActiveStartedAt: null,
      totalTrackingDurationMs,
      stoppedDurationMs,
      stopStartedAt: null,
      isStoppedNow: false,
      nowMs: now,
      cameraAlert: null,
      banner: { kind: "warn", text: "GPS Stopped" },
    });

    if (s.logs.length === 0) return null;
    const avg =
      s.speeds.length > 0 ? s.speeds.reduce((a, b) => a + b, 0) / s.speeds.length : 0;
    return {
      id: `trip_${now}`,
      title: `Hành trình ${new Date(now).toLocaleString("vi-VN")}`,
      startedAt: s.sessionStartTime
        ? new Date(s.sessionStartTime).toISOString()
        : s.logs[0].time,
      endedAt: new Date(now).toISOString(),
      durationMs: totalTrackingDurationMs,
      stoppedDurationMs,
      distanceMeters: s.totalDistanceM,
      maxSpeedKmh: s.maxSpeedKmh,
      avgSpeedKmh: avg,
      logs: s.logs.map((p) => ({ ...p })),
    };
  },

  resetSession: () => {
    const tracking = get().tracking;
    const now = Date.now();
    set({
      currentSpeedKmh: 0,
      maxSpeedKmh: 0,
      totalDistanceM: 0,
      lastCoord: tracking ? get().lastCoord : null,
      lastFix: tracking ? get().lastFix : null,
      logs: [],
      speeds: [],
      segments: [],
      sessionStartTime: now,
      totalTrackingDurationMs: 0,
      trackingActiveStartedAt: tracking ? now : null,
      stoppedDurationMs: 0,
      stopStartedAt: null,
      isStoppedNow: false,
      startTimeLabel: formatStartTime(new Date(now)),
      nowMs: now,
      cameraAlert: null,
    });
  },

  durationMs: () => {
    const s = get();
    const extra = s.trackingActiveStartedAt ? Math.max(0, s.nowMs - s.trackingActiveStartedAt) : 0;
    return s.totalTrackingDurationMs + extra;
  },
  stoppedMs: () => {
    const s = get();
    const extra = s.stopStartedAt ? Math.max(0, s.nowMs - s.stopStartedAt) : 0;
    return s.stoppedDurationMs + extra;
  },

  loadTrips: () => set({ savedTrips: loadTripsFromDisk() }),
  persistTrip: (trip) => {
    const previous = get().savedTrips;
    const next = [trip, ...previous.filter((t) => t.id !== trip.id)].slice(0, MAX_SAVED_TRIPS);
    try {
      localStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(next));
      set({ savedTrips: next });
      return true;
    } catch {
      set({ savedTrips: previous });
      return false;
    }
  },
  mergeTrips: (trips) => {
    const map = new Map(get().savedTrips.map((t) => [t.id, t]));
    for (const t of trips) map.set(t.id, t);
    const next = [...map.values()]
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))
      .slice(0, MAX_SAVED_TRIPS);
    try {
      localStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set({ savedTrips: next });
  },
  deleteTrip: (id) => {
    const next = get().savedTrips.filter((t) => t.id !== id);
    try {
      localStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set({ savedTrips: next });
    if (get().replayTrip?.id === id) {
      set({ replayTrip: null, replayPlaying: false, replayIndex: 0 });
    }
  },

  beginReplay: (trip) =>
    set({
      replayTrip: trip,
      replayIndex: 0,
      replayPlaying: true,
      replayRate: 1,
      tab: "track",
      trackView: "map",
    }),
  endReplay: () => set({ replayTrip: null, replayPlaying: false, replayIndex: 0 }),
  setReplayIndex: (replayIndex) => set({ replayIndex }),
  setReplayPlaying: (replayPlaying) => set({ replayPlaying }),
  setReplayRate: (replayRate) => set({ replayRate }),
}));

export function gaugeMax(vehicle: Vehicle) {
  return vehicle === "bike" ? 80 : 260;
}

export { HCMC };
