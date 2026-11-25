"""Generates the extension icons (public/icon/<size>.png). Run: python3 scripts/make-icons.py"""
import math
from PIL import Image, ImageDraw

def star(cx, cy, r_out, r_in, n=5):
    pts = []
    for i in range(n * 2):
        r = r_out if i % 2 == 0 else r_in
        a = -math.pi / 2 + i * math.pi / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def icon(size):
    s = 512
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=96, fill=(27, 40, 56, 255))
    # three "rows" like a search list
    for i, y in enumerate((300, 360, 420)):
        d.rounded_rectangle([70, y, 442, y + 36], radius=8, fill=(42, 71, 94, 255) if i else (4, 145, 191, 255))
    d.polygon(star(256, 160, 120, 50), fill=(103, 193, 245, 255))
    return img.resize((size, size), Image.LANCZOS)

for size in (16, 32, 48, 96, 128):
    icon(size).save(f"public/icon/{size}.png")
print("ok")
