#!/usr/bin/env python3
"""Write the SplashCall icon and splash into the iOS and Android projects."""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.stderr.write("Pillow is required: python3 -m pip install pillow\n")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
ICON = ROOT / "resources" / "icon.png"
SPLASH = ROOT / "resources" / "splash.png"
BG = (255, 205, 112, 255)  # theme color from public/index.html


def flatten(image: Image.Image, size: int) -> Image.Image:
    image = image.convert("RGBA")
    canvas = Image.new("RGBA", (size, size), BG)
    fitted = image.copy()
    fitted.thumbnail((size, size), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas.convert("RGB")


def foreground(image: Image.Image, size: int) -> Image.Image:
    """Adaptive-icon foreground with the artwork inside the safe zone."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fitted = image.convert("RGBA")
    inner = int(size * 0.66)
    fitted.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG")
    print(path.relative_to(ROOT))


def main() -> None:
    if not ICON.exists():
        sys.exit(f"missing {ICON}")
    icon = Image.open(ICON)
    splash_src = Image.open(SPLASH) if SPLASH.exists() else icon

    ios_icon = ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
    if ios_icon.parent.exists():
        save_png(flatten(icon, 1024), ios_icon)

    splash_dir = ROOT / "ios/App/App/Assets.xcassets/Splash.imageset"
    if splash_dir.exists():
        splash = flatten(splash_src, 2732)
        for name in (
            "splash-2732x2732.png",
            "splash-2732x2732-1.png",
            "splash-2732x2732-2.png",
        ):
            save_png(splash, splash_dir / name)

    res = ROOT / "android/app/src/main/res"
    if res.exists():
        legacy = {
            "mipmap-mdpi": 48,
            "mipmap-hdpi": 72,
            "mipmap-xhdpi": 96,
            "mipmap-xxhdpi": 144,
            "mipmap-xxxhdpi": 192,
        }
        for folder, size in legacy.items():
            image = flatten(icon, size)
            for name in ("ic_launcher.png", "ic_launcher_round.png"):
                save_png(image, res / folder / name)
        foregrounds = {
            "mipmap-mdpi": 108,
            "mipmap-hdpi": 162,
            "mipmap-xhdpi": 216,
            "mipmap-xxhdpi": 324,
            "mipmap-xxxhdpi": 432,
        }
        for folder, size in foregrounds.items():
            save_png(foreground(icon, size), res / folder / "ic_launcher_foreground.png")
        bg_file = res / "values" / "ic_launcher_background.xml"
        if bg_file.parent.exists():
            bg_file.write_text(
                """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFCD70</color>
</resources>
""",
                encoding="utf-8",
            )
            print(bg_file.relative_to(ROOT))

        splash_sizes = {
            "drawable": 480,
            "drawable-port-mdpi": 320,
            "drawable-port-hdpi": 480,
            "drawable-port-xhdpi": 720,
            "drawable-port-xxhdpi": 960,
            "drawable-port-xxxhdpi": 1280,
            "drawable-land-mdpi": 480,
            "drawable-land-hdpi": 800,
            "drawable-land-xhdpi": 1280,
            "drawable-land-xxhdpi": 1600,
            "drawable-land-xxxhdpi": 1920,
        }
        for folder, size in splash_sizes.items():
            target = res / folder / "splash.png"
            if target.parent.exists() or folder.startswith("drawable"):
                side = size if "land" not in folder else max(size, 480)
                save_png(flatten(splash_src, side), target)


if __name__ == "__main__":
    main()
