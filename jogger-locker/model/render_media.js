// Records the rental animation frame by frame and exports the .glb model from
// the stand-alone 3D page (build it with --three-dir first). Needs Playwright
// with Chromium and the three@0.147.0 package:
//
//   node render_media.js up-oval-locker-3d.html node_modules/three out [fps]
//
// Writes out/up-oval-locker.glb and out/frames/f00000.jpg ...; encode the video with
//   ffmpeg -framerate 30 -i out/frames/f%05d.jpg -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart out/rental.mp4

const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

(async () => {
  const [pageFile, threeDir, outDir, fpsArg] = process.argv.slice(2);
  const fps = Number(fpsArg || 30);
  fs.mkdirSync(path.join(outDir, "frames"), { recursive: true });

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.resolve(pageFile));
  await page.waitForFunction(() => window.LOCKER);
  await page.evaluate(() => document.fonts.ready);

  await page.addScriptTag({ path: path.join(threeDir, "examples/js/exporters/GLTFExporter.js") });
  const glb = await page.evaluate(async () => {
    const bytes = new Uint8Array(await window.LOCKER.exportGLB());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  fs.writeFileSync(path.join(outDir, "up-oval-locker.glb"), Buffer.from(glb, "base64"));

  await page.evaluate(() => window.LOCKER.videoMode(true));
  const frames = Math.round((await page.evaluate(() => window.LOCKER.duration)) * fps);
  const viewer = await page.$("#viewer");
  for (let i = 0; i <= frames; i++) {
    await page.evaluate((t) => window.LOCKER.renderAt(t), i / fps);
    const file = path.join(outDir, "frames", `f${String(i).padStart(5, "0")}.jpg`);
    await viewer.screenshot({ path: file, type: "jpeg", quality: 92 });
    if (i % 60 === 0) console.log(`frame ${i} of ${frames}`);
  }
  console.log(errors.length ? errors : "no page errors");
  await browser.close();
})();
