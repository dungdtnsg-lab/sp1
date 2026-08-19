import { useEffect, useRef, useState } from "react";
import { History, SwitchCamera, Video, X } from "lucide-react";
import { persistClip, pickRecorderMime, shareExisting, type SavedClip } from "@/lib/speedo/dashcam-save";
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
  const chunks = useRef<Record<string, Blob[]>>({ rear: [], front: [] });
  const [mode, setMode] = useState<CamMode>("rear");
  const [res, setRes] = useState<Res>(720);
  const [recording, setRecording] = useState(false);
  const [err, setErr] = useState("");
  const [clips, setClips] = useState<SavedClip[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [stamp, setStamp] = useState("");
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
      const { w, h } = RES[res];
      const wantRear = mode !== "front";
      const wantFront = mode !== "rear";
      try {
        if (wantRear) {
          const stream = await openCam("environment", w, h, true);
          if (dead) return stream.getTracks().forEach((t) => t.stop());
          rearStream.current = stream;
          if (rearRef.current) {
            rearRef.current.srcObject = stream;
            await rearRef.current.play().catch(() => undefined);
          }
        }
        if (wantFront) {
          try {
            const stream = await openCam("user", Math.min(w, 1280), Math.min(h, 720), mode === "front");
            if (dead) return stream.getTracks().forEach((t) => t.stop());
            frontStream.current = stream;
            if (frontRef.current) {
              frontRef.current.srcObject = stream;
              await frontRef.current.play().catch(() => undefined);
            }
          } catch {
            if (mode === "dual") setErr("iPhone đang giữ cam sau. Cam trước không mở song song được — ghi cam sau.");
            else throw new Error("Không mở được camera trước.");
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

  useEffect(() => () => stopStreams(), []);

  function stopStreams() {
    rearStream.current?.getTracks().forEach((t) => t.stop());
    frontStream.current?.getTracks().forEach((t) => t.stop());
    rearStream.current = null;
    frontStream.current = null;
  }

  async function startRec() {
    if (!window.MediaRecorder) {
      setErr("WebView iOS này không có MediaRecorder — không ghi được file.");
      return;
    }
    const mime = pickRecorderMime();
    const jobs: { key: string; stream: MediaStream }[] = [];
    if (rearStream.current) jobs.push({ key: "rear", stream: rearStream.current });
    if (frontStream.current) jobs.push({ key: "front", stream: frontStream.current });
    if (!jobs.length) {
      setErr("Chưa có camera.");
      return;
    }
    chunks.current = { rear: [], front: [] };
    recorders.current = [];
    try {
      for (const job of jobs) {
        const rec = mime
          ? new MediaRecorder(job.stream, { mimeType: mime, videoBitsPerSecond: res >= 1080 ? 8_000_000 : 4_000_000 })
          : new MediaRecorder(job.stream);
        rec.ondataavailable = (ev) => {
          if (ev.data.size) chunks.current[job.key].push(ev.data);
        };
        rec.start(400);
        recorders.current.push(rec);
      }
      setRecording(true);
      setErr("");
    } catch {
      setErr("Không khởi động ghi hình được. Thử 720p, tắt cam kép.");
    }
  }

  async function stopRec() {
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
    setRecording(false);
    const stampId = Date.now();
    const next: SavedClip[] = [];
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
      await persistClip(blob, name);
    }
    if (next.length) setClips((c) => [...next, ...c].slice(0, 16));
    else setErr("Không có dữ liệu video. Thử lại, hoặc hạ độ phân giải.");
  }

  const showRear = mode !== "front";

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
        {showRear && (
          <video ref={rearRef} className="h-full w-full object-cover" playsInline muted autoPlay />
        )}
        {mode === "front" && (
          <video ref={frontRef} className="h-full w-full object-cover" playsInline muted autoPlay />
        )}
        {mode === "dual" && (
          <video
            ref={frontRef}
            className="absolute top-3 right-3 z-10 h-36 w-24 rounded-lg border-2 border-white/70 object-cover"
            playsInline
            muted
            autoPlay
          />
        )}
        <div className="pointer-events-none absolute top-3 left-4 font-mono text-[14px] leading-relaxed text-white drop-shadow-[0_1px_4px_#000]">
          <div>
            {new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}, {stamp}
          </div>
          <div>
            Speed - {convertSpeed(speed, unit).toFixed(0)} {unitLabel(unit).toUpperCase()}
          </div>
          <div>{fix ? `${fix.lat.toFixed(6)}  ${fix.lon.toFixed(6)}` : "—  —"}</div>
          {recording && <div className="mt-1 font-bold text-danger">● REC {res}p</div>}
        </div>
        {err && (
          <div className="absolute inset-x-4 bottom-3 rounded-md bg-black/70 px-3 py-2 text-center text-[12px] text-rose-200">
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

async function openCam(facing: "environment" | "user", w: number, h: number, audio: boolean) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: w },
        height: { ideal: h },
      },
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({
      audio,
      video: { facingMode: facing },
    });
  }
}
