// Logic + UI tests for the Morse Code Translator tool (2026-11-10 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_morse.
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

console.log('MORSE STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'morse-code-translator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/morse-code-translator/">'), 'morse: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'morse: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'morse: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'morse: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'morse: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'morse: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Morse Code Translator' && app.url === 'https://toolsdaily.vercel.app/morse-code-translator/' && app.offers.price === '0', 'morse: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `morse: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator', 'qr-reader', 'background-remover', 'lorem-ipsum-generator', 'random-number-generator', 'tip-calculator', 'url-encoder-decoder', 'image-synthid-remover', 'remove-duplicate-lines', 'audio-transcriber'];
  ok(others.length === 28 && others.every((s) => html.includes(`href="../${s}/"`)), 'morse: More-tools nav links all other 28 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 33, 'sitemap.xml has 32 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/morse-code-translator/'), 'sitemap includes morse-code-translator');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 32, 'home has exactly 32 tool cards');
  ok(home.includes('href="morse-code-translator/"'), 'home cards + nav include morse-code-translator');
  ok(home.includes('Thirty-two handy tools'), 'home lead says Thirty-two tools');
}

console.log('MORSE CORE');
{
  const dom = await loadPage('morse-code-translator/');
  const w = dom.window, TD = w.TD_morse;
  ok(TD && typeof TD.textToMorse === 'function' && typeof TD.morseToText === 'function', 'TD_morse exposed');
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Encode basics.
  let r = TD.textToMorse('SOS');
  ok(r.morse === '... --- ...' && r.skipped === 0 && r.symbols === 9 && r.words === 1, 'core encode: SOS -> ... --- ... (9 symbols, 1 word)');
  r = TD.textToMorse('HELLO WORLD');
  ok(r.morse === '.... . .-.. .-.. --- / .-- --- .-. .-.. -..' && r.symbols === 32 && r.words === 2, 'core encode: HELLO WORLD with / word separator (32 symbols, 2 words)');
  r = TD.textToMorse('sos');
  ok(r.morse === '... --- ...', 'core encode: lowercase is uppercased first');
  r = TD.textToMorse('123');
  ok(r.morse === '.---- ..--- ...--' && r.symbols === 15, 'core encode: digits 123');
  r = TD.textToMorse('HI!');
  ok(r.morse === '.... .. -.-.--' && r.symbols === 12, 'core encode: punctuation ! -> -.-.--');
  r = TD.textToMorse('A?B@C');
  ok(r.morse === '.- ..--.. -... .--.-. -.-.', 'core encode: ? and @ are in the table');
  // Unknown characters are skipped and counted.
  r = TD.textToMorse('A#B');
  ok(r.morse === '.- -...' && r.skipped === 1 && r.symbols === 6, 'core encode: # has no Morse code, skipped and counted');
  r = TD.textToMorse('café');
  ok(r.morse === '-.-. .- ..-.' && r.skipped === 1, 'core encode: é skipped, café -> -.-. .- ..-.');
  // Word separator option.
  r = TD.textToMorse('HI THERE', { wordSep: 'spaces' });
  ok(r.morse === '.... ..   - .... . .-. .', 'core encode: three-space word separator option');
  r = TD.textToMorse('HI THERE', { wordSep: 'slash' });
  ok(r.morse === '.... .. / - .... . .-. .', 'core encode: slash word separator option');
  // Multiple spaces collapse to one word gap.
  r = TD.textToMorse('A  B');
  ok(r.morse === '.- / -...' && r.words === 2, 'core encode: double space still one word gap');
  // Empty input.
  r = TD.textToMorse('');
  ok(r.morse === '' && r.skipped === 0 && r.symbols === 0 && r.words === 0, 'core encode: empty input -> empty result');
  // Decode basics.
  let d = TD.morseToText('... --- ...');
  ok(d.text === 'SOS' && d.unknown === 0 && d.symbols === 9 && d.words === 1, 'core decode: ... --- ... -> SOS');
  d = TD.morseToText('.... . .-.. .-.. --- / .-- --- .-. .-.. -..');
  ok(d.text === 'HELLO WORLD' && d.symbols === 32 && d.words === 2, 'core decode: slash word separator -> HELLO WORLD');
  d = TD.morseToText('.... . .-.. .-.. ---   .-- --- .-. .-.. -..');
  ok(d.text === 'HELLO WORLD', 'core decode: three-space word separator also works');
  d = TD.morseToText('.---- ..--- ...--');
  ok(d.text === '123', 'core decode: digits back');
  // Unknown patterns become ? and are counted.
  d = TD.morseToText('... --- ... -.-.-');
  ok(d.text === 'SOS?' && d.unknown === 1, 'core decode: unknown pattern -.-.- -> ? (counted)');
  d = TD.morseToText('hello');
  ok(d.text === '?' && d.unknown === 1, 'core decode: non-Morse token -> ? (counted)');
  d = TD.morseToText('');
  ok(d.text === '' && d.unknown === 0 && d.symbols === 0 && d.words === 0, 'core decode: empty input -> empty result');
  // Round trip.
  const sentence = 'HELLO WORLD 123';
  const enc = TD.textToMorse(sentence);
  const dec = TD.morseToText(enc.morse);
  ok(dec.text === sentence, 'core round trip: HELLO WORLD 123 survives encode + decode');
  // isMorse detection.
  ok(TD.isMorse('... --- ...') === true, 'core isMorse: ... --- ... is Morse');
  ok(TD.isMorse('... --- ... / .... ..') === true, 'core isMorse: slash form is Morse');
  ok(TD.isMorse('hello') === false, 'core isMorse: plain text is not Morse');
  ok(TD.isMorse('') === false, 'core isMorse: empty is not Morse');
  ok(TD.isMorse('/') === false, 'core isMorse: slash alone is not Morse (needs a dot or dash)');
  ok(TD.isMorse('...123') === false, 'core isMorse: mixed digits are not Morse');
  // Timing: 20 WPM -> unit 60 ms (PARIS standard: 1200 / wpm).
  let ev = TD.morseTiming('...', 20);
  ok(ev.length === 5 && JSON.stringify(ev.map((e) => e.ms)) === '[60,60,60,60,60]', 'core timing: ... at 20 WPM = 5 events of 60 ms');
  ev = TD.morseTiming('... --- ...', 20);
  const total = ev.reduce((s, e) => s + e.ms, 0);
  ok(ev.length === 17 && total === 1620, 'core timing: SOS at 20 WPM = 17 events, 1620 ms total');
  ok(ev.filter((e) => e.type === 'dash').every((e) => e.ms === 180), 'core timing: dashes are 3 units (180 ms at 20 WPM)');
  ev = TD.morseTiming('... / ...', 20);
  ok(ev.length === 11 && ev.reduce((s, e) => s + e.ms, 0) === 1020 && ev.some((e) => e.type === 'gap' && e.ms === 420), 'core timing: word gap is 7 units (420 ms at 20 WPM)');
  ev = TD.morseTiming('...', 10);
  ok(ev.reduce((s, e) => s + e.ms, 0) === 600, 'core timing: ... at 10 WPM = 600 ms (unit doubles)');
  ev = TD.morseTiming('', 20);
  ok(eq(ev, []), 'core timing: empty Morse -> no events');
  ev = TD.morseTiming('... xyz', 20);
  ok(ev.length === 5, 'core timing: invalid tokens are skipped');
  dom.window.close();
}

console.log('MORSE UI');
{
  const dom = await loadPage('morse-code-translator/');
  const w = dom.window;
  // Defaults on load: SOS encoded.
  ok(w.document.querySelector('#text-in').value === 'SOS', 'UI defaults: sample input SOS pre-filled');
  ok(w.document.querySelector('#mode-encode').checked && !w.document.querySelector('#mode-decode').checked, 'UI defaults: Text → Morse mode');
  ok(w.document.querySelector('#text-out').value === '... --- ...', 'UI defaults: SOS translated on load');
  ok(w.document.querySelector('#st-in').textContent === '3' && w.document.querySelector('#st-out').textContent === '11' && w.document.querySelector('#st-symbols').textContent === '9' && w.document.querySelector('#st-words').textContent === '1', 'UI defaults: stats 3 / 11 / 9 / 1');
  ok(w.document.querySelector('#text-msg').textContent === 'Translated to Morse code.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI defaults: visible success message');
  ok(w.document.querySelector('#wpm').value === '20' && w.document.querySelector('#wpm-val').textContent === '20', 'UI defaults: 20 WPM');
  // Typing re-translates live.
  setVal(w, '#text-in', 'HI');
  ok(w.document.querySelector('#text-out').value === '.... ..', 'UI live: typing HI -> .... ..');
  ok(w.document.querySelector('#st-in').textContent === '2' && w.document.querySelector('#st-symbols').textContent === '6', 'UI live: stats update (2 chars, 6 symbols)');
  // Word separator option.
  setVal(w, '#text-in', 'HI THERE');
  w.document.querySelector('#word-sep').value = 'spaces';
  w.document.querySelector('#word-sep').dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.document.querySelector('#text-out').value === '.... ..   - .... . .-. .', 'UI word-sep: three spaces option re-encodes');
  w.document.querySelector('#word-sep').value = 'slash';
  w.document.querySelector('#word-sep').dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.document.querySelector('#text-out').value === '.... .. / - .... . .-. .', 'UI word-sep: slash option re-encodes');
  // Switch to decode mode.
  setVal(w, '#text-in', '... --- ...');
  w.document.querySelector('#mode-decode').click();
  ok(w.document.querySelector('#text-out').value === 'SOS', 'UI decode mode: ... --- ... -> SOS');
  ok(w.document.querySelector('#text-msg').textContent === 'Decoded from Morse code.', 'UI decode mode: message says decoded');
  // Unknown pattern in decode shows ?.
  setVal(w, '#text-in', '... --- ... -.-.-');
  ok(w.document.querySelector('#text-out').value === 'SOS?', 'UI decode: unknown pattern shown as ?');
  ok(w.document.querySelector('#text-msg').textContent.includes('1 pattern'), 'UI decode: message counts the unknown pattern');
  // Swap button: flips mode and moves the output into the input.
  w.document.querySelector('#btn-swap').click();
  ok(w.document.querySelector('#mode-encode').checked, 'UI swap: mode flips back to encode');
  ok(w.document.querySelector('#text-in').value === 'SOS?', 'UI swap: output moves into the input');
  ok(w.document.querySelector('#text-out').value === '... --- ... ..--..', 'UI swap: SOS? re-encodes, ? included as ..--..');
  ok(w.document.querySelector('#text-msg').textContent === 'Translated to Morse code.', 'UI swap: message is a plain success (nothing skipped)');
  // WPM slider updates its label.
  setVal(w, '#wpm', '10');
  ok(w.document.querySelector('#wpm-val').textContent === '10', 'UI WPM slider: label follows the slider');
  // Empty input errors and clears the output and stats.
  setVal(w, '#text-in', '');
  w.document.querySelector('#btn-convert').click();
  ok(w.document.querySelector('#text-out').value === '' && w.document.querySelector('#text-msg').textContent.length > 0 && w.document.querySelector('#text-msg').className === 'msg err', 'UI empty input: error shown and output cleared');
  ok(w.document.querySelector('#st-in').textContent === '–' && w.document.querySelector('#st-symbols').textContent === '–', 'UI empty input: stats reset to dashes');
  // Back to a valid value for copy/download/play.
  setVal(w, '#text-in', 'SOS');
  w.document.querySelector('#btn-convert').click();
  ok(w.document.querySelector('#text-out').value === '... --- ...', 'UI valid value after error: SOS again');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy-out').click();
  await sleep(80);
  ok(copied === '... --- ...' && w.document.querySelector('#text-msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI copy writes the result to the clipboard and shows a visible success message');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'morse-code.txt', 'UI download link points at blob with morse-code.txt name');
  ok(w.document.querySelector('#text-msg').textContent === 'Downloaded morse-code.txt.' && w.document.querySelector('#text-msg').className === 'msg ok', 'UI download shows a visible success message');
  // Play with no AudioContext (jsdom) gives a clear error instead of crashing.
  w.document.querySelector('#btn-play').click();
  ok(w.document.querySelector('#text-msg').textContent === 'Audio playback is not supported in this browser.' && w.document.querySelector('#text-msg').className === 'msg err', 'UI play without AudioContext: clear error, no crash');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'morse');
  let visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'morse-code-translator/', 'home search "morse" finds the new tool');
  setVal(hw, '#tool-search', 'telegraph');
  visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'morse-code-translator/', 'home search "telegraph" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-MORSE TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
