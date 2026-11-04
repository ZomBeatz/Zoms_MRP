"""Build the MRP wordmarks and social preview (text outlined from Open Sans, like the Zomello logo).

Run from the repo root: python3 branding/make-logos.py
Needs fontTools and rsvg-convert (librsvg) for the PNGs.
"""
import re
import subprocess
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONTS = "/usr/share/fonts/TTF/"
OUT = "branding"

# The icon, without its <svg> wrapper, from the one source of truth.
ICON = re.search(r"<svg[^>]*>(.*)</svg>", open(f"{OUT}/mrp-icon.svg").read(), re.S).group(1)


def text_path(text, font_file, size, x, baseline, tracking=0.0):
    f = TTFont(FONTS + font_file)
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
    scale = size / f["head"].unitsPerEm
    pen = SVGPathPen(gs)
    cx = x
    for ch in text:
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, cx, baseline)))
        cx += hmtx[g][0] * scale + tracking * size
    return pen.getCommands(), cx - tracking * size


def logo(dark):
    ink, blue, sub = ("#ffffff", "#4fb0ec", "#9aa3b5") if dark else ("#14171f", "#2580c3", "#5b6375")
    zom, x1 = text_path("Zom's", "OpenSans-ExtraBold.ttf", 170, 345, 205)
    mrp, x2 = text_path("MRP", "OpenSans-ExtraBold.ttf", 170, x1 + 44, 205)
    tag, x3 = text_path("MISSION READY PLANNER", "OpenSans-Bold.ttf", 34, 349, 262, tracking=0.16)
    w = round(max(x2, x3) + 35)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} 300" width="{w}" height="300">
  <g transform="scale(0.29297)">{ICON}</g>
  <path d="{zom}" fill="{ink}"/>
  <path d="{mrp}" fill="{blue}"/>
  <path d="{tag}" fill="{sub}"/>
</svg>
''', w


def social():
    """1280 x 640: the dark wordmark on the dark background, with the promise under it."""
    inner, w = logo(True)
    body = re.search(r"<svg[^>]*>(.*)</svg>", inner, re.S).group(1)
    line, lw = text_path("Every mission crewed, every aircraft planned.", "OpenSans-SemiBold.ttf", 38, 0, 0)
    scale = 900 / w
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640" width="1280" height="640">
  <defs>
    <linearGradient id="page" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a1e27"/>
      <stop offset="1" stop-color="#0e1116"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="640" fill="url(#page)"/>
  <g transform="translate({(1280 - 900) / 2} 180) scale({scale})">{body}</g>
  <path transform="translate({(1280 - lw) / 2} 462)" d="{line}" fill="#c9d1e0"/>
</svg>
'''


for name, svg in (("mrp-logo", logo(False)[0]), ("mrp-logo-dark", logo(True)[0]), ("social-preview", social())):
    open(f"{OUT}/{name}.svg", "w").write(svg)
    width = "1280" if name == "social-preview" else "920"
    subprocess.run(["rsvg-convert", "-w", width, f"{OUT}/{name}.svg", "-o", f"{OUT}/{name}.png"], check=True)
