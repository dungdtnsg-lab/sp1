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

const pbx = "ios/App/App.xcodeproj/project.pbxproj";
if (existsSync(pbx)) {
  let proj = readFileSync(pbx, "utf8");
  if (!proj.includes("BackgroundGpsPlugin.swift")) {
    proj = proj.replace(
      "9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = 9582B6822FE993A50072D4E8 /* SceneDelegate.swift */; };",
      "9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = 9582B6822FE993A50072D4E8 /* SceneDelegate.swift */; };\n\t\tB7A1101D0000000000000002 /* BackgroundGpsPlugin.swift in Sources */ = {isa = PBXBuildFile; fileRef = B7A1101D0000000000000001 /* BackgroundGpsPlugin.swift */; };",
    );
    proj = proj.replace(
      "9582B6822FE993A50072D4E8 /* SceneDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SceneDelegate.swift; sourceTree = \"<group>\"; };",
      "9582B6822FE993A50072D4E8 /* SceneDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SceneDelegate.swift; sourceTree = \"<group>\"; };\n\t\tB7A1101D0000000000000001 /* BackgroundGpsPlugin.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = BackgroundGpsPlugin.swift; sourceTree = \"<group>\"; };",
    );
    proj = proj.replace(
      "9582B6822FE993A50072D4E8 /* SceneDelegate.swift */,\n",
      "9582B6822FE993A50072D4E8 /* SceneDelegate.swift */,\n\t\t\t\tB7A1101D0000000000000001 /* BackgroundGpsPlugin.swift */,\n",
    );
    proj = proj.replace(
      "9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,\n",
      "9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,\n\t\t\t\tB7A1101D0000000000000002 /* BackgroundGpsPlugin.swift in Sources */,\n",
    );
    writeFileSync(pbx, proj);
    console.log("[ios-plist] added BackgroundGpsPlugin.swift to Xcode project");
  }
}

spawnSync("python3", ["scripts/sync-ios-icons.py"], { stdio: "inherit" });
console.log("[ios-plist] patched", plistPath);
