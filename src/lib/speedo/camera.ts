export async function openCam(
  facing: "environment" | "user",
  w: number,
  h: number,
  audio: boolean,
) {
  const cams = await listVideoInputs();
  const preferred = pickDevice(cams, facing);
  const rest = cams.filter((c) => c.deviceId !== preferred?.deviceId);
  const tries: Array<MediaTrackConstraints> = [];
  if (preferred) tries.push({ deviceId: { exact: preferred.deviceId } });
  for (const cam of rest) tries.push({ deviceId: { exact: cam.deviceId } });
  tries.push({ facingMode: { exact: facing } });
  tries.push({ facingMode: facing });

  let last: unknown;
  for (const video of tries) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
      const track = stream.getVideoTracks()[0];
      const got = track.getSettings().facingMode;
      if (got && got !== facing && tries.length > 1) {
        stream.getTracks().forEach((t) => t.stop());
        continue;
      }
      await track
        .applyConstraints({ width: { ideal: w }, height: { ideal: h } })
        .catch(() => undefined);
      return stream;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Không mở được camera");
}

export function facingOf(stream: MediaStream | null): "environment" | "user" | "" {
  const mode = stream?.getVideoTracks()[0]?.getSettings().facingMode;
  if (mode === "environment" || mode === "user") return mode;
  const label = stream?.getVideoTracks()[0]?.label ?? "";
  if (/back|rear|environment|wide|ultra|sau/i.test(label)) return "environment";
  if (/front|user|face|trước/i.test(label)) return "user";
  return "";
}

export async function attachVideo(el: HTMLVideoElement | null, stream: MediaStream | null) {
  if (!el) return;
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  el.muted = true;
  el.autoplay = true;
  el.srcObject = stream;
  if (stream) await el.play().catch(() => undefined);
}

async function listVideoInputs() {
  const read = async () =>
    (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  let cams = await read();
  if (cams.some((c) => c.label)) return cams;
  let probe: MediaStream | null = null;
  try {
    probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    cams = await read();
  } catch {
    /* permission */
  } finally {
    probe?.getTracks().forEach((t) => t.stop());
  }
  await sleep(250);
  return cams;
}

function pickDevice(cams: MediaDeviceInfo[], facing: "environment" | "user") {
  const frontRe = /front|user|face|trước|facetime/i;
  const backRe = /back|rear|environment|wide|ultra|tele|sau/i;
  if (facing === "user") {
    return cams.find((c) => frontRe.test(c.label)) ?? cams[0] ?? null;
  }
  return (
    cams.find((c) => backRe.test(c.label) && !frontRe.test(c.label)) ??
    cams.find((c) => !frontRe.test(c.label) && cams.length > 1) ??
    (cams.length > 1 ? cams[1] : cams[0]) ??
    null
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
