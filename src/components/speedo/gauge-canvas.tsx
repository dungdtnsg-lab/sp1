import { useEffect, useRef } from "react";
import { useSpeedo, gaugeMax } from "@/lib/speedo/store";

export function GaugeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const needleRef = useRef(0);
  const speed = useSpeedo((s) => s.currentSpeedKmh);
  const vehicle = useSpeedo((s) => s.vehicle);
  const oled = useSpeedo((s) => s.oled);
  const speedRef = useRef(speed);
  const vehicleRef = useRef(vehicle);
  const oledRef = useRef(oled);
  speedRef.current = speed;
  vehicleRef.current = vehicle;
  oledRef.current = oled;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const draw = (speedKmh: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2 + 8;
      const radius = w / 2 - 22;
      ctx.clearRect(0, 0, w, h);

      const startAngle = 0.72 * Math.PI;
      const endAngle = 2.28 * Math.PI;
      const totalAngle = endAngle - startAngle;

      ctx.beginPath();
      ctx.arc(cx, cy, radius + 16, 0, Math.PI * 2);
      const bezel = ctx.createRadialGradient(cx, cy, radius, cx, cy, radius + 18);
      bezel.addColorStop(0, "#1c2434");
      bezel.addColorStop(0.7, "#0b0e14");
      bezel.addColorStop(1, "#2a3348");
      ctx.fillStyle = bezel;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = "#0a0d14";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.lineWidth = 18;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#151b28";
      ctx.stroke();

      const maxScale = gaugeMax(vehicleRef.current);
      const step = maxScale === 80 ? 10 : 20;
      for (let s = 0; s <= maxScale; s += step / 2) {
        const frac = s / maxScale;
        const angle = startAngle + frac * totalAngle;
        const isMajor = s % step === 0;
        const outer = radius - 2;
        const inner = radius - (isMajor ? 20 : 10);
        ctx.beginPath();
        ctx.moveTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle));
        ctx.lineTo(cx + outer * Math.cos(angle), cy + outer * Math.sin(angle));
        ctx.lineWidth = isMajor ? 3 : 1.4;
        ctx.strokeStyle = isMajor ? (s >= maxScale * 0.8 ? "#f87171" : "#f8fafc") : "#64748b";
        ctx.stroke();
        if (isMajor) {
          const textR = radius - 38;
          ctx.fillStyle = s >= maxScale * 0.8 ? "#fca5a5" : "#e2e8f0";
          ctx.font = "700 15px -apple-system, BlinkMacSystemFont, Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(s), cx + textR * Math.cos(angle), cy + textR * Math.sin(angle));
        }
      }

      const speedFrac = Math.min(Math.max(speedKmh, 0) / maxScale, 1);
      const activeEnd = startAngle + speedFrac * totalAngle;
      if (speedFrac > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, activeEnd);
        ctx.lineWidth = 18;
        ctx.lineCap = "round";
        const grad = ctx.createLinearGradient(0, h, w, 0);
        grad.addColorStop(0, "#22c55e");
        grad.addColorStop(0.45, "#fbbf24");
        grad.addColorStop(1, "#ef4444");
        ctx.strokeStyle = grad;
        ctx.stroke();
      }

      const needleLen = radius - 8;
      const nx = cx + needleLen * Math.cos(activeEnd);
      const ny = cy + needleLen * Math.sin(activeEnd);
      const left = activeEnd + Math.PI / 2;
      const right = activeEnd - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + 7 * Math.cos(left), cy + 7 * Math.sin(left));
      ctx.lineTo(nx, ny);
      ctx.lineTo(cx + 7 * Math.cos(right), cy + 7 * Math.sin(right));
      ctx.closePath();
      ctx.fillStyle = "#ef4444";
      ctx.shadowColor = "rgba(239,68,68,0.85)";
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fillStyle = "#0b0e14";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#f8fafc";
      ctx.fill();
    };

    const loop = () => {
      if (!oledRef.current) {
        needleRef.current += (speedRef.current - needleRef.current) * 0.18;
        if (Math.abs(speedRef.current - needleRef.current) < 0.04) {
          needleRef.current = speedRef.current;
        }
        draw(needleRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} width={360} height={360} className="size-full" aria-hidden />;
}
