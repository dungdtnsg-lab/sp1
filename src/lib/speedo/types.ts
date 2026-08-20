export type Unit = "kmh" | "mph" | "knot";
export type TabId = "track" | "satellites" | "chart" | "export";
export type TrackView = "stats" | "map";
export type Vehicle = "car" | "bike";

export type GpsLog = {
  time: string;
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  heading: number;
  accuracy: number;
};

export type SavedTrip = {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  stoppedDurationMs: number;
  distanceMeters: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  logs: GpsLog[];
};

export type Satellite = {
  prn: string;
  sys: "gps" | "galileo" | "beidou" | "glonass";
  el: number;
  az: number;
  cn0: number;
  usedInFix: boolean;
};

export type GpsFix = {
  lat: number;
  lon: number;
  speedKmh: number;
  heading: number;
  altitude: number;
  accuracy: number;
  timestamp: number;
};

export type CameraAlert = {
  id: string;
  name: string;
  distM: number;
  limit: number;
};

export const SPEED_LIMITS = [40, 50, 60, 80, 100, 120] as const;
export const STOP_SPEED_THRESHOLD_KMH = 1;
export const TELEMETRY_SAMPLE_INTERVAL_MS = 5000;
export const MAX_SAVED_TRIPS = 15;
export const LOCAL_TRIPS_KEY = "gpsSpeedometerSavedTripsV1";
export const SPEED_LIMIT_KEY = "gpsSpeedometerSpeedLimitV1";
export const VOICE_KEY = "gpsSpeedometerVoiceV1";
export const HCMC = { lat: 10.749717, lon: 106.728654 };
