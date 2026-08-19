import { useEffect, useRef, useState } from "react";
import { Camera, History, SwitchCamera, Video, X } from "lucide-react";
import { formatClock, unitLabel, convertSpeed } from "@/lib/speedo/helpers";
import { useSpeedo } from "@/lib/speedo/store";
import { cn } from "@/lib/utils";

type Clip = { url: string; at: string };

export function DashcamPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [recording, setRecording] = useState(false);
  const [err, setErr] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
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
    let dead = false;
    void (async () => {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (dead) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setErr("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Không mở được camera. Cần quyền Camera + Mic.");
      }
    })();
    return () => {
      dead = true;
      recRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  function startRec() {
    const stream = streamRef.current;
    if (!stream) return;
    chunks.current = [];
    const mime = MediaRecorder.isTypeSupported("video/mp4")
      ? "video/mp4"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";
    try {
      const rec = new MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunks.current.push(ev.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType });
        const url = URL.createObjectURL(blob);
        setClips((c) => [{ url, at: new Date().toLocaleString("vi-VN") }, ...c].slice(0, 12));
      };
      rec.start(1000);
      recRef.current = rec;
      setRecording(true);
    } catch {
      setErr("Máy này chưa ghi được video trong app. Vẫn xem camera trực tiếp được.");
    }
  }

  function stopRec() {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-fg">
      <header className="flex shrink-0 items-center justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={() => useSpeedo.getState().setSafetyScreen("menu")}
          className="grid size-9 place-items-center text-xl"
        >
          ‹
        </button>
        <h1 className="text-[15px] font-semibold">Camera ô tô</h1>
        <span className="grid size-9 place-items-center text-muted">
          <Camera className="size-4" />
        </span>
      </header>
      <div className="relative min-h-0 flex-1 bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
        <div className="pointer-events-none absolute top-3 left-4 font-mono text-[15px] leading-relaxed text-white drop-shadow-[0_1px_4px_#000]">
          <div>
            {new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}, {stamp}
          </div>
          <div>
            Speed - {convertSpeed(speed, unit).toFixed(0)} {unitLabel(unit).toUpperCase()}
          </div>
          <div>
            {fix ? `${fix.lat.toFixed(6)}  ${fix.lon.toFixed(6)}` : "—  —"}
          </div>
        </div>
        {err && (
          <div className="absolute inset-x-4 top-1/3 rounded-md bg-black/70 px-3 py-2 text-center text-[12px] text-rose-200">
            {err}
          </div>
        )}
        {showHistory && (
          <div className="absolute inset-0 z-10 overflow-y-auto bg-black/90 p-3">
            <p className="mb-2 text-[12px] font-bold">Lịch sử ghi</p>
            {clips.length === 0 ? (
              <p className="text-[12px] text-muted">Chưa có clip</p>
            ) : (
              clips.map((c) => (
                <a
                  key={c.url}
                  href={c.url}
                  download={`dashcam-${c.at}.mp4`}
                  className="mb-2 block rounded-md border border-border px-3 py-2 text-[12px]"
                >
                  {c.at}
                </a>
              ))
            )}
          </div>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-around px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => (recording ? stopRec() : startRec())}
          className="grid size-16 place-items-center rounded-full border-4 border-white/20 bg-zinc-900"
          title="Ghi hình"
        >
          {recording ? (
            <span className="size-7 rounded-sm bg-danger" />
          ) : (
            <Video className="size-7 text-danger" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
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
