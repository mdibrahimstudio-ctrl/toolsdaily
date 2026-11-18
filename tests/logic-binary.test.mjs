// Logic + UI tests for the Binary / Text Converter tool (2026-11-15, 5-tools day).
// Drives the real page code through jsdom; core functions are window.TD_binary.
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
function setMode(win, decode) {
  const el = win.document.querySelector(decode ? '#mode-decode' : '#mode-encode');
  el.checked = true;
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

console.log('BINARY STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'binary-text-converter', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/binary-text-converter/">'), 'binary: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'binary: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'binary: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'binary: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'binary: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'binary: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Binary / Text Converter' && app.url === 'https://toolsdaily.vercel.app/binary-text-converter/' && app.offers.price === '0', 'binary: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `binary: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['base64-encoder-decoder', 'morse-code-translator', 'url-encoder-decoder', 'json-formatter', 'unit-converter'];
  ok((nav.match(/<li>/g) || []).length === related.length && related.every((s) => nav.includes(`href="../${s}/"`)), 'binary: More-tools nav links exactly its 5 related tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 65, 'sitemap.xml has 65 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/binary-text-converter/'), 'sitemap includes binary-text-converter');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card[\s"]/g) || []).length === 63, 'home has exactly 63 tool cards');
  ok(home.includes('/binary-text-converter/'), 'home cards + nav include binary-text-converter');
  ok(home.includes('Sixty-three handy tools'), 'home lead says Fifty-eight tools');
  ok(home.includes('Converters <span class="n">9</span>'), 'home Converters chip says 9');
  const convSec = home.match(/<section class="cat" id="converters"[\s\S]*?<\/section>/)[0];
  ok(convSec.includes('<span class="cat-n">9 tools</span>'), 'home Converters section says 9 tools');
  const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(llms.includes('browse all 63 free tools'), 'llms.txt says 63 tools');
  ok(llms.includes('https://toolsdaily.vercel.app/binary-text-converter/'), 'llms.txt lists binary-text-converter');
}

console.log('BINARY CORE');
{
  const dom = await loadPage('binary-text-converter/');
  const w = dom.window, TD = w.TD_binary;
  ok(TD && typeof TD.textToBinary === 'function' && typeof TD.binaryToText === 'function' && typeof TD.isValidBinary === 'function', 'TD_binary exposed');
  ok(TD.textToBinary('Hi').text === '01001000 01101001', 'core: "Hi" encodes to 01001000 01101001');
  ok(TD.textToBinary('A').text === '01000001', 'core: "A" encodes to 01000001');
  ok(TD.textToBinary('café').text === '01100011 01100001 01100110 11000011 10101001', 'core: "café" encodes with UTF-8 (é is two bytes)');
  ok(TD.textToBinary('Hi', '').text === '0100100001101001', 'core: no separator joins the bytes');
  ok(TD.textToBinary('Hi', '\n').text === '01001000\n01101001', 'core: newline separator puts each byte on its own line');
  ok(TD.textToBinary('').text === '', 'core: empty input encodes to empty output');
  ok(TD.binaryToText('01001000 01101001').text === 'Hi', 'core: spaced binary decodes to "Hi"');
  ok(TD.binaryToText('01000001').text === 'A', 'core: 01000001 decodes to "A"');
  ok(TD.binaryToText('11000011 10101001').text === 'é', 'core: two-byte UTF-8 decodes to "é"');
  ok(TD.binaryToText('').text === '', 'core: empty binary decodes to empty text');
  ok(TD.binaryToText('0100000').error === 'Binary input must have a number of bits that is a multiple of 8.', 'core: 7 bits rejected (not a multiple of 8)');
  ok(TD.binaryToText('0100000a').error === 'Binary input must contain only the digits 0 and 1.', 'core: letter in binary rejected');
  ok(TD.binaryToText('01000002').error === 'Binary input must contain only the digits 0 and 1.', 'core: digit 2 in binary rejected');
  ok(TD.binaryToText('11111111').error === 'Those bytes are not valid UTF-8 text.', 'core: 0xFF is not valid UTF-8');
  ok(TD.isValidBinary('01000001') === true, 'core isValidBinary: valid byte is true');
  ok(TD.isValidBinary('01000001 01100001') === true, 'core isValidBinary: spaced bytes are true');
  ok(TD.isValidBinary('0100000') === false, 'core isValidBinary: 7 bits is false');
  ok(TD.isValidBinary('0100000a') === false, 'core isValidBinary: letter is false');
  ok(TD.isValidBinary('') === true, 'core isValidBinary: empty input is true');
  dom.window.close();
}

console.log('BINARY UI');
{
  const dom = await loadPage('binary-text-converter/');
  const w = dom.window;
  // Defaults on load: "Hello" encoded with spaces.
  ok(w.document.querySelector('#text-in').value === 'Hello', 'UI defaults: sample input "Hello" pre-filled');
  ok(w.document.querySelector('#mode-encode').checked === true, 'UI defaults: Text-to-binary mode selected');
  ok(w.document.querySelector('#text-out').value === '01001000 01100101 01101100 01101100 01101111', 'UI defaults: "Hello" encoded on load');
  ok(w.document.querySelector('#st-in').textContent === '5' && w.document.querySelector('#st-out').textContent === '44' && w.document.querySelector('#st-bits').textContent === '40', 'UI defaults: stats 5 in / 44 out / 40 bits');
  ok(w.document.querySelector('#msg').textContent === 'Converted — copy it or download it as a .txt file.' && w.document.querySelector('#msg').className === 'msg ok', 'UI defaults: visible success message');
  // Typing converts live.
  setVal(w, '#text-in', 'Hi');
  ok(w.document.querySelector('#text-out').value === '01001000 01101001', 'UI live update: "Hi" encodes live');
  ok(w.document.querySelector('#st-in').textContent === '2' && w.document.querySelector('#st-out').textContent === '17' && w.document.querySelector('#st-bits').textContent === '16', 'UI live update: stats 2 in / 17 out / 16 bits');
  // No separator joins the bytes.
  setVal(w, '#sep', '');
  ok(w.document.querySelector('#text-out').value === '0100100001101001', 'UI separator: no separator joins the bytes');
  ok(w.document.querySelector('#st-out').textContent === '16', 'UI separator: output length drops to 16');
  // Back to spaces, then swap direction decodes the binary back.
  setVal(w, '#sep', ' ');
  w.document.querySelector('#btn-swap').click();
  ok(w.document.querySelector('#mode-decode').checked === true, 'UI swap: decode mode selected after swap');
  ok(w.document.querySelector('#text-in').value === '01001000 01101001', 'UI swap: binary moved into the input');
  ok(w.document.querySelector('#text-out').value === 'Hi', 'UI swap: binary decodes back to "Hi"');
  ok(w.document.querySelector('#st-in').textContent === '17' && w.document.querySelector('#st-out').textContent === '2' && w.document.querySelector('#st-bits').textContent === '16', 'UI swap: stats 17 in / 2 out / 16 bits');
  // Invalid binary errors and clears the output and stats.
  setVal(w, '#text-in', '0100000a');
  ok(w.document.querySelector('#text-out').value === '', 'UI invalid binary: output cleared');
  ok(w.document.querySelector('#msg').textContent === 'Binary input must contain only the digits 0 and 1.' && w.document.querySelector('#msg').className === 'msg err', 'UI invalid binary: visible error message');
  ok(w.document.querySelector('#st-in').textContent === '–' && w.document.querySelector('#st-out').textContent === '–' && w.document.querySelector('#st-bits').textContent === '–', 'UI invalid binary: stats reset to dashes');
  // Back to a valid value for copy and download.
  setMode(w, false);
  setVal(w, '#text-in', 'Hi');
  ok(w.document.querySelector('#text-out').value === '01001000 01101001', 'UI valid value after error: binary regenerates');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy-out').click();
  await sleep(80);
  ok(copied === '01001000 01101001' && w.document.querySelector('#msg').textContent === 'Copied the output to the clipboard.' && w.document.querySelector('#msg').className === 'msg ok', 'UI copy writes the binary to the clipboard and shows a visible success message');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'binary-output.txt', 'UI download link points at blob with binary-output.txt name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded binary-output.txt.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Empty input clears the output and shows a hint.
  setVal(w, '#text-in', '');
  ok(w.document.querySelector('#text-out').value === '', 'UI empty input: output cleared');
  ok(w.document.querySelector('#msg').textContent === 'Type something to convert it.', 'UI empty input: visible hint message');
  // Copy and download with no output error instead of acting on nothing.
  w.document.querySelector('#copy-out').click();
  await sleep(80);
  ok(w.document.querySelector('#msg').textContent === 'Nothing to copy yet — convert something first.' && w.document.querySelector('#msg').className === 'msg err', 'UI copy with empty input: visible error, nothing copied');
  w.document.querySelector('#download').click();
  ok(w.document.querySelector('#msg').textContent === 'Nothing to download yet — convert something first.' && w.document.querySelector('#msg').className === 'msg err', 'UI download with empty input: visible error, nothing downloaded');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'binary code');
  await sleep(200);
  let visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'https://toolsdaily.vercel.app/binary-text-converter/', 'home search "binary code" finds the new tool');
  setVal(hw, '#tool-search', 'ascii');
  await sleep(200);
  visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'https://toolsdaily.vercel.app/binary-text-converter/', 'home search "ascii" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-BINARY TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
