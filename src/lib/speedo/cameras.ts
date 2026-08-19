import { haversineKm } from "./helpers";

export type SpeedCamera = {
  id: string;
  lat: number;
  lon: number;
  limit: number;
  name: string;
  city: string;
};

export type CameraHit = SpeedCamera & { distM: number };

/** Curated phạt-nguội / speed cameras — HCMC-heavy, plus HN / cao tốc. */
export const VN_CAMERAS: SpeedCamera[] = [
  { id: "hcm-pmh-nlb", lat: 10.75115, lon: 106.72942, limit: 60, name: "Phú Mỹ Hưng — Nguyễn Lương Bằng", city: "HCM" },
  { id: "hcm-nvl-nht", lat: 10.7296, lon: 106.7214, limit: 60, name: "Nguyễn Văn Linh × Nguyễn Hữu Thọ", city: "HCM" },
  { id: "hcm-pmh-nvl", lat: 10.7288, lon: 106.7034, limit: 60, name: "Nguyễn Văn Linh — Phú Mỹ Hưng", city: "HCM" },
  { id: "hcm-phu-my", lat: 10.7398, lon: 106.7455, limit: 80, name: "Cầu Phú Mỹ", city: "HCM" },
  { id: "hcm-hang-xanh", lat: 10.7985, lon: 106.7112, limit: 50, name: "Ngã tư Hàng Xanh", city: "HCM" },
  { id: "hcm-sai-gon", lat: 10.8018, lon: 106.7185, limit: 60, name: "Cầu Sài Gòn", city: "HCM" },
  { id: "hcm-phu-dong", lat: 10.7704, lon: 106.693, limit: 40, name: "Ngã sáu Phù Đổng", city: "HCM" },
  { id: "hcm-an-suong", lat: 10.8463, lon: 106.6154, limit: 60, name: "Ngã tư An Sương (QL1A)", city: "HCM" },
  { id: "hcm-an-phu", lat: 10.8022, lon: 106.7516, limit: 60, name: "Nút giao An Phú (Mai Chí Thọ)", city: "HCM" },
  { id: "hcm-rach-chiec", lat: 10.8003, lon: 106.7538, limit: 80, name: "Cầu Rạch Chiếc", city: "HCM" },
  { id: "hcm-my-thuy", lat: 10.7864, lon: 106.7622, limit: 60, name: "Nút giao Mỹ Thủy", city: "HCM" },
  { id: "hcm-thu-thiem2", lat: 10.7782, lon: 106.7208, limit: 60, name: "Cầu Thủ Thiêm 2", city: "HCM" },
  { id: "hcm-bay-hien", lat: 10.793, lon: 106.6536, limit: 50, name: "Ngã tư Bảy Hiền", city: "HCM" },
  { id: "hcm-cong-hoa", lat: 10.7995, lon: 106.658, limit: 50, name: "Cộng Hòa × Hoàng Văn Thụ", city: "HCM" },
  { id: "hcm-tsn", lat: 10.8135, lon: 106.6642, limit: 50, name: "Trường Sơn — Tân Sơn Nhất", city: "HCM" },
  { id: "hcm-binh-loi", lat: 10.8272, lon: 106.7114, limit: 60, name: "Cầu Bình Lợi", city: "HCM" },
  { id: "hcm-ql13", lat: 10.8498, lon: 106.7216, limit: 60, name: "QL13 — nút Bình Phước", city: "HCM" },
  { id: "hcm-xa-lo-hn", lat: 10.8552, lon: 106.8024, limit: 80, name: "Xa lộ Hà Nội — Khu CNC", city: "HCM" },
  { id: "hcm-vvk-nvc", lat: 10.7531, lon: 106.6824, limit: 60, name: "Võ Văn Kiệt × Nguyễn Văn Cừ", city: "HCM" },
  { id: "hcm-nkkh", lat: 10.7822, lon: 106.6984, limit: 50, name: "Nam Kỳ Khởi Nghĩa × Nguyễn Thị Minh Khai", city: "HCM" },
  { id: "hcm-cmt8", lat: 10.7664, lon: 106.6682, limit: 50, name: "Cách Mạng Tháng Tám × Nguyễn Tri Phương", city: "HCM" },
  { id: "hcm-nhc", lat: 10.7884, lon: 106.7182, limit: 50, name: "Cầu vượt Nguyễn Hữu Cảnh", city: "HCM" },
  { id: "hcm-binh-chanh", lat: 10.7102, lon: 106.5804, limit: 70, name: "QL1A Tân Kiên — Bình Chánh", city: "HCM" },
  { id: "hcm-trung-luong", lat: 10.6384, lon: 106.4852, limit: 90, name: "Cao tốc HCM — Trung Lương (Bến Lức)", city: "HCM" },
  { id: "hcm-long-thanh", lat: 10.7874, lon: 107.0231, limit: 120, name: "Cao tốc Long Thành — Dầu Giây", city: "HCM" },
  { id: "hcm-cat-lai", lat: 10.7842, lon: 106.7904, limit: 90, name: "Võ Nguyên Giáp — Cát Lái", city: "HCM" },
  { id: "hcm-suoi-tien", lat: 10.8412, lon: 106.8094, limit: 80, name: "Xa lộ Hà Nội — Suối Tiên", city: "HCM" },
  { id: "dng-bien-hoa", lat: 10.9572, lon: 106.8421, limit: 60, name: "Ngã tư Vũng Tàu — Biên Hòa", city: "Đồng Nai" },
  { id: "tg-rach-mieu", lat: 10.3434, lon: 106.3652, limit: 60, name: "Cầu Rạch Miễu", city: "Tiền Giang" },
  { id: "hn-so", lat: 21.0014, lon: 105.8212, limit: 40, name: "Ngã tư Sở", city: "Hà Nội" },
  { id: "hn-vong", lat: 20.9958, lon: 105.8412, limit: 40, name: "Ngã tư Vọng", city: "Hà Nội" },
  { id: "hn-chuong-duong", lat: 21.0265, lon: 105.8608, limit: 60, name: "Cầu Chương Dương", city: "Hà Nội" },
  { id: "hn-phap-van", lat: 20.9675, lon: 105.8695, limit: 80, name: "Nút Pháp Vân — Cầu Giẽ", city: "Hà Nội" },
  { id: "hn-mai-dich", lat: 21.0403, lon: 105.7795, limit: 80, name: "Vành đai 3 — Mai Dịch", city: "Hà Nội" },
  { id: "hn-nhat-tan", lat: 21.0904, lon: 105.8221, limit: 80, name: "Cầu Nhật Tân", city: "Hà Nội" },
  { id: "hn-thanh-tri", lat: 20.9682, lon: 105.8954, limit: 80, name: "Cầu Thanh Trì", city: "Hà Nội" },
  { id: "hn-ngoc-hoi", lat: 20.9204, lon: 105.8452, limit: 80, name: "QL1A Ngọc Hồi", city: "Hà Nội" },
  { id: "hn-hai-phong", lat: 20.9372, lon: 106.3204, limit: 120, name: "Cao tốc Hà Nội — Hải Phòng", city: "Hải Dương" },
  { id: "dn-rong", lat: 16.0612, lon: 108.2274, limit: 50, name: "Cầu Rồng — Nguyễn Văn Linh", city: "Đà Nẵng" },
  { id: "dn-hai-van", lat: 16.2, lon: 108.1402, limit: 60, name: "Hầm Hải Vân (phía Bắc)", city: "Đà Nẵng" },
  { id: "nt-ql1a", lat: 12.2384, lon: 109.1802, limit: 60, name: "QL1A Nha Trang", city: "Khánh Hòa" },
];

const ALERT_RADIUS_M = 700;

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dL = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dL) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dL);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function headingDelta(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function nearestCameras(lat: number, lon: number, heading: number, radiusM = ALERT_RADIUS_M): CameraHit[] {
  const hits: CameraHit[] = [];
  for (const cam of VN_CAMERAS) {
    const distM = haversineKm(lat, lon, cam.lat, cam.lon) * 1000;
    if (distM > radiusM) continue;
    const brg = bearingDeg(lat, lon, cam.lat, cam.lon);
    if (distM > 90 && headingDelta(heading, brg) > 85) continue;
    hits.push({ ...cam, distM });
  }
  hits.sort((a, b) => a.distM - b.distM);
  return hits;
}

export function camerasInView(lat: number, lon: number, radiusKm = 18) {
  return VN_CAMERAS.filter((c) => haversineKm(lat, lon, c.lat, c.lon) <= radiusKm);
}
