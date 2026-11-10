// Logic + UI tests for the Tip Calculator (2026-11-07 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_tip.
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

console.log('TIP STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'tip-calculator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/tip-calculator/">'), 'tip: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'tip: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'tip: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'tip: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'tip: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'tip: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Tip Calculator' && app.url === 'https://toolsdaily.vercel.app/tip-calculator/' && app.offers.price === '0', 'tip: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `tip: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator', 'qr-reader', 'background-remover', 'lorem-ipsum-generator', 'random-number-generator'];
  ok(others.every((s) => html.includes(`href="../${s}/"`)), 'tip: More-tools nav links all other 23 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 30, 'sitemap.xml has 30 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/tip-calculator/'), 'sitemap includes tip-calculator');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 29, 'home has exactly 29 tool cards');
  ok(home.includes('href="tip-calculator/"'), 'home cards + nav include tip-calculator');
  ok(home.includes('Twenty-nine handy tools'), 'home lead says Twenty-nine tools');
}

console.log('TIP CORE');
{
  const dom = await loadPage('tip-calculator/');
  const w = dom.window, TD = w.TD_tip;
  ok(TD && typeof TD.calculate === 'function' && typeof TD.fmtCents === 'function', 'TD_tip exposed');
  // $100 at 15%, 1 person: tip $15.00, total $115.00.
  const a = TD.calculate({ bill: 100, tipPct: 15, people: 1 });
  ok(!a.error && a.billCents === 10000 && a.tipCents === 1500 && a.totalCents === 11500 && a.perPersonCents === 11500 && a.perPersonTipCents === 1500, '$100, 15%, 1 person -> tip 1500c, total 11500c');
  // $85.50 at 20% split 3 ways: tip $17.10, total $102.60, each $34.20, tip each $5.70.
  const b = TD.calculate({ bill: 85.50, tipPct: 20, people: 3 });
  ok(!b.error && b.tipCents === 1710 && b.totalCents === 10260 && b.perPersonCents === 3420 && b.perPersonTipCents === 570, '$85.50, 20%, 3 people -> tip 1710c, total 10260c, per person 3420c, tip pp 570c');
  // Half-cent rounding: $47.25 at 18% = $8.505 -> $8.51; total $55.76; each $27.88; tip each $4.26.
  const c = TD.calculate({ bill: 47.25, tipPct: 18, people: 2 });
  ok(!c.error && c.tipCents === 851 && c.totalCents === 5576 && c.perPersonCents === 2788 && c.perPersonTipCents === 426, '$47.25, 18%, 2 people -> tip 851c (half-cent rounds up), total 5576c, per person 2788c, tip pp 426c');
  // $33.33 at 15% split 3: tip $5.00, total $38.33, each $12.78, tip each $1.67.
  const d = TD.calculate({ bill: 33.33, tipPct: 15, people: 3 });
  ok(!d.error && d.tipCents === 500 && d.totalCents === 3833 && d.perPersonCents === 1278 && d.perPersonTipCents === 167, '$33.33, 15%, 3 people -> tip 500c, total 3833c, per person 1278c, tip pp 167c');
  // 0% tip and a decimal percentage: $1234.56 at 12.5% split 4.
  const e = TD.calculate({ bill: 10, tipPct: 0, people: 1 });
  ok(!e.error && e.tipCents === 0 && e.totalCents === 1000 && e.perPersonCents === 1000, '$10, 0% tip -> no tip, total $10.00');
  const f = TD.calculate({ bill: 1234.56, tipPct: 12.5, people: 4 });
  ok(!f.error && f.tipCents === 15432 && f.totalCents === 138888 && f.perPersonCents === 34722 && f.perPersonTipCents === 3858, '$1234.56, 12.5%, 4 people -> tip 15432c, total 138888c, per person 34722c, tip pp 3858c');
  // Formatting.
  ok(TD.fmtCents(0) === '$0.00' && TD.fmtCents(5) === '$0.05' && TD.fmtCents(1500) === '$15.00' && TD.fmtCents(123456) === '$1,234.56', 'fmtCents: 0/$0.05/$15.00/$1,234.56');
  // Summary text contains the key figures.
  const s = TD.summary(a, 100, 15, 1);
  ok(s.includes('Bill amount: $100.00') && s.includes('Tip (15%): $15.00') && s.includes('Total bill: $115.00') && s.includes('Per person: $115.00'), 'summary text lists bill, tip, total and per-person amounts');
  // Errors.
  ok(!!TD.calculate({ bill: null, tipPct: 15, people: 1 }).error, 'missing bill errors');
  ok(!!TD.calculate({ bill: 0, tipPct: 15, people: 1 }).error, 'bill of 0 errors');
  ok(!!TD.calculate({ bill: -5, tipPct: 15, people: 1 }).error, 'negative bill errors');
  ok(!!TD.calculate({ bill: 1000001, tipPct: 15, people: 1 }).error, 'bill over $1,000,000 errors');
  ok(!!TD.calculate({ bill: 100, tipPct: null, people: 1 }).error, 'missing tip % errors');
  ok(!!TD.calculate({ bill: 100, tipPct: -1, people: 1 }).error, 'negative tip % errors');
  ok(!!TD.calculate({ bill: 100, tipPct: 101, people: 1 }).error, 'tip % over 100 errors');
  ok(!!TD.calculate({ bill: 100, tipPct: 15, people: null }).error, 'missing people errors');
  ok(!!TD.calculate({ bill: 100, tipPct: 15, people: 0 }).error, '0 people errors');
  ok(!!TD.calculate({ bill: 100, tipPct: 15, people: 2.5 }).error, 'non-integer people errors');
  ok(!!TD.calculate({ bill: 100, tipPct: 15, people: 101 }).error, '101 people errors (limit 100)');
  dom.window.close();
}

console.log('TIP UI');
{
  const dom = await loadPage('tip-calculator/');
  const w = dom.window;
  // Defaults on load: $100, 15%, 1 person.
  ok(w.document.querySelector('#tip-amount').textContent === '$15.00', 'UI defaults: tip $15.00 on load');
  ok(w.document.querySelector('#total').textContent === '$115.00', 'UI defaults: total $115.00 on load');
  ok(w.document.querySelector('#per-person').textContent === '$115.00', 'UI defaults: per person $115.00 on load');
  ok(w.document.querySelector('#per-person-tip').textContent === '$15.00', 'UI defaults: tip per person $15.00 on load');
  // Live update: $85.50, 20%, 3 people.
  setVal(w, '#bill', '85.50');
  setVal(w, '#tip-pct', '20');
  setVal(w, '#people', '3');
  ok(w.document.querySelector('#tip-amount').textContent === '$17.10', 'UI live: tip $17.10');
  ok(w.document.querySelector('#total').textContent === '$102.60', 'UI live: total $102.60');
  ok(w.document.querySelector('#per-person').textContent === '$34.20', 'UI live: per person $34.20');
  ok(w.document.querySelector('#per-person-tip').textContent === '$5.70', 'UI live: tip per person $5.70');
  // Quick-tip button sets the percentage and recalculates.
  setVal(w, '#bill', '100');
  setVal(w, '#people', '1');
  w.document.querySelector('[data-tip="25"]').click();
  ok(w.document.querySelector('#tip-pct').value === '25' && w.document.querySelector('#tip-amount').textContent === '$25.00', 'UI quick-tip 25% button sets 25% and tip becomes $25.00');
  // Invalid bill shows an error and clears the results.
  setVal(w, '#bill', '0');
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#tip-amount').textContent === '–' && w.document.querySelector('#total').textContent === '–', 'UI bill of 0 shows an error and clears the results');
  // Back to a valid bill for copy/download.
  setVal(w, '#bill', '100');
  setVal(w, '#tip-pct', '15');
  ok(w.document.querySelector('#tip-amount').textContent === '$15.00', 'UI valid bill after error: tip $15.00 again');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied && copied.includes('Bill amount: $100.00') && copied.includes('Tip (15%): $15.00') && copied.includes('Total bill: $115.00') && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the summary to the clipboard and shows a visible success message');
  // A clipboard promise that never settles must still give feedback within ~1.5s.
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: () => new Promise(() => {}) }, configurable: true });
  w.document.querySelector('#msg').textContent = '';
  w.document.querySelector('#copy').click();
  await sleep(1800);
  ok(w.document.querySelector('#msg').textContent === 'Could not copy automatically — select the text and copy it manually.' && w.document.querySelector('#msg').className === 'msg err', 'UI copy with a hung clipboard promise falls back to a visible message instead of staying silent');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'tip-summary.txt', 'UI download link points at blob with tip-summary.txt name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded tip-summary.txt.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'tip');
  const visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'tip-calculator/', 'home search "tip" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-TIP TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
