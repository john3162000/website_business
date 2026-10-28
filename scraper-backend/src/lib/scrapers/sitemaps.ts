/**
 * Panlasang Pinoy's Yoast sitemap index lists one post sitemap per ~1,000 posts
 * (post-sitemap.xml, post-sitemap2.xml, …). New ones appear as the site grows, so
 * the crawl reads the index instead of a fixed list.
 */

/** The post sitemaps named in a sitemap index, in order (post-sitemap, post-sitemap2, …). */
export function postSitemapsFromIndex(xml: string): string[] {
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const num = (u: string) => Number(u.match(/post-sitemap(\d*)\.xml$/)?.[1] || 1);
  return [...new Set(urls.filter((u) => /\/post-sitemap\d*\.xml$/.test(u)))].sort((a, b) => num(a) - num(b));
}

/** Every page URL in one sitemap that is on `base` (other hosts are ignored). */
export function urlsFromSitemap(xml: string, base: string): string[] {
  return [...xml.matchAll(/<url>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => m[1].replace(/&amp;/g, "&"))
    .filter((u) => u.startsWith(base));
}
