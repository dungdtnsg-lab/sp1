import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type BgFix = {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  speed: number;
  heading: number;
  timestamp: number;
};

type BackgroundGpsPlugin = {
  start(): Promise<{ ok: boolean; auth?: string }>;
  stop(): Promise<void>;
  drain(): Promise<{ points: BgFix[] }>;
  status(): Promise<{ running: boolean; auth: string; buffered: number }>;
  addListener(
    eventName: "fix",
    listenerFunc: (pos: BgFix) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "error",
    listenerFunc: (err: { message: string }) => void,
  ): Promise<PluginListenerHandle>;
};

export const BackgroundGps = registerPlugin<BackgroundGpsPlugin>("BackgroundGps");
