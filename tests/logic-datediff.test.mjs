// Logic + UI tests for the Date Difference Calculator (2026-11-03 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_dateDiff.
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

async function loadPage(p) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
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

console.log('DATEDIFF STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'date-difference-calculator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/date-difference-calculator/">'), 'datediff: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'datediff: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'datediff: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'datediff: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'datediff: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'datediff: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Date Difference Calculator' && app.url === 'https://toolsdaily.vercel.app/date-difference-calculator/' && app.offers.price === '0', 'datediff: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `datediff: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'qr-reader'];
  ok(others.every((s) => html.includes(`href="../${s}/"`)), 'datediff: More-tools nav links all other 18 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 23, 'sitemap.xml has 23 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/date-difference-calculator/'), 'sitemap includes date-difference-calculator');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 22, 'home has exactly 22 tool cards');
  ok(home.includes('href="date-difference-calculator/"'), 'home cards + nav include date-difference-calculator');
}

console.log('DATEDIFF CORE + UI');
{
  const dom = await loadPage('date-difference-calculator/');
  const w = dom.window, TD = w.TD_dateDiff;
  ok(TD && typeof TD.diff === 'function' && typeof TD.addDays === 'function', 'TD_dateDiff exposed');
  let r = TD.diff('2026-01-01', '2026-01-31');
  ok(r.totalDays === 30 && r.totalWeeks === 4 && r.weekRemainder === 2, 'Jan 1 -> Jan 31 2026 = 30 days = 4 weeks + 2 days');
  ok(r.years === 0 && r.months === 0 && r.days === 30 && r.totalMonths === 0, 'Jan 1 -> Jan 31 calendar = 0y 0m 30d');
  r = TD.diff('2024-02-28', '2024-03-01');
  ok(r.totalDays === 2, 'leap year: Feb 28 -> Mar 1 2024 = 2 days (Feb 29 counted)');
  r = TD.diff('2023-02-28', '2023-03-01');
  ok(r.totalDays === 1, 'non-leap: Feb 28 -> Mar 1 2023 = 1 day');
  r = TD.diff('2023-01-15', '2024-03-20');
  ok(r.years === 1 && r.months === 2 && r.days === 5 && r.totalMonths === 14, 'Jan 15 2023 -> Mar 20 2024 = 1y 2m 5d, 14 complete months');
  ok(r.totalDays === 430, 'Jan 15 2023 -> Mar 20 2024 = 430 days (365 + 31 + 29 + 5)');
  r = TD.diff('2026-01-31', '2026-01-01');
  ok(r.totalDays === 30, 'reversed dates give the same 30 days');
  r = TD.diff('2026-05-05', '2026-05-05');
  ok(r.totalDays === 0 && r.years === 0 && r.months === 0 && r.days === 0, 'same date = 0 days');
  r = TD.diff('2026-05-05', '2026-05-05', true);
  ok(r.totalDays === 1, 'same date with include-end = 1 day');
  r = TD.diff('2026-01-01', '2026-01-31', true);
  ok(r.totalDays === 31, 'Jan 1 -> Jan 31 with include-end = 31 days');
  ok(!!TD.diff('', '2026-01-01').error && !!TD.diff('2023-02-30', '2026-01-01').error, 'missing and impossible dates (Feb 30) error');
  ok(TD.addDays('2026-01-31', 1).date === '2026-02-01', 'Jan 31 2026 + 1 day = Feb 1 2026');
  ok(TD.addDays('2024-02-28', 1).date === '2024-02-29', 'Feb 28 2024 + 1 day = Feb 29 (leap day)');
  ok(TD.addDays('2023-02-28', 1).date === '2023-03-01', 'Feb 28 2023 + 1 day = Mar 1');
  ok(TD.addDays('2026-01-01', -1).date === '2025-12-31', 'Jan 1 2026 - 1 day = Dec 31 2025');
  ok(TD.addDays('2026-01-01', 0).date === '2026-01-01', 'adding 0 days returns the same date');
  ok(!!TD.addDays('', 5).error && !!TD.addDays('2026-01-01', null).error, 'addDays errors on missing date / missing days');
  // UI: difference
  setVal(w, '#date-from', '2026-01-01'); setVal(w, '#date-to', '2026-01-31');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-days').textContent === '30', 'UI shows 30 total days');
  ok(w.document.querySelector('#r-ymd').textContent === '0y 0m 30d', 'UI shows 0y 0m 30d');
  ok(w.document.querySelector('#r-weeks').textContent === '4 weeks, 2 days', 'UI shows 4 weeks, 2 days');
  // UI: swap
  w.document.querySelector('#swap').click();
  ok(w.document.querySelector('#date-from').value === '2026-01-31' && w.document.querySelector('#date-to').value === '2026-01-01', 'UI swap exchanges the two dates');
  // UI: add days
  setVal(w, '#add-date', '2024-02-28'); setVal(w, '#add-days', '1');
  w.document.querySelector('#add-calc').click();
  ok(w.document.querySelector('#add-result').textContent === '2024-02-29 (Thursday)', 'UI add: Feb 28 2024 + 1 = 2024-02-29 (Thursday)');
  setVal(w, '#add-date', '2026-01-01'); setVal(w, '#add-days', '-1');
  w.document.querySelector('#add-calc').click();
  ok(w.document.querySelector('#add-result').textContent === '2025-12-31 (Wednesday)', 'UI subtract: Jan 1 2026 - 1 = 2025-12-31 (Wednesday)');
  dom.window.close();
}

console.log(`\nLOGIC-DATEDIFF TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
