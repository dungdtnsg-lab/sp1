import { useState } from "react";
import { Camera, MonitorPlay, Phone, Siren } from "lucide-react";
import { cancelCrash, dial, enableMotion, disableMotion, fireCrash } from "@/lib/speedo/crash";
import { useSpeedo } from "@/lib/speedo/store";
import { cn } from "@/lib/utils";

export function SafetyTab() {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-3">
      <p className="px-0.5 text-[11.5px] leading-snug text-muted">
        Ba chế độ an toàn khi lái: phát hiện tai nạn, camera hành trình, tốc độ nổi (PiP).
      </p>
      <ModeCard
        title="Phát hiện tai nạn"
        desc="G-sensor + GPS. Đếm ngược rồi gọi / SMS khẩn cấp."
        color="bg-danger"
        icon={<Siren className="size-6" />}
        onClick={() => useSpeedo.getState().setSafetyScreen("crash")}
      />
      <ModeCard
        title="Camera ô tô"
        desc="Xem camera, overlay tốc độ + tọa độ, ghi clip."
        color="bg-zinc-800"
        icon={<Camera className="size-6" />}
        onClick={() => useSpeedo.getState().setSafetyScreen("dashcam")}
      />
      <ModeCard
        title="Hình trong hình"
        desc="Cửa sổ nổi tốc độ / quãng đường / max khi lái."
        color="bg-elevated"
        icon={<MonitorPlay className="size-6" />}
        onClick={() => useSpeedo.getState().setSafetyScreen("pip")}
      />
    </section>
  );
}

function ModeCard({
  title,
  desc,
  color,
  icon,
  onClick,
}: {
  title: string;
  desc: string;
  color: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-border bg-panel px-3 py-3 text-left"
    >
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl text-fg", color)}>
        {icon}
      </span>
      <span>
        <span className="block text-[14px] font-bold">{title}</span>
        <span className="block text-[11px] leading-snug text-muted">{desc}</span>
      </span>
    </button>
  );
}

export function CrashSettings() {
  const crash = useSpeedo((s) => s.crash);
  const [medOpen, setMedOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-black px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-fg">
      <header className="mb-3 flex items-center">
        <button
          type="button"
          className="grid size-9 place-items-center text-2xl"
          onClick={() => useSpeedo.getState().setSafetyScreen("menu")}
        >
          ‹
        </button>
        <h1 className="flex-1 pr-9 text-center text-[16px] font-semibold">Phát hiện tai nạn</h1>
      </header>

      <div className="mx-auto mb-3 grid size-16 place-items-center">
        <span className="size-8 rounded-full bg-danger shadow-[0_0_0_10px_rgba(239,68,68,0.25),0_0_0_20px_rgba(239,68,68,0.12)]" />
      </div>
      <p
        className={cn(
          "mb-4 text-center text-[14px] font-bold",
          crash.enabled ? "text-ok" : "text-danger",
        )}
      >
        {crash.enabled ? "Phát hiện tai nạn đang bật" : "Phát hiện tai nạn bị vô hiệu hóa"}
      </p>

      <div className="mb-3 flex items-center justify-between rounded-xl border border-white/15 px-4 py-3">
        <span className="text-[15px]">Phát hiện tai nạn</span>
        <Toggle
          on={crash.enabled}
          onChange={(on) => {
            useSpeedo.getState().setCrash({ enabled: on });
            if (on) void enableMotion();
            else disableMotion();
          }}
        />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => dial(crash.icePhone || "113")}
          className="flex items-center gap-2 rounded-2xl bg-[#f07178] px-3 py-4 text-left font-bold"
        >
          <Phone className="size-7" />
          Liên hệ khẩn cấp
        </button>
        <button
          type="button"
          onClick={() => setMedOpen(true)}
          className="flex items-center gap-2 rounded-2xl bg-[#22c55e] px-3 py-4 text-left font-bold text-black"
        >
          <Phone className="size-7" />
          Thông tin y tế
        </button>
      </div>

      <div className="mb-3 rounded-xl border border-white/15 px-4 py-3">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">Cuộc gọi khẩn cấp tự động</div>
            <p className="text-[12px] text-zinc-400">
              Tự động gọi dịch vụ khẩn cấp khi phát hiện tai nạn
            </p>
          </div>
          <Toggle
            on={crash.autoCall}
            onChange={(on) => useSpeedo.getState().setCrash({ autoCall: on })}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[13px]">
          <span className="text-zinc-400">Đếm ngược trước khi gọi (giây):</span>
          <strong className="text-danger">{crash.delaySec}</strong>
        </div>
        <input
          type="range"
          min={5}
          max={30}
          value={crash.delaySec}
          onChange={(e) => useSpeedo.getState().setCrash({ delaySec: Number(e.target.value) })}
          className="mt-1 w-full accent-red-500"
        />
        <label className="mt-2 block text-[12px] text-zinc-400">
          Số gọi / SMS
          <input
            value={crash.icePhone}
            onChange={(e) => useSpeedo.getState().setCrash({ icePhone: e.target.value })}
            placeholder="115"
            className="mt-1 w-full rounded-md border border-white/15 bg-zinc-950 px-2 py-1.5 text-[13px] text-fg"
          />
        </label>
      </div>

      <div className="mb-3 rounded-xl border border-white/15 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">SMS khẩn cấp tự động</div>
            <p className="text-[12px] text-zinc-400">
              Tự động gửi SMS tọa độ đến liên lạc khẩn cấp khi phát hiện tai nạn
            </p>
          </div>
          <Toggle
            on={crash.autoSms}
            onChange={(on) => useSpeedo.getState().setCrash({ autoSms: on })}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-[14px]">
        <input
          type="checkbox"
          checked={crash.tos}
          onChange={(e) => useSpeedo.getState().setCrash({ tos: e.target.checked })}
          className="size-4 accent-red-500"
        />
        I agree to the <span className="font-semibold text-danger">Terms of Service</span>
      </label>

      <button
        type="button"
        className="mt-3 w-full rounded-xl border border-danger/40 bg-danger/15 py-3 text-[13px] font-bold text-rose-200"
        onClick={() => {
          if (!crash.tos) {
            window.alert("Tick Terms of Service trước.");
            return;
          }
          fireCrash("TEST");
        }}
      >
        Thử cảnh báo (đếm ngược, không phải tai nạn thật)
      </button>

      {medOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-4">
          <div className="w-full rounded-xl border border-border bg-zinc-950 p-3">
            <h3 className="mb-2 text-[14px] font-bold">Thông tin y tế</h3>
            <textarea
              value={crash.medical}
              onChange={(e) => useSpeedo.getState().setCrash({ medical: e.target.value })}
              rows={5}
              placeholder="Nhóm máu, dị ứng, bệnh nền, người thân..."
              className="w-full rounded-md border border-white/15 bg-black px-2 py-2 text-[13px]"
            />
            <button
              type="button"
              className="mt-2 w-full rounded-md bg-ok py-2 text-[13px] font-bold text-black"
              onClick={() => setMedOpen(false)}
            >
              Lưu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CrashCountdown() {
  const left = useSpeedo((s) => s.crashLeft);
  const delay = useSpeedo((s) => s.crash.delaySec);
  if (left == null) return null;
  const pct = (left / Math.max(1, delay)) * 100;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/92 px-6 text-center">
      <span className="size-10 rounded-full bg-danger shadow-[0_0_0_14px_rgba(239,68,68,0.28)]" />
      <p className="mt-6 text-[18px] font-black text-danger">Phát hiện tai nạn</p>
      <p className="mt-1 text-[13px] text-zinc-300">
        Gọi {useSpeedo.getState().crash.icePhone || "115"} sau
      </p>
      <p className="mt-2 font-mono text-[64px] leading-none font-black text-fg">{left}</p>
      <div className="mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full bg-danger" style={{ width: `${pct}%` }} />
      </div>
      <button
        type="button"
        className="mt-8 w-full max-w-xs rounded-full bg-white py-3 text-[16px] font-bold text-black"
        onClick={() => cancelCrash()}
      >
        Tôi ổn — hủy
      </button>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full",
        on ? "bg-ok" : "bg-zinc-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-6 rounded-full bg-white transition-transform",
          on ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
