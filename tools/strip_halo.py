#!/usr/bin/env python3
"""Strip the pink border halo from already-processed assets in src/assets/.

Run after process_assets.py or whenever you want to clean the halo from
the current sprite frames without re-processing from the 2048px sources.
"""
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "src", "assets"))


def strip_pink_halo(im):
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 255 and r > b + 15 and r > g + 5:
                px[x, y] = (r, g, b, 0)
    return im


def main():
    files = sorted(f for f in os.listdir(ASSETS) if f.endswith(".png"))
    total_pink = 0
    for f in files:
        p = os.path.join(ASSETS, f)
        im = Image.open(p).convert("RGBA")
        px = im.load()
        w, h = im.size
        before = 0
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if 0 < a < 255 and r > b + 15 and r > g + 5:
                    before += 1
        strip_pink_halo(im)
        im.save(p)
        total_pink += before
        print(f"{f}: removed {before} halo px")
    print(f"---\ntotal halo pixels removed: {total_pink}")


if __name__ == "__main__":
    main()