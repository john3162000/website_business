import { test } from "node:test";
import assert from "node:assert/strict";
import { postSitemapsFromIndex, urlsFromSitemap } from "./sitemaps.ts";

test("post sitemaps come from the index, numbered in order, other sitemaps left out", () => {
  const xml = `<?xml version="1.0"?><sitemapindex>
    <sitemap><loc>https://panlasangpinoy.com/post-sitemap10.xml</loc></sitemap>
    <sitemap><loc>https://panlasangpinoy.com/page-sitemap.xml</loc></sitemap>
    <sitemap><loc>https://panlasangpinoy.com/post-sitemap2.xml</loc></sitemap>
    <sitemap><loc> https://panlasangpinoy.com/post-sitemap.xml </loc></sitemap>
    <sitemap><loc>https://panlasangpinoy.com/category-sitemap.xml</loc></sitemap>
    <sitemap><loc>https://panlasangpinoy.com/post-sitemap2.xml</loc></sitemap>
  </sitemapindex>`;
  assert.deepEqual(postSitemapsFromIndex(xml), [
    "https://panlasangpinoy.com/post-sitemap.xml",
    "https://panlasangpinoy.com/post-sitemap2.xml",
    "https://panlasangpinoy.com/post-sitemap10.xml",
  ]);
  assert.deepEqual(postSitemapsFromIndex("<html>blocked</html>"), []);
});

test("WordPress core and recipe post type sitemaps count too, posts first", () => {
  const xml = `<sitemapindex>
    <sitemap><loc>https://site.ph/wp-sitemap-posts-page-1.xml</loc></sitemap>
    <sitemap><loc>https://site.ph/wp-sitemap-posts-post-2.xml</loc></sitemap>
    <sitemap><loc>https://site.ph/wp-sitemap-posts-recipe-1.xml</loc></sitemap>
    <sitemap><loc>https://site.ph/wp-sitemap-posts-post-1.xml</loc></sitemap>
    <sitemap><loc>https://site.ph/wp-sitemap-taxonomies-category-1.xml</loc></sitemap>
  </sitemapindex>`;
  assert.deepEqual(postSitemapsFromIndex(xml), [
    "https://site.ph/wp-sitemap-posts-post-1.xml",
    "https://site.ph/wp-sitemap-posts-post-2.xml",
    "https://site.ph/wp-sitemap-posts-recipe-1.xml",
  ]);
});

test("other sitemap plugins: post sitemaps are the ones that aren't pages or taxonomies", () => {
  const xml = `<?xml version='1.0'?><sitemapindex>
    <sitemap><loc>https://y.com/sitemap-misc.html</loc></sitemap>
    <sitemap><loc>https://y.com/sitemap-misc.xml</loc></sitemap>
    <sitemap><loc>https://y.com/sitemap-tax-category.xml</loc></sitemap>
    <sitemap><loc>https://y.com/sitemap-pt-post-2024-02.xml</loc></sitemap>
    <sitemap><loc>https://y.com/sitemap-pt-page-2020-01.xml</loc></sitemap>
    <sitemap><loc>https://y.com/sitemap-pt-post-2024-01.xml</loc></sitemap>
  </sitemapindex>`;
  assert.deepEqual(postSitemapsFromIndex(xml), ["https://y.com/sitemap-pt-post-2024-02.xml", "https://y.com/sitemap-pt-post-2024-01.xml"]);
  // A urlset (no index) is not read as a list of sitemaps.
  assert.deepEqual(postSitemapsFromIndex("<urlset><url><loc>https://y.com/a.xml</loc></url></urlset>"), []);
});

test("page URLs from a sitemap, only on the site itself", () => {
  const xml = `<urlset>
    <url><loc>https://panlasangpinoy.com/pastil-recipe/</loc><image:image><image:loc>https://cdn.example/x.jpg</image:loc></image:image></url>
    <url><loc>https://panlasangpinoy.com/tom-yum/?a=1&amp;b=2</loc></url>
    <url><loc>https://elsewhere.com/x/</loc></url>
  </urlset>`;
  assert.deepEqual(urlsFromSitemap(xml, "https://panlasangpinoy.com"), [
    "https://panlasangpinoy.com/pastil-recipe/",
    "https://panlasangpinoy.com/tom-yum/?a=1&b=2",
  ]);
});
