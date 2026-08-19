import { useSpeedo } from "./store";
import { convertSpeed, unitLabel } from "./helpers";

export type SavedClip = {
  id: string;
  at: string;
  name: string;
  cam: string;
  url: string;
  blob: Blob;
};

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function pickRecorderMime() {
  const MR = window.MediaRecorder;
  if (!MR) return "";
  const types = [
    "video/mp4",
    "video/mp4;codecs=avc1.42001E,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const t of types) {
    try {
      if (MR.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return "";
}

export function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = useSpeedo.getState();
  const pad = Math.round(w * 0.035);
  const fs = Math.max(18, Math.round(w * 0.032));
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, w, fs * 5.2);
  ctx.font = `700 ${fs}px ui-monospace, SFMono-Regular, monospace`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const now = new Date();
  const date = now.toLocaleString("vi-VN");
  const spd = `${convertSpeed(s.currentSpeedKmh, s.unit).toFixed(0)} ${unitLabel(s.unit)}`;
  const loc = s.lastFix
    ? `${s.lastFix.lat.toFixed(6)}  ${s.lastFix.lon.toFixed(6)}`
    : "NO FIX";
  let y = pad;
  ctx.fillText(date, pad, y);
  y += fs + 8;
  ctx.fillStyle = "#fb923c";
  ctx.fillText(`SPEED  ${spd}`, pad, y);
  y += fs + 8;
  ctx.fillStyle = "#7dd3fc";
  ctx.fillText(loc, pad, y);
  ctx.restore();
}

export function startHudRecorder(video: HTMLVideoElement, w: number, h: number, audio: MediaStreamTrack[]) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  let live = true;
  const tick = () => {
    if (!live || !ctx) return;
    try {
      ctx.drawImage(video, 0, 0, w, h);
      drawHud(ctx, w, h);
    } catch {
      /* video not ready */
    }
    requestAnimationFrame(tick);
  };
  tick();
  const cap = (
    canvas as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }
  ).captureStream?.(30);
  if (cap) {
    for (const t of audio) {
      try {
        cap.addTrack(t);
      } catch {
        /* ignore */
      }
    }
  }
  return {
    stream: cap ?? null,
    canvas,
    stop() {
      live = false;
    },
  };
}

export async function snapshotHud(video: HTMLVideoElement, w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(video, 0, 0, w, h);
  drawHud(ctx, w, h);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.92);
  });
  return blob;
}

export async function persistClip(blob: Blob, name: string, kind: "video" | "photo" = "video") {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const data = await blobToBase64(blob);
  const safe = name.replace(/[^\w.-]+/g, "_");
  const written = await Filesystem.writeFile({
    path: safe,
    data,
    directory: Directory.Cache,
  });
  const uri = written.uri;
  const dataUrl = `data:${blob.type || (kind === "photo" ? "image/jpeg" : "video/mp4")};base64,${data}`;
  let saved = false;
  try {
    const { Media } = await import("@capacitor-community/media");
    if (kind === "photo") {
      await Media.savePhoto({ path: dataUrl });
    } else {
      try {
        await Media.saveVideo({ path: uri });
      } catch {
        await Media.saveVideo({ path: dataUrl });
      }
    }
    saved = true;
  } catch {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: safe, files: [uri] });
      saved = true;
    } catch {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safe;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }
  return { uri, saved };
}

export async function shareExisting(_url: string, name: string, blob: Blob) {
  await persistClip(blob, name, blob.type.startsWith("image/") ? "photo" : "video");
}
