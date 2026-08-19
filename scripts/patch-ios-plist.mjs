import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";

const plistPath = "ios/App/App/Info.plist";
if (!existsSync(plistPath)) {
  console.log("[ios-plist] skip — run after npx cap add ios");
  process.exit(0);
}

let xml = readFileSync(plistPath, "utf8");

function upsert(key, inner) {
  const re = new RegExp(`<key>${key}</key>[\\s\\S]*?(?=<key>|</dict>)`);
  if (re.test(xml)) {
    xml = xml.replace(re, `<key>${key}</key>\n    ${inner}\n    `);
  } else {
    xml = xml.replace("</dict>\n</plist>", `  <key>${key}</key>\n    ${inner}\n  </dict>\n</plist>`);
  }
}

upsert(
  "NSLocationWhenInUseUsageDescription",
  "<string>Ứng dụng cần GPS để đo tốc độ di chuyển và vẽ bản đồ hành trình thời gian thực.</string>",
);
upsert(
  "NSLocationAlwaysAndWhenInUseUsageDescription",
  "<string>Ứng dụng cần định vị GPS liên tục để ghi lại tốc độ và quãng đường hành trình ngay cả khi bạn tắt màn hình hoặc chuyển ứng dụng.</string>",
);
upsert(
  "NSLocationAlwaysUsageDescription",
  "<string>Ứng dụng cần duy trì GPS khi tắt màn hình để lưu đầy đủ dữ liệu chuyến đi.</string>",
);
upsert(
  "UIBackgroundModes",
  "<array>\n      <string>location</string>\n      <string>audio</string>\n    </array>",
);
upsert("UIViewControllerBasedStatusBarAppearance", "<false/>");
upsert("UIStatusBarHidden", "<false/>");
upsert("UIStatusBarStyle", "<string>UIStatusBarStyleLightContent</string>");
upsert(
  "NSCameraUsageDescription",
  "<string>Ứng dụng cần camera để ghi hình camera hành trình ô tô, overlay tốc độ và tọa độ.</string>",
);
upsert(
  "NSMicrophoneUsageDescription",
  "<string>Ứng dụng cần micro để ghi âm thanh cùng video camera hành trình.</string>",
);
upsert(
  "NSMotionUsageDescription",
  "<string>Ứng dụng dùng cảm biến chuyển động để phát hiện tai nạn và gọi khẩn cấp.</string>",
);
upsert("CFBundleDisplayName", "<string>GPS Speedometer</string>");

writeFileSync(plistPath, xml);

const iconSrc = existsSync("public/icon-192.png") ? "public/icon-192.png" : null;
if (iconSrc) {
  const destDir = dirname(plistPath);
  try {
    copyFileSync(iconSrc, join(destDir, "public", "icon-192.png"));
  } catch {
    /* public folder may not exist yet */
  }
}
console.log("[ios-plist] patched", plistPath);
