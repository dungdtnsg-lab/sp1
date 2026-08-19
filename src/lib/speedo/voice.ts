import { useSpeedo } from "./store";

let unlocked = false;
let lastSpeedSpoken = -1;
let lastSpeedAt = 0;

const ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

export function n2vi(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v < 10) return ONES[v];
  if (v < 20) {
    if (v === 10) return "mười";
    if (v === 11) return "mười một";
    if (v === 15) return "mười lăm";
    return `mười ${ONES[v - 10]}`;
  }
  if (v < 100) {
    const tens = Math.floor(v / 10);
    const u = v % 10;
    const head = `${ONES[tens]} mươi`;
    if (u === 0) return head;
    if (u === 1) return `${head} mốt`;
    if (u === 4) return `${head} tư`;
    if (u === 5) return `${head} lăm`;
    return `${head} ${ONES[u]}`;
  }
  const h = Math.floor(v / 100);
  const rest = v % 100;
  const head = h === 1 ? "một trăm" : `${ONES[h]} trăm`;
  if (rest === 0) return head;
  if (rest < 10) return `${head} lẻ ${ONES[rest]}`;
  return `${head} ${n2vi(rest)}`;
}

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return voices.find((v) => v.lang.toLowerCase().startsWith("vi")) ?? voices[0] ?? null;
}

export function unlockVoice() {
  if (unlocked || typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    unlocked = true;
  } catch {
    /* ignore */
  }
}

export function speak(text: string, priority = false) {
  if (!useSpeedo.getState().voiceOn) return;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    if (priority) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "vi-VN";
    u.rate = 1.05;
    u.pitch = 1;
    const voice = pickVoice();
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function maybeSpeakSpeed(kmh: number) {
  if (!useSpeedo.getState().voiceOn) return;
  const rounded = Math.round(kmh);
  const now = Date.now();
  const jumped = Math.abs(rounded - lastSpeedSpoken) >= 8;
  const due = now - lastSpeedAt > 18000;
  if (lastSpeedSpoken >= 0 && !jumped && !due) return;
  if (rounded < 3) return;
  lastSpeedSpoken = rounded;
  lastSpeedAt = now;
  speak(`${n2vi(rounded)} ki lô mét giờ`);
}

export function speakCamera(name: string, distM: number, limit: number) {
  const dist = distM < 80 ? "sắp tới" : `còn ${n2vi(Math.round(distM / 10) * 10)} mét`;
  speak(
    `Chú ý. Camera phạt nguội ${name}. ${dist}. Giới hạn ${n2vi(limit)} ki lô mét giờ.`,
    true,
  );
}

const LIMIT_CLIPS: Record<number, string> = {
  40: "/voice/limit-40.mp3",
  50: "/voice/limit-50.mp3",
  60: "/voice/limit-60.mp3",
  80: "/voice/limit-80.mp3",
  100: "/voice/limit-100.mp3",
  120: "/voice/limit-120.mp3",
};

let overAudio: HTMLAudioElement | null = null;
let lastOverAt = 0;

export function playOverspeedVoice(limitKmh: number) {
  if (!useSpeedo.getState().voiceOn) return;
  const now = Date.now();
  if (now - lastOverAt < 4800) return;
  lastOverAt = now;
  const src = LIMIT_CLIPS[limitKmh] ?? "/voice/overspeed.mp3";
  try {
    window.speechSynthesis?.cancel();
    overAudio?.pause();
    overAudio = new Audio(src);
    overAudio.volume = 1;
    void overAudio.play().catch(() => {
      speak(`Cảnh báo quá tốc độ. Giới hạn ${n2vi(limitKmh)} ki lô mét giờ.`, true);
    });
  } catch {
    speak(`Cảnh báo quá tốc độ. Giới hạn ${n2vi(limitKmh)} ki lô mét giờ.`, true);
  }
}

export function resetVoice() {
  lastSpeedSpoken = -1;
  lastSpeedAt = 0;
  lastOverAt = 0;
  try {
    overAudio?.pause();
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}
