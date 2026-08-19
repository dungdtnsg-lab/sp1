import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

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
upsert("UIStatusBarHidden", "<true/>");
upsert("UIStatusBarStyle", "<string>UIStatusBarStyleLightContent</string>");
upsert("UIRequiresFullScreen", "<true/>");
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
upsert(
  "NSPhotoLibraryAddUsageDescription",
  "<string>Ứng dụng lưu video camera hành trình vào Ảnh.</string>",
);
upsert(
  "NSPhotoLibraryUsageDescription",
  "<string>Ứng dụng cần quyền Ảnh để lưu video và ảnh thông số hành trình vào thư viện.</string>",
);
upsert("CFBundleDisplayName", "<string>GPS Speedometer</string>");

writeFileSync(plistPath, xml);

spawnSync("python3", ["scripts/sync-ios-icons.py"], { stdio: "inherit" });
console.log("[ios-plist] patched", plistPath);
