// Logic tests: real page code driven through jsdom with hand-computed expectations.
// Image/QR canvas pipelines use faithful stubs (jsdom has no canvas): the stubs verify
// page wiring, sizing math and size reporting; pixel output itself is code-reviewed only.
import { createRequire } from 'node:module';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadPage(path, beforeParse) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromURL(BASE + path, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse,
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 3000);
  });
  await sleep(120);
  return dom;
}
function setVal(win, sel, value) {
  const el = win.document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

/* ---------------- WORD COUNTER ---------------- */
console.log('WORD COUNTER');
{
  const dom = await loadPage('word-counter/');
  const w = dom.window, TD = w.TD_countText;
  ok(typeof TD === 'function', 'TD_countText exposed');
  const t1 = 'One two three.\n\nFour five.';
  const r1 = TD(t1);
  ok(r1.words === 5, 'words: "One two three. / Four five." = 5');
  ok(r1.chars === 26, 'chars = 26 (hand-counted incl. newlines)');
  ok(r1.charsNoSpaces === 21, 'chars without spaces = 21 (hand-counted)');
  ok(r1.sentences === 2, 'sentences = 2');
  ok(r1.paragraphs === 2, 'paragraphs = 2');
  ok(r1.readingTime === '< 1 min read', 'reading time for 5 words = "< 1 min read"');
  const t2 = Array(200).fill('word').join(' ');
  ok(TD(t2).words === 200 && TD(t2).readingTime === '1 min read', '200 words -> exactly "1 min read"');
  ok(TD('').words === 0 && TD('').sentences === 0 && TD('').paragraphs === 0, 'empty text -> all zeros');
  const fox = 'The quick brown fox jumps over the lazy dog. It is a classic sentence!';
  ok(TD(fox).words === 14, 'fox paragraph = 14 words (hand-counted)');
  ok(TD(fox).sentences === 2, 'fox paragraph = 2 sentences');
  setVal(w, '#text', t1);
  ok(w.document.querySelector('#c-words').textContent === '5', 'UI updates word count live');
  setVal(w, '#text', 'a  b   c');
  w.document.querySelector('#clean').click();
  ok(w.document.querySelector('#text').value === 'a b c', 'cleanup button collapses extra spaces');
  dom.window.close();
}

/* ---------------- PASSWORD GENERATOR ---------------- */
console.log('PASSWORD GENERATOR');
{
  const dom = await loadPage('password-generator/');
  const w = dom.window, TD = w.TD_genPassword;
  ok(typeof TD === 'function', 'TD_genPassword exposed');
  ok(typeof w.crypto.getRandomValues === 'function', 'crypto.getRandomValues available (secure RNG)');
  const SYM = '!@#$%^&*()-_=+[]{};:,.<>?';
  let allOk = true, setsOk = true;
  for (let i = 0; i < 200; i++) {
    const r = TD({ length: 20, upper: true, numbers: true, symbols: true });
    if (r.password.length !== 20) allOk = false;
    if (!/^[A-Za-z0-9!@#$%^&*()\-_=+\[\]{};:,.<>?]+$/.test(r.password)) allOk = false;
    if (!(/[a-z]/.test(r.password) && /[A-Z]/.test(r.password) && /[0-9]/.test(r.password) && [...r.password].some((c) => SYM.includes(c)))) setsOk = false;
  }
  ok(allOk, '200 samples: length 20 and only allowed characters');
  ok(setsOk, '200 samples: every enabled character set appears at least once');
  let lowerOk = true;
  for (let i = 0; i < 200; i++) {
    const r = TD({ length: 12, upper: false, numbers: false, symbols: false });
    if (!/^[a-z]{12}$/.test(r.password)) lowerOk = false;
  }
  ok(lowerOk, 'all toggles off -> 200 samples are 12 lowercase letters only');
  let noSym = true;
  for (let i = 0; i < 100; i++) {
    const r = TD({ length: 16, upper: true, numbers: true, symbols: false });
    if ([...r.password].some((c) => SYM.includes(c))) noSym = false;
  }
  ok(noSym, 'symbols off -> no symbol characters in 100 samples');
  ok(TD({ length: 8, upper: false, numbers: false, symbols: false }).strength === 'Weak', 'strength: 8 lowercase-only = Weak (~38 bits)');
  ok(TD({ length: 16, upper: true, numbers: true, symbols: true }).strength === 'Excellent', 'strength: 16 all-sets = Excellent (~103 bits)');
  ok(w.document.querySelector('#pwd').value.length === 16, 'UI generates a 16-char password on load');
  w.document.querySelector('#gen').click();
  ok(w.document.querySelector('#pwd').value.length === 16, 'Generate button produces a new 16-char password');
  dom.window.close();
}

/* ---------------- AGE CALCULATOR ---------------- */
console.log('AGE CALCULATOR');
{
  const dom = await loadPage('age-calculator/');
  const w = dom.window, TD = w.TD_age;
  const r = TD('2000-01-15', '2023-01-14');
  ok(r.years === 22 && r.months === 11 && r.days === 30, '2000-01-15 @ 2023-01-14 = 22y 11m 30d (hand-computed)');
  ok(r.totalDays === 8400, 'total days = 8400 (23 years incl. 6 leap days, minus 1)');
  ok(r.totalWeeks === 1200, 'total weeks = 1200');
  ok(r.nextBirthdayDays === 1, 'next birthday in 1 day');
  const b = TD('1990-05-05', '2023-05-05');
  ok(b.years === 33 && b.months === 0 && b.days === 0 && b.nextBirthdayDays === 0, 'exact birthday: 33y 0m 0d, countdown 0');
  ok(TD('', '2023-01-01').error !== undefined, 'empty DOB -> error');
  ok(TD('2030-01-01', '2023-01-01').error !== undefined, 'DOB after target date -> error');
  setVal(w, '#dob', '2000-01-15');
  setVal(w, '#at', '2023-01-14');
  w.document.querySelector('#calc').click();
  ok(w.document.querySelector('#r-ymd').textContent === '22y 11m 30d', 'UI shows 22y 11m 30d');
  ok(w.document.querySelector('#r-days').textContent === '8,400', 'UI shows total days 8,400');
  dom.window.close();
}

/* ---------------- UNIT CONVERTER ---------------- */
console.log('UNIT CONVERTER');
{
  const dom = await loadPage('unit-converter/');
  const w = dom.window, TD = w.TD_convert;
  ok(TD('length', 1, 'km', 'm') === 1000, '1 km = 1000 m');
  ok(TD('temperature', 100, 'C', 'F') === 212, '100 °C = 212 °F');
  ok(TD('temperature', 32, 'F', 'C') === 0, '32 °F = 0 °C');
  ok(TD('temperature', 0, 'C', 'K') === 273.15, '0 °C = 273.15 K');
  ok(approx(TD('weight', 1, 'kg', 'lb'), 2.2046226218, 1e-6), '1 kg = 2.20462 lb (±1e-6)');
  ok(approx(TD('length', 1, 'mi', 'km'), 1.609344, 1e-9), '1 mile = 1.609344 km');
  ok(approx(TD('length', 12, 'in', 'ft'), 1, 1e-9), '12 in = 1 ft');
  ok(approx(TD('weight', 16, 'oz', 'lb'), 1, 1e-9), '16 oz = 1 lb');
  ok(w.document.querySelector('#result').textContent === '1 km = 1000 m', 'UI default shows "1 km = 1000 m"');
  setVal(w, '#val', '5');
  ok(w.document.querySelector('#result').textContent === '5 km = 5000 m', 'UI live-updates on input');
  w.document.querySelector('#swap').click();
  ok(w.document.querySelector('#from').value === 'm' && w.document.querySelector('#to').value === 'km', 'swap button exchanges units');
  dom.window.close();
}

/* ---------------- COLOR CONVERTER ---------------- */
console.log('COLOR CONVERTER');
{
  const dom = await loadPage('color-converter/');
  const w = dom.window, TD = w.TD_color;
  ok(eq(TD('#FF0000'), { rgb: [255, 0, 0], hsl: [0, 100, 50], hsv: [0, 100, 100] }), '#FF0000 -> rgb(255,0,0), hsl(0,100%,50%), hsv(0,100%,100%)');
  ok(eq(TD('#00FF00').hsl, [120, 100, 50]), '#00FF00 -> hsl(120, 100%, 50%)');
  ok(eq(TD('#0000FF').hsl, [240, 100, 50]), '#0000FF -> hsl(240, 100%, 50%)');
  ok(eq(TD('#FFFFFF'), { rgb: [255, 255, 255], hsl: [0, 0, 100], hsv: [0, 0, 100] }), '#FFFFFF -> white in all formats');
  ok(eq(TD('#000000').hsl, [0, 0, 0]), '#000000 -> hsl(0, 0%, 0%)');
  ok(eq(TD('#F00').rgb, [255, 0, 0]), '3-digit #F00 expands to red');
  ok(TD('#ZZZZZZ') === null && TD('not-a-color') === null, 'invalid HEX returns null');
  setVal(w, '#hex', '#00FF00');
  ok(w.document.querySelector('#v-rgb').textContent === 'rgb(0, 255, 0)', 'UI: typing HEX updates RGB output');
  ok(w.document.querySelector('#v-hsl').textContent === 'hsl(120, 100%, 50%)', 'UI: HSL output correct');
  setVal(w, '#hex', '#ZZZ');
  ok(w.document.querySelector('#msg').className.includes('err'), 'UI: invalid HEX shows an error message');
  dom.window.close();
}

/* ---------------- TEXT CASE CONVERTER ---------------- */
console.log('TEXT CASE CONVERTER');
{
  const dom = await loadPage('text-case-converter/');
  const w = dom.window, TD = w.TD_case;
  const s = 'hello world. this is fine.';
  ok(TD(s, 'upper') === 'HELLO WORLD. THIS IS FINE.', 'UPPERCASE transform');
  ok(TD('HELLO WORLD', 'lower') === 'hello world', 'lowercase transform');
  ok(TD(s, 'title') === 'Hello World. This Is Fine.', 'Title Case transform');
  ok(TD('HELLO WORLD. THIS IS FINE.', 'sentence') === 'Hello world. This is fine.', 'Sentence case fixes all-caps text');
  ok(TD('abcd', 'alt') === 'AbCd', 'aLtErNaTiNg starts uppercase and alternates per letter');
  ok(TD('abc def', 'reverse') === 'fed cba', 'reverse text');
  setVal(w, '#text', 'make me loud');
  w.document.querySelector('[data-case="upper"]').click();
  ok(w.document.querySelector('#text').value === 'MAKE ME LOUD', 'UI: UPPERCASE button transforms textarea');
  dom.window.close();
}

/* ---------------- JSON FORMATTER ---------------- */
console.log('JSON FORMATTER');
{
  const dom = await loadPage('json-formatter/');
  const w = dom.window, TD = w.TD_json;
  ok(TD.format('{"a":1}', 2) === '{\n  "a": 1\n}', 'format with 2 spaces (hardcoded expectation)');
  ok(TD.format('{"a":1}', 4) === '{\n    "a": 1\n}', 'format with 4 spaces');
  ok(TD.minify('{\n  "a": 1, "b": [1, 2]\n}') === '{"a":1,"b":[1,2]}', 'minify removes all insignificant whitespace');
  let threw = false;
  try { TD.format('{bad json', 2); } catch (e) { threw = true; }
  ok(threw, 'invalid JSON throws on format');
  setVal(w, '#json-in', '{"x":[3,2,1]}');
  w.document.querySelector('#fmt').click();
  ok(w.document.querySelector('#json-out').value === '{\n  "x": [\n    3,\n    2,\n    1\n  ]\n}', 'UI: Format button pretty-prints');
  ok(w.document.querySelector('#msg').className.includes('ok'), 'UI: success message after format');
  setVal(w, '#json-in', '{bad json');
  w.document.querySelector('#validate').click();
  const msg = w.document.querySelector('#msg');
  ok(msg.className.includes('err') && msg.textContent.startsWith('Invalid JSON:'), 'UI: invalid JSON shows "Invalid JSON: …" error');
  setVal(w, '#json-in', '{"ok":true}');
  w.document.querySelector('#validate').click();
  ok(w.document.querySelector('#msg').textContent.includes('Valid JSON'), 'UI: valid JSON passes validation');
  dom.window.close();
}

/* ---------------- QR GENERATOR ---------------- */
console.log('QR GENERATOR');
{
  const dom = await loadPage('qr-generator/', (win) => {
    // jsdom has no canvas: stub 2D context + toDataURL + anchor click to verify the PNG path wiring.
    win.__rects = 0;
    win.HTMLCanvasElement.prototype.getContext = function () {
      return { fillStyle: '', fillRect: () => { win.__rects++; } };
    };
    win.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,AAAA'; };
    win.HTMLAnchorElement.prototype.click = function () { win.__dl = { href: this.href, download: this.download }; };
  });
  const w = dom.window;
  ok(typeof w.qrcode === 'function', 'vendored qrcode library loaded from local file');
  ok(typeof w.TD_buildQR === 'function', 'TD_buildQR exposed');
  const qr = w.TD_buildQR('HELLO');
  ok(qr.getModuleCount() === 21, '"HELLO" -> version 1 QR = 21×21 modules');
  const qr2 = w.TD_buildQR('https://example.com/some/longer/link?x=1234567890');
  ok(qr2.getModuleCount() > 21 && (qr2.getModuleCount() - 21) % 4 === 0, 'longer text -> larger valid module count (21 + 4k)');
  const svgHost = w.document.querySelector('#qr-out');
  ok(svgHost.querySelector('svg') !== null, 'page renders an SVG QR on load for the default text');
  ok(w.document.querySelector('#dl-png').disabled === false, 'Download PNG enabled after generation');
  // PNG path: dark modules drawn + background = rects; download anchor gets a data URL
  const before = w.__rects;
  w.document.querySelector('#dl-png').click();
  let dark = 0; const n = w.TD_buildQR('https://example.com').getModuleCount();
  const q3 = w.TD_buildQR('https://example.com');
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q3.isDark(r, c)) dark++;
  ok(w.__rects - before === dark + 1, 'PNG path draws background + every dark module to canvas');
  ok(w.__dl && w.__dl.download === 'qrcode.png' && String(w.__dl.href).startsWith('data:image/png'), 'PNG download anchor built with data URL + filename');
  setVal(w, '#qr-text', '');
  ok(w.document.querySelector('#dl-png').disabled === true, 'empty text disables download and errors');
  dom.window.close();
}

/* ---------------- IMAGE TOOLS (stubbed canvas/Image) ---------------- */
function stubImageEnv(win) {
  win.__lastCanvas = null;
  win.URL.createObjectURL = () => 'blob:fake';
  win.URL.revokeObjectURL = () => {};
  win.HTMLCanvasElement.prototype.getContext = function () { return { drawImage: () => {}, fillRect: () => {}, fillStyle: '' }; };
  win.HTMLCanvasElement.prototype.toBlob = function (cb) {
    win.__lastCanvas = { w: this.width, h: this.height };
    cb(new win.Blob(['x'.repeat(2000)], { type: 'image/jpeg' }));
  };
  win.Image = class {
    set src(v) { const self = this; setTimeout(() => { if (self.onload) self.onload(); }, 0); }
    get naturalWidth() { return 2000; }
    get naturalHeight() { return 1000; }
  };
}
console.log('IMAGE COMPRESSOR');
{
  const dom = await loadPage('image-compressor/', stubImageEnv);
  const w = dom.window;
  ok(w.TD_formatBytes(0) === '0 B' && w.TD_formatBytes(1024) === '1.00 KB' && w.TD_formatBytes(5000) === '4.88 KB', 'formatBytes: 0 B / 1.00 KB / 4.88 KB');
  const input = w.document.querySelector('#file');
  Object.defineProperty(input, 'files', { value: [{ name: 'note.txt', type: 'text/plain', size: 100 }], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.document.querySelector('#msg').className.includes('err'), 'non-image file is rejected with an error');
  ok(w.document.querySelector('#compress').disabled === true, 'compress stays disabled for non-image');
  Object.defineProperty(input, 'files', { value: [{ name: 'photo.png', type: 'image/png', size: 5000 }], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.document.querySelector('#compress').disabled === false, 'image file enables Compress');
  setVal(w, '#maxw', '1000');
  w.document.querySelector('#compress').click();
  await sleep(80);
  ok(w.__lastCanvas && w.__lastCanvas.w === 1000 && w.__lastCanvas.h === 500, 'max-width 1000 scales 2000×1000 canvas to 1000×500');
  ok(w.document.querySelector('#orig-size').textContent === '4.88 KB', 'original size shown (5000 B -> 4.88 KB)');
  ok(w.document.querySelector('#comp-size').textContent === '1.95 KB', 'compressed size shown (2000 B stub -> 1.95 KB)');
  ok(w.document.querySelector('#ratio').textContent === '60% smaller', 'saving ratio = 60% smaller');
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'compressed.jpg', 'download link points at blob with .jpg name');
  dom.window.close();
}
console.log('IMAGE CONVERTER');
{
  const dom = await loadPage('image-converter/', stubImageEnv);
  const w = dom.window;
  ok(w.TD_formatBytes(1048576) === '1.00 MB', 'formatBytes: 1 MiB = 1.00 MB');
  const input = w.document.querySelector('#file');
  Object.defineProperty(input, 'files', { value: [{ name: 'pic.webp', type: 'image/webp', size: 4000 }], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.document.querySelector('#convert').disabled === false, 'image file enables Convert');
  w.document.querySelector('#convert').click();
  await sleep(80);
  ok(w.document.querySelector('#out-size').textContent === '1.95 KB', 'converted size shown from canvas blob');
  ok(w.document.querySelector('#out-dims').textContent === '2000 × 1000', 'dimensions shown from source image');
  ok(w.document.querySelector('#dl').getAttribute('download') === 'converted.png', 'default output name is converted.png');
  setVal(w, '#format', 'image/jpeg');
  w.document.querySelector('#convert').click();
  await sleep(80);
  ok(w.document.querySelector('#dl').getAttribute('download') === 'converted.jpg', 'JPEG target -> converted.jpg');
  dom.window.close();
}

/* ---------------- HOME SEARCH ---------------- */
console.log('HOME');
{
  const dom = await loadPage('');
  const w = dom.window;
  ok(w.document.querySelectorAll('.tool-card').length === 24, 'home lists exactly 24 tool cards');
  setVal(w, '#tool-search', 'password');
  const visible = [...w.document.querySelectorAll('.tool-card')].filter((c) => !c.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'password-generator/', 'search "password" filters to 1 card');
  setVal(w, '#tool-search', 'zzzz');
  ok(!w.document.querySelector('#no-results').classList.contains('hidden'), 'no-match search shows the empty note');
  setVal(w, '#tool-search', '');
  ok([...w.document.querySelectorAll('.tool-card')].every((c) => !c.classList.contains('hidden')), 'clearing search restores all cards');
  dom.window.close();
}

console.log(`\nLOGIC TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
