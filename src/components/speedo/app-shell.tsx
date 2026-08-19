import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  BellOff,
  Bike,
  Car,
  Cloud,
  FileDown,
  FlipHorizontal2,
  Map as MapIcon,
  Navigation,
  RotateCcw,
  Satellite,
  Shield,
  Table2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { deleteCloudTrip, listCloudTrips, saveCloudTrip } from "@/lib/trips-api";
import { exportCSV, exportGPX, exportKML } from "@/lib/speedo/export";
import {
  bindVisibility,
  startTracking,
  stopTracking,
} from "@/lib/speedo/engine";
import { startReplay } from "@/lib/speedo/replay";
import { enableMotion } from "@/lib/speedo/crash";
import { resetVoice, unlockVoice } from "@/lib/speedo/voice";
import {
  convertSpeed,
  formatClock,
  formatDuration,
  formatLocalDateTime,
  haptic,
  unitLabel,
  cardinal,
} from "@/lib/speedo/helpers";
import { useSpeedo } from "@/lib/speedo/store";
import { ChartCanvas } from "./chart-canvas";
import { GaugeCanvas } from "./gauge-canvas";
import { MapView } from "./map-view";
import { DashcamPanel } from "./dashcam-panel";
import { PipHud, PipIntro } from "./pip-hud";
import { CrashCountdown, CrashSettings, SafetyTab } from "./safety-tab";
import { SatellitesPanel } from "./satellites-panel";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "track", label: "Current Track", icon: Navigation },
  { id: "satellites", label: "Satellites", icon: Satellite },
  { id: "chart", label: "Speed Chart", icon: Activity },
  { id: "export", label: "Log & Xuất", icon: FileDown },
  { id: "safety", label: "An toàn", icon: Shield },
] as const;

export function SpeedoApp() {
  const tracking = useSpeedo((s) => s.tracking);
  const hud = useSpeedo((s) => s.hud);
  const tab = useSpeedo((s) => s.tab);
  const trackView = useSpeedo((s) => s.trackView);
  const safetyScreen = useSpeedo((s) => s.safetyScreen);
  const compactGauge = tab !== "track" || trackView === "stats";

  useEffect(() => {
    const unbind = bindVisibility();
    useSpeedo.getState().loadTrips();
    if (useSpeedo.getState().crash.enabled) void enableMotion();
    const id = window.setInterval(() => useSpeedo.getState().tickClock(), 1000);
    return () => {
      unbind();
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className={cn("app-shell flex h-dvh flex-col bg-bg", hud && "hud-mirror")}>
      <div className="mx-auto flex h-full min-h-0 w-full flex-col">
        <GaugeCard compact={compactGauge} />
        <nav className="flex shrink-0 border-b-2 border-line bg-surface">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                haptic();
                useSpeedo.getState().setTab(t.id);
              }}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 border-b-[3px] px-1 py-1.5 text-[10.5px] font-bold",
                tab === t.id
                  ? "border-accent text-accent"
                  : "border-transparent text-muted",
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </nav>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5">
          <div className={tab === "track" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <TrackTab />
          </div>
          <div className={tab === "satellites" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <SatellitesTab />
          </div>
          <div className={tab === "chart" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <ChartTab />
          </div>
          <div className={tab === "export" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <ExportTab />
          </div>
          <div className={tab === "safety" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <SafetyTab />
          </div>
        </main>
        <footer className="flex shrink-0 gap-1.5 border-t border-line bg-bg px-2.5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => void onToggleGps()}
            className={cn(
              "min-w-0 flex-[2] rounded-lg py-2.5 text-[13px] font-bold text-fg",
              tracking ? "bg-danger" : "bg-accent",
            )}
          >
            {tracking ? "KẾT THÚC HÀNH TRÌNH" : "BẬT GPS THEO DÕI"}
          </button>
          <VoiceButton />
        </footer>
      </div>
      <PipHud />
      <CrashCountdown />
      {safetyScreen === "crash" && <CrashSettings />}
      {safetyScreen === "dashcam" && <DashcamPanel />}
      {safetyScreen === "pip" && <PipIntro />}
    </div>
  );
}

async function onToggleGps() {
  const s = useSpeedo.getState();
  if (!s.tracking) {
    await startTracking();
    return;
  }
  const trip = stopTracking();
  if (!trip) return;
  const distanceKm = (trip.distanceMeters / 1000).toFixed(3);
  const ok = window.confirm(
    `Đã kết thúc hành trình.\nQuãng đường: ${distanceKm} km\nThời gian: ${formatDuration(trip.durationMs)}\nThời gian dừng: ${formatDuration(trip.stoppedDurationMs)}\n\nBạn có muốn lưu hành trình không?`,
  );
  if (!ok) return;
  if (!s.persistTrip(trip)) {
    window.alert("Không đủ bộ nhớ để lưu hành trình này.");
    return;
  }
  void saveCloudTrip({ data: trip }).catch(() => undefined);
  window.alert("Đã lưu hành trình vào máy.");
}

function onToggleVoice() {
  const turningOff = useSpeedo.getState().voiceOn;
  useSpeedo.getState().toggleVoice();
  if (turningOff) resetVoice();
  else unlockVoice();
  haptic();
}

function VoiceButton() {
  const voiceOn = useSpeedo((s) => s.voiceOn);
  return (
    <button
      type="button"
      title="Bật/tắt giọng đọc tiếng Việt"
      onClick={onToggleVoice}
      className={cn(
        "flex w-[72px] shrink-0 flex-col items-center justify-center rounded-lg border py-1 leading-tight",
        voiceOn ? "border-accent bg-accent/20 text-accent" : "border-border bg-elevated text-slate-300",
      )}
    >
      {voiceOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
      <span className="text-[10px] font-bold">Giọng {voiceOn ? "BẬT" : "TẮT"}</span>
    </button>
  );
}

function GaugeCard({ compact }: { compact: boolean }) {
  const speed = useSpeedo((s) => s.currentSpeedKmh);
  const unit = useSpeedo((s) => s.unit);
  const limit = useSpeedo((s) => s.speedLimitKmh);
  const audio = useSpeedo((s) => s.audioAlert);
  const vehicle = useSpeedo((s) => s.vehicle);
  const dots = useSpeedo((s) => s.gpsDots);
  const sats = useSpeedo((s) => s.satellites);
  const hud = useSpeedo((s) => s.hud);
  const over = speed > limit;
  const used = sats.filter((x) => x.usedInFix).length;
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(formatClock());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="flex shrink-0 flex-col items-center bg-[radial-gradient(circle_at_50%_30%,#151b29_0%,#080a10_100%)] px-3 pt-0.5 pb-1">
      <div className="mb-0.5 flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <ToolBtn
            title="Đặt lại chuyến đi"
            onClick={() => {
              if (window.confirm("Đặt lại toàn bộ dữ liệu hành trình?")) {
                useSpeedo.getState().resetSession();
              }
            }}
          >
            <RotateCcw className="size-3.5" />
          </ToolBtn>
          <ToolBtn
            title="Cảnh báo âm thanh quá tốc"
            active={audio}
            onClick={() => useSpeedo.getState().toggleAudio()}
          >
            {audio ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
          </ToolBtn>
          <ToolBtn
            title="Chế độ HUD phản chiếu kính lái"
            active={hud}
            onClick={() => useSpeedo.getState().toggleHud()}
          >
            <FlipHorizontal2 className="size-3.5" />
          </ToolBtn>
        </div>
        <button
          type="button"
          title="Chạm để đổi giới hạn tốc độ"
          onClick={() => {
            useSpeedo.getState().cycleLimit();
            haptic("medium");
          }}
          className="flex h-9 min-w-9 flex-col items-center justify-center rounded-full border-[3px] border-danger bg-fg px-1.5 text-bg"
        >
          <span className="text-[7px] font-black leading-none">LIMIT</span>
          <span className="text-[13px] font-black leading-none">{limit}</span>
        </button>
      </div>

      <div className={cn("gauge-face relative flex items-center justify-center", compact && "is-compact")}>
        <GaugeCanvas />
        <div
          className={cn(
            "pointer-events-none absolute z-[5] flex flex-col items-center gap-0.5",
            compact ? "top-[18%]" : "top-[52px]",
          )}
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "font-extrabold tracking-wide text-cyan",
                compact ? "text-[9px]" : "text-[11px]",
              )}
            >
              GNSS GPS
            </span>
            <span className="rounded bg-warn/15 px-1 py-px text-[10px] font-bold text-warn">
              {used}/{sats.length}
            </span>
          </div>
          <div className="flex gap-[3.5px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "size-[5.5px] rounded-full",
                  i < dots ? "bg-warn shadow-[0_0_6px_#f59e0b]" : "bg-border",
                )}
              />
            ))}
          </div>
          <div className="mt-0.5 rounded border border-line bg-bg/85 px-2 py-px font-mono text-[10.5px] text-slate-300">
            {clock}
          </div>
        </div>
        <div
          className={cn(
            "pointer-events-none absolute bottom-3 flex min-w-[100px] items-baseline justify-center gap-1 rounded-md border border-border bg-[#080c14] px-2.5 py-0.5",
            compact && "bottom-2",
          )}
        >
          <span
            className={cn(
              "font-mono leading-none font-black",
              compact ? "text-[22px]" : "text-[30px]",
              over ? "text-danger" : "text-fg",
            )}
          >
            {convertSpeed(speed, unit).toFixed(1)}
          </span>
          <span className="text-[11px] font-bold text-cyan">{unitLabel(unit)}</span>
        </div>
      </div>

      <div className="mt-0.5 flex w-full items-center justify-between px-1">
        <VehicleBtn mode="bike" active={vehicle === "bike"} />
        <div className="flex rounded-full border border-border bg-bg p-0.5">
          {(["mph", "knot", "kmh"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => useSpeedo.getState().setUnit(u)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11.5px] font-bold",
                unit === u ? "bg-fg text-bg" : "text-muted",
              )}
            >
              {u}
            </button>
          ))}
        </div>
        <VehicleBtn mode="car" active={vehicle === "car"} />
      </div>
    </section>
  );
}

function VehicleBtn({ mode, active }: { mode: "bike" | "car"; active: boolean }) {
  const Icon = mode === "bike" ? Bike : Car;
  return (
    <button
      type="button"
      title={mode === "bike" ? "Thang đo xe đạp (0-80 km/h)" : "Thang đo ô tô (0-260 km/h)"}
      onClick={() => useSpeedo.getState().setVehicle(mode)}
      className={cn(
        "grid h-8 w-[38px] place-items-center rounded-md border",
        active ? "border-ok bg-ok text-bg" : "border-border bg-elevated text-muted",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

function ToolBtn({
  children,
  title,
  onClick,
  active,
  className,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-full border text-muted",
        active ? "border-cyan bg-cyan/25 text-cyan" : "border-border bg-elevated/85",
        className,
      )}
    >
      {children}
    </button>
  );
}

function TrackTab() {
  const banner = useSpeedo((s) => s.banner);
  const tracking = useSpeedo((s) => s.tracking);
  const stopped = useSpeedo((s) => s.isStoppedNow);
  const view = useSpeedo((s) => s.trackView);
  const nowMs = useSpeedo((s) => s.nowMs);
  const camera = useSpeedo((s) => s.cameraAlert);
  const replayTrip = useSpeedo((s) => s.replayTrip);
  const duration = useMemo(() => formatDuration(useSpeedo.getState().durationMs()), [nowMs]);
  const stopDur = useMemo(() => formatDuration(useSpeedo.getState().stoppedMs()), [nowMs]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "mb-1 shrink-0 rounded-md border px-2 py-1 text-center text-[11px] font-bold",
          replayTrip || banner.kind === "good"
            ? "border-ok/35 bg-ok/15 text-ok"
            : "border-danger/35 bg-danger/15 text-rose-300",
        )}
      >
        {replayTrip ? "● " : banner.kind === "good" ? "● " : "○ "}
        {replayTrip ? `Xem lại: ${replayTrip.title}` : banner.text}
      </div>
      {camera && tracking && (
        <div className="mb-1 flex shrink-0 items-center justify-between gap-2 rounded-md border border-danger/50 bg-danger/20 px-2.5 py-1.5 text-[11px] font-bold text-rose-100">
          <span className="truncate">CAMERA · {camera.name}</span>
          <span className="shrink-0 font-mono text-warn">
            {camera.distM < 80 ? "ĐANG TỚI" : `${Math.round(camera.distM)} m`} · {camera.limit}
          </span>
        </div>
      )}
      <div
        className={cn(
          "mb-1 flex shrink-0 items-center justify-between rounded-md border px-2.5 py-1 text-[10.5px]",
          tracking && stopped
            ? "border-warn/65 bg-warn/15 text-amber-100"
            : "border-border bg-elevated/80 text-slate-300",
        )}
      >
        <span>Thời gian dừng</span>
        <strong className="font-mono text-[11px] text-warn">{stopDur}</strong>
      </div>
      <div className="mb-1.5 flex shrink-0 gap-1.5">
        <ViewToggle
          active={view === "stats"}
          onClick={() => useSpeedo.getState().setTrackView("stats")}
          icon={<Table2 className="size-3.5" />}
          label="Bảng thông số"
        />
        <ViewToggle
          active={view === "map"}
          onClick={() => useSpeedo.getState().setTrackView("map")}
          icon={<MapIcon className="size-3.5" />}
          label="Bản đồ"
        />
      </div>
      <div className={view === "stats" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <StatsView duration={duration} stopDur={stopDur} />
      </div>
      <div className={view === "map" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <MapView />
      </div>
    </section>
  );
}

function ViewToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1 rounded-md border py-1.5 text-[11.5px] font-semibold",
        active ? "border-accent bg-accent text-fg" : "border-border bg-panel text-slate-300",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function StatsView({ duration }: { duration: string; stopDur: string }) {
  const unit = useSpeedo((s) => s.unit);
  const distance = useSpeedo((s) => s.totalDistanceM);
  const max = useSpeedo((s) => s.maxSpeedKmh);
  const speeds = useSpeedo((s) => s.speeds);
  const start = useSpeedo((s) => s.startTimeLabel);
  const fix = useSpeedo((s) => s.lastFix);
  const avg = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const suffix = unitLabel(unit);
  const loc = fix ? `${fix.lat.toFixed(6)}°  ${fix.lon.toFixed(6)}°` : "—";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2">
      <div className="grid shrink-0 grid-cols-2 gap-1.5">
        <Metric label="Duration (Thời gian)" value={duration} />
        <Metric label="Distance (Quãng đường)" value={`${(distance / 1000).toFixed(3)} KM`} />
      </div>
      <div className="shrink-0 overflow-hidden rounded-md border border-[#362231] bg-[#1b141b]">
        <Row label="Start Time" value={start} />
        <Row
          label="Max Speed"
          value={`${convertSpeed(max, unit).toFixed(2)} ${suffix}`}
          valueClass="text-danger"
        />
        <Row
          label="Avg Speed"
          value={`${convertSpeed(avg, unit).toFixed(2)} ${suffix}`}
          valueClass="text-cyan"
        />
        <Row label="Altitude" value={`${(fix?.altitude ?? 0).toFixed(2)} M`} />
        <Row
          label="Heading (Hướng la bàn)"
          value={`${(fix?.heading ?? 0).toFixed(2)}° ${cardinal(fix?.heading ?? 0)}`}
        />
        <div className="flex flex-col gap-0.5 px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="font-medium text-violet-100">Location (Tọa độ WGS84)</span>
            <button
              type="button"
              className="text-[10px] font-bold text-cyan"
              onClick={() => void navigator.clipboard?.writeText(loc)}
            >
              Sao chép
            </button>
          </div>
          <span className="font-mono text-[13px] font-bold tracking-wide text-pink-300">{loc}</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-md border border-[#3d2737] bg-[#1c151c] px-2.5 py-1.5">
      <span className="font-mono text-lg font-extrabold">{value}</span>
      <span className="text-[10.5px] text-fuchsia-200">{label}</span>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#2a1a26] px-2.5 py-1.5 text-[13px]">
      <span className="min-w-0 shrink font-medium text-violet-100">{label}</span>
      <span className={cn("text-right font-bold", valueClass)}>{value}</span>
    </div>
  );
}

function SatellitesTab() {
  return <SatellitesPanel />;
}

function ChartTab() {
  const speed = useSpeedo((s) => s.currentSpeedKmh);
  const unit = useSpeedo((s) => s.unit);
  const logs = useSpeedo((s) => s.logs);
  const points = logs.slice(-120).reverse();
  return (
    <section className="flex flex-col items-center rounded-[10px] border border-border bg-elevated p-2">
      <div className="mb-1.5 flex w-full items-center justify-between">
        <span className="text-[12.5px] font-bold text-accent">Đồ thị vận tốc thời gian thực</span>
        <span className="rounded bg-cyan/15 px-1.5 py-0.5 text-xs font-extrabold text-cyan">
          {convertSpeed(speed, unit).toFixed(1)} {unit}
        </span>
      </div>
      <ChartCanvas />
      <p className="mt-1 text-[10px] text-muted">
        Đường đỏ: vận tốc ghi mỗi 5 giây • Nhãn dưới: ngày giờ ghi nhận
      </p>
      <div className="mt-2 flex w-full items-center justify-between border-t border-border pt-2 text-[11px] font-bold text-slate-300">
        <span>Lịch sử ngày giờ · tốc độ · tọa độ</span>
        <strong className="text-[10px] text-cyan">{logs.length} mốc</strong>
      </div>
      <div className="mt-1 max-h-[220px] w-full overflow-y-auto rounded-md border border-border/70 bg-bg">
        {points.length === 0 ? (
          <div className="px-2 py-2 text-center text-[10px] text-subtle">Chưa có dữ liệu vận tốc</div>
        ) : (
          points.map((p) => (
            <div
              key={p.time + p.lat}
              className="flex items-start justify-between gap-2 border-b border-border/50 px-2 py-1.5 last:border-0"
            >
              <div className="min-w-0">
                <div className="font-mono text-[10.5px] text-slate-200">{formatLocalDateTime(p.time)}</div>
                <div className="truncate font-mono text-[10px] text-pink-200">
                  {p.lat.toFixed(6)}°, {p.lon.toFixed(6)}°
                </div>
              </div>
              <span className="shrink-0 font-extrabold text-[11px]">
                {convertSpeed(p.speed, unit).toFixed(1)} {unitLabel(unit)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ExportTab() {
  const logs = useSpeedo((s) => s.logs);
  const tracking = useSpeedo((s) => s.tracking);
  const trips = useSpeedo((s) => s.savedTrips);
  const cloudSyncing = useSpeedo((s) => s.cloudSyncing);
  const lastCloudSync = useSpeedo((s) => s.lastCloudSync);
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    if (!user) return;
    void syncCloud(false);
  }, [user]);

  return (
    <section className="flex flex-col gap-2.5 rounded-[10px] border border-border bg-elevated p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-cyan">Lưu & Xuất Dữ Liệu Hành Trình</h3>
        <AuthChip pending={isPending} signedIn={Boolean(user)} />
      </div>
      <p className="text-[11.5px] leading-snug text-muted">
        Xuất toàn bộ tọa độ, tốc độ, độ cao và thời gian chuyến đi sang các định dạng chuẩn quốc tế:
      </p>
      <div className="flex flex-col gap-2">
        <ExportBtn className="bg-accent" onClick={() => void exportGPX(logs)}>
          Xuất file GPX (Strava / Garmin)
        </ExportBtn>
        <ExportBtn className="bg-sky-600" onClick={() => void exportKML(logs)}>
          Xuất file KML (Google Earth)
        </ExportBtn>
        <ExportBtn className="bg-emerald-600" onClick={() => void exportCSV(logs)}>
          Xuất file CSV (Excel / Bảng tính)
        </ExportBtn>
      </div>
      <div className="rounded-md border border-cyan/25 bg-cyan/10 px-2.5 py-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-bold text-cyan">
          <Cloud className="size-3.5" />
          Backup mây
        </div>
        <p className="mb-2 text-[10.5px] leading-snug text-muted">
          {user
            ? lastCloudSync
              ? `Đã đồng bộ ${new Date(lastCloudSync).toLocaleTimeString("vi-VN")}. Xóa app vẫn lấy lại được.`
              : "Đăng nhập rồi — chạm để đẩy hành trình lên mây."
            : "Đăng nhập để không mất hành trình khi xóa app."}
        </p>
        {user ? (
          <button
            type="button"
            disabled={cloudSyncing}
            onClick={() => void syncCloud(true)}
            className="w-full rounded-md bg-cyan px-3 py-2 text-[12px] font-bold text-bg disabled:opacity-60"
          >
            {cloudSyncing ? "Đang sao lưu…" : "Sao lưu tất cả lên mây"}
          </button>
        ) : (
          <Link
            to="/login"
            className="block rounded-md border border-cyan/40 px-3 py-2 text-center text-[12px] font-bold text-cyan"
          >
            Đăng nhập để sao lưu
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-1 rounded-md bg-bg px-2.5 py-2 text-[11.5px] text-slate-300">
        <div>
          Tổng số điểm GPS: <strong className="text-warn">{logs.length} điểm</strong>
        </div>
        <div>
          Trạng thái ghi log:{" "}
          <strong className="text-warn">{tracking ? "Đang ghi nhận..." : "Sẵn sàng"}</strong>
        </div>
      </div>
      <div className="rounded-md border border-border bg-bg px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-bold text-slate-300">
          <span>Hành trình đã lưu</span>
          <strong className="min-w-[22px] rounded-full bg-danger/20 px-1.5 py-0.5 text-center text-rose-300">
            {trips.length}
          </strong>
        </div>
        {trips.length === 0 ? (
          <div className="py-1 text-center text-[10.5px] text-subtle">Chưa có hành trình đã lưu</div>
        ) : (
          <div className="flex flex-col">
            {trips.map((trip) => (
              <div key={trip.id} className="border-t border-border/70 py-1.5 first:border-0">
                <div className="truncate text-[10.5px] font-bold">{trip.title}</div>
                <div className="mb-0.5 text-[9.5px] text-muted">
                  {(trip.distanceMeters / 1000).toFixed(3)} km · {formatDuration(trip.durationMs)} ·
                  Dừng {formatDuration(trip.stoppedDurationMs)}
                </div>
                {trip.logs[0] && (
                  <div className="mb-1 font-mono text-[9.5px] text-pink-200">
                    {trip.logs[0].lat.toFixed(6)}°, {trip.logs[0].lon.toFixed(6)}°
                    {trip.logs.at(-1) && trip.logs.length > 1
                      ? ` → ${trip.logs.at(-1)!.lat.toFixed(6)}°, ${trip.logs.at(-1)!.lon.toFixed(6)}°`
                      : ""}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      startReplay(trip);
                    }}
                    className="rounded border border-accent/50 bg-accent/20 px-1.5 py-1 text-[10px] font-extrabold text-accent"
                  >
                    Xem lại
                  </button>
                  <MiniBtn onClick={() => void exportGPX(trip.logs, trip.title)}>GPX</MiniBtn>
                  <MiniBtn onClick={() => void exportKML(trip.logs, trip.title)}>KML</MiniBtn>
                  <MiniBtn onClick={() => void exportCSV(trip.logs, trip.title)}>CSV</MiniBtn>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`Xóa hành trình này?\n${trip.title}`)) return;
                      useSpeedo.getState().deleteTrip(trip.id);
                      void deleteCloudTrip({ data: trip.id }).catch(() => undefined);
                    }}
                    className="rounded border border-danger/45 bg-danger/15 px-1.5 py-1 text-[10px] text-rose-300"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

async function syncCloud(pushLocal: boolean) {
  const store = useSpeedo.getState();
  store.setCloudSyncing(true);
  try {
    const cloud = await listCloudTrips();
    store.mergeTrips(cloud);
    if (pushLocal) {
      const real = store.savedTrips.filter((t) => !t.id.startsWith("demo_"));
      for (const trip of real) {
        await saveCloudTrip({ data: trip });
      }
    }
    store.setLastCloudSync(Date.now());
  } catch {
    /* signed out or network */
  } finally {
    store.setCloudSyncing(false);
  }
}

function AuthChip({ pending, signedIn }: { pending: boolean; signedIn: boolean }) {
  if (pending) return <div className="size-8 animate-pulse rounded-full bg-elevated" />;
  if (signedIn) return <UserButton />;
  return (
    <Link
      to="/login"
      className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted"
    >
      Đăng nhập
    </Link>
  );
}

function ExportBtn({
  children,
  onClick,
  className,
}: {
  children: string;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center rounded-md px-3.5 py-2.5 text-left text-[12.5px] font-bold text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

function MiniBtn({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-cyan/40 bg-cyan/10 px-1 py-1 text-[9px] font-extrabold text-sky-300"
    >
      {children}
    </button>
  );
}
