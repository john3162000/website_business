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
}

export const RECIPE_SOURCES: RecipeSource[] = [
  { site: "PanlasangPinoy", name: "Panlasang Pinoy", base: "https://panlasangpinoy.com", dedupe: false },
];
