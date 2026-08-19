import { fileStem, formatLocalDateTime, haptic, normalizeLogs } from "./helpers";
import type { GpsLog } from "./types";

async function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  try {
    if (typeof navigator.share === "function" && typeof File === "function") {
      const file = new File([blob], fileName, { type: mimeType });
      const canShare =
        typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
      if (canShare) {
        await navigator.share({
          files: [file],
          title: fileName,
          text: "Dữ liệu hành trình GPS Speedometer",
        });
        haptic("medium");
        return true;
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return false;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  haptic("medium");
  return true;
}

function emptyGuard(logs: GpsLog[]) {
  const points = normalizeLogs(logs);
  if (points.length === 0) {
    window.alert("Chưa có dữ liệu GPS để xuất. Hãy bật GPS và di chuyển trước.");
    return null;
  }
  return points;
}

export async function exportGPX(logs: GpsLog[], title = "gps_track") {
  const points = emptyGuard(logs);
  if (!points) return false;
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPS Speedometer Pro" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>GPS Speedometer Track ${formatLocalDateTime(points[0].time)}</name>
    <trkseg>
`;
  for (const point of points) {
    gpx += `      <trkpt lat="${point.lat}" lon="${point.lon}">
        <ele>${point.alt.toFixed(2)}</ele>
        <time>${point.time}</time>
        <speed>${(point.speed / 3.6).toFixed(2)}</speed>
      </trkpt>
`;
  }
  gpx += `    </trkseg>
  </trk>
</gpx>`;
  return downloadFile(gpx, `${fileStem(title)}.gpx`, "application/gpx+xml");
}

export async function exportKML(logs: GpsLog[], title = "gps_track") {
  const points = emptyGuard(logs);
  if (!points) return false;
  const coordsStr = points.map((p) => `${p.lon},${p.lat},${p.alt}`).join("\n        ");
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>GPS Speedometer Track</name>
    <Placemark>
      <name>Lộ trình di chuyển</name>
      <LineString>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>
        ${coordsStr}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
  return downloadFile(kml, `${fileStem(title)}.kml`, "application/vnd.google-earth.kml+xml");
}

export async function exportCSV(logs: GpsLog[], title = "gps_telemetry") {
  const points = emptyGuard(logs);
  if (!points) return false;
  let csv =
    "\uFEFFDate,Time,Timestamp,Latitude,Longitude,Altitude_m,Speed_kmh,Heading_deg,Accuracy_m\n";
  for (const point of points) {
    const date = new Date(point.time);
    const dateOnly = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("vi-VN");
    const timeOnly = Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleTimeString("vi-VN", { hour12: false });
    const cells = [
      dateOnly,
      timeOnly,
      point.time,
      point.lat.toFixed(7),
      point.lon.toFixed(7),
      point.alt.toFixed(2),
      point.speed.toFixed(2),
      point.heading.toFixed(2),
      point.accuracy.toFixed(1),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    csv += `${cells.join(",")}\n`;
  }
  return downloadFile(csv, `${fileStem(title)}.csv`, "text/csv;charset=utf-8;");
}
