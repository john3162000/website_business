/**
 * The recipe sites the crawl reads, in order. Each was checked first (see PROGRESS.md, "Recipe
 * sources"): its robots.txt allows crawling, its terms don't forbid automated collection, and its
 * recipe pages carry schema.org Recipe JSON-LD. Like Panlasang Pinoy, only the title, ingredients,
 * method notes, a photo link and the source link are kept; the site's own page teaches the cooking.
 *
 * `dedupe`: skip a dish already listed (same dishKey) from an earlier source, so a second site adds
 * new dishes instead of a second Chicken Adobo. Panlasang Pinoy, the first source, keeps everything.
 */
export interface RecipeSource {
  /** Stored in Recipe.sourceSite. */
  site: string;
  /** Shown on the site ("Recipe & photo: Kawaling Pinoy"). */
  name: string;
  /** Scheme and host, no trailing slash; sitemap URLs must start with it. */
  base: string;
  dedupe: boolean;
  /** For general food blogs: keep only recipes whose cuisine (or title) matches, e.g. /filipino/i. */
  cuisine?: RegExp;
  /** Only pages under this path ("/recipes/"), for sites whose sitemap also lists articles and reviews. */
  pathPrefix?: string;
}

const FILIPINO = /filipin|pinoy/i;

export const RECIPE_SOURCES: RecipeSource[] = [
  { site: "PanlasangPinoy", name: "Panlasang Pinoy", base: "https://panlasangpinoy.com", dedupe: false },
  // Checked 2026-10-29 (robots.txt, terms, JSON-LD on sample posts); see PROGRESS.md.
  { site: "KawalingPinoy", name: "Kawaling Pinoy", base: "https://www.kawalingpinoy.com", dedupe: true },
  { site: "YummyKitchen", name: "Yummy Kitchen", base: "https://yummykitchentv.com", dedupe: true },
  { site: "RecipesByNora", name: "Recipes by Nora", base: "https://www.recipesbynora.com", dedupe: true },
  { site: "PinoyRecipe", name: "Pinoy Recipe", base: "https://www.pinoyrecipe.net", dedupe: true },
  { site: "FoxyFolksy", name: "Foxy Folksy", base: "https://www.foxyfolksy.com", dedupe: true, cuisine: FILIPINO },
  { site: "ManilaSpoon", name: "Manila Spoon", base: "https://www.manilaspoon.com", dedupe: true, cuisine: FILIPINO },
  { site: "Pepper", name: "Pepper.ph", base: "https://www.pepper.ph", dedupe: true, pathPrefix: "/recipes/" },
];
