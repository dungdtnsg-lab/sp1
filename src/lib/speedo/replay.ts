import { useSpeedo } from "./store";
import type { SavedTrip } from "./types";

let timer: number | null = null;

function clearTimer() {
  if (timer != null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function tick() {
  const s = useSpeedo.getState();
  const trip = s.replayTrip;
  if (!trip || !s.replayPlaying) {
    clearTimer();
    return;
  }
  const next = s.replayIndex + 1;
  if (next >= trip.logs.length) {
    useSpeedo.getState().setReplayPlaying(false);
    clearTimer();
    return;
  }
  useSpeedo.getState().setReplayIndex(next);
}

function arm() {
  clearTimer();
  const s = useSpeedo.getState();
  if (!s.replayPlaying || !s.replayTrip) return;
  const ms = Math.max(80, 320 / s.replayRate);
  timer = window.setInterval(tick, ms);
}

export function startReplay(trip: SavedTrip) {
  if (trip.logs.length < 2) return;
  if (useSpeedo.getState().tracking) {
    window.alert("Tắt GPS trước khi xem lại hành trình.");
    return;
  }
  useSpeedo.getState().beginReplay(trip);
  arm();
}

export function stopReplay() {
  clearTimer();
  useSpeedo.getState().endReplay();
}

export function toggleReplayPlay() {
  const s = useSpeedo.getState();
  if (!s.replayTrip) return;
  const playing = !s.replayPlaying;
  s.setReplayPlaying(playing);
  if (playing) {
    if (s.replayIndex >= (s.replayTrip.logs.length - 1)) s.setReplayIndex(0);
    arm();
  } else {
    clearTimer();
  }
}

export function setReplayRate(rate: 1 | 2 | 4) {
  useSpeedo.getState().setReplayRate(rate);
  if (useSpeedo.getState().replayPlaying) arm();
}

export function seekReplay(index: number) {
  const trip = useSpeedo.getState().replayTrip;
  if (!trip) return;
  useSpeedo.getState().setReplayIndex(Math.max(0, Math.min(trip.logs.length - 1, index)));
}
