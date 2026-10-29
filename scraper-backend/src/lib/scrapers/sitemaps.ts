/**
 * A recipe site's sitemap index lists one post sitemap per ~1,000 posts (Panlasang Pinoy:
 * post-sitemap.xml, post-sitemap2.xml, …). New ones appear as the site grows, so the crawl
 * reads the index instead of a fixed list.
 */

/**
 * The post (and recipe post type) sitemaps named in a sitemap index, in order: Yoast / Rank Math
 * (post-sitemap.xml, post-sitemap2.xml, recipe-sitemap.xml) and WordPress core
 * (wp-sitemap-posts-post-1.xml). Other sitemaps (pages, categories, images) are left out.
 */
export function postSitemapsFromIndex(xml: string): string[] {
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const kind = (u: string) => (/recipe/.test(u.split("/").pop() ?? "") ? 1 : 0);
  const num = (u: string) => Number(u.match(/(\d*)\.xml$/)?.[1] || 1);
  const POST = /\/(?:(?:post|recipes?)-sitemap\d*|wp-sitemap-posts-(?:post|recipes?)-\d+)\.xml$/;
  return [...new Set(urls.filter((u) => POST.test(u)))].sort((a, b) => kind(a) - kind(b) || num(a) - num(b));
}

/** Every page URL in one sitemap that is on `base` (other hosts are ignored). */
export function urlsFromSitemap(xml: string, base: string): string[] {
  return [...xml.matchAll(/<url>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => m[1].replace(/&amp;/g, "&"))
    .filter((u) => u.startsWith(base));
}
