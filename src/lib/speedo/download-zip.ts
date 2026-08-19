export async function downloadGithubZip() {
  const res = await fetch("/GPS-Speedometer-github.zip");
  if (!res.ok) throw new Error("Không lấy được file zip");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "GPS-Speedometer-github.zip";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
