export type SavedClip = {
  id: string;
  at: string;
  name: string;
  cam: string;
  url: string;
  blob: Blob;
};

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function pickRecorderMime() {
  const MR = window.MediaRecorder;
  if (!MR) return "";
  const types = [
    "video/mp4",
    "video/mp4;codecs=avc1.42001E,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const t of types) {
    try {
      if (MR.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return "";
}

export async function persistClip(blob: Blob, name: string) {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: `dashcam/${name}`,
      data,
      directory: Directory.Documents,
      recursive: true,
    });
    try {
      await Share.share({ title: name, files: [written.uri] });
    } catch {
      /* user cancelled share */
    }
    return written.uri;
  } catch {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return url;
  }
}

export async function shareExisting(url: string, name: string, blob: Blob) {
  try {
    await persistClip(blob, name);
  } catch {
    window.open(url, "_blank");
  }
}
