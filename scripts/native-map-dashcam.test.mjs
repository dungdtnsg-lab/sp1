import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Track chỉ mount một Leaflet map và tự đồng bộ kích thước", async () => {
  const [shell, map] = await Promise.all([
    read("src/components/speedo/app-shell.tsx"),
    read("src/components/speedo/map-view.tsx"),
  ]);
  assert.equal(shell.match(/<MapView\s*\/>/g)?.length, 1);
  assert.match(map, /new ResizeObserver\(syncSize\)/);
  assert.match(map, /map\.invalidateSize\(\{ pan: false, debounceMoveend: true \}\)/);
  assert.match(map, /relative z-0 h-full/);
  assert.match(map, /tileerror/);
});

test("camera native chạy trước fallback MediaRecorder và được link vào iOS target", async () => {
  const [panel, scene, project, swift] = await Promise.all([
    read("src/components/speedo/dashcam-panel.tsx"),
    read("ios/App/App/SceneDelegate.swift"),
    read("ios/App/App.xcodeproj/project.pbxproj"),
    read("ios/App/App/DashcamNativePlugin.swift"),
  ]);
  assert.ok(panel.indexOf("DashcamNative.start") < panel.indexOf("!window.MediaRecorder"));
  assert.match(scene, /registerPluginInstance\(DashcamNativePlugin\(\)\)/);
  assert.match(project, /DashcamNativePlugin\.swift in Sources/);
  assert.match(swift, /case rear[\s\S]*case front[\s\S]*case dual/);
  assert.ok(swift.indexOf("captureSession.commitConfiguration()") < swift.indexOf("captureSession.startRunning()"));
  assert.match(swift, /dashcamAlbumName = "GPS Speedometer"/);
  assert.match(swift, /videoMinFrameDurationOverride/);
  assert.match(swift, /canPerform\(\.addContent\)/);
});

test("quyền và plugin lưu Photos không bị ZIP cũ xóa lần nữa", async () => {
  const [pkgText, swiftPackage, plist, patchScript, workflow, save] = await Promise.all([
    read("package.json"),
    read("ios/App/CapApp-SPM/Package.swift"),
    read("ios/App/App/Info.plist"),
    read("scripts/patch-ios-plist.mjs"),
    read(".github/workflows/bungzip.yml"),
    read("src/lib/speedo/dashcam-save.ts"),
  ]);
  const pkg = JSON.parse(pkgText);
  for (const dependency of ["@capacitor-community/media", "@capacitor/filesystem", "@capacitor/share"]) {
    assert.ok(pkg.dependencies[dependency], `${dependency} phải có trong dependencies`);
  }
  assert.doesNotMatch(swiftPackage, /node_modules\/\.pnpm\//);
  assert.match(swiftPackage, /node_modules\/@capacitor-community\/media/);
  for (const key of [
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
    "NSPhotoLibraryAddUsageDescription",
    "NSPhotoLibraryUsageDescription",
  ]) {
    assert.ok(plist.includes(`<key>${key}</key>`), `${key} phải có trong Info.plist`);
    assert.ok(patchScript.includes(`"${key}"`), `${key} phải được cap:sync khôi phục`);
  }
  assert.match(workflow, /Source đã tồn tại — bỏ qua ZIP cũ/);
  assert.match(save, /return \{ uri, saved: false, shared: true \}/);
  assert.match(save, /speedo\.dashcam\.clips\.v1/);
  assert.doesNotMatch(patchScript, /packageClassList\.add\("DashcamNativePlugin"\)/);
});
