import { RadarCanvas } from "./radar-canvas";
import {
  constellationColor,
  constellationLabel,
  gnssMetrics,
} from "@/lib/speedo/satellites";
import { useSpeedo } from "@/lib/speedo/store";
import { cn } from "@/lib/utils";

export function SatellitesPanel() {
  const sats = useSpeedo((s) => s.satellites);
  const acc = useSpeedo((s) => s.lastFix?.accuracy ?? null);
  const tracking = useSpeedo((s) => s.tracking);
  const metrics = gnssMetrics(sats, acc);
  const ranked = [...sats].sort((a, b) => b.cn0 - a.cn0);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="grid grid-cols-4 gap-1">
        <Stat label="FIX" value={metrics.fix} tone={metrics.fix === "3D" ? "ok" : "warn"} />
        <Stat
          label="HDOP"
          value={metrics.hdop.toFixed(2)}
          hint={metrics.grade.label}
          tone={metrics.grade.tone}
        />
        <Stat label="PDOP" value={metrics.pdop.toFixed(2)} />
        <Stat label="ACC" value={`±${metrics.acc.toFixed(1)}m`} />
      </div>

      <div className="grid grid-cols-4 gap-1 text-[10px]">
        {(["gps", "galileo", "beidou", "glonass"] as const).map((sys) => {
          const group = metrics.by[sys];
          const used = group.filter((s) => s.usedInFix).length;
          return (
            <div
              key={sys}
              className="rounded-md border border-border bg-elevated px-1.5 py-1 text-center"
            >
              <div className="font-extrabold" style={{ color: constellationColor(sys) }}>
                {constellationLabel(sys)}
              </div>
              <div className="font-mono text-muted">
                {used}/{group.length}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-bg px-1 py-1">
        <div className="px-1 pb-0.5 text-center text-[10px] font-bold tracking-wide text-cyan">
          SKYPLOT · HDOP OPT · {tracking ? "LIVE GNSS" : "EPHEMERIS"} · {metrics.used} USED / {metrics.view} VIEW
        </div>
        <RadarCanvas />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-elevated">
        <div className="flex items-center justify-between border-b border-border px-2 py-1 text-[10px] font-bold text-muted">
          <span>C/N0 dB-Hz</span>
          <span>chấm đặc = used in fix</span>
        </div>
        <div className="max-h-[220px] overflow-y-auto px-2 py-1">
          {ranked.map((s) => (
            <div key={s.prn} className="mb-0.5 grid grid-cols-[42px_28px_1fr_28px] items-center gap-1">
              <span className="font-mono text-[10px] font-bold" style={{ color: constellationColor(s.sys) }}>
                {s.prn}
              </span>
              <span className="text-[9px] text-muted">{constellationLabel(s.sys)}</span>
              <div className="h-1.5 overflow-hidden rounded-sm bg-bg">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${Math.min(100, (s.cn0 / 50) * 100)}%`,
                    background: constellationColor(s.sys, s.usedInFix),
                    opacity: s.usedInFix ? 1 : 0.45,
                  }}
                />
              </div>
              <span className={cn("text-right font-mono text-[10px]", s.usedInFix ? "text-fg" : "text-subtle")}>
                {s.cn0.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "cyan" | "warn" | "danger";
}) {
  const color =
    tone === "ok"
      ? "text-ok"
      : tone === "cyan"
        ? "text-cyan"
        : tone === "warn"
          ? "text-warn"
          : tone === "danger"
            ? "text-danger"
            : "text-fg";
  return (
    <div className="rounded-md border border-border bg-elevated px-1 py-1 text-center">
      <div className="text-[9px] font-bold tracking-wide text-muted">{label}</div>
      <div className={cn("font-mono text-[12px] font-black", color)}>{value}</div>
      {hint ? <div className={cn("text-[8px] font-bold", color)}>{hint}</div> : null}
    </div>
  );
}
