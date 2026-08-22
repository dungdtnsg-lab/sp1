#!/usr/bin/env python3
from pathlib import Path
import shutil
import struct
import subprocess

root = Path(".")
src_path = root / "public" / "app-icon.png"
if not src_path.exists():
    src_path = root / "public" / "icon-512.png"
if not src_path.exists():
    print("[icons] no source png")
    raise SystemExit(0)

catalog = root / "ios/App/App/Assets.xcassets/AppIcon.appiconset"
catalog.mkdir(parents=True, exist_ok=True)

try:
    from PIL import Image  # type: ignore
except ImportError:
    Image = None


def png_size(path: Path):
    with path.open("rb") as handle:
        header = handle.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"{path} is not a PNG")
    return struct.unpack(">II", header[16:24])


def resize_png(source: Path, destination: Path, size: int):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if Image is not None:
        with Image.open(source) as opened:
            opened.convert("RGB").resize(
                (size, size), Image.Resampling.LANCZOS
            ).save(destination, "PNG")
    elif shutil.which("sips"):
        subprocess.run(
            [
                "sips",
                "-s",
                "format",
                "png",
                "-z",
                str(size),
                str(size),
                str(source),
                "--out",
                str(destination),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
    elif png_size(source) == (size, size):
        shutil.copyfile(source, destination)
    else:
        raise RuntimeError("Pillow or macOS sips is required to resize the app icon")

    if png_size(destination) != (size, size):
        raise RuntimeError(f"invalid icon size: {destination}")


resize_png(src_path, catalog / "AppIcon-512@2x.png", 1024)

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
    resize_png(src_path, app / name, size)

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
print("[icons] AppIcon catalog ready")
