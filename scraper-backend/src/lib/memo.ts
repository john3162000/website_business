/**
 * A small per-instance cache for database loads that every request repeats (FNRI foods, recent
 * prices, the full compile). Prices change once a day, so a few minutes per warm instance is safe
 * and keeps repeated or scripted calls from hitting the database each time. A failed load is not kept.
 */
type Entry = { at: number; value: Promise<unknown> };
const store = new Map<string, Entry>();

export function memo<T>(key: string, ttlMs: number, load: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const hit = store.get(key);
  if (hit && now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: now(), value });
  value.catch(() => { if (store.get(key)?.value === value) store.delete(key); });
  return value;
}

/** For tests. */
export function clearMemo(): void {
  store.clear();
}
