import { useEffect, useRef } from "react";
import { constellationColor } from "@/lib/speedo/satellites";
import { useSpeedo } from "@/lib/speedo/store";

export function RadarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef(0);
  const sats = useSpeedo((s) => s.satellites);
  const oled = useSpeedo((s) => s.oled);
  const satsRef = useRef(sats);
  const oledRef = useRef(oled);
  satsRef.current = sats;
  oledRef.current = oled;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      const satellites = satsRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = w / 2 - 22;
      ctx.clearRect(0, 0, w, h);

      const disc = ctx.createRadialGradient(cx, cy, 6, cx, cy, radius);
      disc.addColorStop(0, "#071525");
      disc.addColorStop(0.55, "#050d18");
      disc.addColorStop(1, "#03060c");
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
      ctx.fillStyle = "#080c14";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = disc;
      ctx.fill();
      ctx.strokeStyle = "#1e3a5f";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, angleRef.current, angleRef.current + 0.42);
      ctx.closePath();
      const sweep = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      sweep.addColorStop(0, "rgba(56,189,248,0.22)");
      sweep.addColorStop(1, "rgba(56,189,248,0)");
      ctx.fillStyle = sweep;
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "rgba(56,189,248,0.18)";
      ctx.lineWidth = 1;
      for (const elev of [0, 30, 60]) {
        const r = radius * ((90 - elev) / 90);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(148,163,184,0.7)";
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${elev}°`, cx + 4, cy - r + 3);
      }

      ctx.strokeStyle = "rgba(56,189,248,0.12)";
      for (let deg = 0; deg < 360; deg += 30) {
        const a = ((deg - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10);
        ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        ctx.stroke();
      }

      const cards: [string, number, string][] = [
        ["N", 0, "#f87171"],
        ["E", 90, "#38bdf8"],
        ["S", 180, "#f59e0b"],
        ["W", 270, "#38bdf8"],
      ];
      ctx.font = "bold 11px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const [label, deg, color] of cards) {
        const a = ((deg - 90) * Math.PI) / 180;
        ctx.fillStyle = color;
        ctx.fillText(label, cx + Math.cos(a) * (radius + 12), cy + Math.sin(a) * (radius + 12));
      }

      for (const s of satellites) {
        const r = radius * ((90 - s.el) / 90);
        const a = ((s.az - 90) * Math.PI) / 180;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        const size = 2.4 + (s.cn0 / 49) * 3.6;
        const color = constellationColor(s.sys, s.usedInFix);
        ctx.beginPath();
        ctx.arc(x, y, size + 3, 0, Math.PI * 2);
        ctx.fillStyle = s.usedInFix ? `${color}33` : "transparent";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        if (s.usedInFix) {
          ctx.fillStyle = color;
          ctx.fill();
        } else {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "8px ui-monospace, monospace";
        ctx.fillText(s.prn, x, y + size + 8);
      }

      ctx.beginPath();
      ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "#f8fafc";
      ctx.fill();
    };

    const loop = () => {
      if (!oledRef.current) {
        angleRef.current = (angleRef.current + 0.018) % (Math.PI * 2);
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={340}
      height={340}
      className="mx-auto block size-[min(100%,236px)]"
      aria-hidden
    />
  );
}
