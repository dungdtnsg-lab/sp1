import type { PluginListenerHandle } from "@capacitor/core";
import { nearestCameras } from "./cameras";
import { useSpeedo } from "./store";
import { HCMC } from "./types";
import { haptic, likelyNoGps, offsetLatLon } from "./helpers";
import { maybeSpeakSpeed, playOverspeedVoice, resetVoice, speakCamera, unlockVoice } from "./voice";
import { considerSpeedCrash } from "./crash";

let watchId: number | null = null;
let nativeWatchId: string | null = null;
let bgHandles: PluginListenerHandle[] = [];
let usingBgGps = false;
let demoTimer: number | null = null;
let watchdog: number | null = null;
let lastGpsAt = 0;
let restarting = false;
let wakeLock: WakeLockSentinel | null = null;
let audioCtx: AudioContext | null = null;
let lastBeep = 0;
let silent: HTMLAudioElement | null = null;
let demoState = { lat: HCMC.lat, lon: HCMC.lon, heading: 28, speed: 32 };
let lastCameraSpoken = "";
let lastCameraAt = 0;

export async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    useSpeedo.getState().setWakeOn(false);
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    useSpeedo.getState().setWakeOn(true);
    wakeLock.addEventListener("release", () => {
      const s = useSpeedo.getState();
      if (s.tracking && document.visibilityState === "visible" && !s.oled) {
        void requestWakeLock();
      }
    });
  } catch {
    useSpeedo.getState().setWakeOn(false);
  }
}

export function releaseWakeLock() {
  if (wakeLock) {
    void wakeLock.release().catch(() => undefined);
    wakeLock = null;
  }
  useSpeedo.getState().setWakeOn(false);
}

function startAudioKeeper() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    if (!silent) {
      silent = new Audio(
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA",
      );
      silent.loop = true;
    }
    void silent.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

function stopAudioKeeper() {
  silent?.pause();
  if (audioCtx && audioCtx.state !== "closed") void audioCtx.suspend().catch(() => undefined);
}

export function playSpeedAlert() {
  const s = useSpeedo.getState();
  if (!s.audioAlert) return;
  const now = Date.now();
  if (now - lastBeep < 1500) return;
  lastBeep = now;
  beep(950, 1250, 0.22);
}

function playCameraBeep() {
  if (!useSpeedo.getState().audioAlert) return;
  beep(680, 1400, 0.18);
  window.setTimeout(() => beep(680, 1400, 0.18), 220);
}

function beep(from: number, to: number, dur: number) {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(from, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, audioCtx.currentTime + dur * 0.7);
    gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch {
    /* ignore */
  }
}

function afterFix(lat: number, lon: number, heading: number, speedKmh: number) {
  const hits = nearestCameras(lat, lon, heading);
  const hit = hits[0] ?? null;
  if (hit) {
    useSpeedo.getState().setCameraAlert({
      id: hit.id,
      name: hit.name,
      distM: hit.distM,
      limit: hit.limit,
    });
    const now = Date.now();
    if (hit.id !== lastCameraSpoken || now - lastCameraAt > 90000) {
      lastCameraSpoken = hit.id;
      lastCameraAt = now;
      playCameraBeep();
      speakCamera(hit.name, hit.distM, hit.limit);
      haptic("medium");
    }
  } else {
    useSpeedo.getState().setCameraAlert(null);
  }
  const st = useSpeedo.getState();
  if (st.currentSpeedKmh > st.speedLimitKmh) {
    playSpeedAlert();
    playOverspeedVoice(st.speedLimitKmh);
  } else {
    maybeSpeakSpeed(speedKmh);
  }
  considerSpeedCrash(speedKmh);
}

function onPosition(pos: GeolocationPosition) {
  lastGpsAt = Date.now();
  const c = pos.coords;
  const raw = c.speed != null && c.speed > 0 ? c.speed * 3.6 : 0;
  useSpeedo.getState().applyFix({
    lat: c.latitude,
    lon: c.longitude,
    speedKmh: raw,
    heading: c.heading ?? 0,
    altitude: c.altitude ?? 0,
    accuracy: c.accuracy ?? 10,
    timestamp: lastGpsAt,
  });
  afterFix(c.latitude, c.longitude, c.heading ?? 0, raw);
}

function onError(err: GeolocationPositionError | Error) {
  const msg = err.message || String(err);
  if (/unavailable|unknown|kCLError|canceled/i.test(msg)) return;
  useSpeedo.getState().setBanner("warn", `GPS Warning: ${msg}`);
}

function clearWatcher() {
  if (watchId != null) {
    try {
      navigator.geolocation.clearWatch(watchId);
    } catch {
      /* ignore */
    }
    watchId = null;
  }
  const handles = bgHandles;
  bgHandles = [];
  const wasBg = usingBgGps;
  usingBgGps = false;
  if (wasBg) {
    void (async () => {
      try {
        for (const h of handles) await h.remove();
        const { BackgroundGps } = await import("./background-gps");
        await BackgroundGps.stop();
      } catch {
        /* ignore */
      }
    })();
  }
  const id = nativeWatchId;
  nativeWatchId = null;
  if (id) {
    void (async () => {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        await Geolocation.clearWatch({ id });
      } catch {
        /* ignore */
      }
    })();
  }
  if (demoTimer != null) {
    window.clearInterval(demoTimer);
    demoTimer = null;
  }
}

async function startBackgroundGps(): Promise<boolean> {
  const { BackgroundGps } = await import("./background-gps");
  await BackgroundGps.start();
  const fixHandle = await BackgroundGps.addListener("fix", (pos) => {
    onPosition({
      coords: {
        latitude: pos.latitude,
        longitude: pos.longitude,
        altitude: pos.altitude,
        accuracy: pos.accuracy,
        altitudeAccuracy: null,
        heading: pos.heading,
        speed: pos.speed,
      },
      timestamp: pos.timestamp,
    } as GeolocationPosition);
  });
  const errHandle = await BackgroundGps.addListener("error", (err) => {
    onError(new Error(err.message));
  });
  bgHandles = [fixHandle, errHandle];
  usingBgGps = true;
  lastGpsAt = Date.now();
  return true;
}

async function startNativeGps(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return false;
    try {
      return await startBackgroundGps();
    } catch {
      /* plugin missing — fallback */
    }
    const { Geolocation } = await import("@capacitor/geolocation");
    await Geolocation.requestPermissions();
    const callbackId = await Geolocation.watchPosition(
      { enableHighAccuracy: true },
      (pos, err) => {
        if (err || !pos) {
          if (err) onError(err);
          return;
        }
        onPosition({
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            altitude: pos.coords.altitude,
            accuracy: pos.coords.accuracy,
            altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
          },
          timestamp: pos.timestamp,
        } as GeolocationPosition);
      },
    );
    nativeWatchId = typeof callbackId === "string" && callbackId ? callbackId : null;
    lastGpsAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

function startDemoLoop() {
  demoTimer = window.setInterval(() => {
    if (!useSpeedo.getState().tracking) return;
    demoState.heading = (demoState.heading + (Math.random() * 8 - 3) + 360) % 360;
    demoState.speed = Math.max(8, Math.min(72, demoState.speed + (Math.random() * 8 - 3.5)));
    const moved = offsetLatLon(demoState.lat, demoState.lon, demoState.heading, demoState.speed / 3.6);
    demoState.lat = moved.lat;
    demoState.lon = moved.lon;
    lastGpsAt = Date.now();
    useSpeedo.getState().applyFix({
      lat: demoState.lat,
      lon: demoState.lon,
      speedKmh: demoState.speed,
      heading: demoState.heading,
      altitude: 8 + Math.sin(lastGpsAt / 4000) * 3,
      accuracy: 4.2,
      timestamp: lastGpsAt,
    });
    afterFix(demoState.lat, demoState.lon, demoState.heading, demoState.speed);
  }, 1000);
}

function startBrowserGps() {
  watchId = navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000,
  });
  lastGpsAt = Date.now();
}

function startWatchdog() {
  stopWatchdog();
  watchdog = window.setInterval(() => {
    const s = useSpeedo.getState();
    if (!s.tracking || s.demo) return;
    if (lastGpsAt && Date.now() - lastGpsAt > 8000) restartWatcher();
  }, 5000);
}

function stopWatchdog() {
  if (watchdog != null) {
    window.clearInterval(watchdog);
    watchdog = null;
  }
}

function restartWatcher() {
  if (!useSpeedo.getState().tracking || restarting) return;
  restarting = true;
  const preferNative = usingBgGps || nativeWatchId != null;
  clearWatcher();
  void (async () => {
    try {
      if (preferNative) {
        const ok = await startNativeGps();
        if (!ok) startBrowserGps();
      } else {
        startBrowserGps();
      }
    } catch (err) {
      onError(err instanceof Error ? err : new Error("GPS restart failed"));
    } finally {
      restarting = false;
    }
  })();
}

export async function startTracking() {
  unlockVoice();
  resetVoice();
  lastCameraSpoken = "";
  lastCameraAt = 0;
  demoState = { lat: HCMC.lat, lon: HCMC.lon, heading: 28, speed: 32 };
  useSpeedo.getState().beginTracking(false);
  const native = await startNativeGps();
  if (native) {
    startWatchdog();
    await requestWakeLock();
    startAudioKeeper();
    haptic("medium");
    return;
  }
  if (likelyNoGps()) {
    useSpeedo.getState().beginTracking(true);
    startDemoLoop();
  } else {
    try {
      startBrowserGps();
    } catch (err) {
      useSpeedo.getState().beginTracking(true);
      startDemoLoop();
      onError(err instanceof Error ? err : new Error("Không khởi động được GPS"));
    }
  }
  await requestWakeLock();
  startAudioKeeper();
  startWatchdog();
  haptic("medium");
  return true;
}

export function stopTracking() {
  const trip = useSpeedo.getState().endTracking();
  clearWatcher();
  stopWatchdog();
  releaseWakeLock();
  stopAudioKeeper();
  resetVoice();
  haptic("medium");
  return trip;
}

export function toggleWake() {
  if (wakeLock) releaseWakeLock();
  else void requestWakeLock();
}

export function bindVisibility() {
  const onVis = () => {
    if (document.visibilityState === "visible" && useSpeedo.getState().tracking) {
      void requestWakeLock();
      if (!useSpeedo.getState().demo && lastGpsAt && Date.now() - lastGpsAt > 7000) {
        restartWatcher();
      }
    }
  };
  document.addEventListener("visibilitychange", onVis);
  return () => document.removeEventListener("visibilitychange", onVis);
}
