#!/usr/bin/env python3
"""
Weather-adjusted demand for a jogger locker kiosk at the UP Diliman Academic Oval.

Reads the Open-Meteo hourly archive CSVs in data/, labels every morning
(5:00-8:00 AM) and evening (5:00-8:00 PM) jogging window of the last 365 days
as "jogged" or "rained out", and writes:

  results/sessions_<model>.csv   one row per window, with the rain figures
  results/summary.json           totals, monthly counts and sensitivity checks
  results/dashboard.html         the summary rendered into dashboard_template.html
  results/up-oval-jogging-weather.html   the same page as a stand-alone file

Standard library only:  python3 weather_analysis.py
"""

import csv
import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "data"
OUT_DIR = HERE / "results"

LOCATION = {"name": "UP Diliman Academic Oval", "lat": 14.6537, "lon": 121.0685}
START, END = date(2025, 9, 21), date(2026, 9, 20)

MODELS = {
    "best_match": "Open-Meteo best match",
    "ecmwf_ifs": "ECMWF IFS, 9 km",
    "era5": "ERA5 reanalysis, 25 km",
}
PRIMARY = "best_match"

WINDOWS = {"am": (5, 8), "pm": (17, 20)}  # local hours, end exclusive
PRE_HOURS = 2           # hours before a window checked for a downpour
RAIN_LIMIT_MM = 0.5     # an hour at or above this inside the window = rained out
DOWNPOUR_MM = 2.5       # an hour at or above this just before the window = rained out
DRY_MM = 0.1            # below this an hour counts as dry (0.1-0.5 = drizzle, still jogged)
SENSITIVITY_LIMITS = [0.2, 0.5, 1.0]

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def load_precipitation(path):
    """Return ({timestamp: mm}, grid point) from an Open-Meteo CSV export."""
    lines = path.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("time,"))
    grid = None
    if lines[0].startswith("latitude,"):
        meta = dict(zip(lines[0].split(","), lines[1].split(",")))
        grid = {"lat": float(meta["latitude"]), "lon": float(meta["longitude"]),
                "elevation_m": float(meta["elevation"])}
    rows = csv.reader(lines[start:])
    header = next(rows)
    # Column names look like "precipitation (mm)" or "precipitation_era5 (mm)".
    col = next(i for i, name in enumerate(header)
               if name.split(" (")[0].split("_")[0] == "precipitation")
    series = {}
    for row in rows:
        if not row or not row[0]:
            continue
        value = row[col].strip() if col < len(row) else ""
        series[datetime.fromisoformat(row[0])] = (
            float(value) if value not in ("", "NaN", "nan", "null") else None)
    return series, grid


def rain_in_hour(series, day, hour):
    """Rain that fell during [hour, hour + 1) local time on `day`.

    Open-Meteo stamps each hourly total at the END of its hour, so the rain
    from 5:00 to 6:00 is stored under 06:00.
    """
    stamp = datetime(day.year, day.month, day.day) + timedelta(hours=hour + 1)
    return series.get(stamp)


def classify(series, day, window, limit=RAIN_LIMIT_MM, pre_rule=True):
    """Label one jogging window: dry / drizzle (both jogged), out, or missing."""
    start, end = WINDOWS[window]
    inside = [rain_in_hour(series, day, h) for h in range(start, end)]
    before = [rain_in_hour(series, day, h) for h in range(start - PRE_HOURS, start)]
    if any(v is None for v in inside + before):
        return {"status": "missing", "reason": "no data", "max_mm": None,
                "total_mm": None, "before_mm": None}
    result = {"max_mm": max(inside), "total_mm": sum(inside), "before_mm": max(before)}
    if max(inside) >= limit:
        result.update(status="out", reason="rain during window")
    elif pre_rule and max(before) >= DOWNPOUR_MM:
        result.update(status="out", reason="downpour just before")
    elif max(inside) >= DRY_MM:
        result.update(status="drizzle", reason="light drizzle")
    else:
        result.update(status="dry", reason="dry")
    return result


def jogged(status):
    return status in ("dry", "drizzle")


def all_days():
    day = START
    while day <= END:
        yield day
        day += timedelta(days=1)


def daily_total(series, day):
    values = [rain_in_hour(series, day, h) for h in range(24)]
    return sum(v for v in values if v is not None)


def month_label(month):
    if month == 9:  # the 365 days start on 21 Sep 2025 and end on 20 Sep 2026
        return "Sep*"
    year = 2025 if month >= 10 else 2026
    return f"{MONTH_NAMES[month - 1]} {year}"


def analyse(series):
    sessions = []
    for day in all_days():
        for window in WINDOWS:
            row = classify(series, day, window)
            row.update(date=day, window=window, weekend=day.weekday() >= 5)
            sessions.append(row)

    totals = defaultdict(int)
    for s in sessions:
        totals["sessions"] += 1
        totals[s["status"]] += 1
        if s["status"] == "out":
            totals["out_during" if s["reason"] == "rain during window" else "out_before"] += 1
        if jogged(s["status"]):
            totals["jogged"] += 1
            totals[f"{s['window']}_jogged"] += 1
            totals["weekend_jogged" if s["weekend"] else "weekday_jogged"] += 1
        totals["weekend_sessions" if s["weekend"] else "weekday_sessions"] += 1

    by_day = defaultdict(list)
    for s in sessions:
        by_day[s["date"]].append(jogged(s["status"]))
    totals["days_both"] = sum(all(v) for v in by_day.values())
    totals["days_one"] = sum(any(v) and not all(v) for v in by_day.values())
    totals["days_none"] = sum(not any(v) for v in by_day.values())

    monthly = []
    for month in range(1, 13):
        rows = [s for s in sessions if s["date"].month == month]
        monthly.append({
            "month": month,
            "label": month_label(month),
            "days": len(rows) // len(WINDOWS),
            "sessions": len(rows),
            "am_jogged": sum(jogged(s["status"]) for s in rows if s["window"] == "am"),
            "pm_jogged": sum(jogged(s["status"]) for s in rows if s["window"] == "pm"),
            "jogged": sum(jogged(s["status"]) for s in rows),
            "weekend_jogged": sum(jogged(s["status"]) for s in rows if s["weekend"]),
            "rain_mm": round(sum(daily_total(series, d) for d in all_days()
                                 if d.month == month), 1),
        })

    sensitivity = {}
    for limit in SENSITIVITY_LIMITS:
        sensitivity[f"limit_{limit}"] = sum(
            jogged(classify(series, d, w, limit=limit)["status"])
            for d in all_days() for w in WINDOWS)
    sensitivity["no_downpour_rule"] = sum(
        jogged(classify(series, d, w, pre_rule=False)["status"])
        for d in all_days() for w in WINDOWS)

    # Longest run of consecutive days with no joggable window at all.
    best = run = 0
    best_end = None
    for day in all_days():
        run = run + 1 if not any(by_day[day]) else 0
        if run > best:
            best, best_end = run, day
    washout = ({"days": best, "start": str(best_end - timedelta(days=best - 1)),
                "end": str(best_end)} if best else {"days": 0})

    wettest = sorted(((daily_total(series, d), d) for d in all_days()), reverse=True)[:10]

    return sessions, {
        "totals": dict(totals),
        "monthly": monthly,
        "sensitivity": sensitivity,
        "longest_washout": washout,
        "wettest_days": [{"date": str(d), "mm": round(mm, 1)} for mm, d in wettest],
        "annual_rain_mm": round(sum(daily_total(series, d) for d in all_days()), 1),
    }


def write_sessions(path, sessions):
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "weekday", "window", "status", "reason",
                    "max_rain_mm_per_hour", "rain_in_window_mm", "max_rain_2h_before_mm"])
        for s in sessions:
            w.writerow([s["date"], s["date"].strftime("%a"),
                        "5-8 AM" if s["window"] == "am" else "5-8 PM",
                        s["status"], s["reason"],
                        *(None if s[k] is None else round(s[k], 2)
                          for k in ("max_mm", "total_mm", "before_mm"))])


def main():
    OUT_DIR.mkdir(exist_ok=True)
    summary = {
        "location": LOCATION,
        "period": {"start": str(START), "end": str(END), "days": (END - START).days + 1},
        "rules": {
            "windows": {"am": "5:00-8:00 AM", "pm": "5:00-8:00 PM"},
            "rain_limit_mm_per_hour": RAIN_LIMIT_MM,
            "downpour_before_mm_per_hour": DOWNPOUR_MM,
            "downpour_check_hours": PRE_HOURS,
            "dry_below_mm": DRY_MM,
        },
        "source": "Open-Meteo Historical Weather API (archive-api.open-meteo.com)",
        "models": {},
    }
    for key, label in MODELS.items():
        path = DATA_DIR / f"up_oval_hourly_{key}.csv"
        if not path.exists():
            print(f"skip {key}: {path.name} not found")
            continue
        series, grid = load_precipitation(path)
        sessions, stats = analyse(series)
        write_sessions(OUT_DIR / f"sessions_{key}.csv", sessions)
        summary["models"][key] = {"label": label, "grid_point": grid, **stats}
        if key == PRIMARY:
            lookup = {(s["date"], s["window"]): s for s in sessions}
            summary["days"] = []
            for day in all_days():
                entry = {"date": str(day), "dow": day.weekday(),
                         "mm": round(daily_total(series, day), 1)}
                for w in WINDOWS:
                    s = lookup[(day, w)]
                    entry[w] = s["status"]
                    entry[f"{w}_mm"] = None if s["max_mm"] is None else round(s["max_mm"], 1)
                    if s["reason"] == "downpour just before":
                        entry[f"{w}_before"] = round(s["before_mm"], 1)
                summary["days"].append(entry)

        t = stats["totals"]
        print(f"\n== {label} ==")
        print(f"jogged {t.get('jogged', 0)} of {t['sessions']} windows "
              f"({100 * t.get('jogged', 0) / t['sessions']:.1f}%): "
              f"AM {t.get('am_jogged', 0)}, PM {t.get('pm_jogged', 0)}; "
              f"rained out {t.get('out', 0)} "
              f"(during {t.get('out_during', 0)}, downpour before {t.get('out_before', 0)}); "
              f"missing {t.get('missing', 0)}")
        print(f"days: both windows OK {t['days_both']}, one {t['days_one']}, none {t['days_none']}; "
              f"annual rain {stats['annual_rain_mm']} mm; longest washout {stats['longest_washout']}")
        print("sensitivity:", stats["sensitivity"])
        for m in stats["monthly"]:
            print(f"  {m['label']:>9}: {m['jogged']:3d}/{m['sessions']:3d} "
                  f"(AM {m['am_jogged']:2d}, PM {m['pm_jogged']:2d})  rain {m['rain_mm']:7.1f} mm")

    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    print(f"\nwrote {OUT_DIR / 'summary.json'}")

    template = HERE / "dashboard_template.html"
    if template.exists() and PRIMARY in summary["models"]:
        data = json.dumps(summary, separators=(",", ":")).replace("</", "<\\/")
        page = template.read_text(encoding="utf-8").replace("__SUMMARY_JSON__", data)
        (OUT_DIR / "dashboard.html").write_text(page, encoding="utf-8")
        print(f"wrote {OUT_DIR / 'dashboard.html'}")
        # The published artifact gets its document shell from the host; the
        # stand-alone copy needs its own to open correctly from a phone or disk.
        body_start = page.index('<main class="page">')
        standalone = (
            '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + page[:body_start] + "</head>\n<body>\n" + page[body_start:] + "\n</body>\n</html>\n")
        (OUT_DIR / "up-oval-jogging-weather.html").write_text(standalone, encoding="utf-8")
        print(f"wrote {OUT_DIR / 'up-oval-jogging-weather.html'}")


if __name__ == "__main__":
    main()
