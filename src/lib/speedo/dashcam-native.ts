import { registerPlugin } from "@capacitor/core";

export type NativeDashcamMode = "rear" | "front" | "dual";

export type NativeDashcamStartOptions = {
  mode: NativeDashcamMode;
  width: number;
  height: number;
  hud: string;
};

export type NativeDashcamStartResult = {
  recording: boolean;
  mode: NativeDashcamMode;
  width: number;
  height: number;
  hasAudio: false;
  warning: string;
};

export type NativeDashcamStopResult = {
  saved: boolean;
  assetIdentifier?: string;
  path: string;
  name: string;
  createdAt: string;
  duration: number;
  albumName: string;
  mode: NativeDashcamMode;
  hasAudio: false;
  warning: string;
  error?: string;
};

type DashcamNativePlugin = {
  start(options: NativeDashcamStartOptions): Promise<NativeDashcamStartResult>;
  updateHud(options: { text: string }): Promise<void>;
  stop(): Promise<NativeDashcamStopResult>;
};

export const DashcamNative = registerPlugin<DashcamNativePlugin>("DashcamNative");
