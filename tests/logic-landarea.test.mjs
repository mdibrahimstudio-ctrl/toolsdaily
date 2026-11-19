// Logic + UI tests for the Land Area Converter (2026-11-18 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_landarea.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8804/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function loadPage(p) {
  const vc = new VirtualConsole();
  const jsdomErrors = [];
  vc.on('jsdomError', (e) => { jsdomErrors.push(e); });
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  const winErrors = [];
  dom.window.addEventListener('error', (e) => { winErrors.push(e.message || String(e.error || e)); });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  dom._winErrors = winErrors;
  dom._jsdomErrors = jsdomErrors;
  return dom;
}
function setVal(win, sel, value) {
  const el = win.document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

console.log('LANDAREA STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'land-area-converter', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Converters · No. 63</p>'), 'landarea: eyebrow Converters · No. 63');
  ok(html.includes('<h1 class="rise rise-1">Land Area Converter</h1>'), 'landarea: H1 is Land Area Converter');
  ok((html.match(/<h1/g) || []).length === 1, 'landarea: exactly one H1');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'landarea: skip link present');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/land-area-converter/">'), 'landarea: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'landarea: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'landarea: twitter card present');
  ok(html.includes('G-KX85CZXTR4'), 'landarea: GA4 tag present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'landarea: no external resource loads except the GA4 tag');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'landarea: design.css stylesheet');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'landarea: site.js at end');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  ok(blocks.length === 1, 'landarea: exactly one JSON-LD script block');
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'landarea: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Land Area Converter' && app.url === 'https://toolsdaily.vercel.app/land-area-converter/' && app.offers.price === '0', 'landarea: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `landarea: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const ids = ['val', 'from', 'convert', 'r-decimal', 'r-katha', 'r-bigha', 'r-acre', 'r-hectare', 'r-sqft', 'r-sqm', 'r-marla', 'r-kanal', 'msg'];
  ok(ids.every((id) => html.includes(`id="${id}"`)), 'landarea: all required element IDs present');
  ok(!html.includes('id="download"') && !html.includes('id="dl"'), 'landarea: NO #download button and NO #dl anchor anywhere');
  const fromOpts = [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  ok(JSON.stringify(fromOpts) === JSON.stringify(['decimal', 'katha', 'bigha', 'acre', 'hectare', 'sqft', 'sqm', 'marla', 'kanal']), 'landarea: #from has all 9 units in order');
  ok(html.includes('<option value="acre" selected>'), 'landarea: #from defaults to acre');
  ok(html.includes('<input type="number" id="val" value="1"'), 'landarea: #val defaults to 1');
  ok(html.includes('Bangladesh standard: 1 katha = 720 sq ft'), 'landarea: Bangladesh standard note present');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['unit-converter', 'currency-converter', 'color-converter', 'base64-encoder-decoder', 'url-encoder-decoder'];
  const navHrefs = [...nav.matchAll(/href="\.\.\/([^/]+)\/"/g)].map((m) => m[1]);
  ok(JSON.stringify(navHrefs) === JSON.stringify(related), 'landarea: nav.more has exactly the 5 related links in order');
  ok(nav.includes('Unit Converter') && nav.includes('Currency Converter') && nav.includes('Color Converter') && nav.includes('Base64 Encoder / Decoder') && nav.includes('URL Encoder / Decoder'), 'landarea: nav.more display names correct');
  ok(html.includes('<p>68 tools · New tools added regularly.</p>'), 'landarea: footer says 68 tools');
}

console.log('LANDAREA CORE');
{
  const dom = await loadPage('land-area-converter/');
  const w = dom.window, TD = w.TD_landarea;
  ok(TD && typeof TD.convert === 'function' && typeof TD.fmt === 'function', 'TD_landarea exposed with convert/fmt');
  ok(dom._winErrors.length === 0, `landarea: zero JS errors on load (got ${dom._winErrors.length})`);
  const jsErrs = dom._jsdomErrors.filter((e) => !/Could not load/i.test(String((e && e.message) || e)));
  ok(jsErrs.length === 0, `landarea: zero jsdom script errors on load (got ${jsErrs.length})`);
  // 1 acre = 100 decimal = 60.5 katha = 3.025 bigha = 0.4047 ha = 43560 sq ft
  // = 4046.8603 sqm (43560/10.7639) = 160 marla = 8 kanal.
  const a = TD.convert(1, 'acre');
  ok(!a.error && a.decimal === 100 && a.sqft === 43560 && a.katha === 60.5 && a.bigha === 3.025 && a.hectare === 0.4047 && a.sqm === 4046.8603 && a.marla === 160 && a.kanal === 8, "1 acre -> decimal 100, sqft 43560, katha 60.5, bigha 3.025, hectare 0.4047, sqm 4046.8603, marla 160, kanal 8");
  // 1 bigha = 20 katha = 14400 sq ft = 33.0579 decimal (14400/435.6 = 33.057851...).
  const b = TD.convert(1, 'bigha');
  ok(!b.error && b.katha === 20 && b.sqft === 14400 && b.decimal === 33.0579 && b.acre === 0.3306, '1 bigha -> katha 20, sqft 14400, decimal 33.0579, acre 0.3306');
  // 1 kanal = 20 marla = 5445 sq ft.
  const c = TD.convert(1, 'kanal');
  ok(!c.error && c.marla === 20 && c.sqft === 5445 && c.acre === 0.125 && c.decimal === 12.5, '1 kanal -> marla 20, sqft 5445, acre 0.125, decimal 12.5');
  // 1 hectare = 2.4711 acre = 107639.104 sq ft.
  const d = TD.convert(1, 'hectare');
  ok(!d.error && d.acre === 2.4711 && d.sqft === 107639.104 && d.decimal === 247.1054, '1 hectare -> acre 2.4711, sqft 107639.104, decimal 247.1054');
  // 1 decimal = 435.6 sq ft = 0.605 katha = 1.6 marla.
  const e = TD.convert(1, 'decimal');
  ok(!e.error && e.sqft === 435.6 && e.katha === 0.605 && e.marla === 1.6 && e.acre === 0.01, '1 decimal -> sqft 435.6, katha 0.605, marla 1.6, acre 0.01');
  // Zero converts to all zeros.
  const z = TD.convert(0, 'decimal');
  ok(!z.error && Object.values(z).every((v) => v === 0), '0 decimal -> all zeros');
  // Errors: negative, NaN, unknown unit, missing value.
  ok(!!TD.convert(-1, 'acre').error, 'negative value errors');
  ok(!!TD.convert(NaN, 'acre').error, 'NaN value errors');
  ok(!!TD.convert(null, 'acre').error, 'missing value errors');
  ok(!!TD.convert(1, 'sqyd').error, 'unknown unit errors');
  ok(!!TD.convert(1, '').error, 'empty unit errors');
  // Formatting trims trailing zeros.
  ok(TD.fmt(43560) === '43560' && TD.fmt(60.5) === '60.5' && TD.fmt(0.4047) === '0.4047' && TD.fmt(0) === '0' && TD.fmt(871.2) === '871.2', 'fmt: 43560/60.5/0.4047/0/871.2');
  dom.window.close();
}

console.log('LANDAREA UI');
{
  const dom = await loadPage('land-area-converter/');
  const w = dom.window;
  // Defaults on load: 1 acre.
  ok(w.document.querySelector('#r-sqft').textContent === '43560', 'UI defaults: 1 acre = 43560 sq ft on load');
  ok(w.document.querySelector('#r-decimal').textContent === '100', 'UI defaults: 1 acre = 100 decimal on load');
  // 2 decimal = 871.2 sq ft via the Convert button.
  setVal(w, '#val', '2');
  setVal(w, '#from', 'decimal');
  w.document.querySelector('#convert').click();
  ok(w.document.querySelector('#r-sqft').textContent === '871.2', 'UI 2 decimal -> sqft 871.2 after Convert click');
  ok(w.document.querySelector('#r-katha').textContent === '1.21', 'UI 2 decimal -> katha 1.21 after Convert click');
  // Live conversion on input: 3 decimal = 1306.8 sq ft without clicking.
  setVal(w, '#val', '3');
  ok(w.document.querySelector('#r-sqft').textContent === '1306.8', 'UI live: 3 decimal -> sqft 1306.8 on input');
  // Invalid input shows an error and clears the results.
  setVal(w, '#val', '-1');
  w.document.querySelector('#convert').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#msg').className === 'msg err' && w.document.querySelector('#r-sqft').textContent === '–' && w.document.querySelector('#r-decimal').textContent === '–', 'UI -1 shows an error and clears the results');
  // Empty input also errors.
  setVal(w, '#val', '');
  w.document.querySelector('#convert').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-sqft').textContent === '–', 'UI empty input shows an error and clears the results');
  // Back to valid inputs restores the results.
  setVal(w, '#val', '1');
  setVal(w, '#from', 'acre');
  w.document.querySelector('#convert').click();
  ok(w.document.querySelector('#r-sqft').textContent === '43560' && w.document.querySelector('#msg').textContent === '', 'UI valid inputs after error: 1 acre = 43560 sq ft again, message cleared');
  dom.window.close();
}

console.log(`\nLOGIC-LANDAREA TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
