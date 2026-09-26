#!/usr/bin/env python3
"""
Compiles the five jogger-locker pages into one page with a tab for each.
Every page opens in its own frame, so its styles and scripts stay separate:

  all-pages.html              the tabbed page as published to Claude
  up-oval-locker-kiosk.html   stand-alone copy to save; its 3D tab carries
                              three.js inside, so it also works offline

Build the pages first: weather_analysis.py, design/build_locker_bank.py,
architecture/build_architecture.py, locks/build_locks.py and
model/build_model.py --three-dir node_modules/three.
"""

import json
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent

# tab id, tab label, page title, stand-alone page
PAGES = [
    ("weather", "Weather", "UP Oval Jogging Weather", "results/up-oval-jogging-weather.html"),
    ("design", "Design", "UP Oval Locker Bank", "design/up-oval-locker-bank.html"),
    ("system", "System", "UP Oval Locker System", "architecture/up-oval-locker-system.html"),
    ("locks", "Locks", "UP Oval Locker Locks", "locks/up-oval-locker-locks.html"),
    ("model", "3D model", "UP Oval Locker 3D", "model/up-oval-locker-3d.html"),
]
CHARSET = '<meta charset="utf-8">\n'
SHELL = ('<!doctype html>\n<html lang="en">\n<head>\n' + CHARSET +
         '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')


def model_from_cdn():
    """The 3D page loading three.js from the CDN, as a full document."""
    page = (HERE / "model/locker-3d.html").read_text(encoding="utf-8")
    start = page.index('<main class="page">')
    return SHELL + page[:start] + "</head>\n<body>\n" + page[start:] + "\n</body>\n</html>\n"


def framed(html):
    """Links inside a tab open in a new browser tab instead of replacing the frame."""
    assert CHARSET in html
    return html.replace(CHARSET, CHARSET + '<base target="_blank">\n', 1)


def build(model_html):
    pages = {}
    for tab, _, title, path in PAGES:
        html = model_html if tab == "model" else (HERE / path).read_text(encoding="utf-8")
        pages[tab] = {"title": title, "html": framed(html)}
    tabs = "\n".join(
        f'    <button class="tab" type="button" role="tab" id="tab-{tab}" data-page="{tab}" '
        f'aria-controls="panel-{tab}" aria-selected="false" tabindex="-1">{escape(label)}</button>'
        for tab, label, _, _ in PAGES)
    panels = "\n".join(
        f'  <section class="panel" role="tabpanel" id="panel-{tab}" aria-labelledby="tab-{tab}" hidden></section>'
        for tab, _, _, _ in PAGES)
    # Escaping every "<" keeps the pages from ending the JSON script block early.
    data = json.dumps(pages).replace("<", "\\u003c")
    template = (HERE / "tabs_template.html").read_text(encoding="utf-8")
    return template.replace("__TABS__", tabs).replace("__PANELS__", panels).replace("__PAGES__", data)


def main():
    published = build(model_from_cdn())
    (HERE / "all-pages.html").write_text(published, encoding="utf-8")
    offline = build((HERE / "model/up-oval-locker-3d.html").read_text(encoding="utf-8"))
    body_start = offline.index('<header class="bar">')
    standalone = SHELL + offline[:body_start] + "</head>\n<body>\n" + offline[body_start:] + "\n</body>\n</html>\n"
    (HERE / "up-oval-locker-kiosk.html").write_text(standalone, encoding="utf-8")
    print(f"wrote all-pages.html ({len(published) // 1024} KB) "
          f"and up-oval-locker-kiosk.html ({len(standalone) // 1024} KB)")


if __name__ == "__main__":
    main()
