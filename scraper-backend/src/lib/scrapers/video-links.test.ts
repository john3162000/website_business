import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVideoLinks, videoSearchLinks } from "./video-links.ts";

const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

test("video links: the VideoObject in the JSON-LD graph (Panlasang Pinoy)", () => {
  const html = ld({ "@graph": [
    { "@type": "ImageObject", contentUrl: "https://panlasangpinoy.com/logo.png" },
    { "@type": "Recipe", video: { "@type": "VideoObject", contentUrl: "https://www.youtube.com/watch?v=FWjp0ieChzs", embedUrl: "https://www.youtube.com/embed/FWjp0ieChzs?feature=oembed" } },
  ] });
  assert.deepEqual(extractVideoLinks(html), { youtube: "https://www.youtube.com/watch?v=FWjp0ieChzs", tiktok: null });
});

test("video links: an embedded player or a TikTok link in the page body; nothing when there is none", () => {
  const html = `<iframe src="https://www.youtube-nocookie.com/embed/3jUtOPlkZPo"></iframe> <a href="https://www.tiktok.com/@panlasangpinoy/video/7301234567890123456">TikTok</a>`;
  assert.deepEqual(extractVideoLinks(html), { youtube: "https://www.youtube.com/watch?v=3jUtOPlkZPo", tiktok: "https://www.tiktok.com/@panlasangpinoy/video/7301234567890123456" });
  assert.deepEqual(extractVideoLinks(`${ld({ "@type": "Recipe" })}<p>No video</p><script type="application/ld+json">{broken</script>`), { youtube: null, tiktok: null });
});

test("video search links name the dish", () => {
  const s = videoSearchLinks("Sinigang na Baboy Recipe");
  assert.equal(s.youtube, "https://www.youtube.com/results?search_query=Sinigang%20na%20Baboy%20recipe%20panlasang%20pinoy");
  assert.match(s.tiktok, /^https:\/\/www\.tiktok\.com\/search\?q=Sinigang%20na%20Baboy%20recipe$/);
});
