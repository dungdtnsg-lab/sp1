import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { SpeedoApp } from "@/components/speedo/app-shell";
import "@/styles.css";

function NativeLogin() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
      <h1 className="text-lg font-black text-cyan">Backup mây</h1>
      <p className="max-w-sm text-[13px] leading-relaxed text-muted">
        Bản IPA lưu hành trình ngay trên máy. Đăng nhập mây dùng bản web sau khi
        publish.
      </p>
      <Link to="/" className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-fg">
        Quay lại Speedo
      </Link>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: SpeedoApp,
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: NativeLogin,
});

const routeTree = rootRoute.addChildren([indexRoute, loginRoute]);
const router = createRouter({ routeTree });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
