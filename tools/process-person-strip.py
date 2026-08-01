#!/usr/bin/env python3

import argparse
from pathlib import Path

from PIL import Image


def parse_args():
    parser = argparse.ArgumentParser(
        description="Split a transparent character strip into normalized runtime frames.",
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("--frames", type=int, required=True)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--canvas-width", type=int, default=480)
    parser.add_argument("--canvas-height", type=int, default=432)
    parser.add_argument("--target-width", type=int, default=440)
    parser.add_argument("--target-height", type=int, default=408)
    parser.add_argument("--baseline", type=int, default=424)
    parser.add_argument("--padding", type=int, default=4)
    parser.add_argument(
        "--align-x",
        choices=("shared", "bbox-center"),
        default="shared",
        help="Keep source-slot offsets or center each frame's visible silhouette.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if args.frames < 1:
        raise SystemExit("--frames must be at least 1")

    strip = Image.open(args.input).convert("RGBA")
    boundaries = [round(index * strip.width / args.frames) for index in range(args.frames + 1)]
    slots = [
        strip.crop((boundaries[index], 0, boundaries[index + 1], strip.height))
        for index in range(args.frames)
    ]
    boxes = [slot.getchannel("A").getbbox() for slot in slots]
    if any(box is None for box in boxes):
        empty_index = boxes.index(None)
        raise SystemExit(f"frame {empty_index} is empty after background removal")

    min_slot_width = min(slot.width for slot in slots)
    left = max(0, min(box[0] for box in boxes) - args.padding)
    top = max(0, min(box[1] for box in boxes) - args.padding)
    right = min(min_slot_width, max(box[2] for box in boxes) + args.padding)
    bottom = min(strip.height, max(box[3] for box in boxes) + args.padding)
    source_width = right - left
    source_height = bottom - top
    if source_width <= 0 or source_height <= 0:
        raise SystemExit("shared content bounds are invalid")

    scale = min(
        args.target_width / source_width,
        args.target_height / source_height,
    )
    output_width = max(1, round(source_width * scale))
    output_height = max(1, round(source_height * scale))
    shared_output_x = (args.canvas_width - output_width) // 2
    output_y = args.baseline - output_height
    if shared_output_x < 0 or output_y < 0:
        raise SystemExit("normalized content does not fit the configured canvas")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    output_boxes = []
    for index, slot in enumerate(slots):
        normalized = slot.crop((left, top, right, bottom)).resize(
            (output_width, output_height),
            Image.Resampling.LANCZOS,
        )
        output_x = shared_output_x
        if args.align_x == "bbox-center":
            visible_box = normalized.getchannel("A").getbbox()
            visible_center = (visible_box[0] + visible_box[2]) / 2
            output_x = round(args.canvas_width / 2 - visible_center)
        if output_x < 0 or output_x + output_width > args.canvas_width:
            raise SystemExit(f"frame {index} does not fit after horizontal alignment")

        frame = Image.new("RGBA", (args.canvas_width, args.canvas_height), (0, 0, 0, 0))
        frame.alpha_composite(normalized, (output_x, output_y))
        output = args.output_dir / f"{args.prefix}_{index}.png"
        frame.save(output, optimize=True)
        output_boxes.append((output_x, output_y, output_x + output_width, output_y + output_height))

    print(
        f"wrote {args.frames} frames; shared_source_box="
        f"({left},{top},{right},{bottom}); scale={scale:.4f}; "
        f"align_x={args.align_x}; output_boxes={output_boxes}",
    )


if __name__ == "__main__":
    main()
