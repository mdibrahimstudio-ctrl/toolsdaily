// Logic + UI tests for the Zakat Calculator (2026-11-18 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_zakat.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8802/';
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

console.log('ZAKAT STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'zakat-calculator', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Calculators · No. 60</p>'), 'zakat: eyebrow Calculators · No. 60');
  ok(html.includes('<h1 class="rise rise-1">Zakat Calculator</h1>'), 'zakat: H1 is Zakat Calculator');
  ok((html.match(/<h1/g) || []).length === 1, 'zakat: exactly one H1');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'zakat: skip link present');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/zakat-calculator/">'), 'zakat: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'zakat: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'zakat: twitter card present');
  ok(html.includes('G-KX85CZXTR4'), 'zakat: GA4 tag present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'zakat: no external resource loads except the GA4 tag');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'zakat: design.css stylesheet');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'zakat: site.js at end');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  ok(blocks.length === 1, 'zakat: exactly one JSON-LD script block');
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'zakat: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Zakat Calculator' && app.url === 'https://toolsdaily.vercel.app/zakat-calculator/' && app.offers.price === '0', 'zakat: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `zakat: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const ids = ['cash', 'gold-g', 'gold-price', 'silver-g', 'silver-price', 'business', 'debts', 'calc', 'copy', 'download', 'reset', 'r-net', 'r-nisab', 'r-zakat', 'breakdown', 'msg', 'dl'];
  ok(ids.every((id) => html.includes(`id="${id}"`)), 'zakat: all required element IDs present');
  ok((html.match(/id="download"/g) || []).length === 1, 'zakat: exactly one #download button');
  ok(html.includes('<a id="dl" class="hidden" href="#" download="zakat-calculator.txt">'), 'zakat: hidden #dl anchor with zakat-calculator.txt download name');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['roi-calculator', 'compound-interest-calculator', 'emi-calculator', 'loan-calculator', 'percentage-calculator'];
  const navHrefs = [...nav.matchAll(/href="\.\.\/([^/]+)\/"/g)].map((m) => m[1]);
  ok(JSON.stringify(navHrefs) === JSON.stringify(related), 'zakat: nav.more has exactly the 5 related links in order');
  ok(nav.includes('ROI Calculator') && nav.includes('Compound Interest Calculator') && nav.includes('EMI Calculator') && nav.includes('Loan Calculator') && nav.includes('% Percentage Calculator'), 'zakat: nav.more display names correct');
  ok(html.includes('<p>63 tools · New tools added regularly.</p>'), 'zakat: footer says 63 tools');
}

console.log('ZAKAT CORE');
{
  const dom = await loadPage('zakat-calculator/');
  const w = dom.window, TD = w.TD_zakat;
  ok(TD && typeof TD.calculate === 'function' && typeof TD.summary === 'function' && typeof TD.fmt === 'function', 'TD_zakat exposed with calculate/summary/fmt');
  ok(dom._winErrors.length === 0, `zakat: zero JS errors on load (got ${dom._winErrors.length})`);
  const jsErrs = dom._jsdomErrors.filter((e) => !/Could not load/i.test(String((e && e.message) || e)));
  ok(jsErrs.length === 0, `zakat: zero jsdom script errors on load (got ${jsErrs.length})`);
  // Defaults: cash $10,000, gold price $80/g, silver price $1/g.
  // Nisab = min(87.48 x 80 = 6998.40, 612.36 x 1 = 612.36) = 612.36; zakat = 2.5% of 10000 = 250.
  const a = TD.calculate({ cash: 10000, goldG: 0, goldPrice: 80, silverG: 0, silverPrice: 1, business: 0, debts: 0 });
  ok(!a.error && a.netWealth === 10000 && a.nisab === 612.36 && a.due === true && a.zakat === 250, 'cash 10000 -> net 10000, nisab 612.36, due, zakat 250');
  // Gold 100 g at $80/g: gold value $8,000, net $8,000, zakat $200.
  const b = TD.calculate({ cash: 0, goldG: 100, goldPrice: 80, silverG: 0, silverPrice: 1, business: 0, debts: 0 });
  ok(!b.error && b.goldValue === 8000 && b.netWealth === 8000 && b.due === true && b.zakat === 200, 'gold 100g @ $80 -> gold value 8000, net 8000, zakat 200');
  // Cash $100 only: net $100 < nisab $612.36, no zakat due.
  const c = TD.calculate({ cash: 100, goldG: 0, goldPrice: 80, silverG: 0, silverPrice: 1, business: 0, debts: 0 });
  ok(!c.error && c.netWealth === 100 && c.due === false && c.zakat === 0, 'cash 100 -> net 100 < 612.36, no zakat due, zakat 0');
  // Cash $10,000 with $2,000 debts: net $8,000, zakat $200.
  const d = TD.calculate({ cash: 10000, goldG: 0, goldPrice: 80, silverG: 0, silverPrice: 1, business: 0, debts: 2000 });
  ok(!d.error && d.netWealth === 8000 && d.due === true && d.zakat === 200, 'cash 10000 + debts 2000 -> net 8000, zakat 200');
  // Silver 700 g at $1/g: silver value $700, net $700 >= 612.36, zakat $17.50.
  const e = TD.calculate({ cash: 0, goldG: 0, goldPrice: 80, silverG: 700, silverPrice: 1, business: 0, debts: 0 });
  ok(!e.error && e.silverValue === 700 && e.netWealth === 700 && e.due === true && e.zakat === 17.5, 'silver 700g @ $1 -> silver value 700, net 700, zakat 17.50');
  // Gold nisab binds when gold is cheap: gold $5/g, silver $1/g -> nisab = min(437.40, 612.36) = 437.40.
  const f = TD.calculate({ cash: 500, goldG: 0, goldPrice: 5, silverG: 0, silverPrice: 1, business: 0, debts: 0 });
  ok(!f.error && f.nisab === 437.4 && f.due === true && f.zakat === 12.5, 'gold $5/g -> nisab 437.40 (gold binds), cash 500 due, zakat 12.50');
  // Exactly at the nisab: cash $612.36 is due.
  const g = TD.calculate({ cash: 612.36, goldG: 0, goldPrice: 80, silverG: 0, silverPrice: 1, business: 0, debts: 0 });
  ok(!g.error && g.due === true && g.zakat === 15.31, 'cash exactly at nisab 612.36 -> due, zakat 15.31');
  // Errors.
  ok(!!TD.calculate({ cash: -5, goldG: 0, goldPrice: 80, silverG: 0, silverPrice: 1, business: 0, debts: 0 }).error, 'negative cash errors');
  ok(!!TD.calculate({ cash: NaN, goldG: 0, goldPrice: 80, silverG: 0, silverPrice: 1, business: 0, debts: 0 }).error, 'NaN cash errors');
  ok(!!TD.calculate({ cash: 10000, goldG: 0, goldPrice: 0, silverG: 0, silverPrice: 1, business: 0, debts: 0 }).error, 'gold price 0 errors');
  ok(!!TD.calculate({ cash: 10000, goldG: 0, goldPrice: 80, silverG: 0, silverPrice: 0, business: 0, debts: 0 }).error, 'silver price 0 errors');
  ok(!!TD.calculate({ cash: 10000, goldG: 0, goldPrice: 80, silverG: 0, silverPrice: 1, business: 0, debts: -1 }).error, 'negative debts errors');
  ok(!!TD.calculate({ cash: 10000, goldG: -1, goldPrice: 80, silverG: 0, silverPrice: 1, business: 0, debts: 0 }).error, 'negative gold weight errors');
  ok(!!TD.calculate({ cash: 10000, goldG: 0, goldPrice: 80, silverG: -1, silverPrice: 1, business: 0, debts: 0 }).error, 'negative silver weight errors');
  // Formatting.
  ok(TD.fmt(0) === '$0.00' && TD.fmt(250) === '$250.00' && TD.fmt(123456.78) === '$123,456.78', 'fmt: $0.00 / $250.00 / $123,456.78');
  // Summary text contains the key figures.
  const s = TD.summary(a);
  ok(s.includes('Net zakatable wealth: $10,000.00') && s.includes('Nisab: $612.36') && s.includes('Zakat due (2.5%): $250.00'), 'summary lists net wealth, nisab and zakat due');
  const s2 = TD.summary(c);
  ok(s2.includes('Net zakatable wealth: $100.00') && s2.includes('No zakat due'), 'summary for below-nisab case says No zakat due');
  dom.window.close();
}

console.log('ZAKAT UI');
{
  const dom = await loadPage('zakat-calculator/');
  const w = dom.window;
  // Defaults on load: cash $10,000, gold price $80, silver price $1.
  ok(w.document.querySelector('#r-net').textContent === '$10,000.00', 'UI defaults: net $10,000.00 on load');
  ok(w.document.querySelector('#r-nisab').textContent === '$612.36', 'UI defaults: nisab $612.36 on load');
  ok(w.document.querySelector('#r-zakat').textContent === '$250.00', 'UI defaults: zakat $250.00 on load');
  // Breakdown lists all five lines on load.
  const bd = w.document.querySelector('#breakdown').textContent;
  ok(bd.includes('Cash: $10,000.00') && bd.includes('Gold value: $0.00') && bd.includes('Silver value: $0.00') && bd.includes('Business assets: $0.00') && bd.includes('Less debts'), 'UI defaults: breakdown lists cash, gold, silver, business and debts');
  // Cash $100 -> below nisab.
  setVal(w, '#cash', '100');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-net').textContent === '$100.00' && w.document.querySelector('#r-zakat').textContent === 'No zakat due — below nisab', 'UI cash 100 -> net $100.00, below-nisab message');
  // Invalid input shows an error and clears the results.
  setVal(w, '#cash', '-5');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#msg').className === 'msg err' && w.document.querySelector('#r-net').textContent === '–' && w.document.querySelector('#r-nisab').textContent === '–' && w.document.querySelector('#r-zakat').textContent === '–', 'UI cash -5 shows an error and clears the results');
  // Back to valid inputs for copy/download.
  setVal(w, '#cash', '10000');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-net').textContent === '$10,000.00' && w.document.querySelector('#r-zakat').textContent === '$250.00', 'UI valid inputs after error: net $10,000.00 and zakat $250.00 again');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied && copied.includes('Net zakatable wealth: $10,000.00') && copied.includes('Nisab: $612.36') && copied.includes('Zakat due (2.5%): $250.00') && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the summary to the clipboard and shows a visible success message');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'zakat-calculator.txt', 'UI download link points at blob with zakat-calculator.txt name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded zakat-calculator.txt.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Download with invalid inputs: link stays '#' and a hint shows.
  setVal(w, '#cash', '-5');
  w.document.querySelector('#download').click();
  ok(dl.getAttribute('href') === '#' && w.document.querySelector('#msg').textContent.length > 0, 'UI download with invalid inputs leaves #dl at # and shows a hint');
  // Reset restores the defaults.
  w.document.querySelector('#reset').click();
  ok(w.document.querySelector('#cash').value === '10000' && w.document.querySelector('#gold-g').value === '0' && w.document.querySelector('#gold-price').value === '80' && w.document.querySelector('#silver-g').value === '0' && w.document.querySelector('#silver-price').value === '1' && w.document.querySelector('#business').value === '0' && w.document.querySelector('#debts').value === '0', 'UI reset restores the default inputs');
  ok(w.document.querySelector('#r-net').textContent === '$10,000.00' && w.document.querySelector('#r-nisab').textContent === '$612.36' && w.document.querySelector('#r-zakat').textContent === '$250.00', 'UI reset restores the default results');
  ok(dl.getAttribute('href') === '#', 'UI reset puts #dl back to #');
  dom.window.close();
}

console.log(`\nLOGIC-ZAKAT TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
