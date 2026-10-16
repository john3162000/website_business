/**
 * "How to cook" video links from a recipe page: the schema.org VideoObject in its JSON-LD
 * (Panlasang Pinoy lists the recipe's YouTube video there), else a YouTube embed or a TikTok
 * video link anywhere in the HTML. Pure, so it is tested without the network.
 */
export interface VideoLinks {
  youtube: string | null;
  tiktok: string | null;
}

const YT_ID = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const TIKTOK = /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/;

const youtubeUrl = (s: string): string | null => {
  const m = YT_ID.exec(s);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
};

/** Every object in a JSON-LD value, depth first (handles @graph and nested arrays). */
function* objects(v: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(v)) for (const x of v) yield* objects(x);
  else if (v && typeof v === "object") {
    yield v as Record<string, unknown>;
    for (const x of Object.values(v)) if (x && typeof x === "object") yield* objects(x);
  }
}

export function extractVideoLinks(html: string): VideoLinks {
  let youtube: string | null = null, tiktok: string | null = null;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1]); } catch { continue; }
    for (const o of objects(data)) {
      const type = o["@type"];
      if (!(type === "VideoObject" || (Array.isArray(type) && type.includes("VideoObject")))) continue;
      for (const k of ["contentUrl", "embedUrl", "url"]) {
        const u = typeof o[k] === "string" ? (o[k] as string) : "";
        youtube ??= youtubeUrl(u);
        tiktok ??= TIKTOK.exec(u)?.[0] ?? null;
      }
    }
  }
  // No structured video: an embedded player or a link in the page body.
  youtube ??= youtubeUrl(html);
  tiktok ??= TIKTOK.exec(html)?.[0] ?? null;
  return { youtube, tiktok };
}

/** Search pages to fall back on when the recipe has no video of its own. */
export function videoSearchLinks(title: string): { youtube: string; tiktok: string } {
  const q = encodeURIComponent(`${title.replace(/\s+recipe$/i, "")} recipe panlasang pinoy`);
  return {
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(title.replace(/\s+recipe$/i, "") + " recipe")}`,
  };
}
