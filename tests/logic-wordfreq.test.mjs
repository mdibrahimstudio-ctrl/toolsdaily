// Logic + UI tests for the Word Frequency Counter tool (2026-11-16).
// Drives the real page code through jsdom; core functions are window.TD_wordfreq.
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
function setCheck(win, sel, checked) {
  const el = win.document.querySelector(sel);
  el.checked = checked;
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
}

const SAMPLE = 'The cat sat on the mat. The cat slept.';

console.log('WORDFREQ STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'word-frequency-counter', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/word-frequency-counter/">'), 'wordfreq: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'wordfreq: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'wordfreq: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'wordfreq: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'wordfreq: GA4 tag present');
  ok((html.match(/<h1/g) || []).length === 1, 'wordfreq: exactly one h1');
  ok(html.includes('Text Tools · No. 49'), 'wordfreq: eyebrow is Text Tools · No. 49');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'wordfreq: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Word Frequency Counter' && app.url === 'https://toolsdaily.vercel.app/word-frequency-counter/' && app.offers.price === '0', 'wordfreq: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `wordfreq: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['word-counter', 'text-case-converter', 'remove-duplicate-lines', 'lorem-ipsum-generator', 'fancy-text-generator'];
  ok((nav.match(/<li>/g) || []).length === related.length && related.every((s) => nav.includes(`href="../${s}/"`)), 'wordfreq: More-tools nav links exactly its 5 related tools');
  ok(html.includes('<p>58 tools · New tools added regularly.</p>'), 'wordfreq: footer count line stays 58 tools');
}

console.log('WORDFREQ CORE');
{
  const dom = await loadPage('word-frequency-counter/');
  const w = dom.window, TD = w.TD_wordfreq;
  ok(TD && typeof TD.tokenize === 'function' && typeof TD.analyze === 'function' && typeof TD.buildList === 'function', 'TD_wordfreq exposed');
  ok(Array.isArray(TD.STOP_WORDS) && TD.STOP_WORDS.length >= 40 && TD.STOP_WORDS.includes('the') && TD.STOP_WORDS.includes('and'), 'STOP_WORDS has 40+ common words');
  // tokenize: hand-verified case.
  ok(JSON.stringify(TD.tokenize(SAMPLE, true)) === JSON.stringify(['the', 'cat', 'sat', 'on', 'the', 'mat', 'the', 'cat', 'slept']), 'core tokenize: sample sentence gives 9 lowercase tokens');
  ok(JSON.stringify(TD.tokenize("don't 123", true)) === JSON.stringify(["don't", '123']), 'core tokenize: apostrophe and number stay in one word each');
  ok(JSON.stringify(TD.tokenize('Hello, WORLD!', false)) === JSON.stringify(['Hello', 'WORLD']), 'core tokenize: case-sensitive mode keeps original case');
  ok(JSON.stringify(TD.tokenize('', true)) === JSON.stringify([]), 'core tokenize: empty text gives []');
  // analyze: hand-verified case, stop words off.
  const r = TD.analyze(SAMPLE, { ignoreCase: true, stopWords: false, topN: 25 });
  ok(!r.error && r.total === 9 && r.unique === 6, 'core analyze: sample gives total 9, unique 6');
  ok(r.rows[0].word === 'the' && r.rows[0].count === 3 && r.rows[0].pct === 33.33, 'core analyze: rows[0] is the x3, 33.33%');
  ok(r.rows[1].word === 'cat' && r.rows[1].count === 2 && r.rows[1].pct === 22.22, 'core analyze: rows[1] is cat x2, 22.22%');
  ok(r.rows.length === 6 && r.rows[5].count === 1 && r.rows[5].pct === 11.11, 'core analyze: 6 rows, singletons at 11.11%');
  ok(Math.abs(r.rows.reduce((s, x) => s + x.pct, 0) - 100) <= 0.1, 'core analyze: pct sums to ~100 (within 0.1)');
  // Stop words on: "the" and "on" gone, cat leads; total still counts all tokens.
  const rs = TD.analyze(SAMPLE, { ignoreCase: true, stopWords: true, topN: 25 });
  ok(!rs.error && rs.total === 9 && rs.unique === 4, 'core analyze stopWords: total still 9, unique 4 non-stop words');
  ok(rs.rows[0].word === 'cat' && rs.rows[0].count === 2, 'core analyze stopWords: rows[0] is cat x2');
  ok(!rs.rows.some((x) => x.word === 'the' || x.word === 'on'), 'core analyze stopWords: the/on removed from rows');
  // Case-sensitive mode keeps "The" and "the" separate.
  const rc = TD.analyze(SAMPLE, { ignoreCase: false, stopWords: false, topN: 25 });
  ok(!rc.error && rc.unique === 7, 'core analyze case-sensitive: unique 7 (The vs the separate)');
  ok(rc.rows.some((x) => x.word === 'The' && x.count === 2) && rc.rows.some((x) => x.word === 'the' && x.count === 1), 'core analyze case-sensitive: The x2 and the x1 are separate rows');
  // Empty / whitespace-only.
  ok(TD.analyze('', { ignoreCase: true, stopWords: false, topN: 25 }).error === 'Paste some text first.', 'core analyze: empty text errors');
  ok(TD.analyze('   \n\t  ', { ignoreCase: true, stopWords: false, topN: 25 }).error === 'Paste some text first.', 'core analyze: whitespace-only text errors');
  // topN limiting and invalid topN.
  const r2 = TD.analyze(SAMPLE, { ignoreCase: true, stopWords: false, topN: 2 });
  ok(r2.rows.length === 2 && r2.rows[0].word === 'the' && r2.rows[1].word === 'cat' && r2.unique === 6, 'core analyze: topN=2 limits rows to 2 but unique stays 6');
  ok(TD.analyze(SAMPLE, { ignoreCase: true, stopWords: false, topN: 0 }).rows.length === 6, 'core analyze: topN=0 falls back to default 25');
  ok(TD.analyze(SAMPLE, { ignoreCase: true, stopWords: false, topN: NaN }).rows.length === 6, 'core analyze: topN=NaN falls back to default 25');
  // Stop words removing everything: rows [] but total counts all tokens.
  const rall = TD.analyze('the and of to', { ignoreCase: true, stopWords: true, topN: 25 });
  ok(!rall.error && rall.total === 4 && rall.unique === 0 && rall.rows.length === 0, 'core analyze: all-stop-words text gives total 4, unique 0, rows []');
  // Large input scales.
  const big = TD.analyze((SAMPLE + ' ').repeat(500).trim(), { ignoreCase: true, stopWords: false, topN: 25 });
  ok(!big.error && big.total === 4500 && big.rows[0].word === 'the' && big.rows[0].count === 1500 && big.rows[0].pct === 33.33, 'core analyze: 500x sentence gives total 4500, the x1500, 33.33%');
  // buildList.
  const list = TD.buildList(r);
  ok(list.includes('Word frequency — ToolsDaily'), 'core buildList: header line');
  ok(list.includes('the\t3\t33.33%'), 'core buildList: the row line with tab separators');
  ok(list.includes('cat\t2\t22.22%'), 'core buildList: cat row line');
  ok(list.includes('Total words: 9'), 'core buildList: total line');
  dom.window.close();
}

console.log('WORDFREQ UI');
{
  const dom = await loadPage('word-frequency-counter/');
  const w = dom.window;
  const doc = w.document;
  // Defaults on load: sample text pre-filled, result shown.
  ok(doc.querySelector('#text-in').value === SAMPLE, 'UI defaults: sample text pre-filled');
  ok(doc.querySelector('#opt-ignore-case').checked === true, 'UI defaults: ignore-case checked');
  ok(doc.querySelector('#opt-stop-words').checked === false, 'UI defaults: stop-words unchecked');
  ok(doc.querySelector('#opt-top-n').value === '25', 'UI defaults: top-N is 25');
  ok(doc.querySelector('#st-words').textContent === '9' && doc.querySelector('#st-unique').textContent === '6' && doc.querySelector('#st-top').textContent === 'the (3)', 'UI defaults: stats 9 / 6 / the (3)');
  ok(doc.querySelectorAll('#freq-body tr').length === 6, 'UI defaults: table has 6 rows');
  ok(doc.querySelector('#freq-body tr').textContent.includes('the'), 'UI defaults: first table row is the');
  ok(doc.querySelector('#msg').className === 'msg ok', 'UI defaults: visible success message');
  ok(doc.querySelector('#copy') && doc.querySelector('#copy').textContent === 'Copy list', 'UI: copy button exists');
  ok(doc.querySelector('#download') && doc.querySelector('#download').textContent === 'Download .txt', 'UI: download button visible from page load');
  ok(doc.querySelector('#dl').getAttribute('download') === 'word-frequency.txt', 'UI: hidden dl anchor named word-frequency.txt');
  // Typing new text updates live.
  setVal(w, '#text-in', 'apple banana apple');
  ok(doc.querySelector('#st-words').textContent === '3' && doc.querySelector('#st-unique').textContent === '2' && doc.querySelector('#st-top').textContent === 'apple (2)', 'UI live update: apple banana apple gives 3 / 2 / apple (2)');
  ok(doc.querySelectorAll('#freq-body tr').length === 2, 'UI live update: table has 2 rows');
  // Unchecking ignore-case changes counts.
  setVal(w, '#text-in', 'The the THE');
  ok(doc.querySelector('#st-unique').textContent === '1' && doc.querySelector('#st-top').textContent === 'the (3)', 'UI case: ignore-case on merges The/the/THE into one word');
  setCheck(w, '#opt-ignore-case', false);
  ok(doc.querySelector('#st-unique').textContent === '3' && doc.querySelectorAll('#freq-body tr').length === 3, 'UI case: unchecking ignore-case splits into 3 unique words');
  setCheck(w, '#opt-ignore-case', true);
  // Stop-words checkbox filters live.
  setVal(w, '#text-in', SAMPLE);
  setCheck(w, '#opt-stop-words', true);
  ok(doc.querySelector('#st-unique').textContent === '4' && doc.querySelector('#st-top').textContent === 'cat (2)', 'UI stop words: checking the box gives unique 4, top cat (2)');
  setCheck(w, '#opt-stop-words', false);
  // Top-N input limits rows live.
  setVal(w, '#opt-top-n', '2');
  ok(doc.querySelectorAll('#freq-body tr').length === 2, 'UI top-N: setting 2 limits the table to 2 rows');
  setVal(w, '#opt-top-n', '25');
  // Analyze button re-runs the count.
  setVal(w, '#text-in', 'one two two three three three');
  doc.querySelector('#btn-analyze').click();
  ok(doc.querySelector('#st-words').textContent === '6' && doc.querySelector('#st-top').textContent === 'three (3)', 'UI button: Count words gives 6 words, top three (3)');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  doc.querySelector('#download').click();
  const dl = doc.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'word-frequency.txt', 'UI download link points at blob with word-frequency.txt name');
  ok(doc.querySelector('#msg').textContent === 'Downloaded word-frequency.txt.' && doc.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Copy with nothing to copy errors (after clearing below); first check copy exists and is wired.
  // Clearing the textarea shows the error and empties the table.
  setVal(w, '#text-in', '');
  ok(doc.querySelector('#st-words').textContent === '–' && doc.querySelector('#st-unique').textContent === '–' && doc.querySelector('#st-top').textContent === '–', 'UI clear: stats reset to dashes');
  ok(doc.querySelectorAll('#freq-body tr').length === 0, 'UI clear: table emptied');
  ok(doc.querySelector('#msg').textContent === 'Paste some text first.' && doc.querySelector('#msg').className === 'msg err', 'UI clear: visible error message');
  // Download with no text errors instead of downloading.
  doc.querySelector('#download').click();
  ok(doc.querySelector('#msg').textContent === 'Nothing to download yet — paste some text first.' && doc.querySelector('#msg').className === 'msg err', 'UI download with no text: visible error, nothing downloaded');
  // Copy with no text errors.
  doc.querySelector('#copy').click();
  ok(doc.querySelector('#msg').textContent === 'Nothing to copy yet — paste some text first.' && doc.querySelector('#msg').className === 'msg err', 'UI copy with no text: visible error');
  dom.window.close();
}

console.log(`\nLOGIC-WORDFREQ TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
