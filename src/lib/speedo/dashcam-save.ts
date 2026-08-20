import { useSpeedo } from "./store";
import { convertSpeed, unitLabel } from "./helpers";

export type SavedClip = {
  id: string;
  at: string;
  name: string;
  cam: string;
  saved: boolean;
  url?: string;
  blob?: Blob;
  assetIdentifier?: string;
  thumbnailUrl?: string;
  durationSec?: number;
};

export type PersistResult = {
  uri: string;
  saved: boolean;
  shared?: boolean;
  assetIdentifier?: string;
};

type MediaBridge = {
  getAlbums(): Promise<{ albums: Array<{ identifier: string; name: string }> }>;
  createAlbum(options: { name: string }): Promise<void>;
  getMedias(options: {
    quantity: number;
    thumbnailWidth: number;
    thumbnailHeight: number;
    thumbnailQuality: number;
    types: "videos";
    albumIdentifier: string;
  }): Promise<{
    medias: Array<{
      identifier: string;
      data: string;
      creationDate: string;
      duration?: number;
    }>;
  }>;
  getMediaByIdentifier(options: { identifier: string }): Promise<{ path: string }>;
  savePhoto(options: { path: string; albumIdentifier?: string }): Promise<{ identifier?: string }>;
  saveVideo(options: { path: string; albumIdentifier?: string }): Promise<{ identifier?: string }>;
};

const DASHCAM_ALBUM = "GPS Speedometer";
const LOCAL_CLIPS_KEY = "speedo.dashcam.clips.v1";
let albumPromise: Promise<string | undefined> | null = null;

export async function persistClip(
  blob: Blob,
  name: string,
  kind: "video" | "photo" = "video",
): Promise<PersistResult> {
  if (!blob || blob.size < 64) {
    throw new Error("File rỗng — quay ít nhất 3 giây rồi bấm dừng.");
  }
  const mime = blob.type || (kind === "photo" ? "image/jpeg" : "video/mp4");
  const safe = (name || `clip-${Date.now()}`).replace(/[^\w.-]+/g, "_");
  const data = await blobToBase64(blob);
  if (!data) throw new Error("Không đọc được dữ liệu video.");
  const dataUrl = `data:${mime};base64,${data}`;

  try {
    const { Media } = await import("@capacitor-community/media");
    const media = Media as MediaBridge;
    const albumIdentifier = await ensureAlbum(media).catch(() => undefined);
    const result =
      kind === "photo"
        ? await media.savePhoto({ path: dataUrl, albumIdentifier })
        : await media.saveVideo({ path: dataUrl, albumIdentifier });
    return { uri: dataUrl, saved: true, assetIdentifier: result.identifier };
  } catch {
    /* fall through */
  }

  let uri = "";
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const written = await Filesystem.writeFile({
      path: `speedo/${safe}`,
      data,
      directory: Directory.Documents,
      recursive: true,
    });
    uri = written.uri;
    try {
      const { Media } = await import("@capacitor-community/media");
      const media = Media as MediaBridge;
      const albumIdentifier = await ensureAlbum(media).catch(() => undefined);
      const result =
        kind === "photo"
          ? await media.savePhoto({ path: uri, albumIdentifier })
          : await media.saveVideo({ path: uri, albumIdentifier });
      return { uri, saved: true, assetIdentifier: result.identifier };
    } catch {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: safe, files: [uri] });
      return { uri, saved: false, shared: true };
    }
  } catch {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safe;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { uri: url, saved: false };
  }
}

async function ensureAlbum(media: MediaBridge) {
  albumPromise ??= (async () => {
    const current = await media.getAlbums();
    const existing = current.albums.find((album) => album.name === DASHCAM_ALBUM);
    if (existing) return existing.identifier;
    await media.createAlbum({ name: DASHCAM_ALBUM });
    const refreshed = await media.getAlbums();
    return refreshed.albums.find((album) => album.name === DASHCAM_ALBUM)?.identifier;
  })();
  try {
    return await albumPromise;
  } catch (error) {
    albumPromise = null;
    throw error;
  }
}

export async function loadSavedClips(): Promise<SavedClip[]> {
  const local = loadLocalClips();
  try {
    const { Media } = await import("@capacitor-community/media");
    const media = Media as MediaBridge;
    const albums = await media.getAlbums();
    const album = albums.albums.find((entry) => entry.name === DASHCAM_ALBUM);
    if (!album) return local;
    const result = await media.getMedias({
      quantity: 24,
      thumbnailWidth: 240,
      thumbnailHeight: 160,
      thumbnailQuality: 72,
      types: "videos",
      albumIdentifier: album.identifier,
    });
    const photos = result.medias.map((asset) => ({
      id: asset.identifier,
      at: formatSavedAt(asset.creationDate),
      name: `dashcam-${asset.creationDate || Date.now()}.mp4`,
      cam: "Đã lưu trong Ảnh",
      saved: true,
      assetIdentifier: asset.identifier,
      thumbnailUrl: asset.data ? `data:image/jpeg;base64,${asset.data}` : undefined,
      durationSec: asset.duration,
    }));
    const photoIds = new Set(photos.map((clip) => clip.id));
    return [...photos, ...local.filter((clip) => !photoIds.has(clip.id))];
  } catch {
    return local;
  }
}

export function rememberSavedClip(clip: SavedClip) {
  const durableUrl = clip.url?.startsWith("file:") ? clip.url : undefined;
  if (!clip.assetIdentifier && !durableUrl) return;
  try {
    const next: SavedClip = {
      id: clip.id,
      at: clip.at,
      name: clip.name,
      cam: clip.cam,
      saved: clip.saved,
      assetIdentifier: clip.assetIdentifier,
      durationSec: clip.durationSec,
      url: durableUrl,
    };
    const current = loadLocalClips().filter(
      (entry) =>
        entry.id !== clip.id &&
        (!durableUrl || entry.url !== durableUrl) &&
        (!clip.assetIdentifier || entry.assetIdentifier !== clip.assetIdentifier),
    );
    localStorage.setItem(LOCAL_CLIPS_KEY, JSON.stringify([next, ...current].slice(0, 48)));
  } catch {
    /* Storage có thể bị tắt; video trong Photos/Documents vẫn không bị xóa. */
  }
}

function loadLocalClips(): SavedClip[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_CLIPS_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (clip): clip is SavedClip =>
        Boolean(
          clip &&
            typeof clip === "object" &&
            "id" in clip &&
            typeof clip.id === "string" &&
            "name" in clip &&
            typeof clip.name === "string" &&
            "saved" in clip &&
            typeof clip.saved === "boolean",
        ),
    );
  } catch {
    return [];
  }
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("vi-VN") : value;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
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

export function drawHud(ctx: CanvasRenderingContext2D, w: number, _h: number) {
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

export async function shareExisting(clip: SavedClip): Promise<PersistResult> {
  if (clip.assetIdentifier) {
    const { Media } = await import("@capacitor-community/media");
    const media = Media as MediaBridge;
    const file = await media.getMediaByIdentifier({ identifier: clip.assetIdentifier });
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: clip.name, files: [file.path] });
    return { uri: file.path, saved: true, assetIdentifier: clip.assetIdentifier };
  }
  if (clip.url?.startsWith("file:")) {
    if (!clip.saved) {
      try {
        const { Media } = await import("@capacitor-community/media");
        const media = Media as MediaBridge;
        const albumIdentifier = await ensureAlbum(media).catch(() => undefined);
        const result = await media.saveVideo({ path: clip.url, albumIdentifier });
        return { uri: clip.url, saved: true, assetIdentifier: result.identifier };
      } catch {
        /* Cho phép người dùng xuất file nếu quyền Photos vẫn bị từ chối. */
      }
    }
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: clip.name, files: [clip.url] });
    return { uri: clip.url, saved: clip.saved, shared: true };
  }
  if (clip.blob) {
    return persistClip(clip.blob, clip.name, clip.blob.type.startsWith("image/") ? "photo" : "video");
  }
  throw new Error("Không tìm thấy file video để chia sẻ.");
}
