// Logic + UI tests for the Image SynthID Remover (2026-11-08, Ibrahim's direct order).
// Scan core is window.TD_metadata.scanMetadata — pure byte analysis, tested on
// crafted JPEG/PNG/WebP buffers. UI drives the real page through jsdom with a
// stubbed Image/canvas (jsdom has no image codec), like the compressor tests.
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

async function loadPage(p, stub) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse: stub ? (win) => stub(win) : undefined,
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  return dom;
}
function stubImageEnv(win) {
  win.URL.createObjectURL = () => 'blob:fake';
  win.URL.revokeObjectURL = () => {};
  win.HTMLCanvasElement.prototype.getContext = function () { return { drawImage: () => {}, fillRect: () => {}, fillStyle: '' }; };
  win.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new win.Blob(['x'.repeat(2000)], { type: 'image/jpeg' })); };
  win.Image = class {
    set src(v) { const self = this; setTimeout(() => { if (self.onload) self.onload(); }, 0); }
    get naturalWidth() { return 2000; }
    get naturalHeight() { return 1000; }
  };
}

/* ---------- crafted sample buffers ---------- */
const strBytes = (s) => [...s].map((c) => c.charCodeAt(0));
function tiff(gps) {
  const b = [];
  const p16 = (v) => b.push(v & 255, (v >> 8) & 255);
  const p32 = (v) => b.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255);
  b.push(0x49, 0x49); p16(42); p32(8);           // 'II', magic, IFD0 at offset 8
  p16(1);                                          // one IFD0 entry
  if (gps) { p16(0x8825); p16(4); p32(1); p32(26); }  // GPSInfo pointer -> offset 26
  else { p16(0x010F); p16(2); p32(6); p32(26); }      // Make (ASCII) -> offset 26
  p32(0);                                          // next IFD = none (offset 26 reached)
  if (gps) { p16(1); p16(0x0002); p16(5); p32(3); p32(0); p32(0); } // GPS IFD: 1 entry (latitude)
  else b.push(0x43, 0x61, 0x6E, 0x6F, 0x6E, 0x00);    // 'Canon\0'
  return b;
}
const appSeg = (marker, data) => { const len = data.length + 2; return [0xFF, marker, (len >> 8) & 255, len & 255, ...data]; };
const jpeg = (...segs) => [0xFF, 0xD8, ...segs.flat(), 0xFF, 0xD9];
const jpegExif = (gps) => jpeg(appSeg(0xE1, [...strBytes('Exif\0\0'), ...tiff(gps)]));
const jpegXmp = () => jpeg(appSeg(0xE1, [...strBytes('http://ns.adobe.com/xap/1.0/\0'), ...strBytes('<x:xmpmeta></x:xmpmeta>')]));
const jpegC2pa = () => jpeg(appSeg(0xEB, strBytes('jumb jumf c2pa manifest store')));
const jpegBare = () => [0xFF, 0xD8, 0xFF, 0xD9];
function pngChunk(type, data) {
  const len = data.length;
  return [(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...strBytes(type), ...data, 0, 0, 0, 0];
}
const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const pngText = () => [...PNG_SIG, ...pngChunk('IHDR', new Array(13).fill(0)), ...pngChunk('tEXt', [...strBytes('Software'), 0, ...strBytes('UnitTest 1.0')]), ...pngChunk('IEND', [])];
const pngExif = () => [...PNG_SIG, ...pngChunk('IHDR', new Array(13).fill(0)), ...pngChunk('eXIf', tiff(false)), ...pngChunk('IEND', [])];
const pngC2pa = () => [...PNG_SIG, ...pngChunk('IHDR', new Array(13).fill(0)), ...pngChunk('caBX', strBytes('xx c2pa xx')), ...pngChunk('IEND', [])];
const pngClean = () => [...PNG_SIG, ...pngChunk('IHDR', new Array(13).fill(0)), ...pngChunk('IEND', [])];
function webpChunk(type, data) {
  const len = data.length;
  const out = [...strBytes(type), len & 255, (len >> 8) & 255, (len >> 16) & 255, (len >> 24) & 255, ...data];
  if (len % 2) out.push(0);
  return out;
}
const webpExifGps = () => { const body = [...strBytes('WEBP'), ...webpChunk('EXIF', tiff(true))]; return [...strBytes('RIFF'), body.length & 255, (body.length >> 8) & 255, 0, 0, ...body]; };

console.log('METADATA STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'image-synthid-remover', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/image-synthid-remover/">'), 'metadata: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'metadata: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'metadata: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'metadata: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'metadata: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'metadata: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Image SynthID Remover' && app.url === 'https://toolsdaily.vercel.app/image-synthid-remover/' && app.offers.price === '0', 'metadata: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `metadata: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator', 'qr-reader', 'background-remover', 'lorem-ipsum-generator', 'random-number-generator', 'tip-calculator', 'url-encoder-decoder'];
  ok(others.every((s) => html.includes(`href="../${s}/"`)), 'metadata: More-tools nav links all other 25 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 33, 'sitemap.xml has 32 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/image-synthid-remover/'), 'sitemap includes image-synthid-remover');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 32, 'home has exactly 32 tool cards');
  ok(home.includes('href="image-synthid-remover/"'), 'home cards include image-synthid-remover');
  ok(home.includes('Thirty-two handy tools'), 'home lead says Thirty-two tools');
}

console.log('METADATA CORE');
{
  const dom = await loadPage('image-synthid-remover/');
  const w = dom.window, TD = w.TD_metadata;
  ok(TD && typeof TD.scanMetadata === 'function' && typeof TD.detectFormat === 'function', 'TD_metadata exposed');
  const scan = (arr) => TD.scanMetadata(new w.Uint8Array(arr));
  ok(TD.formatBytes(0) === '0 B' && TD.formatBytes(5000) === '4.88 KB' && TD.formatBytes(1048576) === '1.00 MB', 'formatBytes: 0 B / 4.88 KB / 1.00 MB');
  ok(TD.cleanFileName('photo.jpg', 'image/png') === 'photo-clean.png', 'cleanFileName: photo.jpg -> photo-clean.png');
  ok(TD.cleanFileName('a.b.png', 'image/jpeg') === 'a.b-clean.jpg', 'cleanFileName: a.b.png -> a.b-clean.jpg');

  let r = scan(jpegExif(false));
  ok(r.format === 'jpeg' && r.exif === true && r.gps === false, 'jpeg: EXIF APP1 detected, no GPS');
  ok(r.found.some((f) => f.id === 'exif') && !r.found.some((f) => f.id === 'gps'), 'jpeg: found list has exif, not gps');
  r = scan(jpegExif(true));
  ok(r.exif === true && r.gps === true, 'jpeg: EXIF with GPSInfo tag -> GPS detected');
  ok(r.found.length >= 2 && r.found[0].id === 'gps', 'jpeg: GPS listed first in found list');
  r = scan(jpegXmp());
  ok(r.xmp === true && r.exif === false, 'jpeg: XMP APP1 detected (not mistaken for EXIF)');
  r = scan(jpegC2pa());
  ok(r.c2pa === true, 'jpeg: C2PA (APP11/JUMBF string) detected');
  r = scan(jpegBare());
  ok(r.format === 'jpeg' && r.found.length === 0, 'jpeg: bare SOI/EOI file -> no metadata');

  r = scan(pngText());
  ok(r.format === 'png' && r.textKeywords.length === 1 && r.textKeywords[0] === 'Software', 'png: tEXt chunk keyword "Software" read');
  ok(r.found.some((f) => f.id === 'pngtext'), 'png: found list includes pngtext');
  r = scan(pngExif());
  ok(r.exif === true && r.gps === false, 'png: eXIf chunk detected');
  r = scan(pngC2pa());
  ok(r.c2pa === true, 'png: caBX chunk -> C2PA detected');
  r = scan(pngClean());
  ok(r.format === 'png' && r.found.length === 0, 'png: IHDR+IEND only -> no metadata');

  r = scan(webpExifGps());
  ok(r.format === 'webp' && r.exif === true && r.gps === true, 'webp: EXIF chunk with GPS detected');
  r = scan([1, 2, 3, 4, 5]);
  ok(r.format === 'unknown' && r.found.length === 0, 'unknown bytes -> format unknown, no metadata');
  dom.window.close();
}

console.log('METADATA UI');
{
  const dom = await loadPage('image-synthid-remover/', stubImageEnv);
  const w = dom.window;
  const input = w.document.querySelector('#file');
  const setFile = (file) => { Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new w.Event('change', { bubbles: true })); };

  setFile({ name: 'note.txt', type: 'text/plain', size: 100 });
  await sleep(60);
  ok(w.document.querySelector('#msg').className.includes('err'), 'non-image file is rejected with an error');
  ok(w.document.querySelector('#file-info').classList.contains('hidden'), 'file info stays hidden for non-image');

  const gpsBytes = jpegExif(true);
  setFile(new w.File([new w.Uint8Array(gpsBytes)], 'photo.jpg', { type: 'image/jpeg' }));
  await sleep(200);
  const listText = w.document.querySelector('#meta-list').textContent;
  ok(listText.includes('GPS location tag'), 'UI: GPS tag reported in the found list');
  ok(listText.includes('EXIF data'), 'UI: EXIF reported in the found list');
  ok(w.document.querySelector('#fi-size').textContent.includes('JPEG'), 'UI: file info shows JPEG format');
  ok(w.document.querySelector('#clean').disabled === false, 'UI: Remove metadata enabled after scan');
  w.document.querySelector('#clean').click();
  await sleep(200);
  const dl = w.document.querySelector('#dl');
  ok(!dl.classList.contains('hidden') && dl.getAttribute('download') === 'photo-clean.jpg', 'UI: clean download offered as photo-clean.jpg');
  ok(dl.getAttribute('href') === 'blob:fake', 'UI: download points at the clean blob');
  ok(w.document.querySelector('#st-before').textContent === w.TD_metadata.formatBytes(gpsBytes.length), 'UI: original size shown');
  ok(w.document.querySelector('#st-after').textContent === '1.95 KB', 'UI: clean size shown (2000 B stub blob)');
  ok(!w.document.querySelector('#results').classList.contains('hidden'), 'UI: results stats visible after cleaning');

  setFile(new w.File([new w.Uint8Array(pngClean())], 'clean.png', { type: 'image/png' }));
  await sleep(200);
  ok(w.document.querySelector('#meta-list').textContent.includes('No metadata found'), 'UI: clean PNG reports "No metadata found"');
  ok(w.document.querySelector('#clean').disabled === false, 'UI: clean copy still offered for a clean file');
  dom.window.close();
}

console.log(`\nMETADATA TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
