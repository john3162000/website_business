---
title: "Impeccable review 2026-11-10"
tags: [sarapsulit, design, impeccable, review]
aliases: [Design review November 2026, Impeccable critique 2]
updated: 2026-11-10
---

# Impeccable review, 2026-11-10

**Score:** 26/40, up from 22/40 on 2026-10-29.
Full report in the repo: `.impeccable/critique/2026-11-09T23-28-51Z__docs-index-html.md`.

## What was fixed (branch `claude/critique-fixes-2`, waiting for "deploy")

| # | Issue | Fix |
|---|---|---|
| 1 | Tagalog mode half in English | Tagalog by default. Titles, intros, buttons, the pop-up and category labels are translated. |
| 2 | Feeding planner mislabels dishes, no verdict | Right gulay/isda labels, no repeated protein within 3 days, "Pasok sa budget" line, shellfish note |
| 3 | Grey text hard to read | Darker greys, labels at least 12 px. Contrast failures went from 36 to 0. |
| 4 | Pages too long on phone | Compact Browse rows, Okasyon folds when no holiday is near, alerts card only with alerts |
| 5 | Heavy first visit | "Laktawan muna" on the age question, 5-step tour (was 10) |

## Still open

- Most of the 85 remaining detector findings are design-token drift: one-off colours and sizes.
- The brand word "FARM2FIGURE" is 9.9 px. It's the logo, so it stays.
- A next review should check the new Tagalog copy with real users.

Related: [[00 Index - Cooking and Nutrients]]
