import { useRef, useState } from "react";
import { haptic } from "@/lib/speedo/helpers";
import { useSpeedo } from "@/lib/speedo/store";

export function OledOverlay() {
  const active = useSpeedo((s) => s.oled);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [label, setLabel] = useState("Vuốt sang phải để mở khóa");
  const swipe = useRef<{ startX: number; max: number; dist: number } | null>(null);

  if (!active) return null;

  function reset() {
    setDx(0);
    setLabel("Vuốt sang phải để mở khóa");
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const max = Math.max(0, rect.width - 48);
    swipe.current = { startX: e.clientX, max, dist: 0 };
    trackRef.current?.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!swipe.current) return;
    const dist = Math.min(Math.max(0, e.clientX - swipe.current.startX), swipe.current.max);
    swipe.current.dist = dist;
    setDx(dist);
    setLabel(dist >= swipe.current.max * 0.8 ? "Thả tay để mở khóa" : "Vuốt sang phải để mở khóa");
    e.preventDefault();
  }

  function onUp() {
    if (!swipe.current) return;
    const unlock = swipe.current.dist >= swipe.current.max * 0.8;
    swipe.current = null;
    if (unlock) {
      useSpeedo.getState().setOled(false);
      reset();
      haptic("medium");
    } else reset();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-1.5 text-center text-subtle opacity-80">
        <span className="text-xs font-bold text-ok">GPS ĐANG THEO DÕI NGẦM</span>
        <p className="text-sm">Màn hình đen tiết kiệm pin OLED</p>
        <div
          ref={trackRef}
          className="relative mt-2 h-12 w-[min(82vw,300px)] overflow-hidden rounded-full border border-border bg-elevated touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div
            className="absolute top-1 left-1 h-10 rounded-full bg-ok/30"
            style={{ width: dx + 40 }}
          />
          <div
            className="absolute top-1 left-1 grid size-10 place-items-center rounded-full bg-ok text-2xl font-black text-bg"
            style={{ transform: `translateX(${dx}px)` }}
          >
            ›
          </div>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center pl-8 text-[11px] font-bold text-muted">
            {label}
          </span>
        </div>
        <p className="text-[11px] text-subtle">GPS vẫn tiếp tục ghi nhận khi màn hình đen</p>
      </div>
    </div>
  );
}
