# Handoff: branch claude/settings-grocery-filters (stopped 2026-10-27 to save budget)

## Done (pushed)
- docs/: Settings button (⚙️ in header: language TL/EN, multi-diet, kitchen, "Suggest ka pa", dark mode, weather),
  docs/settings.js + settings.test.mjs; grocery list grouped by palengke section (receipt, text, PNG, HTML);
  Fish/Chicken/Pork/Beef chips (meatTypes() from proteinKind()) in Browse and Planner; diets must ALL pass
  (dietsOk, dietNote keeps "guidance only"); planner drag and drop (dim + lit valid slots, mouse + touch hold).
  Site tests: 81/81 pass; node --check passes.
- Backend (NOT yet run through `npm test` / `npx tsc --noEmit`): methodNotes() in compile.ts (+ method-notes.test.ts,
  passes), applianceWords() in appliances.ts, Recipe.methodNotes column (schema, migration 20261027000000,
  ensure-schema, load.ts fallback).

## To do next
1. Check screenshots in demo/settings-out (from .github/workflows/settings-preview.yml); fix anything off.
2. recipe-scraper.ts: read post sitemaps from sitemap_index.xml (fallback to the 3 fixed ones); batch the
   "already saved" check (findMany url in [...]); save methodNotes(instructions) and NO description/instructions
   for new recipes (keep url + imageUrl link). Hidden-if-unknown already happens in the engine.
3. scraper-backend/scripts/add-recipes.mjs: loops POST /api/scrape/recipes with ADMIN_TOKEN read from the PC's
   env or scraper-backend/.env.local (never printed); optional GitHub workflow_dispatch using an ADMIN_TOKEN secret.
   Document both in CLAUDE.md.
4. Run npm test, tsc, node --test docs/*.test.mjs. Delete demo/ preview files, the settings-preview workflow and this
   file. Open the PR with auto-merge (merge commits), check the live site, update PROGRESS.md (also add #36–#53).
5. Owner ticks Desktop\SarapSulit Stakeholders\Website Improvements.md (not reachable from the cloud).
Note: Panlasang Pinoy has ~3,000 posts, so ~5,000 recipes needs a second source (owner's call).
