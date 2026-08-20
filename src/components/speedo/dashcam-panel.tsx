import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { History, SwitchCamera, Video, X } from "lucide-react";
import {
  loadSavedClips,
  persistClip,
  pickRecorderMime,
  rememberSavedClip,
  shareExisting,
  snapshotHud,
  startHudRecorder,
  type SavedClip,
} from "@/lib/speedo/dashcam-save";
import { attachVideo, facingOf, openCam } from "@/lib/speedo/camera";
import { DashcamNative } from "@/lib/speedo/dashcam-native";
import { formatClock, unitLabel, convertSpeed } from "@/lib/speedo/helpers";
import { useSpeedo } from "@/lib/speedo/store";
import { cn } from "@/lib/utils";

type CamMode = "rear" | "front" | "dual";
type Res = 480 | 720 | 1080;

const RES: Record<Res, { w: number; h: number }> = {
  480: { w: 854, h: 480 },
  720: { w: 1280, h: 720 },
  1080: { w: 1920, h: 1080 },
};

export function DashcamPanel() {
  const rearRef = useRef<HTMLVideoElement>(null);
  const frontRef = useRef<HTMLVideoElement>(null);
  const rearStream = useRef<MediaStream | null>(null);
  const frontStream = useRef<MediaStream | null>(null);
  const recorders = useRef<MediaRecorder[]>([]);
  const hudRecorders = useRef<Array<{ stop: () => void }>>([]);
  const nativeRecording = useRef(false);
  const nativeHudTimer = useRef<number | null>(null);
  const chunks = useRef<Record<string, Blob[]>>({ rear: [], front: [] });
  const [mode, setMode] = useState<CamMode>("rear");
  const [res, setRes] = useState<Res>(720);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [clips, setClips] = useState<SavedClip[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [stamp, setStamp] = useState("");
  const [liveCam, setLiveCam] = useState("");
  const speed = useSpeedo((s) => s.currentSpeedKmh);
  const unit = useSpeedo((s) => s.unit);
  const fix = useSpeedo((s) => s.lastFix);
  const nativeAvailable = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("DashcamNative");

  useEffect(() => {
    const id = window.setInterval(() => setStamp(formatClock()), 1000);
    setStamp(formatClock());
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (recording) return;
    let dead = false;
    void (async () => {
      stopStreams();
      setLiveCam("");
      await attachVideo(rearRef.current, null);
      await attachVideo(frontRef.current, null);
      const { w, h } = RES[res];
      try {
        if (mode === "front") {
          const stream = await openCam("user", w, h, true);
          if (dead) return stream.getTracks().forEach((t) => t.stop());
          frontStream.current = stream;
          await attachVideo(frontRef.current, stream);
          setLiveCam(labelFor(stream, "trước"));
        } else {
          const rear = await openCam("environment", w, h, true);
          if (dead) return rear.getTracks().forEach((t) => t.stop());
          rearStream.current = rear;
          await attachVideo(rearRef.current, rear);
          setLiveCam(labelFor(rear, "sau"));
          if (facingOf(rear) === "user") {
            setErr("Máy đang mở cam trước. Bấm Cam sau lần nữa, hoặc tắt app Camera khác.");
          }

          if (mode === "dual") {
            try {
              const front = await openCam("user", Math.min(w, 960), Math.min(h, 540), false);
              if (dead) return front.getTracks().forEach((t) => t.stop());
              if (rear.getVideoTracks().some((t) => t.readyState !== "live")) {
                front.getTracks().forEach((t) => t.stop());
                setErr("iPhone chỉ cho 1 camera lúc này — đang giữ cam sau.");
              } else {
                frontStream.current = front;
                await attachVideo(frontRef.current, front);
              }
            } catch {
              setErr("Không mở được cam trước song song. Đang ghi cam sau.");
            }
          }
        }
        if (mode !== "dual") setErr("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Không mở được camera. Cần quyền Camera + Mic.");
      }
    })();
    return () => {
      dead = true;
      if (!recording) stopStreams();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, res, previewKey]);

  useEffect(
    () => () => {
      stopStreams();
      stopNativeHudUpdates();
      hudRecorders.current.forEach((recorder) => recorder.stop());
      if (nativeRecording.current) void DashcamNative.stop().catch(() => undefined);
    },
    [],
  );

  useEffect(() => {
    if (!showHistory) return;
    let cancelled = false;
    setHistoryLoading(true);
    void loadSavedClips()
      .then((saved) => {
        if (cancelled) return;
        setClips((current) => mergeClips(saved, current));
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showHistory]);

  function stopStreams() {
    rearStream.current?.getTracks().forEach((t) => t.stop());
    frontStream.current?.getTracks().forEach((t) => t.stop());
    rearStream.current = null;
    frontStream.current = null;
  }

  function hudText() {
    const latest = useSpeedo.getState();
    const location = latest.lastFix
      ? `${latest.lastFix.lat.toFixed(6)}  ${latest.lastFix.lon.toFixed(6)}`
      : "—  —";
    const camera = mode === "dual" ? "CAM SAU + CAM TRƯỚC" : mode === "front" ? "CAM TRƯỚC" : "CAM SAU";
    return [
      new Date().toLocaleString("vi-VN"),
      `SPEED  ${convertSpeed(latest.currentSpeedKmh, latest.unit).toFixed(0)} ${unitLabel(latest.unit).toUpperCase()}`,
      location,
      camera,
    ].join("\n");
  }

  function stopNativeHudUpdates() {
    if (nativeHudTimer.current != null) window.clearInterval(nativeHudTimer.current);
    nativeHudTimer.current = null;
  }

  async function startRec() {
    if (recording || saving) return;
    if (nativeAvailable) {
      stopStreams();
      await attachVideo(rearRef.current, null);
      await attachVideo(frontRef.current, null);
      try {
        const started = await DashcamNative.start({
          mode,
          width: RES[res].w,
          height: RES[res].h,
          hud: hudText(),
        });
        nativeRecording.current = true;
        nativeHudTimer.current = window.setInterval(() => {
          void DashcamNative.updateHud({ text: hudText() }).catch(() => undefined);
        }, 1000);
        setRecording(true);
        setErr(started.hasAudio ? "" : "Đang ghi video native; bản này chưa ghi âm thanh.");
      } catch (error) {
        nativeRecording.current = false;
        setPreviewKey((value) => value + 1);
        setErr(error instanceof Error ? error.message : "Không khởi động được camera native.");
      }
      return;
    }
    if (!window.MediaRecorder) {
      setErr("Thiết bị này không có bộ ghi native hoặc MediaRecorder.");
      return;
    }
    const mime = pickRecorderMime();
    const jobs: { key: string; video: HTMLVideoElement | null; stream: MediaStream }[] = [];
    if (rearStream.current) jobs.push({ key: "rear", video: rearRef.current, stream: rearStream.current });
    if (frontStream.current) jobs.push({ key: "front", video: frontRef.current, stream: frontStream.current });
    if (!jobs.length) {
      setErr("Chưa có camera.");
      return;
    }
    chunks.current = { rear: [], front: [] };
    recorders.current = [];
    hudRecorders.current = [];
    try {
      for (const job of jobs) {
        const hudRecorder = job.video
          ? startHudRecorder(job.video, RES[res].w, RES[res].h, job.stream.getAudioTracks())
          : null;
        const recStream = hudRecorder?.stream ?? job.stream;
        const rec = mime
          ? new MediaRecorder(recStream, { mimeType: mime, videoBitsPerSecond: res >= 1080 ? 8_000_000 : 4_000_000 })
          : new MediaRecorder(recStream);
        rec.ondataavailable = (ev) => {
          if (ev.data.size) chunks.current[job.key].push(ev.data);
        };
        rec.start(400);
        recorders.current.push(rec);
        if (hudRecorder) hudRecorders.current.push(hudRecorder);
      }
      setRecording(true);
      setErr("");
    } catch {
      recorders.current.forEach((recorder) => {
        if (recorder.state !== "inactive") recorder.stop();
      });
      recorders.current = [];
      hudRecorders.current.forEach((recorder) => recorder.stop());
      hudRecorders.current = [];
      setErr("Không khởi động ghi hình được. Thử 720p, tắt cam kép.");
    }
  }

  async function stopRec() {
    if (saving) return;
    setSaving(true);
    if (nativeRecording.current) {
      try {
        const result = await DashcamNative.stop();
        const clip: SavedClip = {
          id: result.assetIdentifier ?? result.path,
          at: new Date(result.createdAt).toLocaleString("vi-VN"),
          name: result.name,
          cam: result.mode === "dual" ? "Cam sau + trước" : result.mode === "front" ? "Cam trước" : "Cam sau",
          saved: result.saved,
          assetIdentifier: result.assetIdentifier,
          url: result.path,
          durationSec: result.duration,
        };
        rememberSavedClip(clip);
        setClips((current) => mergeClips([clip], current));
        setErr(
          result.saved
            ? `Đã lưu video vào Ảnh › ${result.albumName}.`
            : result.error || "Video đã ghi trong app nhưng chưa được thêm vào Ảnh. Mở Lịch sử để chia sẻ/lưu.",
        );
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Không thể hoàn tất video camera.");
      } finally {
        nativeRecording.current = false;
        stopNativeHudUpdates();
        setRecording(false);
        setSaving(false);
        setPreviewKey((value) => value + 1);
      }
      return;
    }

    const recs = recorders.current;
    recorders.current = [];
    await Promise.all(
      recs.map(
        (rec) =>
          new Promise<void>((resolve) => {
            if (rec.state === "inactive") return resolve();
            rec.onstop = () => resolve();
            try {
              rec.requestData();
              rec.stop();
            } catch {
              resolve();
            }
          }),
      ),
    );
    hudRecorders.current.forEach((recorder) => recorder.stop());
    hudRecorders.current = [];
    setRecording(false);
    const stampId = Date.now();
    const next: SavedClip[] = [];
    const { w, h } = RES[res];
    let savedCount = 0;
    let manualCount = 0;
    let lastFailure = "";
    for (const key of ["rear", "front"] as const) {
      const parts = chunks.current[key];
      if (!parts.length) continue;
      const type = recs[0]?.mimeType || "video/mp4";
      const blob = new Blob(parts, { type });
      const ext = type.includes("webm") ? "webm" : "mp4";
      const name = `dashcam-${key}-${stampId}.${ext}`;
      const url = URL.createObjectURL(blob);
      const videoEl = key === "rear" ? rearRef.current : frontRef.current;
      try {
        const photo = videoEl ? await snapshotHud(videoEl, w, h) : null;
        const vid = await persistClip(blob, name, "video");
        if (photo) void persistClip(photo, `dashcam-${key}-${stampId}.jpg`, "photo").catch(() => undefined);
        if (vid.saved) savedCount += 1;
        else manualCount += 1;
        const clip: SavedClip = {
          id: vid.assetIdentifier ?? `${key}-${stampId}`,
          at: new Date().toLocaleString("vi-VN"),
          name,
          cam: key === "rear" ? "Cam sau" : "Cam trước",
          saved: vid.saved,
          assetIdentifier: vid.assetIdentifier,
          url: vid.uri.startsWith("file:") ? vid.uri : url,
          blob,
        };
        rememberSavedClip(clip);
        next.push(clip);
      } catch (e) {
        manualCount += 1;
        lastFailure = e instanceof Error ? e.message : "Ghi xong nhưng chưa vào Ảnh.";
        next.push({
          id: `${key}-${stampId}`,
          at: new Date().toLocaleString("vi-VN"),
          name,
          cam: key === "rear" ? "Cam sau" : "Cam trước",
          saved: false,
          url,
          blob,
        });
      }
    }
    if (next.length) {
      setClips((current) => mergeClips(next, current));
      if (manualCount === 0) setErr(`Đã lưu ${savedCount} video vào album GPS Speedometer trong Ảnh.`);
      else setErr(lastFailure || "Video đã ghi nhưng chưa xác nhận lưu vào Ảnh. Mở Lịch sử để thử lại.");
    } else {
      setErr("Không có dữ liệu video. Hãy quay ít nhất 3 giây hoặc hạ độ phân giải.");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-fg">
      <header className="island-pad flex shrink-0 items-center justify-between px-3 pb-2">
        <button
          type="button"
          disabled={recording || saving}
          onClick={() => useSpeedo.getState().setSafetyScreen("menu")}
          className="grid size-9 place-items-center text-xl disabled:opacity-35"
        >
          ‹
        </button>
        <h1 className="text-[15px] font-semibold">Camera ô tô</h1>
        <span className="w-9" />
      </header>

      <div className="flex shrink-0 items-center gap-1.5 px-3 pb-2">
        {(["rear", "front", "dual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={recording || saving}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-[11px] font-bold",
              mode === m ? "bg-accent text-fg" : "bg-zinc-900 text-slate-300",
            )}
          >
            {m === "rear" ? "Cam sau" : m === "front" ? "Cam trước" : "Cả hai"}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 px-3 pb-2">
        {([480, 720, 1080] as const).map((r) => (
          <button
            key={r}
            type="button"
            disabled={recording || saving}
            onClick={() => setRes(r)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-[11px] font-bold",
              res === r ? "bg-cyan/20 text-cyan" : "bg-zinc-900 text-slate-300",
            )}
          >
            {r}p
          </button>
        ))}
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={rearRef}
          className={cn("h-full w-full object-cover", mode === "front" && "hidden")}
          playsInline
          muted
          autoPlay
        />
        <video
          ref={frontRef}
          className={cn(
            "object-cover",
            mode === "front" && "h-full w-full",
            mode === "dual" && "absolute top-3 right-3 z-10 h-36 w-24 rounded-lg border-2 border-white/70",
            mode === "rear" && "hidden",
          )}
          playsInline
          muted
          autoPlay
        />
        <div className="pointer-events-none absolute top-3 left-4 font-mono text-[14px] leading-relaxed text-white drop-shadow-[0_1px_4px_#000]">
          <div>
            {new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}, {stamp}
          </div>
          <div>
            Speed - {convertSpeed(speed, unit).toFixed(0)} {unitLabel(unit).toUpperCase()}
          </div>
          <div>{fix ? `${fix.lat.toFixed(6)}  ${fix.lon.toFixed(6)}` : "—  —"}</div>
          <div className="font-bold text-cyan">{liveCam || (mode === "front" ? "Cam trước" : "Cam sau")}</div>
          {recording && <div className="mt-1 font-bold text-danger">● REC {res}p</div>}
        </div>
        {recording && nativeRecording.current && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/65 px-8 text-center text-[13px] font-bold text-white">
            Đang ghi bằng camera native. HUD được ghép trực tiếp vào video.
          </div>
        )}
        {err && (
          <div
            className={cn(
              "absolute inset-x-4 bottom-3 rounded-md bg-black/70 px-3 py-2 text-center text-[12px]",
              err.startsWith("Đã lưu")
                ? "text-emerald-200"
                : err.startsWith("Đang ghi")
                  ? "text-amber-200"
                  : "text-rose-200",
            )}
          >
            {err}
          </div>
        )}
        {showHistory && (
          <div className="absolute inset-0 z-20 overflow-y-auto bg-black/92 p-3">
            <p className="mb-2 text-[12px] font-bold">Thư viện Camera ô tô — album GPS Speedometer</p>
            {historyLoading && clips.length === 0 ? (
              <p className="text-[12px] text-muted">Đang đọc video đã lưu trong Ảnh…</p>
            ) : clips.length === 0 ? (
              <p className="text-[12px] text-muted">Chưa có clip. Bấm nút đỏ để quay, bấm vuông để dừng và lưu.</p>
            ) : (
              clips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    void shareExisting(c)
                      .then((result) => {
                        if (c.saved || !result.saved) return;
                        const updated = {
                          ...c,
                          id: result.assetIdentifier ?? c.id,
                          saved: true,
                          assetIdentifier: result.assetIdentifier,
                        };
                        rememberSavedClip(updated);
                        setClips((current) =>
                          current.map((clip) => (clip.id === c.id ? updated : clip)),
                        );
                        setErr("Đã lưu video vào album GPS Speedometer trong Ảnh.");
                      })
                      .catch((error) => {
                        setErr(error instanceof Error ? error.message : "Không mở được video để chia sẻ.");
                      });
                  }}
                  className="mb-2 flex w-full items-center gap-2 rounded-md border border-border px-2 py-2 text-left text-[12px]"
                >
                  {c.thumbnailUrl ? (
                    <img src={c.thumbnailUrl} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="grid h-12 w-16 shrink-0 place-items-center rounded bg-zinc-900">
                      <Video className="size-5 text-danger" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.cam}</span>
                    <span className="block text-[10px] text-muted">
                      {c.at}
                      {c.durationSec ? ` · ${Math.max(1, Math.round(c.durationSec))} giây` : ""}
                    </span>
                  </span>
                  <span className={c.saved ? "text-cyan" : "text-warn"}>{c.saved ? "Chia sẻ" : "Lưu lại"}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-around px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={saving || (!recording && !nativeAvailable && !liveCam)}
          onClick={() => (recording ? void stopRec() : void startRec())}
          className="grid size-16 place-items-center rounded-full border-4 border-white/20 bg-zinc-900 disabled:opacity-40"
          title={saving ? "Đang lưu video" : recording ? "Dừng và lưu" : liveCam || nativeAvailable ? "Ghi hình" : "Đang mở camera"}
        >
          {saving ? (
            <span className="text-xs font-bold text-warn">LƯU</span>
          ) : recording ? (
            <span className="size-7 rounded-sm bg-danger" />
          ) : (
            <Video className="size-7 text-danger" />
          )}
        </button>
        <button
          type="button"
          disabled={recording || saving}
          onClick={() => setMode((m) => (m === "rear" ? "front" : "rear"))}
          className="grid size-16 place-items-center rounded-full border border-white/15 bg-zinc-900"
          title="Đổi camera"
        >
          <SwitchCamera className="size-7" />
        </button>
        <button
          type="button"
          disabled={recording || saving}
          onClick={() => setShowHistory((v) => !v)}
          className={cn(
            "grid size-16 place-items-center rounded-full border border-white/15 bg-zinc-900",
            showHistory && "border-accent",
            (recording || saving) && "opacity-40",
          )}
          title="Lịch sử"
        >
          {showHistory ? <X className="size-7" /> : <History className="size-7" />}
        </button>
      </footer>
    </div>
  );
}

function labelFor(stream: MediaStream, fallback: string) {
  const name = stream.getVideoTracks()[0]?.label;
  if (name) return name;
  return fallback === "sau" ? "Cam sau" : "Cam trước";
}

function mergeClips(primary: SavedClip[], secondary: SavedClip[]) {
  const byId = new Map<string, SavedClip>();
  for (const clip of [...primary, ...secondary]) {
    if (!byId.has(clip.id)) byId.set(clip.id, clip);
  }
  return [...byId.values()].slice(0, 24);
}
