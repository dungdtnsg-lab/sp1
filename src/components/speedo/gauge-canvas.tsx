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
      const cy = h / 2;
      const radius = w / 2 - 18;
      ctx.clearRect(0, 0, w, h);

      const startAngle = 0.75 * Math.PI;
      const endAngle = 2.25 * Math.PI;
      const totalAngle = endAngle - startAngle;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.lineWidth = 14;
      ctx.strokeStyle = "#141c2c";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, radius - 16, startAngle, endAngle);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(56, 189, 248, 0.2)";
      ctx.stroke();

      const maxScale = gaugeMax(vehicleRef.current);
      const step = maxScale === 80 ? 10 : 20;
      for (let s = 0; s <= maxScale; s += step / 2) {
        const frac = s / maxScale;
        const angle = startAngle + frac * totalAngle;
        const isMajor = s % step === 0;
        const innerR = radius - (isMajor ? 14 : 7);
        ctx.beginPath();
        ctx.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));
        ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
        ctx.lineWidth = isMajor ? 2.5 : 1;
        ctx.strokeStyle = isMajor ? (s >= maxScale * 0.75 ? "#ef4444" : "#f8fafc") : "#475569";
        ctx.stroke();
        if (isMajor) {
          const textR = radius - 26;
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(s), cx + textR * Math.cos(angle), cy + textR * Math.sin(angle));
        }
      }

      const speedFrac = Math.min(speedKmh / maxScale, 1);
      const activeEnd = startAngle + speedFrac * totalAngle;
      if (speedFrac > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, activeEnd);
        ctx.lineWidth = 14;
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#22c55e");
        grad.addColorStop(0.5, "#eab308");
        grad.addColorStop(1, "#ef4444");
        ctx.strokeStyle = grad;
        ctx.stroke();
      }

      const needleLen = radius - 15;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + needleLen * Math.cos(activeEnd), cy + needleLen * Math.sin(activeEnd));
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#ef4444";
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    };

    const loop = () => {
      if (!oledRef.current) {
        needleRef.current += (speedRef.current - needleRef.current) * 0.15;
        if (Math.abs(speedRef.current - needleRef.current) < 0.05) {
          needleRef.current = speedRef.current;
        }
        draw(needleRef.current);
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
      className="size-[248px]"
      aria-hidden
    />
  );
}
