import { registerPlugin } from "@capacitor/core";

type DashcamNativePlugin = {
  startDual(options: { width: number; height: number; hud: string }): Promise<{ recording: boolean }>;
  updateHud(options: { text: string }): Promise<void>;
  stop(): Promise<{ saved: boolean }>;
};

export const DashcamNative = registerPlugin<DashcamNativePlugin>("DashcamNative");
