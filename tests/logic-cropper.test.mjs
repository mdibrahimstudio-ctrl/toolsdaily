// Logic + UI tests for the Image Cropper tool (2026-11-14 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_crop.
// jsdom has no canvas/Image decoding, so UI tests stub Image (2000x1000)
// and the canvas pipeline the same way the resizer tests do.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function stubCropEnv(win) {
  win.__lastCanvas = null;
  win.__drawn = null;
  win.URL.createObjectURL = () => 'blob:fake';
  win.URL.revokeObjectURL = () => {};
  win.HTMLCanvasElement.prototype.getContext = function () {
    return {
      drawImage: (...a) => { win.__drawn = a.slice(1); },
      fillRect: () => {}, fillStyle: '',
    };
  };
  win.HTMLCanvasElement.prototype.toBlob = function (cb) {
    win.__lastCanvas = { w: this.width, h: this.height };
    cb(new win.Blob(['x'.repeat(1500)], { type: 'image/png' }));
  };
  win.Image = class {
    set src(v) { const self = this; setTimeout(() => { if (self.onload) self.onload(); }, 0); }
    get naturalWidth() { return 2000; }
    get naturalHeight() { return 1000; }
  };
}

async function loadPage(p, stub) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win) { if (stub) stubCropEnv(win); },
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  return dom;
}
function setVal(win, sel, value) {
  const el = win.document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

console.log('CROPPER STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'image-cropper', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/image-cropper/">'), 'cropper: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'cropper: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'cropper: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'cropper: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'cropper: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'cropper: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Image Cropper' && app.url === 'https://toolsdaily.vercel.app/image-cropper/' && app.offers.price === '0', 'cropper: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `cropper: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['image-resizer', 'image-compressor', 'image-converter', 'image-synthid-remover', 'background-remover'];
  ok((nav.match(/<li>/g) || []).length === related.length && related.every((s) => nav.includes(`href="../${s}/"`)), 'cropper: More-tools nav links exactly its 5 related tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 55, 'sitemap.xml has 55 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/image-cropper/'), 'sitemap includes image-cropper');
  ok(/image-cropper\/<\/loc>\s*<lastmod>2026-11-14<\/lastmod>/.test(sitemap), 'sitemap image-cropper lastmod is 2026-11-14');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card[\s"]/g) || []).length === 53, 'home has exactly 53 tool cards');
  ok(home.includes('/image-cropper/'), 'home cards + nav include image-cropper');
  ok(home.includes('Fifty-three handy tools'), 'home lead says Fifty-three tools');
  ok(home.includes('Search 53 tools'), 'home search placeholder says 53 tools');
  ok(home.includes('Image Tools <span class="n">6</span>'), 'home Image Tools chip says 6');
  ok(home.includes('All <span class="n">53</span>'), 'home All chip says 53');
  const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(llms.includes('https://toolsdaily.vercel.app/image-cropper/'), 'llms.txt lists the new tool');
  ok(llms.includes('browse all 53 free tools'), 'llms.txt says 53 tools');
}

console.log('CROPPER CORE');
{
  const dom = await loadPage('image-cropper/', false);
  const w = dom.window, T = w.TD_crop;
  ok(T && typeof T.parseAspect === 'function' && typeof T.defaultCrop === 'function' && typeof T.clampCrop === 'function' && typeof T.applyAspect === 'function' && typeof T.moveCrop === 'function' && typeof T.resizeCrop === 'function', 'TD_crop exposed');
  // parseAspect.
  ok(T.parseAspect('free') === null && T.parseAspect('') === null && T.parseAspect('bogus') === null, 'parseAspect: free/empty/bogus -> null');
  ok(T.parseAspect('1:1') === 1 && T.parseAspect('4:3') === 4 / 3 && T.parseAspect('16:9') === 16 / 9, 'parseAspect: 1:1, 4:3, 16:9');
  ok(T.parseAspect('3:4') === 0.75 && T.parseAspect('9:16') === 9 / 16 && T.parseAspect('2/3') === 2 / 3, 'parseAspect: portrait ratios + slash form');
  ok(T.parseAspect('0:1') === null && T.parseAspect('1:0') === null && T.parseAspect(' 16 : 9 ') === 16 / 9, 'parseAspect: zero sides rejected, spaces tolerated');
  // defaultCrop: 2000x1000.
  ok(JSON.stringify(T.defaultCrop(2000, 1000, null)) === '{"x":200,"y":100,"width":1600,"height":800}', 'defaultCrop free on 2000x1000 -> centered 80%');
  ok(JSON.stringify(T.defaultCrop(2000, 1000, 1)) === '{"x":500,"y":0,"width":1000,"height":1000}', 'defaultCrop 1:1 -> centered 1000x1000 square');
  ok(JSON.stringify(T.defaultCrop(2000, 1000, 16 / 9)) === '{"x":111,"y":0,"width":1778,"height":1000}', 'defaultCrop 16:9 -> full height, 1778 wide');
  ok(JSON.stringify(T.defaultCrop(2000, 1000, 9 / 16)) === '{"x":719,"y":0,"width":563,"height":1000}', 'defaultCrop 9:16 portrait -> 563 wide, centered');
  ok(JSON.stringify(T.defaultCrop(1000, 2000, 16 / 9)) === '{"x":0,"y":719,"width":1000,"height":563}', 'defaultCrop 16:9 on tall image -> full width, 563 high');
  ok(!!T.defaultCrop(0, 1000, null).error && !!T.defaultCrop(2000, 0, null).error, 'defaultCrop: zero dimension errors');
  // clampCrop.
  ok(JSON.stringify(T.clampCrop({ x: -50, y: -20, width: 500, height: 300 }, 2000, 1000)) === '{"x":0,"y":0,"width":500,"height":300}', 'clampCrop: negative origin -> 0,0');
  ok(JSON.stringify(T.clampCrop({ x: 1900, y: 900, width: 500, height: 300 }, 2000, 1000)) === '{"x":1500,"y":700,"width":500,"height":300}', 'clampCrop: overflowing origin pulled back inside');
  ok(JSON.stringify(T.clampCrop({ x: 0, y: 0, width: 0, height: -5 }, 2000, 1000)) === '{"x":0,"y":0,"width":1,"height":1}', 'clampCrop: zero/negative size -> 1x1 minimum');
  ok(JSON.stringify(T.clampCrop({ x: 10.4, y: 20.6, width: 100.2, height: 50.9 }, 2000, 1000)) === '{"x":10,"y":21,"width":100,"height":51}', 'clampCrop: fractional values rounded');
  ok(JSON.stringify(T.clampCrop({ x: 0, y: 0, width: 99999, height: 99999 }, 2000, 1000)) === '{"x":0,"y":0,"width":2000,"height":1000}', 'clampCrop: oversize rect -> whole image');
  // applyAspect (center-preserving).
  ok(JSON.stringify(T.applyAspect({ x: 200, y: 100, width: 1600, height: 800 }, 1, 2000, 1000)) === '{"x":600,"y":100,"width":800,"height":800}', 'applyAspect 1:1 on 1600x800 -> centered 800x800');
  ok(JSON.stringify(T.applyAspect({ x: 500, y: 0, width: 1000, height: 1000 }, 16 / 9, 2000, 1000)) === '{"x":500,"y":219,"width":1000,"height":563}', 'applyAspect 16:9 on square -> 1000x563 centered');
  ok(JSON.stringify(T.applyAspect({ x: 200, y: 100, width: 1600, height: 800 }, null, 2000, 1000)) === '{"x":200,"y":100,"width":1600,"height":800}', 'applyAspect free -> unchanged');
  // moveCrop.
  ok(JSON.stringify(T.moveCrop({ x: 200, y: 100, width: 1600, height: 800 }, 100, 50, 2000, 1000)) === '{"x":300,"y":150,"width":1600,"height":800}', 'moveCrop: +100,+50 shifts the box');
  ok(JSON.stringify(T.moveCrop({ x: 200, y: 100, width: 1600, height: 800 }, 500, 300, 2000, 1000)) === '{"x":400,"y":200,"width":1600,"height":800}', 'moveCrop: clamped at the right/bottom edge');
  ok(JSON.stringify(T.moveCrop({ x: 200, y: 100, width: 1600, height: 800 }, -500, -300, 2000, 1000)) === '{"x":0,"y":0,"width":1600,"height":800}', 'moveCrop: clamped at the left/top edge');
  // resizeCrop.
  ok(JSON.stringify(T.resizeCrop({ x: 200, y: 100, width: 1600, height: 800 }, 'se', 100, 50, 2000, 1000, null)) === '{"x":200,"y":100,"width":1700,"height":850}', 'resizeCrop se: grows right + down');
  ok(JSON.stringify(T.resizeCrop({ x: 200, y: 100, width: 1600, height: 800 }, 'se', 500, 500, 2000, 1000, null)) === '{"x":200,"y":100,"width":1800,"height":900}', 'resizeCrop se: clamped at the image edge');
  ok(JSON.stringify(T.resizeCrop({ x: 200, y: 100, width: 1600, height: 800 }, 'nw', -100, -50, 2000, 1000, null)) === '{"x":100,"y":50,"width":1700,"height":850}', 'resizeCrop nw: grows left + up');
  ok(JSON.stringify(T.resizeCrop({ x: 200, y: 100, width: 1600, height: 800 }, 'e', 100, 0, 2000, 1000, null)) === '{"x":200,"y":100,"width":1700,"height":800}', 'resizeCrop e: edge handle changes width only');
  ok(JSON.stringify(T.resizeCrop({ x: 200, y: 100, width: 1600, height: 800 }, 'se', 200, 0, 2000, 1000, 1)) === '{"x":700,"y":100,"width":800,"height":800}', 'resizeCrop se with 1:1 lock -> square, center kept');
  // Helpers.
  ok(T.cropArea({ width: 1600, height: 800 }) === 1280000, 'cropArea: 1600x800 -> 1,280,000 px');
  ok(JSON.stringify(T.toDisplay({ x: 200, y: 100, width: 1600, height: 800 }, 0.5)) === '{"x":100,"y":50,"width":800,"height":400}', 'toDisplay: image px -> display px at 0.5 scale');
  ok(JSON.stringify(T.toImage({ x: 100, y: 50, width: 800, height: 400 }, 0.5)) === '{"x":200,"y":100,"width":1600,"height":800}', 'toImage: display px -> image px at 0.5 scale');
  ok(T.formatBytes(0) === '0 B' && T.formatBytes(5000) === '4.88 KB' && T.formatBytes(1500) === '1.46 KB' && T.formatBytes(1048576) === '1.00 MB', 'formatBytes: 0 B / 4.88 KB / 1.46 KB / 1.00 MB');
  dom.window.close();
}

console.log('CROPPER UI (stubbed Image + canvas)');
{
  const dom = await loadPage('image-cropper/', true);
  const w = dom.window, d = w.document;
  const q = (s) => d.querySelector(s);
  ok(q('#crop').disabled === true, 'UI: Crop disabled before an image is chosen');
  ok(q('#editor').classList.contains('hidden'), 'UI: editor hidden before an image is chosen');
  // Non-image rejected.
  const input = q('#file');
  Object.defineProperty(input, 'files', { value: [{ name: 'note.txt', type: 'text/plain', size: 100 }], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(q('#msg').className.includes('err'), 'UI: non-image file is rejected with an error');
  ok(q('#crop').disabled === true, 'UI: Crop stays disabled for non-image');
  // Real image flow (stub 2000x1000).
  Object.defineProperty(input, 'files', { value: [{ name: 'photo.png', type: 'image/png', size: 5000 }], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(80);
  ok(q('#crop').disabled === false, 'UI: image file enables Crop');
  ok(!q('#editor').classList.contains('hidden'), 'UI: editor shown after image loads');
  ok(q('#cx').value === '200' && q('#cy').value === '100' && q('#cw').value === '1600' && q('#ch').value === '800', 'UI: default free crop 200,100 1600x800 in the numeric inputs');
  const box = q('#crop-box');
  ok(box.style.left === '10%' && box.style.top === '10%' && box.style.width === '80%' && box.style.height === '80%', 'UI: crop box positioned at 10%/10% 80%x80%');
  // Numeric input edit (free aspect): narrow the width.
  setVal(w, '#cw', '800');
  ok(q('#cw').value === '800' && box.style.width === '40%', 'UI: typing width 800 moves the box to 40% wide');
  // Reset restores the default free crop.
  q('#reset-crop').click();
  ok(q('#cw').value === '1600' && box.style.width === '80%', 'UI: Reset restores the 1600-wide default crop');
  // Aspect preset 1:1.
  q('[data-aspect="1:1"]').click();
  ok(q('#cx').value === '600' && q('#cy').value === '100' && q('#cw').value === '800' && q('#ch').value === '800', 'UI: 1:1 preset -> centered 800x800 at 600,100');
  ok(box.style.left === '30%' && box.style.top === '10%' && box.style.width === '40%' && box.style.height === '80%', 'UI: 1:1 box at 30%/10% 40%x80%');
  ok(q('[data-aspect="1:1"]').classList.contains('active') && !q('[data-aspect="free"]').classList.contains('active'), 'UI: 1:1 button becomes the active preset');
  // Reset with a ratio locked restores the ratio default.
  q('#reset-crop').click();
  ok(q('#cx').value === '500' && q('#cw').value === '1000' && q('#ch').value === '1000', 'UI: Reset with 1:1 -> centered 1000x1000 square');
  // Crop through the stubbed canvas pipeline.
  q('#crop').click();
  await sleep(80);
  ok(w.__lastCanvas && w.__lastCanvas.w === 1000 && w.__lastCanvas.h === 1000, 'UI: canvas sized 1000x1000 for the square crop');
  ok(JSON.stringify(w.__drawn) === '[500,0,1000,1000,0,0,1000,1000]', 'UI: drawImage uses the exact crop source rect');
  ok(q('#orig-dims').textContent === '2000 × 1000', 'UI: original dimensions shown');
  ok(q('#crop-dims').textContent === '1000 × 1000', 'UI: cropped dimensions shown');
  ok(q('#orig-size').textContent === '4.88 KB', 'UI: original size shown (5000 B -> 4.88 KB)');
  ok(q('#out-size').textContent === '1.46 KB', 'UI: cropped size shown (1500 B stub -> 1.46 KB)');
  const dl = q('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'cropped.png', 'UI: download link points at blob with cropped.png name');
  ok(q('#msg').textContent === 'Done! Your cropped image is ready.' && q('#msg').className.includes('ok'), 'UI: success message shown with ok class');
  // JPEG output name.
  setVal(w, '#format', 'image/jpeg');
  q('#crop').click();
  await sleep(80);
  ok(q('#dl').getAttribute('download') === 'cropped.jpg', 'UI: JPEG format -> cropped.jpg download name');
  dom.window.close();
}

console.log(`\nCROPPER TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
