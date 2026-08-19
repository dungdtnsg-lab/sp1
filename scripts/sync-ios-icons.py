#!/usr/bin/env python3
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    raise SystemExit("pillow missing")

root = Path(".")
src_path = root / "public" / "app-icon.png"
if not src_path.exists():
    src_path = root / "public" / "icon-512.png"
if not src_path.exists():
    print("[icons] no source png")
    raise SystemExit(0)

src = Image.open(src_path).convert("RGB")
src = src.resize((1024, 1024), Image.Resampling.LANCZOS)

catalog = root / "ios/App/App/Assets.xcassets/AppIcon.appiconset"
catalog.mkdir(parents=True, exist_ok=True)
src.save(catalog / "AppIcon-512@2x.png", "PNG")

app = root / "ios/App/App"
sizes = {
    "AppIcon60x60.png": 60,
    "AppIcon60x60@2x.png": 120,
    "AppIcon60x60@3x.png": 180,
    "AppIcon76x76.png": 76,
    "AppIcon76x76@2x.png": 152,
    "AppIcon76x76@2x~ipad.png": 152,
}
for name, size in sizes.items():
    src.resize((size, size), Image.Resampling.LANCZOS).save(app / name, "PNG")

contents = """{
  "images" : [
    {
      "filename" : "AppIcon-512@2x.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
"""
(catalog / "Contents.json").write_text(contents)
print("[icons] wrote 1024 AppIcon + raster sizes")
