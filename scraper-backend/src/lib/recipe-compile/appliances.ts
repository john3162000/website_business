/**
 * Kitchen appliances a recipe needs, read from its title and cooking steps.
 * A stove (kalan) and ordinary pots and pans are assumed and never listed.
 * The site lets people say what they have and hides dishes they can't cook;
 * substitutes (an air fryer for an oven, and so on) are decided on the site.
 */

export const APPLIANCES = [
  "oven",
  "air_fryer",
  "microwave",
  "grill",
  "steamer",
  "rice_cooker",
  "pressure_cooker",
  "slow_cooker",
  "blender",
  "mixer",
] as const;
export type Appliance = (typeof APPLIANCES)[number];

const PATTERNS: Record<Appliance, RegExp> = {
  // "bake" but not "baking soda/powder"; "broil"; a preheated or named oven.
  oven: /\boven\b|\bbak(e|ed|es|ing)\b(?!\s+(soda|powder))|\bbroil(er|ed|ing)?\b/,
  air_fryer: /\bair[- ]?fr(y|ied|ier|yer|ying)\b/,
  microwave: /\bmicrowav/,
  // Charcoal or electric grilling; "grill pan" counts too, since it needs the heat of a grill.
  grill: /\b(grill(ed|ing)?|griller|ihaw|inihaw|charcoal|barbecue|bbq|skewers?)\b/,
  steamer: /\bsteam(er|ed|ing)?\b(?!\s+(rice|out))|\bsiomai steamer\b|\blansong\b/,
  rice_cooker: /\brice cooker\b/,
  pressure_cooker: /\bpressure[- ]?cook(er|ed|ing)?\b|\binstant ?pot\b|\binstapot\b/,
  slow_cooker: /\bslow[- ]?cook(er)?\b|\bcrock[- ]?pot\b/,
  blender: /\bblender\b|\bfood processor\b|\bblitz\b/,
  mixer: /\b(stand|hand|electric) mixer\b|\bmixer\b/,
};

// "Steamed rice" and "serve with steamed rice" are side dishes, not steaming the dish.
const STEAMED_RICE = /\bsteamed (white |jasmine )?rice\b|\bsteam(ing)? hot\b/g;

/** The words in the steps that name an appliance ("bake", "air fryer"), for method notes. */
export function applianceWords(instructions: string[]): string[] {
  const text = instructions.join("\n").toLowerCase().replace(STEAMED_RICE, " ");
  return APPLIANCES.flatMap((a) => [...text.matchAll(new RegExp(PATTERNS[a].source, "g"))].map((m) => m[0]));
}

/** The appliances named in a recipe's title or steps, in APPLIANCES order. */
export function detectAppliances(title: string, instructions: string[] = []): Appliance[] {
  const text = `${title}\n${instructions.join("\n")}`.toLowerCase().replace(STEAMED_RICE, " ");
  return APPLIANCES.filter((a) => PATTERNS[a].test(text));
}
