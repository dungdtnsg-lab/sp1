import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="app-shell grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="size-12 rounded-xl" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">GPS Speedometer</h1>
            <p className="text-sm text-muted">Đăng nhập để đồng bộ hành trình</p>
          </div>
        </div>
        {authEnabled ? (
          GROK_PROVIDERS.map((p) => (
            <button
              key={p.providerId}
              type="button"
              onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
              className="w-full rounded-lg border border-border bg-elevated px-4 py-3 text-sm font-semibold hover:bg-panel"
            >
              Tiếp tục với {p.label}
            </button>
          ))
        ) : (
          <p className="text-sm text-muted">Đăng nhập đang tắt.</p>
        )}
        <Link to="/" className="block text-center text-sm text-muted hover:text-fg">
          Dùng không cần tài khoản
        </Link>
      </div>
    </main>
  );
}
