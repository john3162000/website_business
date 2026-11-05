/**
 * Query-string checks for the public GET routes. Vercel's CDN caches by full URL, so an unknown
 * or malformed param (`?x=1`, `?id=abc`) would skip the cache and force a fresh recompile. Each
 * route lists the params it takes; anything else is refused with a 400 before any database work.
 */

export type ParamRule = (value: string) => boolean;

/** A positive integer id with no sign, leading zeros or suffix ("12", not "012" or "12abc"). */
export const isId: ParamRule = (v) => /^[1-9]\d{0,8}$/.test(v);

/** An integer from min to max, written plainly (no leading zeros, so each value has one URL). */
export const intIn = (min: number, max: number): ParamRule => (v) => /^(0|[1-9]\d{0,5})$/.test(v) && Number(v) >= min && Number(v) <= max;

/** One of a fixed set of values. */
export const oneOf = (...allowed: string[]): ParamRule => (v) => allowed.includes(v);

/** Free text up to `max` characters (a search box). */
export const textUpTo = (max: number): ParamRule => (v) => v.trim().length > 0 && v.length <= max;

export type QueryCheck = { ok: true; params: URLSearchParams } | { ok: false; error: string };

/** Checks a request URL against the allowed params: no unknown names, no repeats, every value valid. */
export function checkQuery(url: string, rules: Record<string, ParamRule> = {}): QueryCheck {
  const params = new URL(url).searchParams;
  const seen = new Set<string>();
  for (const [name, value] of params) {
    const rule = Object.hasOwn(rules, name) ? rules[name] : undefined;
    if (!rule) return { ok: false, error: `Unknown query parameter "${name.slice(0, 40)}"` };
    if (seen.has(name)) return { ok: false, error: `Repeated query parameter "${name}"` };
    seen.add(name);
    if (!rule(value)) return { ok: false, error: `Invalid value for "${name}"` };
  }
  return { ok: true, params };
}
