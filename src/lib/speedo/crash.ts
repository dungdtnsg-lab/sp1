import { useSpeedo } from "./store";

let motionOn = false;
let lastFire = 0;
let prevSpeed = 0;
let recentMax = 0;
let recentMaxAt = 0;
let countdownTimer: number | null = null;

function gForce(ax: number, ay: number, az: number) {
  return Math.sqrt(ax * ax + ay * ay + az * az) / 9.81;
}

export function considerSpeedCrash(speedKmh: number) {
  const s = useSpeedo.getState();
  if (!s.crash.enabled || !s.tracking || s.crashLeft != null) {
    prevSpeed = speedKmh;
    return;
  }
  const now = Date.now();
  if (speedKmh > recentMax || now - recentMaxAt > 2500) {
    recentMax = speedKmh;
    recentMaxAt = now;
  }
  const dropNow = prevSpeed - speedKmh;
  const dropWindow = recentMax - speedKmh;
  const hardStop =
    (prevSpeed >= 25 && dropNow >= 16 && speedKmh < 8) ||
    (recentMax >= 30 && dropWindow >= 22 && speedKmh < 8 && now - recentMaxAt <= 2500);
  if (hardStop) fireCrash("GPS");
  prevSpeed = speedKmh;
}

function onMotion(ev: DeviceMotionEvent) {
  const a = ev.accelerationIncludingGravity;
  if (!a || a.x == null || a.y == null || a.z == null) return;
  const s = useSpeedo.getState();
  if (!s.crash.enabled || !s.tracking || s.crashLeft != null) return;
  const g = gForce(a.x, a.y, a.z);
  if (g >= 4.6 || g <= 0.18) fireCrash("IMU");
}

export async function enableMotion() {
  if (motionOn) return;
  const DM = window.DeviceMotionEvent as
    | (typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> })
    | undefined;
  try {
    if (DM?.requestPermission) {
      const perm = await DM.requestPermission();
      if (perm !== "granted") return;
    }
  } catch {
    return;
  }
  window.addEventListener("devicemotion", onMotion);
  motionOn = true;
}

export function disableMotion() {
  if (!motionOn) return;
  window.removeEventListener("devicemotion", onMotion);
  motionOn = false;
}

export function fireCrash(_why: string) {
  const now = Date.now();
  if (now - lastFire < 90_000) return;
  lastFire = now;
  const s = useSpeedo.getState();
  if (!s.crash.tos) {
    useSpeedo.getState().setBanner("warn", "Bật điều khoản trước khi dùng phát hiện tai nạn");
    return;
  }
  const delay = Math.max(5, Math.min(30, s.crash.delaySec));
  useSpeedo.getState().setCrashLeft(delay);
  startCountdown();
}

function startCountdown() {
  stopCountdown();
  countdownTimer = window.setInterval(() => {
    const left = useSpeedo.getState().crashLeft;
    if (left == null) {
      stopCountdown();
      return;
    }
    if (left <= 1) {
      stopCountdown();
      useSpeedo.getState().setCrashLeft(null);
      void triggerEmergency();
      return;
    }
    useSpeedo.getState().setCrashLeft(left - 1);
  }, 1000);
}

export function cancelCrash() {
  stopCountdown();
  lastFire = Date.now();
  useSpeedo.getState().setCrashLeft(null);
}

function stopCountdown() {
  if (countdownTimer != null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

export async function triggerEmergency() {
  const s = useSpeedo.getState();
  const fix = s.lastFix;
  const loc = fix ? `${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)}` : "không có tọa độ";
  const maps = fix
    ? `https://maps.google.com/?q=${fix.lat},${fix.lon}`
    : "";
  const body = `TAI NAN! Toa do: ${loc}. Toc do: ${s.currentSpeedKmh.toFixed(0)} km/h. ${maps}`;
  const phone = (s.crash.icePhone || "115").replace(/\s+/g, "");

  if (s.crash.autoSms && phone && phone !== "113" && phone !== "114" && phone !== "115") {
    window.location.href = `sms:${phone}&body=${encodeURIComponent(body)}`;
    await new Promise((r) => setTimeout(r, 700));
  }
  if (s.crash.autoCall) {
    window.location.href = `tel:${phone}`;
  }
}

export function dial(number: string) {
  window.location.href = `tel:${number.replace(/\s+/g, "")}`;
}
