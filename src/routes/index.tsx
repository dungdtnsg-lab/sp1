import { createFileRoute } from "@tanstack/react-router";
import { SpeedoApp } from "@/components/speedo/app-shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <SpeedoApp />;
}
