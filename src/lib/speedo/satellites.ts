import type { Satellite } from "./types";

type Seed = Omit<Satellite, "usedInFix" | "el" | "az" | "cn0"> & {
  el: number;
  az: number;
  cn0: number;
  period: number;
};

const BASE: Seed[] = [
  { prn: "G02", sys: "gps", el: 54, az: 28, cn0: 41, period: 86 },
  { prn: "G05", sys: "gps", el: 22, az: 335, cn0: 33, period: 92 },
  { prn: "G12", sys: "gps", el: 71, az: 48, cn0: 46, period: 78 },
  { prn: "G13", sys: "gps", el: 18, az: 198, cn0: 27, period: 101 },
  { prn: "G15", sys: "gps", el: 41, az: 142, cn0: 38, period: 84 },
  { prn: "G17", sys: "gps", el: 63, az: 255, cn0: 43, period: 90 },
  { prn: "G19", sys: "gps", el: 77, az: 12, cn0: 47, period: 75 },
  { prn: "G21", sys: "gps", el: 9, az: 88, cn0: 22, period: 110 },
  { prn: "G24", sys: "gps", el: 36, az: 276, cn0: 36, period: 88 },
  { prn: "G28", sys: "gps", el: 58, az: 310, cn0: 42, period: 81 },
  { prn: "G29", sys: "gps", el: 14, az: 164, cn0: 25, period: 97 },
  { prn: "G32", sys: "gps", el: 47, az: 221, cn0: 39, period: 85 },
  { prn: "E02", sys: "galileo", el: 62, az: 118, cn0: 44, period: 94 },
  { prn: "E07", sys: "galileo", el: 33, az: 64, cn0: 36, period: 89 },
  { prn: "E08", sys: "galileo", el: 19, az: 205, cn0: 29, period: 102 },
  { prn: "E13", sys: "galileo", el: 71, az: 344, cn0: 45, period: 77 },
  { prn: "E15", sys: "galileo", el: 48, az: 178, cn0: 40, period: 91 },
  { prn: "E21", sys: "galileo", el: 27, az: 292, cn0: 32, period: 99 },
  { prn: "E27", sys: "galileo", el: 56, az: 16, cn0: 42, period: 83 },
  { prn: "E30", sys: "galileo", el: 8, az: 241, cn0: 21, period: 108 },
  { prn: "C06", sys: "beidou", el: 44, az: 96, cn0: 38, period: 87 },
  { prn: "C09", sys: "beidou", el: 66, az: 301, cn0: 44, period: 79 },
  { prn: "C11", sys: "beidou", el: 23, az: 151, cn0: 30, period: 95 },
  { prn: "C14", sys: "beidou", el: 73, az: 42, cn0: 46, period: 74 },
  { prn: "C16", sys: "beidou", el: 37, az: 228, cn0: 35, period: 93 },
  { prn: "C21", sys: "beidou", el: 12, az: 184, cn0: 24, period: 104 },
  { prn: "C24", sys: "beidou", el: 51, az: 333, cn0: 41, period: 82 },
  { prn: "C27", sys: "beidou", el: 29, az: 77, cn0: 33, period: 98 },
  { prn: "C33", sys: "beidou", el: 59, az: 269, cn0: 43, period: 80 },
  { prn: "C36", sys: "beidou", el: 16, az: 8, cn0: 26, period: 106 },
  { prn: "R01", sys: "glonass", el: 39, az: 54, cn0: 37, period: 86 },
  { prn: "R08", sys: "glonass", el: 61, az: 199, cn0: 42, period: 81 },
  { prn: "R11", sys: "glonass", el: 21, az: 318, cn0: 28, period: 100 },
  { prn: "R14", sys: "glonass", el: 47, az: 127, cn0: 39, period: 88 },
  { prn: "R20", sys: "glonass", el: 70, az: 247, cn0: 44, period: 76 },
  { prn: "R23", sys: "glonass", el: 11, az: 351, cn0: 23, period: 107 },
];

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function los(elDeg: number, azDeg: number) {
  const el = (elDeg * Math.PI) / 180;
  const az = (azDeg * Math.PI) / 180;
  const ce = Math.cos(el);
  return [Math.sin(az) * ce, Math.cos(az) * ce, Math.sin(el), 1] as const;
}

function invert4(a: number[]): number[] | null {
  const m = a.slice();
  const inv = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let col = 0; col < 4; col++) {
    let piv = col;
    let best = Math.abs(m[col * 4 + col]);
    for (let r = col + 1; r < 4; r++) {
      const v = Math.abs(m[r * 4 + col]);
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (best < 1e-10) return null;
    if (piv !== col) {
      for (let k = 0; k < 4; k++) {
        const i1 = col * 4 + k;
        const i2 = piv * 4 + k;
        const t = m[i1];
        m[i1] = m[i2];
        m[i2] = t;
        const u = inv[i1];
        inv[i1] = inv[i2];
        inv[i2] = u;
      }
    }
    const div = m[col * 4 + col];
    for (let k = 0; k < 4; k++) {
      m[col * 4 + k] /= div;
      inv[col * 4 + k] /= div;
    }
    for (let r = 0; r < 4; r++) {
      if (r === col) continue;
      const f = m[r * 4 + col];
      for (let k = 0; k < 4; k++) {
        m[r * 4 + k] -= f * m[col * 4 + k];
        inv[r * 4 + k] -= f * inv[col * 4 + k];
      }
    }
  }
  return inv;
}

export type Dop = { hdop: number; vdop: number; pdop: number; tdop: number };

export function computeDop(sats: Satellite[]): Dop | null {
  if (sats.length < 4) return null;
  const N = new Array(16).fill(0);
  for (const s of sats) {
    const row = los(s.el, s.az);
    const w = Math.pow(10, (s.cn0 - 34) / 20);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) N[i * 4 + j] += w * row[i] * row[j];
    }
  }
  const Q = invert4(N);
  if (!Q) return null;
  const hdop = Math.sqrt(Math.max(0, Q[0] + Q[5]));
  const vdop = Math.sqrt(Math.max(0, Q[10]));
  const tdop = Math.sqrt(Math.max(0, Q[15]));
  const pdop = Math.sqrt(Math.max(0, Q[0] + Q[5] + Q[10]));
  if (![hdop, vdop, pdop, tdop].every((n) => Number.isFinite(n))) return null;
  return { hdop, vdop, pdop, tdop };
}

function scoreSat(s: Satellite) {
  return s.el * 1.4 + s.cn0;
}

export function optimizeHdop(all: Satellite[]) {
  let pool = all.filter((s) => s.el >= 15 && s.cn0 >= 28);
  if (pool.length < 6) pool = all.filter((s) => s.el >= 12 && s.cn0 >= 26);
  if (pool.length < 4) {
    const fallback = [...all].sort((a, b) => scoreSat(b) - scoreSat(a)).slice(0, 4);
    return { used: fallback, dop: computeDop(fallback) };
  }

  let chosen = pool;
  let best = computeDop(chosen) ?? { hdop: 9.9, vdop: 9.9, pdop: 9.9, tdop: 9.9 };

  const worstFirst = [...chosen].sort((a, b) => scoreSat(a) - scoreSat(b));
  for (const sat of worstFirst) {
    if (chosen.length <= 8) break;
    const trial = chosen.filter((s) => s.prn !== sat.prn);
    const dop = computeDop(trial);
    if (dop && dop.hdop < best.hdop - 0.015) {
      chosen = trial;
      best = dop;
    }
  }

  return { used: chosen, dop: best };
}

export function hdopGrade(hdop: number) {
  if (hdop < 1) return { label: "XUẤT SẮC", tone: "ok" as const };
  if (hdop < 2) return { label: "TỐT", tone: "cyan" as const };
  if (hdop < 5) return { label: "KHÁ", tone: "warn" as const };
  return { label: "YẾU", tone: "danger" as const };
}

export function generateSatellites(accuracy = 10, nowMs = 0): Satellite[] {
  const t = nowMs / 1000;
  const visible = BASE.map((s, i) => {
    const el = clamp(s.el + Math.sin(t / s.period + i * 0.4) * 11, 4, 88);
    const az = (s.az + (t * 360) / (s.period * 12) + i) % 360;
    const fade = el < 15 ? (el - 4) / 11 : 1;
    const cn0 = clamp(s.cn0 + Math.sin(t / 6.5 + i) * 3.2, 16, 49) * (0.55 + 0.45 * fade);
    return {
      prn: s.prn,
      sys: s.sys,
      el: Math.round(el * 10) / 10,
      az: (az + 360) % 360,
      cn0: Math.round(cn0 * 10) / 10,
      usedInFix: false,
    };
  });
  const { used } = optimizeHdop(visible);
  const ids = new Set(used.map((s) => s.prn));
  return visible.map((s) => ({ ...s, usedInFix: ids.has(s.prn) }));
}

export function constellationColor(sys: Satellite["sys"], used = true) {
  if (!used) return "#64748b";
  if (sys === "galileo") return "#38bdf8";
  if (sys === "beidou") return "#f87171";
  if (sys === "glonass") return "#c084fc";
  return "#facc15";
}

export function constellationLabel(sys: Satellite["sys"]) {
  if (sys === "galileo") return "GAL";
  if (sys === "beidou") return "BDS";
  if (sys === "glonass") return "GLO";
  return "GPS";
}

export function gnssMetrics(sats: Satellite[], accuracy: number | null) {
  const used = sats.filter((s) => s.usedInFix);
  const dop = computeDop(used) ?? { hdop: 9.9, vdop: 9.9, pdop: 9.9, tdop: 9.9 };
  const uere = 2.4;
  const estAcc = dop.hdop * uere;
  const acc = accuracy != null ? Math.min(accuracy, estAcc * 1.15) : estAcc;
  const by = {
    gps: sats.filter((s) => s.sys === "gps"),
    galileo: sats.filter((s) => s.sys === "galileo"),
    beidou: sats.filter((s) => s.sys === "beidou"),
    glonass: sats.filter((s) => s.sys === "glonass"),
  };
  return {
    used: used.length,
    view: sats.length,
    hdop: dop.hdop,
    vdop: dop.vdop,
    pdop: dop.pdop,
    tdop: dop.tdop,
    acc,
    grade: hdopGrade(dop.hdop),
    fix: used.length >= 4 ? "3D" : used.length >= 3 ? "2D" : "NO FIX",
    by,
  };
}
