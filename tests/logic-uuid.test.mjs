// Logic + UI tests for the UUID Generator tool (2026-11-11 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_uuid.
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

console.log('UUID STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'uuid-generator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/uuid-generator/">'), 'uuid: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'uuid: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'uuid: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'uuid: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'uuid: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'uuid: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'UUID Generator' && app.url === 'https://toolsdaily.vercel.app/uuid-generator/' && app.offers.price === '0', 'uuid: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `uuid: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator', 'qr-reader', 'background-remover', 'lorem-ipsum-generator', 'random-number-generator', 'tip-calculator', 'url-encoder-decoder', 'image-synthid-remover', 'remove-duplicate-lines', 'audio-transcriber', 'morse-code-translator'];
  ok(others.length === 29 && others.every((s) => html.includes(`href="../${s}/"`)), 'uuid: More-tools nav links all other 29 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 33, 'sitemap.xml has 32 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/uuid-generator/'), 'sitemap includes uuid-generator');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 32, 'home has exactly 32 tool cards');
  ok(home.includes('href="uuid-generator/"'), 'home cards + nav include uuid-generator');
  ok(home.includes('Thirty-two handy tools'), 'home lead says Thirty-two tools');
}

console.log('UUID CORE');
{
  const dom = await loadPage('uuid-generator/');
  const w = dom.window, TD = w.TD_uuid;
  ok(TD && typeof TD.generateV4 === 'function' && typeof TD.generateV1 === 'function' && typeof TD.validateUUID === 'function', 'TD_uuid exposed');
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  // Deterministic v4: seeded bytes 0..15 -> version/variant bits forced.
  const seeded = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = i; return b; };
  let v4 = TD.generateV4(seeded);
  ok(v4 === '00010203-0405-4607-8809-0a0b0c0d0e0f', 'core v4: seeded bytes 0..15 -> 00010203-0405-4607-8809-0a0b0c0d0e0f (version 4, variant 8)');
  ok(v4.charAt(14) === '4' && '89ab'.includes(v4.charAt(19)), 'core v4: version nibble 4, variant nibble 8 (RFC 4122)');
  // Real v4: format + version/variant hold for random output.
  v4 = TD.generateV4();
  ok(UUID_RE.test(v4) && v4.charAt(14) === '4' && '89ab'.includes(v4.charAt(19)), 'core v4: random output matches UUID format, version 4, RFC 4122 variant');
  // Deterministic v1: Unix epoch, clockSeq 0x1234, node 01:02:03:04:05:06.
  const node = new Uint8Array([1, 2, 3, 4, 5, 6]);
  let v1 = TD.generateV1({ nowMs: 0, clockSeq: 0x1234, node });
  ok(v1 === '13814000-1dd2-11b2-9234-010203040506', 'core v1: epoch + cs 0x1234 -> 13814000-1dd2-11b2-9234-010203040506');
  v1 = TD.generateV1({ nowMs: 1700000000000, clockSeq: 0x1234, node });
  ok(v1 === '04afc000-833b-11ee-9234-010203040506', 'core v1: 2023-11-14 22:13:20 UTC -> 04afc000-833b-11ee-9234-010203040506');
  ok(v1.charAt(14) === '1' && '89ab'.includes(v1.charAt(19)), 'core v1: version nibble 1, RFC 4122 variant');
  // Same instant + same clockSeq + same node, different 100-ns tick -> different UUIDs.
  const a = TD.generateV1({ ts100: 122192928000000000n, clockSeq: 0x1234, node });
  const b = TD.generateV1({ ts100: 122192928000000001n, clockSeq: 0x1234, node });
  ok(a !== b && a.slice(0, 8) !== b.slice(0, 8), 'core v1: +1 tick at the same instant changes the UUID');
  // Bulk v4 with a counter-based deterministic source: all valid, all unique.
  let calls = 0;
  const counterRand = (n) => { const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = (calls * 16 + i) % 256; calls++; return out; };
  let bulk = TD.generateBulk({ version: 'v4', count: 10, rand: counterRand });
  ok(bulk.uuids.length === 10 && bulk.count === 10 && bulk.unique === 10 && bulk.version === 4, 'core bulk v4: 10 requested -> 10 generated, 10 unique, version 4');
  ok(bulk.uuids.every((u) => UUID_RE.test(u) && u.charAt(14) === '4'), 'core bulk v4: every UUID matches the format with version 4');
  // Bulk v1: unique even at the same instant (timestamp ticks per item).
  bulk = TD.generateBulk({ version: 'v1', count: 5, nowMs: 1700000000000, clockSeq: 0x1234, node });
  ok(bulk.uuids.length === 5 && bulk.unique === 5 && bulk.version === 1, 'core bulk v1: 5 at one instant -> 5 unique, version 1');
  ok(bulk.uuids.every((u) => UUID_RE.test(u) && u.charAt(14) === '1'), 'core bulk v1: every UUID is a valid v1');
  ok(new Set(bulk.uuids.map((u) => u.slice(24))).size === 1, 'core bulk v1: same node shared across the batch');
  // Count clamping.
  ok(TD.generateBulk({ count: 0 }).count === 1, 'core bulk: count 0 clamps to 1');
  ok(TD.generateBulk({ count: 5000 }).count === 1000, 'core bulk: count 5000 clamps to 1000');
  ok(TD.generateBulk({ count: NaN }).count === 5, 'core bulk: count NaN defaults to 5');
  ok(TD.generateBulk({}).version === 4, 'core bulk: default version is v4');
  // Formatting.
  const sample = '550e8400-e29b-41d4-a716-446655440000';
  ok(TD.formatUUID(sample, {}) === sample, 'core format: default keeps the canonical form');
  ok(TD.formatUUID(sample, { uppercase: true }) === '550E8400-E29B-41D4-A716-446655440000', 'core format: uppercase option');
  ok(TD.formatUUID(sample, { noHyphens: true }) === '550e8400e29b41d4a716446655440000', 'core format: no-hyphens option (32 digits)');
  ok(TD.formatUUID(sample, { braces: true }) === '{550e8400-e29b-41d4-a716-446655440000}', 'core format: braces option');
  ok(TD.formatUUID(sample, { uppercase: true, noHyphens: true, braces: true }) === '{550E8400E29B41D4A716446655440000}', 'core format: all three options combine');
  // Joining.
  ok(TD.joinUUIDs(['a', 'b'], 'newline') === 'a\nb', 'core join: newline separator');
  ok(TD.joinUUIDs(['a', 'b'], 'comma') === 'a, b', 'core join: comma separator');
  ok(TD.joinUUIDs([], 'newline') === '', 'core join: empty list -> empty string');
  // Validation.
  let chk = TD.validateUUID('550e8400-e29b-41d4-a716-446655440000');
  ok(chk.valid === true && chk.version === 4 && chk.variant === 'RFC 4122' && chk.nil === false && chk.normalized === '550e8400-e29b-41d4-a716-446655440000', 'core validate: known v4 UUID -> valid, version 4, RFC 4122');
  chk = TD.validateUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
  ok(chk.valid === true && chk.version === 1 && chk.variant === 'RFC 4122', 'core validate: known v1 UUID (DNS namespace) -> version 1');
  chk = TD.validateUUID('00000000-0000-0000-0000-000000000000');
  ok(chk.valid === true && chk.version === 0 && chk.nil === true, 'core validate: nil UUID -> valid, version 0, nil true');
  chk = TD.validateUUID('550E8400E29B41D4A716446655440000');
  ok(chk.valid === true && chk.normalized === '550e8400-e29b-41d4-a716-446655440000', 'core validate: bare 32-hex upper -> valid, normalized to hyphenated lowercase');
  chk = TD.validateUUID('{550e8400-e29b-41d4-a716-446655440000}');
  ok(chk.valid === true && chk.braced === true && chk.normalized === '550e8400-e29b-41d4-a716-446655440000', 'core validate: braced UUID -> valid, braced flagged');
  chk = TD.validateUUID('  550e8400-e29b-41d4-a716-446655440000  ');
  ok(chk.valid === true, 'core validate: surrounding whitespace is trimmed');
  chk = TD.validateUUID('6ba7b810-9dad-11d1-c0b4-00c04fd430c8');
  ok(chk.valid === true && chk.variant === 'Microsoft', 'core validate: variant nibble c -> Microsoft variant');
  chk = TD.validateUUID('6ba7b810-9dad-11d1-00b4-00c04fd430c8');
  ok(chk.valid === true && chk.variant === 'NCS', 'core validate: variant nibble 0 -> NCS variant');
  for (const bad of ['not-a-uuid', '550e8400-e29b-41d4-a716', '550e8400-e29b-41d4-a716-44665544000g', '', '550e8400-e29b-41d4-a716-446655440000-extra', '{550e8400-e29b-41d4-a716-446655440000']) {
    chk = TD.validateUUID(bad);
    ok(chk.valid === false && chk.version === null && chk.normalized === null, `core validate: ${JSON.stringify(bad)} is invalid`);
  }
  // Round trip: generated UUIDs validate as their own version.
  const gen = TD.generateBulk({ version: 'v4', count: 3 });
  ok(gen.uuids.every((u) => { const c = TD.validateUUID(u); return c.valid && c.version === 4; }), 'core round trip: generated v4 UUIDs validate as v4');
  const gen1 = TD.generateBulk({ version: 'v1', count: 3 });
  ok(gen1.uuids.every((u) => { const c = TD.validateUUID(u); return c.valid && c.version === 1; }), 'core round trip: generated v1 UUIDs validate as v1');
  dom.window.close();
}

console.log('UUID UI');
{
  const dom = await loadPage('uuid-generator/');
  const w = dom.window;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const outLines = () => w.document.querySelector('#output').value.split('\n').filter((l) => l.length > 0);
  // Defaults on load: 5 v4 UUIDs.
  ok(w.document.querySelector('#uuid-version-v4').checked && !w.document.querySelector('#uuid-version-v1').checked, 'UI defaults: v4 selected');
  ok(w.document.querySelector('#uuid-count').value === '5', 'UI defaults: count 5');
  ok(outLines().length === 5 && outLines().every((u) => UUID_RE.test(u) && u.charAt(14) === '4'), 'UI defaults: 5 valid v4 UUIDs generated on load');
  ok(w.document.querySelector('#st-count').textContent === '5' && w.document.querySelector('#st-unique').textContent === '5' && w.document.querySelector('#st-version').textContent === 'v4', 'UI defaults: stats 5 / 5 / v4');
  ok(w.document.querySelector('#uuid-msg').textContent === 'Generated 5 UUIDs (version 4).' && w.document.querySelector('#uuid-msg').className === 'msg ok', 'UI defaults: visible success message');
  // Count change regenerates live.
  setVal(w, '#uuid-count', '3');
  ok(outLines().length === 3 && w.document.querySelector('#st-count').textContent === '3', 'UI count: 3 requested -> 3 UUIDs, stats update');
  // Version switch regenerates as v1.
  w.document.querySelector('#uuid-version-v1').click();
  ok(outLines().length === 3 && outLines().every((u) => UUID_RE.test(u) && u.charAt(14) === '1'), 'UI v1: switching to v1 regenerates 3 valid v1 UUIDs');
  ok(w.document.querySelector('#st-version').textContent === 'v1', 'UI v1: stats show v1');
  ok(w.document.querySelector('#uuid-msg').textContent === 'Generated 3 UUIDs (version 1).', 'UI v1: message says version 1');
  // Back to v4 for format tests.
  w.document.querySelector('#uuid-version-v4').click();
  // Uppercase option.
  w.document.querySelector('#uuid-uppercase').click();
  ok(outLines().every((u) => u === u.toUpperCase() && UUID_RE.test(u.toLowerCase())), 'UI uppercase: all UUIDs uppercase, still valid shape');
  // No-hyphens option (with uppercase still on).
  w.document.querySelector('#uuid-no-hyphens').click();
  ok(outLines().every((u) => /^[0-9A-F]{32}$/.test(u)), 'UI no-hyphens: 32 hex digits, no dashes');
  // Braces option.
  w.document.querySelector('#uuid-braces').click();
  ok(outLines().every((u) => u.startsWith('{') && u.endsWith('}')), 'UI braces: every UUID wrapped in { }');
  // Turn format options back off.
  w.document.querySelector('#uuid-uppercase').click();
  w.document.querySelector('#uuid-no-hyphens').click();
  w.document.querySelector('#uuid-braces').click();
  ok(outLines().every((u) => UUID_RE.test(u)), 'UI format off: back to plain canonical UUIDs');
  // Comma separator.
  w.document.querySelector('#uuid-sep').value = 'comma';
  w.document.querySelector('#uuid-sep').dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.document.querySelector('#output').value.includes(', ') && !w.document.querySelector('#output').value.includes('\n'), 'UI separator: comma joins with ", ", no newlines');
  w.document.querySelector('#uuid-sep').value = 'newline';
  w.document.querySelector('#uuid-sep').dispatchEvent(new w.Event('change', { bubbles: true }));
  // Count clamps.
  setVal(w, '#uuid-count', '0');
  ok(outLines().length === 1 && w.document.querySelector('#uuid-count').value === '1', 'UI count clamp: 0 -> 1 UUID');
  setVal(w, '#uuid-count', '2000');
  ok(outLines().length === 1000 && w.document.querySelector('#uuid-count').value === '1000', 'UI count clamp: 2000 -> 1000 UUIDs');
  setVal(w, '#uuid-count', '5');
  // Generate button regenerates (new batch differs from the old one).
  const before = w.document.querySelector('#output').value;
  w.document.querySelector('#generate').click();
  ok(w.document.querySelector('#output').value !== before && outLines().length === 5, 'UI generate: button produces a fresh batch of 5');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.document.querySelector('#copy').click();
  await sleep(80);
  ok(copied === w.document.querySelector('#output').value && w.document.querySelector('#uuid-msg').textContent === 'Copied to clipboard.' && w.document.querySelector('#uuid-msg').className === 'msg ok', 'UI copy writes the result to the clipboard and shows a visible success message');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'uuids.txt', 'UI download link points at blob with uuids.txt name');
  ok(w.document.querySelector('#uuid-msg').textContent === 'Downloaded uuids.txt.' && w.document.querySelector('#uuid-msg').className === 'msg ok', 'UI download shows a visible success message');
  // Validator: a valid v4 UUID.
  setVal(w, '#validate-in', '550e8400-e29b-41d4-a716-446655440000');
  ok(w.document.querySelector('#validate-msg').textContent.includes('Valid UUID — version 4, RFC 4122 variant.') && w.document.querySelector('#validate-msg').className === 'msg ok', 'UI validate: known v4 UUID reported valid, version 4');
  // Validator: a v1 UUID.
  setVal(w, '#validate-in', '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
  ok(w.document.querySelector('#validate-msg').textContent.includes('version 1'), 'UI validate: known v1 UUID reported as version 1');
  // Validator: nil UUID.
  setVal(w, '#validate-in', '00000000-0000-0000-0000-000000000000');
  ok(w.document.querySelector('#validate-msg').textContent.includes('nil UUID'), 'UI validate: nil UUID flagged as nil');
  // Validator: garbage.
  setVal(w, '#validate-in', 'hello-world');
  ok(w.document.querySelector('#validate-msg').textContent.includes('Not a valid UUID') && w.document.querySelector('#validate-msg').className === 'msg err', 'UI validate: garbage reported invalid with an error message');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'uuid');
  let visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'uuid-generator/', 'home search "uuid" finds the new tool');
  setVal(hw, '#tool-search', 'guid');
  visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'uuid-generator/', 'home search "guid" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-UUID TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
