import { useRef, useState, type PointerEvent as PE } from "react";
import { convertSpeed, unitLabel } from "@/lib/speedo/helpers";
import { useSpeedo } from "@/lib/speedo/store";

export function PipHud() {
  const on = useSpeedo((s) => s.pipOn);
  const speed = useSpeedo((s) => s.currentSpeedKmh);
  const unit = useSpeedo((s) => s.unit);
  const distance = useSpeedo((s) => s.totalDistanceM);
  const max = useSpeedo((s) => s.maxSpeedKmh);
  const speeds = useSpeedo((s) => s.speeds);
  const avg = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const [pos, setPos] = useState({ x: 24, y: 120 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const suffix = unitLabel(unit);

  function down(e: PE<HTMLDivElement>) {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PE<HTMLDivElement>) {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
  }
  function up() {
    drag.current = null;
  }

  if (!on) return null;
  return (
    <div
      className="fixed z-50 w-[210px] touch-none rounded-xl border border-white/15 bg-black/92 px-3 py-2 shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
    >
      <button
        type="button"
        className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-white text-xs text-black"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => useSpeedo.getState().setPipOn(false)}
      >
        ×
      </button>
      <div className="text-center text-[10px] text-zinc-400">Current Speed</div>
      <div className="flex items-end justify-center gap-1">
        <span className="font-mono text-[44px] leading-none font-black text-danger">
          {convertSpeed(speed, unit).toFixed(0)}
        </span>
        <span className="mb-1 text-[11px] text-zinc-400">{suffix}</span>
      </div>
      <div className="mt-1 grid grid-cols-3 border-t border-white/10 pt-1 text-center">
        <PipCell label="Distance" value={(distance / 1000).toFixed(1)} unit="km" />
        <PipCell label="Avg. Speed" value={convertSpeed(avg, unit).toFixed(0)} unit={suffix} />
        <PipCell label="Max. Speed" value={convertSpeed(max, unit).toFixed(0)} unit={suffix} />
      </div>
    </div>
  );
}

function PipCell({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="text-[8px] text-zinc-500">{label}</div>
      <div className="font-mono text-[15px] font-black text-danger">{value}</div>
      <div className="text-[8px] text-zinc-500">{unit}</div>
    </div>
  );
}

export function PipIntro() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#111]/95 px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-fg">
      <button
        type="button"
        className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-white/10 text-lg"
        onClick={() => useSpeedo.getState().setSafetyScreen("menu")}
      >
        ×
      </button>
      <h2 className="mt-8 text-center text-[22px] leading-snug font-black">
        Tận hưởng chế độ hình trong hình khi ứng dụng ở chế độ nền
      </h2>
      <div className="mx-auto mt-6 w-[240px] rounded-xl border border-white/15 bg-black px-3 py-3">
        <div className="text-center text-[11px] text-zinc-400">Current Speed</div>
        <div className="text-center font-mono text-[52px] leading-none font-black text-danger">80</div>
        <div className="-mt-1 text-center text-[12px] text-zinc-400">km/h</div>
        <div className="mt-2 grid grid-cols-3 border-t border-white/10 pt-2 text-center">
          <PipCell label="Distance" value="13.5" unit="km" />
          <PipCell label="Avg. Speed" value="55" unit="km/h" />
          <PipCell label="Max. Speed" value="88" unit="km/h" />
        </div>
      </div>
      <p className="mt-6 text-center text-[13px] leading-relaxed text-zinc-300">
        Kéo cửa sổ nổi. iOS chỉ cho PiP video hệ thống nếu máy hỗ trợ — luôn có cửa sổ nổi trong app.
      </p>
      <button
        type="button"
        className="mt-auto rounded-full bg-white py-3.5 text-[16px] font-bold text-black"
        onClick={() => {
          useSpeedo.getState().setPipOn(true);
          useSpeedo.getState().setSafetyScreen("menu");
          void startVideoPip();
        }}
      >
        Bắt đầu hình trong hình
      </button>
    </div>
  );
}

async function startVideoPip() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 420;
    canvas.height = 280;
    const ctx = canvas.getContext("2d");
    if (!ctx || !("captureStream" in canvas) || !document.pictureInPictureEnabled) return;
    const draw = () => {
      const s = useSpeedo.getState();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 420, 280);
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 92px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(Math.round(s.currentSpeedKmh)), 210, 130);
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "18px sans-serif";
      ctx.fillText("km/h", 210, 158);
      ctx.font = "16px ui-monospace, monospace";
      ctx.fillStyle = "#ef4444";
      ctx.fillText((s.totalDistanceM / 1000).toFixed(1), 80, 230);
      ctx.fillText(
        String(Math.round(s.speeds.reduce((a, b) => a + b, 0) / Math.max(1, s.speeds.length))),
        210,
        230,
      );
      ctx.fillText(String(Math.round(s.maxSpeedKmh)), 340, 230);
    };
    draw();
    const timer = window.setInterval(draw, 400);
    const stream = (canvas as HTMLCanvasElement & { captureStream: (n: number) => MediaStream }).captureStream(
      8,
    );
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await video.requestPictureInPicture();
    video.addEventListener("leavepictureinpicture", () => window.clearInterval(timer));
  } catch {
    /* in-app HUD is the fallback */
  }
}
