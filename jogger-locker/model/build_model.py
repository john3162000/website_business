#!/usr/bin/env python3
"""
Builds the 3D locker page from locker_3d_template.html, using the same L-shaped
door layout and measurements as design/build_locker_bank.py:

  locker-3d.html           the page as published to Claude (three.js from a CDN)
  up-oval-locker-3d.html   stand-alone copy; with --three-dir it carries three.js
                           inside the file, so it opens without internet

  python3 build_model.py [--three-dir node_modules/three]    (three@0.147.0)

render_media.js then records the rental video and exports the .glb model.
"""

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "design"))
import build_locker_bank as design  # noqa: E402

THREE_VERSION = "0.147.0"
CDN = f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}"
SCRIPTS = ["build/three.min.js", "examples/js/controls/OrbitControls.js"]


def demo_door():
    """The first backpack door in the column right after the control column,
    which sits beside the screen at waist height: the door the story uses."""
    number = 0
    after_control = False
    for col in design.COLUMNS:
        if col is None:
            after_control = True
            continue
        for size in col:
            number += 1
            if after_control and size == "M":
                return number
    raise ValueError("no backpack door after the control column")


def params():
    return {
        "module": design.MODULE,
        "depth": design.DEPTH,
        "plinth": design.PLINTH,
        "doorTop": design.DOOR_TOP,
        "signTop": design.SIGN_TOP,
        "canopy": design.CANOPY,
        "canopyReach": design.CANOPY_REACH,
        "pitch": design.PITCH,
        "columns": design.COLUMNS,
        "fold": design.FOLD,
        "lot": design.LOT,
        "demo": demo_door(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--three-dir", type=Path, help="three@0.147.0 package folder to inline into the stand-alone copy")
    args = parser.parse_args()

    template = (HERE / "locker_3d_template.html").read_text(encoding="utf-8")
    page = template.replace("__PARAMS__", json.dumps(params())).replace("__DEMO__", str(demo_door()))
    cdn_tags = "\n".join(f'<script src="{CDN}/{path}"></script>' for path in SCRIPTS)
    (HERE / "locker-3d.html").write_text(page.replace("<!--THREE-->", cdn_tags), encoding="utf-8")

    if args.three_dir:
        scripts = [(args.three_dir / path).read_text(encoding="utf-8").replace("</script", "<\\/script")
                   for path in SCRIPTS]
        three = "\n".join(f"<script>\n{code}\n</script>" for code in scripts)
    else:
        three = cdn_tags
    page = page.replace("<!--THREE-->", three)
    body_start = page.index('<main class="page">')
    standalone = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                  + page[:body_start] + "</head>\n<body>\n" + page[body_start:] + "\n</body>\n</html>\n")
    (HERE / "up-oval-locker-3d.html").write_text(standalone, encoding="utf-8")
    print("wrote locker-3d.html and up-oval-locker-3d.html"
          + (" (three.js inlined)" if args.three_dir else " (three.js from CDN)"))


if __name__ == "__main__":
    main()
