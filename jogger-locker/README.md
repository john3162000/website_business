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

## Locker design

`design/` holds the proposed 30-door locker bank: 6 small doors with USB
charging, 21 backpack doors and 3 large doors around a control column.
It is 2.80 x 0.62 x 1.85 m and needs about 4.9 m2 of floor with a clear strip
in front. The page also estimates rent at DiliMall and Gyud Food.

- `design/build_locker_bank.py`: draws the elevation, section and floor plan
  from the door layout in `COLUMNS` and fills them into the template
- `design/locker_bank_template.html`: page text and styling
- `design/locker-bank.html`: the finished page, as published to Claude
- `design/up-oval-locker-bank.html`: stand-alone copy to save and open

Rerun with `python3 design/build_locker_bank.py` after changing the layout.

## System architecture

`architecture/` describes how the unstaffed kiosk works: a Raspberry Pi in the
kiosk drives RS485 lock boards and checks PINs offline, a Next.js + Prisma app
on Render takes PayMongo QR Ph payments by webhook and sends PINs through
Semaphore, and the kiosk talks to the server over one HTTPS connection with a
long-poll for commands. The page covers the rent and open sequences, rental
states, failure handling, data, API, security, running costs and a build plan.

- `architecture/build_architecture.py`: draws the diagrams (the sequences
  live in `RENT_STEPS` and `OPEN_STEPS`) and fills them into the template
- `architecture/architecture_template.html`: page text and styling
- `architecture/system-architecture.html`: the finished page, as published
- `architecture/up-oval-locker-system.html`: stand-alone copy to save and open

Weather data: [Open-Meteo.com](https://open-meteo.com/), CC BY 4.0.
