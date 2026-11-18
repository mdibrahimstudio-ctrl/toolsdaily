// Logic + UI tests for the Username Generator tool (2026-11-15, 5-tools day).
// Drives the real page code through jsdom; core functions are window.TD_username.
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
// Deterministic pseudo-random stream (LCG) so generated batches are repeatable.
function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

console.log('USERNAME STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'username-generator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/username-generator/">'), 'username: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'username: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'username: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'username: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'username: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'username: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Username Generator' && app.url === 'https://toolsdaily.vercel.app/username-generator/' && app.offers.price === '0', 'username: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `username: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['password-generator', 'fancy-text-generator', 'random-number-generator', 'uuid-generator', 'lorem-ipsum-generator'];
  ok((nav.match(/<li>/g) || []).length === related.length && related.every((s) => nav.includes(`href="../${s}/"`)), 'username: More-tools nav links exactly its 5 related tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 65, 'sitemap.xml has 65 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/username-generator/'), 'sitemap includes username-generator');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card[\s"]/g) || []).length === 63, 'home has exactly 63 tool cards');
  ok(home.includes('/username-generator/'), 'home cards + nav include username-generator');
  ok(home.includes('Sixty-three handy tools'), 'home lead says Fifty-eight tools');
  ok(home.includes('Generators <span class="n">6</span>'), 'home Generators chip says 6');
  const genSec = home.match(/<section class="cat" id="generators"[\s\S]*?<\/section>/)[0];
  ok(genSec.includes('<span class="cat-n">6 tools</span>'), 'home Generators section says 6 tools');
  const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(llms.includes('browse all 63 free tools'), 'llms.txt says 63 tools');
  ok(llms.includes('https://toolsdaily.vercel.app/username-generator/'), 'llms.txt lists username-generator');
}

console.log('USERNAME CORE');
{
  const dom = await loadPage('username-generator/');
  const w = dom.window, TD = w.TD_username;
  ok(TD && typeof TD.cleanKeyword === 'function' && typeof TD.generate === 'function', 'TD_username exposed');
  ok(Array.isArray(TD.ADJECTIVES) && TD.ADJECTIVES.length === 24, 'exactly 24 adjectives');
  ok(Array.isArray(TD.NOUNS) && TD.NOUNS.length === 24, 'exactly 24 nouns');
  ok(JSON.stringify(TD.STYLES) === JSON.stringify(['any', 'gamer', 'cool', 'pro']), 'STYLES is [any, gamer, cool, pro]');
  ok(TD.MAX_LEN === 20, 'MAX_LEN is 20');
  ok(TD.cleanKeyword(' Nova! ') === 'nova', 'core cleanKeyword: trims, lowercases, strips "!"');
  ok(TD.cleanKeyword('Hello World') === 'helloworld', 'core cleanKeyword: spaces removed');
  ok(TD.cleanKeyword('a-b_c.d') === 'a-b_c.d', 'core cleanKeyword: dash, underscore and dot kept');
  ok(TD.cleanKeyword('') === '', 'core cleanKeyword: empty stays empty');
  ok(TD.cleanKeyword('averylongkeywordname') === 'averylongkey', 'core cleanKeyword: capped at 12 characters');
  // Deterministic single names with rand () => 0 (first adjective, first noun, first separator).
  ok(JSON.stringify(TD.generate({ keyword: '', style: 'any', count: 1 }, () => 0).names) === JSON.stringify(['swiftfalcon']), 'core generate any + rand 0 gives swiftfalcon');
  ok(JSON.stringify(TD.generate({ keyword: '', style: 'gamer', count: 1 }, () => 0).names) === JSON.stringify(['xXFalconXx']), 'core generate gamer + rand 0 gives xXFalconXx');
  ok(JSON.stringify(TD.generate({ keyword: '', style: 'cool', count: 1 }, () => 0).names) === JSON.stringify(['SwiftFalcon']), 'core generate cool + rand 0 gives SwiftFalcon');
  ok(JSON.stringify(TD.generate({ keyword: '', style: 'pro', count: 1 }, () => 0).names) === JSON.stringify(['swift_falcon']), 'core generate pro + rand 0 gives swift_falcon');
  ok(JSON.stringify(TD.generate({ keyword: 'nova', style: 'any', count: 1 }, () => 0).names) === JSON.stringify(['novafalcon']), 'core generate with keyword nova + rand 0 gives novafalcon');
  // A constant rand can only ever make one unique name, so a batch of 10 must fail cleanly.
  const stuck = TD.generate({ keyword: '', style: 'any', count: 10 }, () => 0);
  ok(stuck.error === 'Could only make 1 unique names — try a different style or keyword.', 'core generate: constant rand makes only 1 unique name and reports it');
  // A varied stream makes a full batch of unique, well-formed names.
  const batch = TD.generate({ keyword: '', style: 'any', count: 10 }, seededRand(42));
  ok(!batch.error && batch.names.length === 10, 'core generate: seeded stream makes 10 names');
  ok(new Set(batch.names).size === 10, 'core generate: all 10 names are unique');
  ok(batch.names.every((n) => n.length >= 3 && n.length <= 20 && /^[A-Za-z0-9_.\-]+$/.test(n)), 'core generate: every name is 3-20 chars of letters, digits, _ . -');
  ok(batch.style === 'any' && batch.keyword === '', 'core generate: style and keyword echoed back');
  const kwBatch = TD.generate({ keyword: 'nova', style: 'gamer', count: 5 }, seededRand(7));
  ok(!kwBatch.error && kwBatch.names.length === 5, 'core generate: keyword batch makes 5 names');
  ok(kwBatch.names.every((n) => n.includes('nova')), 'core generate: every keyword name contains "nova"');
  ok(kwBatch.keyword === 'nova' && kwBatch.style === 'gamer', 'core generate: keyword batch echoes keyword and style');
  ok(TD.generate({ keyword: '', style: 'any', count: 0 }).error === 'Generate between 1 and 50 names.', 'core generate: 0 names rejected');
  ok(TD.generate({ keyword: '', style: 'any', count: 51 }).error === 'Generate between 1 and 50 names.', 'core generate: 51 names rejected');
  ok(TD.generate({ keyword: '', style: 'any', count: 2.5 }).error === 'Generate between 1 and 50 names.', 'core generate: fractional count rejected');
  ok(TD.generate({ keyword: '', style: 'bogus', count: 1 }, seededRand(3)).style === 'any', 'core generate: unknown style falls back to any');
  dom.window.close();
}

console.log('USERNAME UI');
{
  const dom = await loadPage('username-generator/');
  const w = dom.window;
  // Defaults on load: 10 names, Any style, no keyword.
  ok(w.document.querySelectorAll('.name-row').length === 10, 'UI defaults: 10 name rows rendered');
  ok(w.document.querySelectorAll('[data-copy]').length === 10, 'UI defaults: 10 copy buttons, one per name');
  ok(w.document.querySelector('#st-count').textContent === '10' && w.document.querySelector('#st-style').textContent === 'Any style' && w.document.querySelector('#st-keyword').textContent === '—', 'UI defaults: stats 10 names / Any style / no keyword');
  ok(w.document.querySelector('#msg').textContent === '10 usernames ready — copy one, copy them all, or download the list.' && w.document.querySelector('#msg').className === 'msg ok', 'UI defaults: visible success message');
  const names0 = [...w.document.querySelectorAll('.name-out')].map((el) => el.textContent);
  ok(new Set(names0).size === 10, 'UI defaults: all 10 names are unique');
  ok(names0.every((n) => n.length >= 3 && n.length <= 20), 'UI defaults: every name is 3-20 characters');
  // A keyword is woven into every name.
  setVal(w, '#keyword', 'nova');
  ok(w.document.querySelector('#st-keyword').textContent === 'nova', 'UI keyword: stat shows the keyword');
  const namesKw = [...w.document.querySelectorAll('.name-out')].map((el) => el.textContent);
  ok(namesKw.length === 10 && namesKw.every((n) => n.includes('nova')), 'UI keyword: all 10 names contain "nova"');
  ok(new Set(namesKw).size === 10, 'UI keyword: all 10 names are still unique');
  // Switching style updates the stat.
  setVal(w, '#style', 'gamer');
  ok(w.document.querySelector('#st-style').textContent === 'Gamer', 'UI style: stat shows Gamer');
  const namesGamer = [...w.document.querySelectorAll('.name-out')].map((el) => el.textContent);
  ok(namesGamer.length === 10 && namesGamer.every((n) => n.includes('nova')), 'UI style: gamer names still contain the keyword');
  // 25 names on request.
  setVal(w, '#count', '25');
  ok(w.document.querySelectorAll('.name-row').length === 25, 'UI count: 25 name rows rendered');
  ok(w.document.querySelector('#st-count').textContent === '25', 'UI count: stat shows 25 names');
  ok(w.document.querySelector('#msg').textContent === '25 usernames ready — copy one, copy them all, or download the list.' && w.document.querySelector('#msg').className === 'msg ok', 'UI count: visible success message for 25 names');
  // Copy one name with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  const firstBtn = w.document.querySelector('[data-copy]');
  const firstName = firstBtn.getAttribute('data-copy');
  firstBtn.click();
  await sleep(80);
  ok(copied === firstName && w.document.querySelector('#msg').textContent === `Copied ${firstName} to the clipboard.` && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the single name to the clipboard and shows a visible success message');
  // Copy all writes every name on its own line.
  w.document.querySelector('#copy-all').click();
  await sleep(80);
  const allNames = [...w.document.querySelectorAll('.name-out')].map((el) => el.textContent);
  ok(copied === allNames.join('\n') && w.document.querySelector('#msg').textContent === 'Copied all 25 usernames to the clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy all writes all 25 names, one per line');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'usernames.txt', 'UI download link points at blob with usernames.txt name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded usernames.txt with 25 names.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'username');
  await sleep(200);
  let visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'https://toolsdaily.vercel.app/username-generator/', 'home search "username" finds the new tool');
  setVal(hw, '#tool-search', 'handle');
  await sleep(200);
  visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'https://toolsdaily.vercel.app/username-generator/', 'home search "handle" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-USERNAME TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
