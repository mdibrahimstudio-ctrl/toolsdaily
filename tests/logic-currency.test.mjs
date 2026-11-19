// Logic + UI tests for the Currency Converter (2026-11-17 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_currency.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8793/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function loadPage(p) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => { const m = String(e && e.message || e); if (!m.includes('Could not load')) errors.push(m); });
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(200);
  return { dom, errors };
}
function setVal(win, sel, value) {
  const el = win.document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

console.log('CURRENCY STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'currency-converter', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Converters · No. 55</p>'), 'currency: eyebrow Converters · No. 55');
  ok((html.match(/<h1/g) || []).length === 1, 'currency: exactly one H1');
  ok(html.includes('<h1 class="rise rise-1">Currency Converter</h1>'), 'currency: H1 is Currency Converter');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'currency: skip link present');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/currency-converter/">'), 'currency: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'currency: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'currency: twitter card present');
  ok(html.includes('G-KX85CZXTR4'), 'currency: GA4 tag present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'currency: no external resource loads except the GA4 tag');
  ok(html.includes('https://open.er-api.com/v6/latest/'), 'currency: live rate endpoint referenced');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'currency: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Currency Converter' && app.url === 'https://toolsdaily.vercel.app/currency-converter/' && app.offers.price === '0', 'currency: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `currency: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  ok(!html.includes('id="dl"') && !html.includes('id="download"'), 'currency: NO #dl anchor and NO download button (numbers-only tool)');
  for (const id of ['amount', 'from', 'to', 'swap', 'result', 'rate-line', 'rate-source', 'msg']) {
    ok(html.includes(`id="${id}"`), `currency: element #${id} present`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['unit-converter', 'color-converter', 'base64-encoder-decoder', 'json-formatter', 'url-encoder-decoder'];
  ok((nav.match(/<li>/g) || []).length === 5, 'currency: nav.more has exactly 5 related links');
  ok(related.every((s, i) => nav.indexOf(`href="../${s}/"`) > -1) &&
    nav.indexOf('unit-converter') < nav.indexOf('color-converter') &&
    nav.indexOf('color-converter') < nav.indexOf('base64-encoder-decoder') &&
    nav.indexOf('base64-encoder-decoder') < nav.indexOf('json-formatter') &&
    nav.indexOf('json-formatter') < nav.indexOf('url-encoder-decoder'), 'currency: nav.more links are the 5 related tools in order');
  ok(nav.includes('>Unit Converter<') && nav.includes('>Color Converter<') && nav.includes('>Base64 Encoder / Decoder<') && nav.includes('>JSON Formatter<') && nav.includes('>URL Encoder / Decoder<'), 'currency: nav.more display names match the target pages');
  ok(html.includes('68 tools · New tools added regularly.'), 'currency: footer says 68 tools');
  ok(html.includes('Offline fallback rates as of 2026-11-17'), 'currency: fallback snapshot is dated 2026-11-17 in the UI');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'currency: no emoji anywhere on the page');
}

console.log('CURRENCY CORE');
{
  const { dom, errors } = await loadPage('currency-converter/');
  const w = dom.window, TD = w.TD_currency, R = w.TD_currencyRates;
  ok(errors.length === 0, `currency: zero JS errors on load (${errors.length} seen)`);
  ok(TD && typeof TD.convert === 'function' && typeof TD.getRate === 'function' && typeof TD.lookup === 'function', 'TD_currency exposed with convert/getRate/lookup');
  ok(R && typeof R === 'object', 'TD_currencyRates fallback table exposed');
  // Fallback table sanity.
  const keys = Object.keys(R);
  ok(keys.length >= 40, `currency: fallback table has ${keys.length} currencies (>= 40)`);
  ok(R.USD === 1, 'currency: fallback USD base = 1');
  ok(keys.every((k) => typeof R[k] === 'number' && isFinite(R[k]) && R[k] > 0), 'currency: all fallback rates are positive numbers');
  for (const c of ['EUR', 'GBP', 'JPY', 'BDT', 'INR', 'AED', 'SAR', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD', 'NZD']) {
    ok(typeof R[c] === 'number' && R[c] > 0, `currency: fallback has major currency ${c}`);
  }
  ok(Math.abs(R.EUR - 0.908584) < 1e-9, 'currency: fallback EUR rate is the real 2026-11-17 snapshot value 0.908584');
  // Core math via convert(amount, rate).
  ok(Math.abs(TD.convert(100, 0.908584) - 90.8584) < 1e-9, 'convert: 100 x 0.908584 = 90.8584');
  ok(TD.convert(0, 0.908584) === 0, 'convert: 0 amount converts to 0');
  ok(TD.convert(100, 0) === 0, 'convert: rate 0 converts to 0');
  ok(Math.abs(TD.convert(0.01, 159.580113) - 1.59580113) < 1e-9, 'convert: tiny amount 0.01 x 159.580113');
  ok(TD.convert(1000000, 0.908584) === 908584, 'convert: huge amount 1,000,000 x 0.908584');
  ok(Number.isNaN(TD.convert(-5, 0.9)), 'convert: negative amount -> NaN');
  ok(Number.isNaN(TD.convert(NaN, 0.9)), 'convert: NaN amount -> NaN');
  ok(Number.isNaN(TD.convert(100, NaN)), 'convert: NaN rate -> NaN');
  ok(Number.isNaN(TD.convert(100, -1)), 'convert: negative rate -> NaN');
  // getRate(from, to, ratesTable).
  ok(Math.abs(TD.getRate('USD', 'EUR', R) - 0.908584) < 1e-12, 'getRate: USD->EUR = 0.908584');
  ok(Math.abs(TD.getRate('EUR', 'USD', R) - (1 / 0.908584)) < 1e-9, 'getRate: EUR->USD inverts the USD->EUR rate');
  ok(TD.getRate('EUR', 'EUR', R) === 1, 'getRate: same currency = 1');
  ok(Math.abs(TD.getRate('EUR', 'GBP', R) - (R.GBP / R.EUR)) < 1e-12, 'getRate: EUR->GBP = GBP/EUR cross rate');
  ok(TD.getRate('USD', 'XXX', R) === null, 'getRate: missing To currency -> null');
  ok(TD.getRate('XXX', 'EUR', R) === null, 'getRate: missing From currency -> null');
  ok(TD.getRate('USD', 'EUR', null) === null, 'getRate: null table -> null');
  ok(TD.lookup('USD', 'EUR', R) === TD.getRate('USD', 'EUR', R), 'lookup: alias matches getRate');
  // Rounding / formatting.
  ok(TD.formatAmount(90.8584, 'EUR') === '90.86', 'formatAmount: 90.8584 EUR -> 90.86 (2 decimals)');
  ok(TD.formatAmount(15958.0113, 'JPY') === '15,958', 'formatAmount: 15958.01 JPY -> 15,958 (0 decimals)');
  ok(TD.formatAmount(133548.5864, 'KRW') === '133,549', 'formatAmount: KRW rounds to 0 decimals');
  ok(TD.formatAmount(0, 'USD') === '0.00', 'formatAmount: 0 USD -> 0.00');
  ok(TD.decimalsFor('JPY') === 0 && TD.decimalsFor('KRW') === 0 && TD.decimalsFor('EUR') === 2 && TD.decimalsFor('BDT') === 2, 'decimalsFor: JPY/KRW 0, EUR/BDT 2');
  ok(TD.fmtRate(0.908584) === '0.908584', 'fmtRate: 0.908584 stays 0.908584');
  dom.window.close();
}

console.log('CURRENCY UI');
{
  const { dom, errors } = await loadPage('currency-converter/');
  const w = dom.window, d = w.document;
  ok(errors.length === 0, `currency UI: zero JS errors on load (${errors.length} seen)`);
  const fromSel = d.querySelector('#from'), toSel = d.querySelector('#to');
  ok(fromSel.options.length >= 150, `currency UI: From lists ${fromSel.options.length} currencies (>= 150)`);
  ok(toSel.options.length >= 150, `currency UI: To lists ${toSel.options.length} currencies (>= 150)`);
  ok(fromSel.options[0].textContent.includes(' — ') && fromSel.options[0].textContent.length > 5, 'currency UI: options show code + name (e.g. USD — US Dollar)');
  ok(d.querySelector('#amount').value === '100' && fromSel.value === 'USD' && toSel.value === 'EUR', 'currency UI: defaults are 100 USD -> EUR');
  ok(d.querySelector('#result').textContent === '100.00 USD = 90.86 EUR', 'currency UI default: 100 USD = 90.86 EUR (fallback rates)');
  ok(d.querySelector('#rate-line').textContent === '1 USD = 0.908584 EUR', 'currency UI default rate line: 1 USD = 0.908584 EUR');
  ok(d.querySelector('#rate-source').textContent.includes('2026-11-17'), 'currency UI: rate source shows the fallback date before live rates load');
  // Live update: 50 EUR -> GBP = 41.73 (fallback cross rate).
  setVal(w, '#amount', '50');
  setVal(w, '#from', 'EUR');
  setVal(w, '#to', 'GBP');
  ok(d.querySelector('#result').textContent === '50.00 EUR = 41.73 GBP', 'currency UI live: 50 EUR = 41.73 GBP');
  ok(d.querySelector('#rate-line').textContent.startsWith('1 EUR = 0.834'), 'currency UI live rate line: 1 EUR = 0.834... GBP');
  // JPY zero decimals: 100 USD -> JPY = 15,958.
  setVal(w, '#amount', '100');
  setVal(w, '#from', 'USD');
  setVal(w, '#to', 'JPY');
  ok(d.querySelector('#result').textContent === '100.00 USD = 15,958 JPY', 'currency UI: 100 USD = 15,958 JPY (0 decimals)');
  // Swap button swaps the selects and the result.
  d.querySelector('#swap').click();
  ok(fromSel.value === 'JPY' && toSel.value === 'USD', 'currency UI swap: selects swap to JPY -> USD');
  ok(d.querySelector('#result').textContent === '100 JPY = 0.63 USD', 'currency UI after swap: 100 JPY = 0.63 USD (JPY amount shown with 0 decimals)');
  // Invalid / negative amount shows a message and clears the result.
  setVal(w, '#amount', '-5');
  ok(d.querySelector('#msg').textContent.length > 0 && d.querySelector('#result').textContent === '–', 'currency UI: negative amount shows a message and clears the result');
  setVal(w, '#amount', '');
  ok(d.querySelector('#msg').textContent.length > 0 && d.querySelector('#result').textContent === '–', 'currency UI: empty amount shows a message and clears the result');
  // Recovery: valid amount again.
  setVal(w, '#amount', '100');
  setVal(w, '#from', 'USD');
  setVal(w, '#to', 'EUR');
  ok(d.querySelector('#result').textContent === '100.00 USD = 90.86 EUR' && d.querySelector('#msg').textContent === '', 'currency UI: valid amount after error restores the result and clears the message');
  dom.window.close();
}

console.log(`\nLOGIC-CURRENCY TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
