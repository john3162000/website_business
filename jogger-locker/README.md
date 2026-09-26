# Jogger locker kiosk: weather check

How many 5-8 AM and 5-8 PM jogging windows at the UP Diliman Academic Oval
were dry enough to jog over the last 365 days (21 Sep 2025 to 20 Sep 2026),
and what that means for a 30-locker kiosk.

## Result

573 of 730 windows were joggable (78%): 306 mornings and 267 evenings.
January to April was 96% joggable; June to September was 57%, and August
was the worst month at 19 of 62.

Open `results/up-oval-jogging-weather.html` for the calendar, monthly chart and revenue
calculator.

## Rules

- A window is rained out when any hour inside it has 0.5 mm of rain or more,
  or when an hour in the two hours before has 2.5 mm or more.
- Drizzle under 0.5 mm per hour counts as jogged.

## Rerun it

1. Download the hourly CSV from Open-Meteo and save it as
   `data/up_oval_hourly_best_match.csv`:

   https://archive-api.open-meteo.com/v1/archive?latitude=14.6537&longitude=121.0685&start_date=2025-09-21&end_date=2026-09-20&hourly=precipitation,rain,temperature_2m,apparent_temperature,weather_code&timezone=Asia%2FManila&format=csv

   To cover a different year, change `start_date` and `end_date` in the link
   and `START` and `END` in `weather_analysis.py`.

2. Run `python3 weather_analysis.py` (standard library only). It rewrites
   everything in `results/`.

## Files

- `weather_analysis.py`: labels every window and writes the results
- `dashboard_template.html`: page template; the script fills in the data
- `data/`: raw hourly weather from Open-Meteo
- `results/sessions_best_match.csv`: one row per window, with rain figures
- `results/summary.json`: totals, monthly counts and sensitivity checks
- `results/dashboard.html`: the finished page, as published to Claude
- `results/up-oval-jogging-weather.html`: the same page as a stand-alone file to
  save and open in any browser

Weather data: [Open-Meteo.com](https://open-meteo.com/), CC BY 4.0.
