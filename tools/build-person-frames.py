#!/usr/bin/env python3

import argparse
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


CANVAS_SIZE = (480, 432)
TARGET_SIZE = (440, 408)
BASELINE = 424
ALPHA_THRESHOLD = 16

MASTER_SLOTS = {
    "jump": [
        (1020, 20, 1188, 340),
        (1188, 20, 1340, 340),
        (1340, 20, 1500, 340),
    ],
    "sit": [
        (20, 360, 205, 670),
        (205, 360, 395, 670),
    ],
    "lying": [(410, 400, 690, 660)],
    "sleep": [(690, 400, 950, 660)],
    "wag": [
        (960, 370, 1097, 670),
        (1097, 370, 1228, 670),
        (1228, 370, 1361, 670),
        (1361, 370, 1510, 670),
    ],
    "tilt": [
        (20, 700, 210, 1000),
        (210, 700, 410, 1000),
    ],
    "sniff": [
        (410, 700, 590, 1000),
        (590, 700, 780, 1000),
    ],
}

ACTION_FPS = {
    "idle": 1.5,
    "walk_right": 8,
    "run": 10,
    "jump": 6,
    "sit": 1.5,
    "lying": 1,
    "sleep": 1,
    "wag": 4,
    "tilt": 5,
    "sniff": 2,
    "scratch": 4,
}

ACTION_ORDER = [
    "idle",
    "walk_right",
    "run",
    "jump",
    "sit",
    "lying",
    "sleep",
    "wag",
    "tilt",
    "sniff",
    "scratch",
]

SOURCE_MATERIALS = {
    "idle": "idle-alpha.png (approved base character art)",
    "jump/sit/lying/sleep/wag/tilt/sniff": "all-actions-green.png (素材.png)",
    "scratch": "scratch-green.png (素材2.png)",
    "run": "run-green.png (d10b5ad9-bd88-4755-b088-a4dce09536f1.png)",
    "walk_right": "walk-right-green.png (ecbf3a2a-f7bc-47a3-9d46-3b512ac201d0.png)",
}


def parse_args():
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description="Build normalized runtime frames for the person desktop pet.",
    )
    parser.add_argument("--project-root", type=Path, default=project_root)
    return parser.parse_args()


def largest_component_mask(alpha):
    binary = np.asarray(alpha, dtype=np.uint8) >= ALPHA_THRESHOLD
    height, width = binary.shape
    visited = np.zeros_like(binary, dtype=bool)
    largest = []

    for start_y, start_x in zip(*np.nonzero(binary & ~visited)):
        if visited[start_y, start_x]:
            continue
        queue = deque([(int(start_y), int(start_x))])
        visited[start_y, start_x] = True
        component = []
        while queue:
            y, x = queue.popleft()
            component.append((y, x))
            for next_y, next_x in (
                (y - 1, x - 1), (y - 1, x), (y - 1, x + 1),
                (y, x - 1), (y, x + 1),
                (y + 1, x - 1), (y + 1, x), (y + 1, x + 1),
            ):
                if (
                    0 <= next_y < height
                    and 0 <= next_x < width
                    and binary[next_y, next_x]
                    and not visited[next_y, next_x]
                ):
                    visited[next_y, next_x] = True
                    queue.append((next_y, next_x))
        if len(component) > len(largest):
            largest = component

    if not largest:
        raise ValueError("frame has no visible character pixels")

    mask_array = np.zeros_like(binary, dtype=np.uint8)
    ys, xs = zip(*largest)
    mask_array[np.asarray(ys), np.asarray(xs)] = 255
    return Image.fromarray(mask_array, mode="L").filter(ImageFilter.MaxFilter(5))


def clean_slot(slot):
    slot = slot.convert("RGBA")
    component_mask = largest_component_mask(slot.getchannel("A"))
    cleaned_alpha = ImageChops.multiply(slot.getchannel("A"), component_mask)
    cleaned = slot.copy()
    cleaned.putalpha(cleaned_alpha)
    bbox = cleaned_alpha.getbbox()
    if bbox is None:
        raise ValueError("frame is empty after detached-component cleanup")
    return cleaned, bbox


def extract_slots(source, rectangles, source_indices=None):
    extracted = []
    for index, rectangle in enumerate(rectangles):
        slot = source.crop(rectangle)
        cleaned, bbox = clean_slot(slot)
        extracted.append({
            "image": cleaned,
            "bbox": bbox,
            "global_bottom": rectangle[1] + bbox[3],
            "source_index": index,
        })
    if source_indices is not None:
        extracted = [extracted[index] for index in source_indices]
    return extracted


def equal_rectangles(image, count):
    boundaries = [round(index * image.width / count) for index in range(count + 1)]
    return [
        (boundaries[index], 0, boundaries[index + 1], image.height)
        for index in range(count)
    ]


def fit_scale(frames):
    max_width = max(frame["bbox"][2] - frame["bbox"][0] for frame in frames)
    max_height = max(frame["bbox"][3] - frame["bbox"][1] for frame in frames)
    return min(TARGET_SIZE[0] / max_width, TARGET_SIZE[1] / max_height)


def normalize_action(frames, scale, output_dir, prefix, preserve_vertical=False):
    maximum_bottom = max(frame["global_bottom"] for frame in frames)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_frames = []

    for output_index, frame_data in enumerate(frames):
        bbox = frame_data["bbox"]
        sprite = frame_data["image"].crop(bbox)
        output_width = max(1, round(sprite.width * scale))
        output_height = max(1, round(sprite.height * scale))
        if output_width > TARGET_SIZE[0] or output_height > TARGET_SIZE[1]:
            raise ValueError(f"{prefix}_{output_index} exceeds the runtime safe area")

        sprite = sprite.resize((output_width, output_height), Image.Resampling.LANCZOS)
        output_x = (CANVAS_SIZE[0] - output_width) // 2
        lift = 0
        if preserve_vertical:
            lift = round((maximum_bottom - frame_data["global_bottom"]) * scale)
        output_y = BASELINE - lift - output_height
        if output_x < 0 or output_y < 0:
            raise ValueError(f"{prefix}_{output_index} does not fit the runtime canvas")

        canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
        canvas.alpha_composite(sprite, (output_x, output_y))
        output_path = output_dir / f"{prefix}_{output_index}.png"
        canvas.save(output_path, optimize=True)
        manifest_frames.append({
            "file": output_path.name,
            "source_index": frame_data["source_index"],
            "source_bbox": list(bbox),
            "output_bbox": [
                output_x,
                output_y,
                output_x + output_width,
                output_y + output_height,
            ],
        })

    return manifest_frames


def render_preview(frame_paths, output_path, fps):
    preview_frames = []
    for frame_path in frame_paths:
        frame = Image.open(frame_path).convert("RGBA")
        background = Image.new("RGBA", (160, 160), (244, 244, 240, 255))
        rendered = frame.resize((160, 144), Image.Resampling.LANCZOS)
        background.alpha_composite(rendered, (0, 8))
        preview_frames.append(background.convert("RGB"))
    duration = max(80, round(1000 / fps))
    preview_frames[0].save(
        output_path,
        save_all=True,
        append_images=preview_frames[1:],
        duration=duration,
        loop=0,
        optimize=False,
    )


def make_contact_sheet(asset_dir, preview_dir):
    cell_width = 180
    cell_height = 182
    sheet = Image.new(
        "RGB",
        (cell_width * 4, cell_height * len(ACTION_ORDER)),
        (238, 238, 234),
    )
    draw = ImageDraw.Draw(sheet)

    for row, action in enumerate(ACTION_ORDER):
        frame_paths = sorted(asset_dir.glob(f"{action}_*.png"))
        for column, frame_path in enumerate(frame_paths):
            frame = Image.open(frame_path).convert("RGBA")
            rendered = frame.resize((160, 144), Image.Resampling.LANCZOS)
            cell = Image.new("RGBA", (160, 144), (255, 255, 255, 255))
            cell.alpha_composite(rendered)
            x = column * cell_width + 10
            y = row * cell_height + 26
            sheet.paste(cell.convert("RGB"), (x, y))
            draw.text((x, y + 148), frame_path.stem, fill=(35, 35, 35))
        draw.text((10, row * cell_height + 7), action, fill=(25, 25, 25))

    sheet.save(preview_dir / "person-contact-sheet.png", optimize=True)


def main():
    args = parse_args()
    root = args.project_root.resolve()
    strip_dir = root / "art/person/strips"
    asset_dir = root / "src/assets/characters/person"
    preview_dir = root / "art/person/previews"
    qa_dir = root / "art/person/qa"
    preview_dir.mkdir(parents=True, exist_ok=True)
    qa_dir.mkdir(parents=True, exist_ok=True)

    master = Image.open(strip_dir / "all-actions-alpha.png").convert("RGBA")
    idle = Image.open(strip_dir / "idle-alpha.png").convert("RGBA")
    walk = Image.open(strip_dir / "walk-right-alpha.png").convert("RGBA")
    run = Image.open(strip_dir / "run-alpha.png").convert("RGBA")
    scratch = Image.open(strip_dir / "scratch-alpha.png").convert("RGBA")

    master_groups = {
        action: extract_slots(master, rectangles)
        for action, rectangles in MASTER_SLOTS.items()
    }
    master_scale = TARGET_SIZE[1] / max(
        frame["bbox"][3] - frame["bbox"][1]
        for action in ("wag", "tilt", "sniff")
        for frame in master_groups[action]
    )

    groups = {
        **master_groups,
        "idle": extract_slots(idle, equal_rectangles(idle, 4)),
        "walk_right": extract_slots(
            walk,
            equal_rectangles(walk, 4),
            source_indices=[0, 1, 3, 1],
        ),
        "run": extract_slots(
            run,
            equal_rectangles(run, 4),
            source_indices=[0, 1, 2, 1],
        ),
        "scratch": extract_slots(scratch, equal_rectangles(scratch, 2)),
    }
    scales = {
        action: master_scale for action in MASTER_SLOTS
    }
    walk_scale = fit_scale(groups["walk_right"])
    scales.update({
        "idle": fit_scale(groups["idle"]),
        "walk_right": walk_scale,
        "run": walk_scale,
        "scratch": fit_scale(groups["scratch"]),
    })

    manifest = {
        "canvas": list(CANVAS_SIZE),
        "baseline": BASELINE,
        "source_materials": SOURCE_MATERIALS,
        "actions": {},
    }
    for action, frames in groups.items():
        normalized = normalize_action(
            frames,
            scales[action],
            asset_dir,
            action,
            preserve_vertical=action in {"jump", "run"},
        )
        manifest["actions"][action] = {
            "scale": scales[action],
            "frames": normalized,
        }

    expected_counts = {
        "idle": 4,
        "walk_right": 4,
        "run": 4,
        "jump": 3,
        "sit": 2,
        "lying": 1,
        "sleep": 1,
        "wag": 4,
        "tilt": 2,
        "sniff": 2,
        "scratch": 2,
    }
    total_frames = 0
    for action, expected_count in expected_counts.items():
        frame_paths = sorted(asset_dir.glob(f"{action}_*.png"))
        if len(frame_paths) != expected_count:
            raise ValueError(
                f"{action} expected {expected_count} frames, found {len(frame_paths)}",
            )
        total_frames += len(frame_paths)
        render_preview(
            frame_paths,
            preview_dir / f"{action}.gif",
            ACTION_FPS[action],
        )
    if total_frames != 29:
        raise ValueError(f"expected 29 runtime frames, found {total_frames}")

    make_contact_sheet(asset_dir, preview_dir)
    manifest["runtime_frame_count"] = total_frames
    with (qa_dir / "frame-manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(f"wrote {total_frames} runtime frames to {asset_dir}")
    print(f"wrote previews to {preview_dir}")


if __name__ == "__main__":
    main()
