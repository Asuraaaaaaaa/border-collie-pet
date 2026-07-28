#!/usr/bin/env python3
"""Split the 37-frame border collie sprite sheet into individual frames.

Source: ~/Desktop/素材.png  (3840x2160, 8 columns x 5 rows, each cell 480x360)
Background: light blue/white checkered (transparent indicator)
Output:  src/assets/  (480x480 RGBA, transparent, bottom-anchored)

Sprite numbering is NOT sequential:
  - Missing: 32
  - Duplicate: 34 appears twice (tilt_1 and sniff_0)
"""
import os
from collections import deque

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = "/Users/asura/Projects/素材.png"
ASSETS = os.path.normpath(os.path.join(HERE, "..", "src", "assets"))

CELL_W, CELL_H = 480, 360
LABEL_SKIP = 100    # top of each cell holds the "01"-"37" number label
CONTENT_H = CELL_H - LABEL_SKIP
CANVAS = 480
TOL = 15

# Grid -> sprite number (and optional override for duplicate 34 / missing 32)
GRID_MAP = {}
for x in range(8):
    GRID_MAP[(0, x)] = (1 + x, None)
    GRID_MAP[(1, x)] = (9 + x, None)
    GRID_MAP[(2, x)] = (17 + x, None)
    GRID_MAP[(3, x)] = (25 + x, None)   # 32 will be skipped
# Row 4 manual: 33, 34(first), 34(second), 35, 36, 37
GRID_MAP[(4, 0)] = (33, "tilt_0")
GRID_MAP[(4, 1)] = (34, "tilt_1")     # first 34
GRID_MAP[(4, 2)] = (34, "sniff_0")    # second 34
GRID_MAP[(4, 3)] = (35, "sniff_1")
GRID_MAP[(4, 4)] = (36, "scratch_0")
GRID_MAP[(4, 5)] = (37, "scratch_1")

SPRITE_MAP = {
    1: "idle_0", 2: "idle_1", 3: "idle_2", 4: "idle_3",
    5: "walk_right_0", 6: "walk_right_1", 7: "walk_right_2", 8: "walk_right_3",
    9: "walk_front_0", 10: "walk_front_1", 11: "walk_front_2", 12: "walk_front_3",
    13: "walk_back_0", 14: "walk_back_1", 15: "walk_back_2", 16: "walk_back_3",
    17: "run_0", 18: "run_1", 19: "run_2", 20: "run_3",
    21: "sit_0", 22: "sit_1",
    23: "lying_0", 24: "sleep_0",
    25: "jump_0", 26: "jump_1", 27: "jump_2",
    28: "wag_0", 29: "wag_1", 30: "wag_2", 31: "wag_3",
}


def key_white(im, tol=TOL):
    """Flood-fill near-white from all borders; only edges touching bg become transparent."""
    w, h = im.size
    px = im.load()
    mask = bytearray(w * h)
    dq = deque()

    def is_bg(x, y):
        r, g, b = px[x, y]
        return r > 255 - tol and g > 255 - tol and b > 255 - tol

    for x in range(w):
        for y in (0, h - 1):
            if not mask[y * w + x] and is_bg(x, y):
                mask[y * w + x] = 1
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not mask[y * w + x] and is_bg(x, y):
                mask[y * w + x] = 1
                dq.append((x, y))

    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not mask[ny * w + nx] and is_bg(nx, ny):
                mask[ny * w + nx] = 1
                dq.append((nx, ny))

    out = im.convert("RGBA")
    po = out.load()
    for y in range(h):
        for x in range(w):
            if mask[y * w + x]:
                r, g, b, _ = po[x, y]
                po[x, y] = (r, g, b, 0)
    return out


def render_cell(cell):
    keyed = key_white(cell)
    bbox = keyed.split()[3].getbbox()
    if not bbox:
        return None
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    scale = min(CANVAS / bw, CANVAS / bh) * 0.95
    nw, nh = max(1, int(bw * scale)), max(1, int(bh * scale))
    crop = keyed.crop(bbox).resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((CANVAS - nw) // 2, CANVAS - nh))
    return canvas


def main():
    if not os.path.exists(SRC):
        raise SystemExit(f"source not found: {SRC}")
    im = Image.open(SRC).convert("RGB")
    os.makedirs(ASSETS, exist_ok=True)

    written, skipped = 0, 0
    for (cell_y, cell_x), (num, override) in GRID_MAP.items():
        if num == 32:
            print(f"  sprite 32 skipped (missing)")
            skipped += 1
            continue
        x0 = cell_x * CELL_W
        y0 = cell_y * CELL_H + LABEL_SKIP
        x1 = x0 + CELL_W
        y1 = y0 + CONTENT_H
        cell = im.crop((x0, y0, x1, y1))
        canvas = render_cell(cell)
        if canvas is None:
            print(f"  sprite {num:02d}: empty after key, skip")
            continue
        if override:
            name = override
        elif num in SPRITE_MAP:
            name = SPRITE_MAP[num]
        else:
            print(f"  sprite {num:02d}: no mapping, skip")
            continue
        canvas.save(os.path.join(ASSETS, f"{name}.png"))
        written += 1
        print(f"  sprite {num:02d} -> {name}.png")

    print(f"---\nwritten: {written}, skipped: {skipped}")


if __name__ == "__main__":
    main()