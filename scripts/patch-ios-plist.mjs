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
upsert("UIStatusBarHidden", "<true/>");
upsert("UIStatusBarStyle", "<string>UIStatusBarStyleLightContent</string>");
upsert("UIRequiresFullScreen", "<true/>");
upsert(
  "NSCameraUsageDescription",
  "<string>Ứng dụng cần camera để ghi hình camera hành trình ô tô, kèm tốc độ và tọa độ.</string>",
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
  "<string>Ứng dụng lưu video camera hành trình vào album GPS Speedometer trong Ảnh.</string>",
);
upsert(
  "NSPhotoLibraryUsageDescription",
  "<string>Ứng dụng cần đọc album GPS Speedometer để hiển thị lại video trong mục Camera ô tô.</string>",
);
upsert("CFBundleDisplayName", "<string>GPS Speedometer</string>");

writeFileSync(plistPath, xml);

const capConfigPath = "ios/App/App/capacitor.config.json";
if (existsSync(capConfigPath)) {
  const config = JSON.parse(readFileSync(capConfigPath, "utf8"));
  // Hai plugin cục bộ được đăng ký bằng GPSBridgeViewController. Loại tên cũ
  // khỏi config để Capacitor không khởi tạo cùng một plugin hai lần.
  const manuallyRegistered = new Set(["BackgroundGpsPlugin", "DashcamNativePlugin"]);
  config.packageClassList = (config.packageClassList || []).filter(
    (className) => !manuallyRegistered.has(className),
  );
  config.ios = { ...(config.ios || {}), contentInset: "never", preferredContentMode: "mobile" };
  writeFileSync(capConfigPath, `${JSON.stringify(config, null, "\t")}\n`);
}

const projectPath = "ios/App/App.xcodeproj/project.pbxproj";
if (existsSync(projectPath)) {
  let project = readFileSync(projectPath, "utf8");
  const insertAfter = (anchor, value) => {
    if (project.includes(value.trim())) return;
    if (!project.includes(anchor)) throw new Error(`[ios-plist] Xcode anchor not found: ${anchor}`);
    project = project.replace(anchor, `${anchor}\n${value}`);
  };
  insertAfter(
    "\t\t9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = 9582B6822FE993A50072D4E8 /* SceneDelegate.swift */; };",
    "\t\tB7A1101D0000000000000002 /* BackgroundGpsPlugin.swift in Sources */ = {isa = PBXBuildFile; fileRef = B7A1101D0000000000000001 /* BackgroundGpsPlugin.swift */; };",
  );
  insertAfter(
    "\t\tB7A1101D0000000000000002 /* BackgroundGpsPlugin.swift in Sources */ = {isa = PBXBuildFile; fileRef = B7A1101D0000000000000001 /* BackgroundGpsPlugin.swift */; };",
    "\t\tB7A1101D0000000000000004 /* DashcamNativePlugin.swift in Sources */ = {isa = PBXBuildFile; fileRef = B7A1101D0000000000000003 /* DashcamNativePlugin.swift */; };",
  );
  insertAfter(
    "\t\t9582B6822FE993A50072D4E8 /* SceneDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SceneDelegate.swift; sourceTree = \"<group>\"; };",
    "\t\tB7A1101D0000000000000001 /* BackgroundGpsPlugin.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = BackgroundGpsPlugin.swift; sourceTree = \"<group>\"; };",
  );
  insertAfter(
    "\t\tB7A1101D0000000000000001 /* BackgroundGpsPlugin.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = BackgroundGpsPlugin.swift; sourceTree = \"<group>\"; };",
    "\t\tB7A1101D0000000000000003 /* DashcamNativePlugin.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = DashcamNativePlugin.swift; sourceTree = \"<group>\"; };",
  );
  insertAfter(
    "\t\t\t\t9582B6822FE993A50072D4E8 /* SceneDelegate.swift */,",
    "\t\t\t\tB7A1101D0000000000000001 /* BackgroundGpsPlugin.swift */,",
  );
  insertAfter(
    "\t\t\t\tB7A1101D0000000000000001 /* BackgroundGpsPlugin.swift */,",
    "\t\t\t\tB7A1101D0000000000000003 /* DashcamNativePlugin.swift */,",
  );
  insertAfter(
    "\t\t\t\t9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,",
    "\t\t\t\tB7A1101D0000000000000002 /* BackgroundGpsPlugin.swift in Sources */,",
  );
  insertAfter(
    "\t\t\t\tB7A1101D0000000000000002 /* BackgroundGpsPlugin.swift in Sources */,",
    "\t\t\t\tB7A1101D0000000000000004 /* DashcamNativePlugin.swift in Sources */,",
  );
  writeFileSync(projectPath, project);
}

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
