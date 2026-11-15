// Logic + UI tests for the Fancy Text Generator tool (2026-11-15 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_fancy.
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

console.log('FANCY STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'fancy-text-generator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/fancy-text-generator/">'), 'fancy: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'fancy: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'fancy: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'fancy: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'fancy: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'fancy: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Fancy Text Generator' && app.url === 'https://toolsdaily.vercel.app/fancy-text-generator/' && app.offers.price === '0', 'fancy: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `fancy: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['word-counter', 'text-case-converter', 'lorem-ipsum-generator', 'remove-duplicate-lines', 'morse-code-translator'];
  ok((nav.match(/<li>/g) || []).length === related.length && related.every((s) => nav.includes(`href="../${s}/"`)), 'fancy: More-tools nav links exactly its 5 related tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 35, 'sitemap.xml has 34 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/fancy-text-generator/'), 'sitemap includes fancy-text-generator');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card[\s"]/g) || []).length === 34, 'home has exactly 34 tool cards');
  ok(home.includes('/fancy-text-generator/'), 'home cards + nav include fancy-text-generator');
  ok(home.includes('Thirty-four handy tools'), 'home lead says Thirty-four tools');
  ok(home.includes('Text Tools <span class="n">7</span>'), 'home Text Tools chip says 7');
  ok(home.includes('<span class="cat-n">7 tools</span>'), 'home Text Tools section says 7 tools');
  const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(llms.includes('browse all 34 free tools'), 'llms.txt says 34 tools');
  ok(llms.includes('https://toolsdaily.vercel.app/fancy-text-generator/'), 'llms.txt lists fancy-text-generator');
}

console.log('FANCY CORE');
{
  const dom = await loadPage('fancy-text-generator/');
  const w = dom.window, TD = w.TD_fancy;
  ok(TD && typeof TD.convert === 'function' && typeof TD.convertAll === 'function', 'TD_fancy exposed');
  ok(Array.isArray(TD.STYLES) && TD.STYLES.length === 18, 'exactly 18 styles defined');
  ok(TD.MAX_LEN === 1000, 'MAX_LEN is 1000');
  // "Hello World" in every style — exact strings verified against the Unicode blocks.
  const HW = {
    'bold': '𝐇𝐞𝐥𝐥𝐨 𝐖𝐨𝐫𝐥𝐝',
    'italic': '𝐻𝑒𝑙𝑙𝑜 𝑊𝑜𝑟𝑙𝑑',
    'bold-italic': '𝑯𝒆𝒍𝒍𝒐 𝑾𝒐𝒓𝒍𝒅',
    'script': 'ℋ𝒺𝓁𝓁𝓄 𝒲𝓄𝓇𝓁𝒹',
    'bold-script': '𝓗𝓮𝓵𝓵𝓸 𝓦𝓸𝓻𝓵𝓭',
    'fraktur': 'ℌ𝔢𝔩𝔩𝔬 𝔚𝔬𝔯𝔩𝔡',
    'double-struck': 'ℍ𝕖𝕝𝕝𝕠 𝕎𝕠𝕣𝕝𝕕',
    'monospace': '𝙷𝚎𝚕𝚕𝚘 𝚆𝚘𝚛𝚕𝚍',
    'sans-bold': '𝗛𝗲𝗹𝗹𝗼 𝗪𝗼𝗿𝗹𝗱',
    'circled': 'Ⓗⓔⓛⓛⓞ Ⓦⓞⓡⓛⓓ',
    'negative-circled': '🅗🅔🅛🅛🅞 🅦🅞🅡🅛🅓',
    'squared': '🄷🄴🄻🄻🄾 🅆🄾🅁🄻🄳',
    'small-caps': 'ʜᴇʟʟᴏ ᴡᴏʀʟᴅ',
    'fullwidth': 'Ｈｅｌｌｏ　Ｗｏｒｌｄ',
    'upside-down': 'plɹoM ollǝH',
    'strikethrough': 'H̶e̶l̶l̶o̶ ̶W̶o̶r̶l̶d̶',
    'underline': 'H̲e̲l̲l̲o̲ ̲W̲o̲r̲l̲d̲',
    'superscript': 'ᴴᵉˡˡᵒ ᵂᵒʳˡᵈ',
  };
  for (const [id, expected] of Object.entries(HW)) {
    const r = TD.convert('Hello World', id);
    ok(!r.error && r.text === expected, `core: Hello World -> ${id} is exactly ${JSON.stringify(expected)}`);
  }
  // Exception capitals: script B/H, fraktur C/H, double-struck C/H live outside their blocks.
  ok(TD.convert('ABC xyz 09', 'script').text === '𝒜ℬ𝒞 𝓍𝓎𝓏 09', 'core script: B is ℬ (U+212C), digits unchanged');
  ok(TD.convert('ABC xyz 09', 'fraktur').text === '𝔄𝔅ℭ 𝔵𝔶𝔷 09', 'core fraktur: C is ℭ (U+212D), digits unchanged');
  ok(TD.convert('ABC xyz 09', 'double-struck').text === '𝔸𝔹ℂ 𝕩𝕪𝕫 𝟘𝟡', 'core double-struck: C is ℂ (U+2102), digits are 𝟘𝟡');
  ok(TD.convert('ABC xyz 09', 'bold').text === '𝐀𝐁𝐂 𝐱𝐲𝐳 𝟎𝟗', 'core bold: digits are 𝟎𝟗');
  ok(TD.convert('ABC xyz 09', 'monospace').text === '𝙰𝙱𝙲 𝚡𝚢𝚣 𝟶𝟿', 'core monospace: digits are 𝟶𝟿');
  ok(TD.convert('ABC xyz 09', 'sans-bold').text === '𝗔𝗕𝗖 𝘅𝘆𝘇 𝟬𝟵', 'core sans-bold: digits are 𝟬𝟵');
  ok(TD.convert('ABC xyz 09', 'circled').text === 'ⒶⒷⒸ ⓧⓨⓩ ⓪⑨', 'core circled: 0 is ⓪ (U+24EA), 9 is ⑨ (U+2468)');
  ok(TD.convert('ABC xyz 09', 'negative-circled').text === '🅐🅑🅒 🅧🅨🅩 ⓿❾', 'core negative-circled: lowercase maps to capitals, 0 is ⓿, 9 is ❾');
  ok(TD.convert('ABC xyz 09', 'squared').text === '🄰🄱🄲 🅇🅈🅉 09', 'core squared: lowercase maps to capitals, digits unchanged');
  ok(TD.convert('ABC xyz 09', 'small-caps').text === 'ᴀʙᴄ xʏᴢ 09', 'core small-caps: x has no small cap and stays x, digits unchanged');
  ok(TD.convert('ABC xyz 09', 'fullwidth').text === 'ＡＢＣ　ｘｙｚ　０９', 'core fullwidth: spaces become U+3000, digits are fullwidth');
  ok(TD.convert('ABC xyz 09', 'upside-down').text === '60 zʎx Ↄᗺ∀', 'core upside-down: string is reversed and flipped (6<->9, C is Ↄ)');
  ok(TD.convert('ABC xyz 09', 'superscript').text === 'ᴬᴮᶜ ˣʸᶻ ⁰⁹', 'core superscript: C falls back to lowercase ᶜ, digits are superscripts');
  // Punctuation and accented letters pass through unchanged.
  ok(TD.convert('Hi! 123', 'bold').text === '𝐇𝐢! 𝟏𝟐𝟑', 'core bold: "!" passes through, digits convert');
  ok(TD.convert('Hi! 123', 'italic').text === '𝐻𝑖! 123', 'core italic: digits unchanged (no italic digits in Unicode)');
  ok(TD.convert('Hi! 123', 'upside-down').text === 'Ɛ21 !ᴉH', 'core upside-down: "Hi! 123" reverses to "Ɛ21 !ᴉH"');
  ok(TD.convert('café', 'bold').text === '𝐜𝐚𝐟é', 'core bold: accented é passes through unchanged');
  ok(TD.convert('café', 'upside-down').text === 'éɟɐɔ', 'core upside-down: é passes through, rest flips');
  ok(TD.convert('café', 'small-caps').text === 'ᴄᴀꜰé', 'core small-caps: é unchanged');
  // Combining styles: one combining char per character, spaces included, newlines kept clean.
  ok(TD.convert('ab', 'strikethrough').text === 'a̶b̶', 'core strikethrough: U+0336 after each char');
  ok(TD.convert('ab', 'underline').text === 'a̲b̲', 'core underline: U+0332 after each char');
  ok(TD.convert('a\nb', 'strikethrough').text === 'a̶\nb̶', 'core strikethrough: newline is NOT struck');
  // Empty, unknown style, over-limit.
  ok(TD.convert('', 'bold').text === '', 'core: empty input -> empty output');
  ok(TD.convert('Hi', 'nope').error === 'Unknown style.', 'core: unknown style id returns an error');
  ok(TD.convert('x'.repeat(1001), 'bold').error === 'Keep it under 1,000 characters.', 'core: 1001 chars is over the limit');
  ok(!TD.convert('x'.repeat(1000), 'bold').error, 'core: exactly 1000 chars is allowed');
  // convertAll returns all 18 rows in style order.
  const all = TD.convertAll('Hi');
  ok(!all.error && all.rows.length === 18, 'core convertAll: 18 rows');
  ok(all.rows[0].id === 'bold' && all.rows[0].text === '𝐇𝐢' && all.rows[17].id === 'superscript' && all.rows[17].text === 'ᴴⁱ', 'core convertAll: first row bold, last row superscript');
  ok(all.rows.every((r, i) => r.id === TD.STYLES[i].id && r.name === TD.STYLES[i].name), 'core convertAll: rows follow STYLES order and names');
  ok(TD.convertAll('x'.repeat(1001)).error === 'Keep it under 1,000 characters.', 'core convertAll: over-limit input returns an error');
  dom.window.close();
}

console.log('FANCY UI');
{
  const dom = await loadPage('fancy-text-generator/');
  const w = dom.window;
  // Defaults on load: sample input, all 18 styles rendered.
  ok(w.document.querySelector('#text-in').value === 'Hello World', 'UI defaults: sample input pre-filled');
  ok(w.document.querySelectorAll('.style-row').length === 18, 'UI defaults: 18 style rows rendered');
  ok(w.document.querySelectorAll('[data-copy]').length === 18, 'UI defaults: 18 copy buttons, one per style');
  ok(w.document.querySelector('#out-bold').textContent === '𝐇𝐞𝐥𝐥𝐨 𝐖𝐨𝐫𝐥𝐝', 'UI defaults: bold output rendered on load');
  ok(w.document.querySelector('#out-script').textContent === 'ℋ𝒺𝓁𝓁𝓄 𝒲𝓄𝓇𝓁𝒹', 'UI defaults: script output rendered on load');
  ok(w.document.querySelector('#out-upside-down').textContent === 'plɹoM ollǝH', 'UI defaults: upside-down output rendered on load');
  ok(w.document.querySelector('#st-chars').textContent === '11' && w.document.querySelector('#st-words').textContent === '2' && w.document.querySelector('#st-styles').textContent === '18', 'UI defaults: stats 11 chars / 2 words / 18 styles');
  ok(w.document.querySelector('#text-msg').textContent === '18 styles ready — copy any style, or download them all as a text file.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI defaults: visible success message');
  // Typing updates all styles live.
  setVal(w, '#text-in', 'ABC');
  ok(w.document.querySelector('#out-bold').textContent === '𝐀𝐁𝐂', 'UI live update: bold shows 𝐀𝐁𝐂');
  ok(w.document.querySelector('#out-script').textContent === '𝒜ℬ𝒞', 'UI live update: script shows 𝒜ℬ𝒞');
  ok(w.document.querySelector('#out-fraktur').textContent === '𝔄𝔅ℭ', 'UI live update: fraktur shows 𝔄𝔅ℭ');
  ok(w.document.querySelector('#out-fullwidth').textContent === 'ＡＢＣ', 'UI live update: fullwidth shows ＡＢＣ');
  ok(w.document.querySelector('#st-chars').textContent === '3' && w.document.querySelector('#st-words').textContent === '1', 'UI live update: stats 3 chars / 1 word');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('[data-copy="bold"]').click();
  await sleep(80);
  ok(copied === '𝐀𝐁𝐂' && w.document.querySelector('#text-msg').textContent === 'Copied the Bold style to the clipboard.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI copy writes the bold style to the clipboard and shows a visible success message');
  w.document.querySelector('[data-copy="script"]').click();
  await sleep(80);
  ok(copied === '𝒜ℬ𝒞' && w.document.querySelector('#text-msg').textContent === 'Copied the Script style to the clipboard.', 'UI copy: script button copies the script style');
  // A clipboard promise that never settles must still give feedback within ~1.5s.
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: () => new Promise(() => {}) }, configurable: true });
  w.document.querySelector('#text-msg').textContent = '';
  w.document.querySelector('[data-copy="bold"]').click();
  await sleep(1800);
  ok(w.document.querySelector('#text-msg').textContent === 'Could not copy automatically — select the text and copy it manually.' && w.document.querySelector('#text-msg').className === 'msg err', 'UI copy with a hung clipboard promise falls back to a visible message instead of staying silent');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'fancy-text.txt', 'UI download link points at blob with fancy-text.txt name');
  ok(w.document.querySelector('#text-msg').textContent === 'Downloaded fancy-text.txt with all 18 styles.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI download shows a visible success message');
  // Empty input errors and clears the outputs and stats.
  setVal(w, '#text-in', '');
  ok(w.document.querySelector('#out-bold').textContent === '' && w.document.querySelector('#out-script').textContent === '', 'UI empty input: style outputs cleared');
  ok(w.document.querySelector('#text-msg').textContent === 'Type something first — your fancy styles will appear below.' && w.document.querySelector('#text-msg').className === 'msg err', 'UI empty input: visible error message');
  ok(w.document.querySelector('#st-chars').textContent === '–' && w.document.querySelector('#st-words').textContent === '–' && w.document.querySelector('#st-styles').textContent === '–', 'UI empty input: stats reset to dashes');
  // Copy with no output errors instead of copying nothing.
  w.document.querySelector('[data-copy="bold"]').click();
  await sleep(80);
  ok(w.document.querySelector('#text-msg').textContent === 'Nothing to copy yet — type some text first.' && w.document.querySelector('#text-msg').className === 'msg err', 'UI copy with empty input: visible error, nothing copied');
  // Back to a valid value for the home-search check.
  setVal(w, '#text-in', 'Hello World');
  ok(w.document.querySelector('#out-bold').textContent === '𝐇𝐞𝐥𝐥𝐨 𝐖𝐨𝐫𝐥𝐝', 'UI valid value after error: styles regenerate');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'fancy');
  await sleep(200); // v2 filter animates hides over 150ms before adding .hidden
  let visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'https://toolsdaily.vercel.app/fancy-text-generator/', 'home search "fancy" finds the new tool');
  setVal(hw, '#tool-search', 'unicode');
  await sleep(200);
  visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'https://toolsdaily.vercel.app/fancy-text-generator/', 'home search "unicode" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-FANCY TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
