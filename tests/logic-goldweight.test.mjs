// Logic + UI tests for the Gold Weight Converter (2026-11-18 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_goldweight.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8803/';
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

console.log('GOLDWEIGHT STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'gold-weight-converter', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Converters · No. 62</p>'), 'goldweight: eyebrow Converters · No. 62');
  ok(html.includes('<h1 class="rise rise-1">Gold Weight Converter</h1>'), 'goldweight: H1 is Gold Weight Converter');
  ok((html.match(/<h1/g) || []).length === 1, 'goldweight: exactly one H1');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'goldweight: skip link present');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/gold-weight-converter/">'), 'goldweight: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'goldweight: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'goldweight: twitter card present');
  ok(html.includes('G-KX85CZXTR4'), 'goldweight: GA4 tag present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'goldweight: no external resource loads except the GA4 tag');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'goldweight: design.css stylesheet');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'goldweight: site.js at end');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  ok(blocks.length === 1, 'goldweight: exactly one JSON-LD script block');
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'goldweight: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Gold Weight Converter' && app.url === 'https://toolsdaily.vercel.app/gold-weight-converter/' && app.offers.price === '0', 'goldweight: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `goldweight: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const ids = ['val', 'from', 'convert', 'r-tola', 'r-masha', 'r-ratti', 'r-bhori', 'r-gram', 'r-kg', 'r-troyoz', 'msg'];
  ok(ids.every((id) => html.includes(`id="${id}"`)), 'goldweight: all required element IDs present');
  ok(!html.includes('id="download"') && !html.includes('id="dl"'), 'goldweight: NO #download button and NO #dl anchor anywhere');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['unit-converter', 'currency-converter', 'color-converter', 'base64-encoder-decoder', 'json-formatter'];
  const navHrefs = [...nav.matchAll(/href="\.\.\/([^/]+)\/"/g)].map((m) => m[1]);
  ok(JSON.stringify(navHrefs) === JSON.stringify(related), 'goldweight: nav.more has exactly the 5 related links in order');
  ok(nav.includes('Unit Converter') && nav.includes('Currency Converter') && nav.includes('Color Converter') && nav.includes('Base64 Encoder / Decoder') && nav.includes('JSON Formatter'), 'goldweight: nav.more display names correct');
  ok(html.includes('<p>68 tools · New tools added regularly.</p>'), 'goldweight: footer says 68 tools');
  ok(html.includes('1 tola = 11.6638 g'), 'goldweight: conversion factors stated on the page');
}

console.log('GOLDWEIGHT CORE');
{
  const dom = await loadPage('gold-weight-converter/');
  const w = dom.window, TD = w.TD_goldweight;
  ok(TD && typeof TD.convert === 'function' && typeof TD.fmt === 'function', 'TD_goldweight exposed with convert/fmt');
  ok(dom._winErrors.length === 0, `goldweight: zero JS errors on load (got ${dom._winErrors.length})`);
  const jsErrs = dom._jsdomErrors.filter((e) => !/Could not load/i.test(String((e && e.message) || e)));
  ok(jsErrs.length === 0, `goldweight: zero jsdom script errors on load (got ${jsErrs.length})`);
  // 1 tola = 11.6638 g = 12 masha = 96 ratti = 1 bhori = 0.0117 kg = 0.375 troy oz.
  const a = TD.convert(1, 'tola');
  ok(!a.error && a.gram === 11.6638 && a.masha === 12 && a.ratti === 96 && a.bhori === 1 && a.tola === 1 && a.kg === 0.0117 && a.troyOz === 0.375, '1 tola -> 11.6638 g, 12 masha, 96 ratti, 1 bhori, 0.0117 kg, 0.375 troy oz');
  // 1 kg = 1000 g; 1000 / 11.6638 = 85.735352... -> 85.7354 at 4 decimals.
  const b = TD.convert(1, 'kg');
  ok(!b.error && b.gram === 1000 && b.tola === 85.7354 && b.kg === 1, '1 kg -> 1000 g, 85.7354 tola');
  // 1 troy ounce = 31.1035 g.
  const c = TD.convert(1, 'troy-ounce');
  ok(!c.error && c.gram === 31.1035 && c.troyOz === 1, '1 troy ounce -> 31.1035 g');
  // 12 masha = 1 tola; 96 ratti = 1 tola.
  const d = TD.convert(12, 'masha');
  ok(!d.error && d.tola === 1 && d.ratti === 96 && d.gram === 11.6638, '12 masha -> 1 tola, 96 ratti, 11.6638 g');
  const e = TD.convert(96, 'ratti');
  ok(!e.error && e.tola === 1 && e.masha === 12 && e.gram === 11.6638, '96 ratti -> 1 tola, 12 masha, 11.6638 g');
  // Zero converts to all zeros.
  const z = TD.convert(0, 'gram');
  ok(!z.error && z.tola === 0 && z.masha === 0 && z.ratti === 0 && z.bhori === 0 && z.gram === 0 && z.kg === 0 && z.troyOz === 0, '0 gram -> all zeros');
  // Bhori equals tola.
  const bh = TD.convert(2, 'bhori');
  ok(!bh.error && bh.tola === 2 && bh.gram === 23.3276, '2 bhori -> 2 tola, 23.3276 g');
  // Errors: negative, NaN, unknown unit.
  ok(!!TD.convert(-1, 'tola').error, 'negative value errors');
  ok(!!TD.convert(NaN, 'tola').error, 'NaN value errors');
  ok(!!TD.convert(1, 'pound').error, 'unknown unit errors');
  ok(!!TD.convert(1, '').error, 'empty unit errors');
  // Formatting: up to 4 decimals, trailing zeros trimmed.
  ok(TD.fmt(11.6638) === '11.6638' && TD.fmt(12) === '12' && TD.fmt(96) === '96' && TD.fmt(0.375) === '0.375' && TD.fmt(0.0857) === '0.0857' && TD.fmt(0) === '0', 'fmt: 11.6638/12/96/0.375/0.0857/0');
  dom.window.close();
}

console.log('GOLDWEIGHT UI');
{
  const dom = await loadPage('gold-weight-converter/');
  const w = dom.window;
  // Defaults on load: 1 tola = 11.6638 g.
  ok(w.document.querySelector('#r-gram').textContent === '11.6638', 'UI defaults: 1 tola = 11.6638 g on load');
  ok(w.document.querySelector('#r-masha').textContent === '12' && w.document.querySelector('#r-ratti').textContent === '96' && w.document.querySelector('#r-troyoz').textContent === '0.375', 'UI defaults: 12 masha, 96 ratti, 0.375 troy oz on load');
  // 2 grams -> 0.1715 tola (2 / 11.6638 = 0.17147... -> 0.1715).
  setVal(w, '#val', '2');
  const fromEl = w.document.querySelector('#from');
  fromEl.value = 'gram';
  fromEl.dispatchEvent(new w.Event('change', { bubbles: true }));
  w.document.querySelector('#convert').click();
  ok(w.document.querySelector('#r-tola').textContent === '0.1715', 'UI 2 grams -> 0.1715 tola');
  ok(w.document.querySelector('#r-kg').textContent === '0.002', 'UI 2 grams -> 0.002 kg');
  // Live conversion on input without clicking Convert.
  setVal(w, '#val', '1');
  fromEl.value = 'tola';
  fromEl.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.document.querySelector('#r-gram').textContent === '11.6638', 'UI live conversion: back to 1 tola = 11.6638 g without clicking');
  // Invalid input shows an error and clears the results.
  setVal(w, '#val', '-1');
  w.document.querySelector('#convert').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#msg').className === 'msg err', 'UI -1 shows an error with class msg err');
  ok(['#r-tola', '#r-masha', '#r-ratti', '#r-bhori', '#r-gram', '#r-kg', '#r-troyoz'].every((sel) => w.document.querySelector(sel).textContent === '–'), 'UI invalid input clears all results to –');
  // Empty input also errors.
  setVal(w, '#val', '');
  w.document.querySelector('#convert').click();
  ok(w.document.querySelector('#msg').textContent.length > 0 && w.document.querySelector('#r-gram').textContent === '–', 'UI empty input shows an error and clears the results');
  // Valid input again recovers.
  setVal(w, '#val', '1');
  w.document.querySelector('#convert').click();
  ok(w.document.querySelector('#r-gram').textContent === '11.6638' && w.document.querySelector('#msg').textContent === '', 'UI valid input after error recovers to 11.6638 g with no message');
  dom.window.close();
}

console.log(`\nLOGIC-GOLDWEIGHT TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
