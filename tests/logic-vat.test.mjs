// Logic + UI tests for the VAT & Sales Tax Calculator (2026-11-17 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_vat.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8795/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function loadPage(p) {
  const vc = new VirtualConsole();
  let jsErrors = 0;
  vc.on('jsdomError', (e) => {
    const m = String((e && e.message) || e);
    // External-resource failures and jsdom's unimplemented navigation are
    // environment limits, not page JS errors.
    if (/Could not load|Not implemented/i.test(m)) return;
    jsErrors++;
  });
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  return { dom, jsErrors };
}
function setVal(win, sel, value) {
  const el = win.document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

console.log('VAT STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'vat-tax-calculator', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Calculators · No. 57</p>'), 'vat: eyebrow is Calculators · No. 57');
  ok(html.includes('<h1 class="rise rise-1">VAT &amp; Sales Tax Calculator</h1>'), 'vat: H1 is the tool name');
  ok((html.match(/<h1/g) || []).length === 1, 'vat: exactly one H1');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/vat-tax-calculator/">'), 'vat: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'vat: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'vat: twitter card present');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'vat: design.css stylesheet linked');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'vat: site.js loaded at end');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'vat: skip link present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'vat: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'vat: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'vat: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'VAT & Sales Tax Calculator' && app.url === 'https://toolsdaily.vercel.app/vat-tax-calculator/' && app.offers.price === '0', 'vat: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `vat: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  ok((html.match(/id="download"/g) || []).length === 1, 'vat: exactly one #download button');
  ok(html.includes('<a id="dl" class="hidden" href="#" download="vat-tax-calculator.txt">'), 'vat: hidden #dl anchor present with vat-tax-calculator.txt name');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['percentage-calculator', 'tip-calculator', 'emi-calculator', 'loan-calculator', 'discount-calculator'];
  ok((nav.match(/<li>/g) || []).length === related.length, 'vat: More-tools nav has exactly 5 links');
  ok(related.every((s) => nav.includes(`href="../${s}/"`)), 'vat: More-tools nav links the 5 related tools');
  ok(nav.indexOf('percentage-calculator') < nav.indexOf('tip-calculator') && nav.indexOf('tip-calculator') < nav.indexOf('emi-calculator') && nav.indexOf('emi-calculator') < nav.indexOf('loan-calculator') && nav.indexOf('loan-calculator') < nav.indexOf('discount-calculator'), 'vat: More-tools nav links are in the required order');
  ok(nav.includes('>Tip Calculator<') && nav.includes('>EMI Calculator<') && nav.includes('>Loan Calculator<') && nav.includes('>Discount Calculator<'), 'vat: More-tools nav uses the tools’ display names');
  ok(html.includes('<p>63 tools · New tools added regularly.</p>'), 'vat: footer says 63 tools');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'vat: no emoji anywhere on the page');
  for (const id of ['#amount', '#rate', '#mode', '#calc', '#copy', '#download', '#reset', '#r-net', '#r-tax', '#r-gross', '#msg', '#dl']) {
    ok(html.includes(`id="${id.slice(1)}"`), `vat: element ${id} present`);
  }
  ok(['5', '10', '15', '20', '25'].every((r) => html.includes(`data-rate="${r}"`)), 'vat: preset buttons for 5/10/15/20/25% present');
}

console.log('VAT CORE');
{
  const { dom, jsErrors } = await loadPage('vat-tax-calculator/');
  const w = dom.window, TD = w.TD_vat;
  ok(jsErrors === 0, `vat: zero JS errors on load (${jsErrors})`);
  ok(TD && typeof TD.addTax === 'function' && typeof TD.removeTax === 'function' && typeof TD.calculate === 'function' && typeof TD.fmtCents === 'function', 'TD_vat exposed with addTax, removeTax, calculate, fmtCents');
  // Defaults: add 20% to $100 -> net $100.00, tax $20.00, gross $120.00.
  const a = TD.addTax(10000, 2000);
  ok(!a.error && a.netCents === 10000 && a.taxCents === 2000 && a.grossCents === 12000, 'add 20% to $100 -> net 10000c, tax 2000c, gross 12000c');
  // Remove 20% from $100 -> net $83.33, tax $16.67, gross $100.00.
  const b = TD.removeTax(10000, 2000);
  ok(!b.error && b.netCents === 8333 && b.taxCents === 1667 && b.grossCents === 10000, 'remove 20% from $100 -> net 8333c, tax 1667c, gross 10000c');
  // 0% rate: nothing changes either way.
  const c = TD.addTax(10000, 0);
  ok(!c.error && c.taxCents === 0 && c.grossCents === 10000, 'add 0% to $100 -> no tax, gross $100.00');
  const d = TD.removeTax(10000, 0);
  ok(!d.error && d.netCents === 10000 && d.taxCents === 0, 'remove 0% from $100 -> net $100.00, no tax');
  // Preset rates, add mode on $100.
  const presets = [[500, 500, 10500], [1000, 1000, 11000], [1500, 1500, 11500], [2500, 2500, 12500]];
  presets.forEach(([bps, tax, gross]) => {
    const r = TD.addTax(10000, bps);
    ok(!r.error && r.taxCents === tax && r.grossCents === gross, `add ${bps / 100}% to $100 -> tax ${tax}c, gross ${gross}c`);
  });
  // Preset rates, remove mode from the gross price that holds $100 net.
  const presetsR = [[500, 10500, 10000, 500], [1000, 11000, 10000, 1000], [1500, 11500, 10000, 1500], [2500, 12500, 10000, 2500]];
  presetsR.forEach(([bps, gross, net, tax]) => {
    const r = TD.removeTax(gross, bps);
    ok(!r.error && r.netCents === net && r.taxCents === tax && r.grossCents === gross, `remove ${bps / 100}% from $${gross / 100} -> net ${net}c, tax ${tax}c`);
  });
  // Fractional rates: 7.5% on $200 -> tax $15.00; remove 7.5% from $107.50 -> net $100.00.
  const e = TD.addTax(20000, 750);
  ok(!e.error && e.taxCents === 1500 && e.grossCents === 21500, 'add 7.5% to $200 -> tax 1500c, gross 21500c');
  const f = TD.removeTax(10750, 750);
  ok(!f.error && f.netCents === 10000 && f.taxCents === 750, 'remove 7.5% from $107.50 -> net 10000c, tax 750c');
  // 12.5% on $80 -> tax $10.00, gross $90.00.
  const g = TD.addTax(8000, 1250);
  ok(!g.error && g.taxCents === 1000 && g.grossCents === 9000, 'add 12.5% to $80 -> tax 1000c, gross 9000c');
  // Zero amount is valid and stays zero.
  const h = TD.addTax(0, 2000);
  ok(!h.error && h.netCents === 0 && h.taxCents === 0 && h.grossCents === 0, 'add 20% to $0 -> all zero');
  const i = TD.removeTax(0, 2000);
  ok(!i.error && i.netCents === 0 && i.taxCents === 0 && i.grossCents === 0, 'remove 20% from $0 -> all zero');
  // Half-cent rounding, half a cent always rounds up.
  const j = TD.removeTax(1000, 2000);
  ok(!j.error && j.netCents === 833 && j.taxCents === 167, 'remove 20% from $10.00 -> net 833c, tax 167c (half-cent rounds up)');
  const k = TD.addTax(105, 1000);
  ok(!k.error && k.taxCents === 11 && k.grossCents === 116, 'add 10% to $1.05 -> tax 11c ($0.105 rounds up), gross 116c');
  const l = TD.addTax(5, 1000);
  ok(!l.error && l.taxCents === 1 && l.grossCents === 6, 'add 10% to $0.05 -> tax 1c ($0.005 rounds up), gross 6c');
  // Huge values: $1,000,000 at 20%.
  const m = TD.addTax(100000000, 2000);
  ok(!m.error && m.taxCents === 20000000 && m.grossCents === 120000000, 'add 20% to $1,000,000 -> tax 20000000c, gross 120000000c');
  // calculate() wrapper in both modes.
  const n = TD.calculate({ amount: 100, rate: 20, mode: 'add' });
  ok(!n.error && n.netCents === 10000 && n.taxCents === 2000 && n.grossCents === 12000, 'calculate add $100 at 20% -> 10000/2000/12000c');
  const o = TD.calculate({ amount: 100, rate: 20, mode: 'remove' });
  ok(!o.error && o.netCents === 8333 && o.taxCents === 1667 && o.grossCents === 10000, 'calculate remove $100 at 20% -> 8333/1667/10000c');
  // Formatting.
  ok(TD.fmtCents(0) === '$0.00' && TD.fmtCents(5) === '$0.05' && TD.fmtCents(2000) === '$20.00' && TD.fmtCents(123456) === '$1,234.56', 'fmtCents: 0/$0.05/$20.00/$1,234.56');
  // Summary text contains the key figures.
  const s = TD.summary(a, 100, 20, 'add');
  ok(s.includes('Net amount: $100.00') && s.includes('Tax amount: $20.00') && s.includes('Gross amount: $120.00') && s.includes('Tax rate: 20%'), 'summary text lists net, tax, gross and rate');
  // Errors: negative, invalid, out-of-range.
  ok(!!TD.calculate({ amount: -5, rate: 20, mode: 'add' }).error, 'negative amount errors');
  ok(!!TD.calculate({ amount: null, rate: 20, mode: 'add' }).error, 'missing amount errors');
  ok(!!TD.calculate({ amount: NaN, rate: 20, mode: 'add' }).error, 'NaN amount errors');
  ok(!!TD.calculate({ amount: 1000001, rate: 20, mode: 'add' }).error, 'amount over $1,000,000 errors');
  ok(!!TD.calculate({ amount: 100, rate: null, mode: 'add' }).error, 'missing rate errors');
  ok(!!TD.calculate({ amount: 100, rate: NaN, mode: 'add' }).error, 'NaN rate errors');
  ok(!!TD.calculate({ amount: 100, rate: -1, mode: 'add' }).error, 'negative rate errors');
  ok(!!TD.calculate({ amount: 100, rate: 101, mode: 'add' }).error, 'rate over 100% errors');
  ok(!!TD.calculate({ amount: 100, rate: 20, mode: 'bogus' }).error, 'unknown mode errors');
  ok(!!TD.addTax(-100, 2000).error, 'addTax with negative cents errors');
  ok(!!TD.removeTax(10000, -100).error, 'removeTax with negative rate errors');
  ok(!!TD.addTax(10000, 10001).error, 'addTax with rate over 100% errors');
  dom.window.close();
}

console.log('VAT UI');
{
  const { dom } = await loadPage('vat-tax-calculator/');
  const w = dom.window;
  // Defaults on load: $100, 20%, add mode.
  ok(w.document.querySelector('#r-net').textContent === '$100.00', 'UI defaults: net $100.00 on load');
  ok(w.document.querySelector('#r-tax').textContent === '$20.00', 'UI defaults: tax $20.00 on load');
  ok(w.document.querySelector('#r-gross').textContent === '$120.00', 'UI defaults: gross $120.00 on load');
  // Remove mode with the same inputs.
  setVal(w, '#mode', 'remove');
  ok(w.document.querySelector('#r-net').textContent === '$83.33', 'UI remove mode: net $83.33');
  ok(w.document.querySelector('#r-tax').textContent === '$16.67', 'UI remove mode: tax $16.67');
  ok(w.document.querySelector('#r-gross').textContent === '$100.00', 'UI remove mode: gross $100.00');
  // Live update: $250 at 15%, add mode.
  setVal(w, '#mode', 'add');
  setVal(w, '#amount', '250');
  setVal(w, '#rate', '15');
  ok(w.document.querySelector('#r-net').textContent === '$250.00', 'UI live: net $250.00');
  ok(w.document.querySelector('#r-tax').textContent === '$37.50', 'UI live: tax $37.50');
  ok(w.document.querySelector('#r-gross').textContent === '$287.50', 'UI live: gross $287.50');
  // Preset button sets the rate and recalculates.
  setVal(w, '#amount', '100');
  w.document.querySelector('[data-rate="25"]').click();
  ok(w.document.querySelector('#rate').value === '25' && w.document.querySelector('#r-tax').textContent === '$25.00' && w.document.querySelector('#r-gross').textContent === '$125.00', 'UI preset 25% button sets 25% and tax becomes $25.00');
  // Calculate button applies the current inputs.
  setVal(w, '#amount', '200');
  setVal(w, '#rate', '10');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-tax').textContent === '$20.00' && w.document.querySelector('#r-gross').textContent === '$220.00', 'UI Calculate button: $200 at 10% -> tax $20.00, gross $220.00');
  // Invalid amount shows an error and clears the results.
  setVal(w, '#amount', '-5');
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-net').textContent === '–' && w.document.querySelector('#r-tax').textContent === '–' && w.document.querySelector('#r-gross').textContent === '–', 'UI amount of -5 shows an error and clears the results');
  // Reset restores the defaults and resets the download link.
  w.document.querySelector('#reset').click();
  ok(w.document.querySelector('#amount').value === '100' && w.document.querySelector('#rate').value === '20' && w.document.querySelector('#mode').value === 'add', 'UI Reset restores amount 100, rate 20, add mode');
  ok(w.document.querySelector('#r-net').textContent === '$100.00' && w.document.querySelector('#r-tax').textContent === '$20.00' && w.document.querySelector('#r-gross').textContent === '$120.00', 'UI Reset recalculates the defaults');
  ok(w.document.querySelector('#dl').getAttribute('href') === '#', 'UI Reset resets the download link to #');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied && copied.includes('Net amount: $100.00') && copied.includes('Tax amount: $20.00') && copied.includes('Gross amount: $120.00') && w.document.querySelector('#msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the summary to the clipboard and shows a visible success message');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'vat-tax-calculator.txt', 'UI download link points at blob with vat-tax-calculator.txt name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded vat-tax-calculator.txt.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Download with invalid input downloads nothing and leaves the link at #.
  setVal(w, '#amount', '-5');
  w.document.querySelector('#dl').setAttribute('href', '#');
  w.document.querySelector('#download').click();
  ok(w.document.querySelector('#dl').getAttribute('href') === '#' && w.document.querySelector('#msg').textContent.length > 0, 'UI download with invalid input shows a hint and downloads nothing');
  dom.window.close();
}

console.log(`\nLOGIC-VAT TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
