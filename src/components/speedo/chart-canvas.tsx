import { useEffect, useRef } from "react";
import { convertSpeed, formatLocalTime } from "@/lib/speedo/helpers";
import { gaugeMax, useSpeedo } from "@/lib/speedo/store";

export function ChartCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logs = useSpeedo((s) => s.logs);
  const unit = useSpeedo((s) => s.unit);
  const vehicle = useSpeedo((s) => s.vehicle);
  const maxSpeedKmh = useSpeedo((s) => s.maxSpeedKmh);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const plotLeft = 38;
    const plotRight = 8;
    const plotTop = 20;
    const plotBottom = 30;
    const plotWidth = w - plotLeft - plotRight;
    const plotHeight = h - plotTop - plotBottom;
    const points = logs.map((p) => ({ time: p.time, speed: p.speed }));
    const chartMaxKmh =
      gaugeMax(vehicle) === 80 ? 80 : Math.max(140, Math.ceil(Math.max(maxSpeedKmh, 1) / 20) * 20);
    const chartMax = convertSpeed(chartMaxKmh, unit);

    ctx.clearRect(0, 0, w, h);
    ctx.font = "9px Arial";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= 4; i++) {
      const fraction = i / 4;
      const y = plotTop + plotHeight - fraction * plotHeight;
      ctx.strokeStyle = "#283548";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(w - plotRight, y);
      ctx.stroke();
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "right";
      ctx.fillText((chartMax * fraction).toFixed(0), plotLeft - 5, y);
    }
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "left";
    ctx.fillText(unit.toUpperCase(), 3, plotTop - 8);

    if (points.length < 2) {
      ctx.fillStyle = "#64748b";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Đang chờ dữ liệu vận tốc...", w / 2, plotTop + plotHeight / 2);
      return;
    }

    const maxRender = 240;
    const renderPoints =
      points.length > maxRender
        ? Array.from({ length: maxRender }, (_, i) => {
            const src = Math.round((i * (points.length - 1)) / (maxRender - 1));
            return points[src];
          })
        : points;

    const toX = (i: number) => plotLeft + (i / (renderPoints.length - 1)) * plotWidth;
    const toY = (p: { speed: number }) => {
      const speed = Math.min(Math.max(convertSpeed(p.speed, unit), 0), chartMax);
      return plotTop + plotHeight - (speed / chartMax) * plotHeight;
    };

    ctx.beginPath();
    renderPoints.forEach((point, i) => {
      if (i === 0) ctx.moveTo(toX(i), toY(point));
      else ctx.lineTo(toX(i), toY(point));
    });
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(239, 68, 68, 0.65)";
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const lastX = toX(renderPoints.length - 1);
    ctx.lineTo(lastX, plotTop + plotHeight);
    ctx.lineTo(plotLeft, plotTop + plotHeight);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, plotTop, 0, plotTop + plotHeight);
    fill.addColorStop(0, "rgba(239, 68, 68, 0.35)");
    fill.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = fill;
    ctx.fill();

    const labels = [0, Math.floor((renderPoints.length - 1) / 2), renderPoints.length - 1];
    ctx.fillStyle = "#94a3b8";
    ctx.font = "8px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "alphabetic";
    labels.forEach((index, labelIndex) => {
      ctx.textAlign = labelIndex === 0 ? "left" : labelIndex === 2 ? "right" : "center";
      ctx.fillText(formatLocalTime(renderPoints[index].time), toX(index), h - 7);
    });
  }, [logs, unit, vehicle, maxSpeedKmh]);

  return <canvas ref={canvasRef} width={340} height={230} className="w-full" aria-hidden />;
}
