// Logic + UI tests for the Typing Speed Test (2026-11-19 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_typing.
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
function setInput(win, value) {
  const el = win.document.querySelector('#input');
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  return el;
}

console.log('TYPING STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'typing-speed-test', 'index.html'), 'utf8');
  ok(html.includes('<p class="eyebrow">Text Tools · No. 64</p>'), 'typing: eyebrow is Text Tools · No. 64');
  ok(html.includes('<h1 class="rise rise-1">Typing Speed Test</h1>'), 'typing: H1 is the tool name');
  ok((html.match(/<h1/g) || []).length === 1, 'typing: exactly one H1');
  ok(html.includes('<title>Typing Speed Test — Free Online Typing Test — ToolsDaily</title>'), 'typing: title is correct');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/typing-speed-test/">'), 'typing: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'typing: og:image present');
  ok(html.includes('<meta property="og:url" content="https://toolsdaily.vercel.app/typing-speed-test/">'), 'typing: og:url present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'typing: twitter card present');
  ok(html.includes('<link rel="stylesheet" href="../assets/design.css">'), 'typing: design.css stylesheet linked');
  ok(html.includes('<script src="../assets/site.js"></script>'), 'typing: site.js loaded at end');
  ok(html.includes('<a class="skip" href="#tool">Skip to tool</a>'), 'typing: skip link present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'typing: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'typing: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'typing: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Typing Speed Test' && app.url === 'https://toolsdaily.vercel.app/typing-speed-test/' && app.offers.price === '0', 'typing: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `typing: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  ok(html.includes('<p>68 tools · New tools added regularly.</p>'), 'typing: footer says 68 tools');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'typing: no emoji anywhere on the page');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['word-counter', 'text-case-converter', 'lorem-ipsum-generator', 'word-frequency-counter', 'morse-code-translator'];
  ok((nav.match(/<li>/g) || []).length === related.length, 'typing: More-tools nav has exactly 5 links');
  ok(related.every((s) => nav.includes(`href="../${s}/"`)), 'typing: More-tools nav links the 5 related tools');
  ok(nav.indexOf('word-counter') < nav.indexOf('text-case-converter') && nav.indexOf('text-case-converter') < nav.indexOf('lorem-ipsum-generator') && nav.indexOf('lorem-ipsum-generator') < nav.indexOf('word-frequency-counter') && nav.indexOf('word-frequency-counter') < nav.indexOf('morse-code-translator'), 'typing: More-tools nav links are in the required order');
  ok(nav.includes('>Word Counter<') && nav.includes('>Text Case Converter<') && nav.includes('>Lorem Ipsum Generator<') && nav.includes('>Word Frequency Counter<') && nav.includes('>Morse Code Translator<'), 'typing: More-tools nav uses the tools’ display names');
  for (const id of ['#words', '#input', '#start', '#restart', '#timer', '#wpm', '#accuracy', '#results', '#copy', '#msg']) {
    ok(html.includes(`id="${id.slice(1)}"`), `typing: element ${id} present`);
  }
  ok(!html.includes('id="download"') && !html.includes('id="dl"'), 'typing: NO #download / #dl present');
  ok(!html.toLowerCase().includes('download'), 'typing: no download wording anywhere on the page');
}

console.log('TYPING CORE');
{
  const { dom, jsErrors } = await loadPage('typing-speed-test/');
  const w = dom.window, TD = w.TD_typing;
  ok(jsErrors === 0, `typing: zero JS errors on load (${jsErrors})`);
  ok(TD && typeof TD.computeWPM === 'function' && typeof TD.computeAccuracy === 'function' && typeof TD.countCorrectChars === 'function' && typeof TD.sampleWords === 'function', 'TD_typing exposed with computeWPM, computeAccuracy, countCorrectChars, sampleWords');
  ok(typeof TD.finishTest === 'function' && typeof TD.endTest === 'function' && typeof TD.startTest === 'function' && typeof TD.resetTest === 'function', 'TD_typing exposes finishTest/endTest/startTest/resetTest hooks');
  // WPM math: one word = 5 characters.
  ok(TD.computeWPM(250, 60) === 50, 'WPM: 250 correct chars in 60s = 50 WPM');
  ok(TD.computeWPM(125, 30) === 50, 'WPM: 125 correct chars in 30s = 50 WPM');
  ok(TD.computeWPM(0, 60) === 0, 'WPM: 0 correct chars = 0 WPM');
  ok(TD.computeWPM(250, 0) === 0, 'WPM: 0 seconds elapsed = 0 WPM');
  ok(TD.computeWPM(300, 60) === 60, 'WPM: 300 correct chars in 60s = 60 WPM');
  ok(TD.computeWPM(50, 60) === 10, 'WPM: 50 correct chars in 60s = 10 WPM');
  ok(TD.computeWPM(100, 120) === 10, 'WPM: 100 correct chars in 120s = 10 WPM');
  ok(TD.computeWPM(25, 60) === 5, 'WPM: 25 correct chars in 60s = 5 WPM');
  // Accuracy math.
  ok(TD.computeAccuracy(90, 100) === 90, 'accuracy: 90/100 = 90%');
  ok(TD.computeAccuracy(0, 0) === 0, 'accuracy: 0 typed = 0%');
  ok(TD.computeAccuracy(100, 100) === 100, 'accuracy: 100/100 = 100%');
  ok(TD.computeAccuracy(0, 10) === 0, 'accuracy: 0/10 = 0%');
  ok(TD.computeAccuracy(1, 3) === 33, 'accuracy: 1/3 rounds to 33%');
  ok(TD.computeAccuracy(2, 3) === 67, 'accuracy: 2/3 rounds to 67%');
  // countCorrectChars.
  ok(TD.countCorrectChars('hello world', 'hello world') === 11, 'countCorrectChars: exact match counts all 11 chars');
  ok(TD.countCorrectChars('hello world', 'hello') === 5, 'countCorrectChars: partial input counts the 5 matching chars');
  ok(TD.countCorrectChars('hello world', 'hallo warld') === 9, 'countCorrectChars: 2 wrong chars -> 9 correct of 11');
  ok(TD.countCorrectChars('hello', 'xxxxx') === 0, 'countCorrectChars: all wrong = 0');
  ok(TD.countCorrectChars('hello', '') === 0, 'countCorrectChars: empty input = 0');
  ok(TD.countCorrectChars('', '') === 0, 'countCorrectChars: empty target and input = 0');
  ok(TD.countCorrectChars('hi', 'hello') === 1, 'countCorrectChars: typed longer than target only compares the overlap (1)');
  ok(TD.countCorrectChars('Hello', 'hello') === 4, 'countCorrectChars: case-sensitive, H vs h differs (4)');
  // Word sampling.
  const list = TD.words;
  ok(Array.isArray(list) && list.length >= 100, `word list has ${list.length} common words`);
  const s10 = TD.sampleWords(list, 10);
  ok(s10.length === 10, 'sampleWords: returns exactly 10 words');
  ok(s10.every((x) => list.includes(x)), 'sampleWords: every sampled word comes from the list');
  ok(new Set(s10).size === 10, 'sampleWords: no duplicates within a 10-word sample');
  const s50 = TD.sampleWords(list, 50);
  ok(s50.length === 50 && new Set(s50).size === 50, 'sampleWords: 50-word sample has 50 distinct words');
  const seeded = TD.sampleWords(list, 5, () => 0.5);
  ok(seeded.length === 5 && seeded.every((x) => list.includes(x)), 'sampleWords: seeded rng still returns 5 words from the list');
  const passage = TD.buildPassage(list, 10);
  ok(typeof passage === 'string' && passage.split(' ').length === 10, 'buildPassage: returns a 10-word passage');
  ok(TD.duration === 60, 'TD_typing duration is 60 seconds');
  dom.window.close();
}

console.log('TYPING UI');
{
  const { dom, jsErrors } = await loadPage('typing-speed-test/');
  const w = dom.window, TD = w.TD_typing;
  const q = (s) => w.document.querySelector(s);
  ok(jsErrors === 0, `typing UI: zero JS errors on load (${jsErrors})`);
  // Words displayed on load: a 50-word passage, all from the word list.
  const shown = q('#words').textContent.trim();
  ok(shown.length > 50, 'UI: words displayed on load');
  ok(shown.split(' ').length === 50, 'UI: passage on load has 50 words');
  ok(shown.split(' ').every((x) => TD.words.includes(x)), 'UI: every displayed word comes from the word list');
  ok(q('#timer').textContent === '60s', 'UI: timer shows 60s on load');
  ok(q('#wpm').textContent === '0', 'UI: WPM is 0 on load');
  ok(q('#accuracy').textContent === '0%', 'UI: accuracy is 0% on load');
  ok(q('#results').hidden === true, 'UI: results panel hidden on load');
  // Start, then type the first 10 chars exactly: 10 correct chars in the
  // clamped first second -> (10/5)/(1/60) = 120 WPM, 100% accuracy.
  q('#start').click();
  setInput(w, shown.slice(0, 10));
  ok(q('#wpm').textContent === '120', 'UI live: typing 10 correct chars shows 120 WPM');
  ok(q('#accuracy').textContent === '100%', 'UI live: typing 10 correct chars shows 100% accuracy');
  // Type 10 wrong chars instead: 0 correct -> 0 WPM, 0% accuracy.
  setInput(w, 'zzzzzzzzzz');
  ok(q('#wpm').textContent === '0', 'UI live: 10 wrong chars shows 0 WPM');
  ok(q('#accuracy').textContent === '0%', 'UI live: 10 wrong chars shows 0% accuracy');
  // Type the first 25 chars exactly, then finish immediately via the hook.
  setInput(w, shown.slice(0, 25));
  ok(q('#wpm').textContent === '300', 'UI live: typing 25 correct chars shows 300 WPM');
  const r1 = TD.finishTest();
  ok(r1 && r1.wpm === 300 && r1.accuracy === 100 && r1.correctChars === 25 && r1.totalTyped === 25, 'UI finish hook: result is 300 WPM, 100%, 25/25 chars');
  ok(q('#results').hidden === false, 'UI finish: results panel is shown');
  ok(q('#r-wpm').textContent === '300', 'UI finish: result WPM reads 300');
  ok(q('#r-accuracy').textContent === '100%', 'UI finish: result accuracy reads 100%');
  ok(q('#r-chars').textContent === '25 / 25', 'UI finish: result chars read 25 / 25');
  ok(q('#r-best').textContent === '300', 'UI finish: best WPM this session reads 300');
  ok(q('#timer').textContent === '0s', 'UI finish: timer reads 0s');
  ok(q('#msg').textContent.includes('300 WPM'), 'UI finish: message names the 300 WPM result');
  // Restart resets everything but keeps the session best.
  const oldPassage = shown;
  q('#restart').click();
  ok(q('#input').value === '', 'UI restart: input is cleared');
  ok(q('#wpm').textContent === '0', 'UI restart: WPM resets to 0');
  ok(q('#accuracy').textContent === '0%', 'UI restart: accuracy resets to 0%');
  ok(q('#timer').textContent === '60s', 'UI restart: timer resets to 60s');
  ok(q('#results').hidden === true, 'UI restart: results panel is hidden again');
  const shown2 = q('#words').textContent.trim();
  ok(shown2.length > 50 && shown2.split(' ').length === 50, 'UI restart: a fresh 50-word passage is shown');
  ok(shown2 !== oldPassage, 'UI restart: the new passage differs from the old one');
  ok(TD.getBestWPM() === 300, 'UI restart: best WPM (300) is kept for the session');
  // Second run, slower: 15 correct chars -> 180 WPM; best stays 300.
  q('#start').click();
  setInput(w, shown2.slice(0, 15));
  const r2 = TD.endTest();
  ok(r2 && r2.wpm === 180 && r2.bestWPM === 300, 'UI second run: 15 correct chars = 180 WPM, best stays 300');
  ok(q('#r-wpm').textContent === '180', 'UI second run: result WPM reads 180');
  ok(q('#r-best').textContent === '300', 'UI second run: best WPM still reads 300');
  // Copy with a stubbed clipboard.
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  q('#copy').click();
  await sleep(80);
  ok(copied && copied.includes('WPM: 180') && copied.includes('Accuracy: 100%') && copied.includes('Correct characters: 15 / 15') && copied.includes('Best WPM this session: 300'), 'UI copy writes the 180 WPM / 100% / 15/15 / best 300 summary to the clipboard');
  ok(q('#msg').textContent === 'Copied to clipboard.' && q('#msg').className === 'msg ok', 'UI copy shows a visible success message');
  dom.window.close();
}

console.log(`\nLOGIC-TYPING TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
