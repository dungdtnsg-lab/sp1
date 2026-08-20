import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { History, SwitchCamera, Video, X } from "lucide-react";
import {
  persistClip,
  pickRecorderMime,
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
  const nativeDual = useRef(false);
  const nativeHudTimer = useRef<number | null>(null);
  const chunks = useRef<Record<string, Blob[]>>({ rear: [], front: [] });
  const [mode, setMode] = useState<CamMode>("rear");
  const [res, setRes] = useState<Res>(720);
  const [recording, setRecording] = useState(false);
  const [err, setErr] = useState("");
  const [clips, setClips] = useState<SavedClip[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [stamp, setStamp] = useState("");
  const [liveCam, setLiveCam] = useState("");
  const speed = useSpeedo((s) => s.currentSpeedKmh);
  const unit = useSpeedo((s) => s.unit);
  const fix = useSpeedo((s) => s.lastFix);

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
  }, [mode, res]);

  useEffect(
    () => () => {
      stopStreams();
      stopNativeHudUpdates();
      if (nativeDual.current) void DashcamNative.stop().catch(() => undefined);
    },
    [],
  );

  function stopStreams() {
    rearStream.current?.getTracks().forEach((t) => t.stop());
    frontStream.current?.getTracks().forEach((t) => t.stop());
    rearStream.current = null;
    frontStream.current = null;
  }

  function hudText() {
    const latest = useSpeedo.getState();
    const loc = latest.lastFix
      ? `${latest.lastFix.lat.toFixed(6)}  ${latest.lastFix.lon.toFixed(6)}`
      : "—  —";
    return [
      new Date().toLocaleString("vi-VN"),
      `SPEED  ${convertSpeed(latest.currentSpeedKmh, latest.unit).toFixed(0)} ${unitLabel(latest.unit).toUpperCase()}`,
      loc,
      "CAM SAU + CAM TRƯỚC",
    ].join("\n");
  }

  function stopNativeHudUpdates() {
    if (nativeHudTimer.current != null) window.clearInterval(nativeHudTimer.current);
    nativeHudTimer.current = null;
  }

  async function startNativeDual() {
    await DashcamNative.startDual({ width: RES[res].w, height: RES[res].h, hud: hudText() });
    nativeDual.current = true;
    nativeHudTimer.current = window.setInterval(() => {
      void DashcamNative.updateHud({ text: hudText() }).catch(() => undefined);
    }, 1000);
  }

  async function startRec() {
    if (!window.MediaRecorder) {
      setErr("WebView iOS này không có MediaRecorder — không ghi được file.");
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
    if (mode === "dual" && Capacitor.isNativePlatform()) {
      stopStreams();
      try {
        await startNativeDual();
        setRecording(true);
        setErr("Đang ghi đồng thời cam sau + cam trước, HUD sẽ được lưu trực tiếp vào Ảnh.");
        return;
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Không khởi động được quay kép native.");
        setMode("rear");
        return;
      }
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
      setErr("Không khởi động ghi hình được. Thử 720p, tắt cam kép.");
    }
  }

  async function stopRec() {
    if (nativeDual.current) {
      try {
        await DashcamNative.stop();
        setErr("Đã lưu video HUD hai camera vào thư viện Ảnh.");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Không thể lưu video hai camera.");
      } finally {
        nativeDual.current = false;
        stopNativeHudUpdates();
        setRecording(false);
      }
      return;
    }
    const recs = recorders.current;
    recorders.current = [];
    await Promise.all(
      recs.map(
        (rec) =>
          new Promise<void>((resolve) => {
            rec.onstop = () => resolve();
            try {
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
    for (const key of ["rear", "front"] as const) {
      const parts = chunks.current[key];
      if (!parts.length) continue;
      const type = recs[0]?.mimeType || "video/mp4";
      const blob = new Blob(parts, { type });
      const ext = type.includes("webm") ? "webm" : "mp4";
      const name = `dashcam-${key}-${stampId}.${ext}`;
      const url = URL.createObjectURL(blob);
      next.push({
        id: `${key}-${stampId}`,
        at: new Date().toLocaleString("vi-VN"),
        name,
        cam: key === "rear" ? "Cam sau" : "Cam trước",
        url,
        blob,
      });
      const videoEl = key === "rear" ? rearRef.current : frontRef.current;
      try {
        const photo = videoEl ? await snapshotHud(videoEl, w, h) : null;
        const vid = await persistClip(blob, name, "video");
        if (photo) await persistClip(photo, `dashcam-${key}-${stampId}.jpg`, "photo");
        if (!vid.saved) setErr("Video đã ghi. Mở Share → Lưu Video để đưa vào Ảnh.");
        else setErr("Đã lưu video + ảnh thông số vào thư viện Ảnh.");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ghi xong nhưng chưa vào Ảnh. Bấm lịch sử → Lưu.");
      }
    }
    if (next.length) setClips((c) => [...next, ...c].slice(0, 16));
    else setErr("Không có dữ liệu video. Thử lại, hoặc hạ độ phân giải.");
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-fg">
      <header className="island-pad flex shrink-0 items-center justify-between px-3 pb-2">
        <button
          type="button"
          onClick={() => useSpeedo.getState().setSafetyScreen("menu")}
          className="grid size-9 place-items-center text-xl"
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
            disabled={recording}
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
            disabled={recording}
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
        {recording && nativeDual.current && (
          <div className="absolute inset-0 grid place-items-center bg-black/75 px-8 text-center text-[14px] font-bold text-white">
            Đang ghi đồng thời camera trước + sau bằng camera native\nHUD được ghép vào video khi lưu.
          </div>
        )}
        {err && (
          <div
            className={cn(
              "absolute inset-x-4 bottom-3 rounded-md bg-black/70 px-3 py-2 text-center text-[12px]",
              err.startsWith("Đã lưu") ? "text-emerald-200" : "text-rose-200",
            )}
          >
            {err}
          </div>
        )}
        {showHistory && (
          <div className="absolute inset-0 z-20 overflow-y-auto bg-black/92 p-3">
            <p className="mb-2 text-[12px] font-bold">File đã ghi — bấm để lưu / chia sẻ</p>
            {clips.length === 0 ? (
              <p className="text-[12px] text-muted">Chưa có clip. Bấm nút đỏ để quay, bấm vuông để dừng và lưu.</p>
            ) : (
              clips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void shareExisting(c.url, c.name, c.blob)}
                  className="mb-2 flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-[12px]"
                >
                  <span>
                    {c.cam} · {c.at}
                  </span>
                  <span className="text-cyan">Lưu</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-around px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => (recording ? void stopRec() : void startRec())}
          className="grid size-16 place-items-center rounded-full border-4 border-white/20 bg-zinc-900"
          title="Ghi hình"
        >
          {recording ? <span className="size-7 rounded-sm bg-danger" /> : <Video className="size-7 text-danger" />}
        </button>
        <button
          type="button"
          disabled={recording}
          onClick={() => setMode((m) => (m === "rear" ? "front" : "rear"))}
          className="grid size-16 place-items-center rounded-full border border-white/15 bg-zinc-900"
          title="Đổi camera"
        >
          <SwitchCamera className="size-7" />
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className={cn(
            "grid size-16 place-items-center rounded-full border border-white/15 bg-zinc-900",
            showHistory && "border-accent",
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
