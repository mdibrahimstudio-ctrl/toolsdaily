// Logic + UI tests for the Text to Speech tool (2026-11-13 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_tts.
// speechSynthesis does not exist in jsdom, so UI tests install a mock via
// beforeParse that records utterances and lets the test fire onend manually.
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

function installSpeechMock(win) {
  const voices = [
    { name: 'Google US English', lang: 'en-US', default: true },
    { name: 'Google UK English Female', lang: 'en-GB', default: false },
    { name: 'Microsoft Zira', lang: 'en-US', default: false },
  ];
  const spoken = [];
  let cancelCount = 0, pauseCount = 0, resumeCount = 0;
  const mock = {
    voices, spoken,
    get cancelCount() { return cancelCount; },
    get pauseCount() { return pauseCount; },
    get resumeCount() { return resumeCount; },
    current: null,
    fireEnd() { const u = this.current; if (u && typeof u.onend === 'function') u.onend(); },
  };
  win.speechSynthesis = {
    getVoices: () => voices.slice(),
    speak: (u) => { mock.current = u; spoken.push(u); },
    cancel: () => { cancelCount++; mock.current = null; },
    pause: () => { pauseCount++; },
    resume: () => { resumeCount++; },
    speaking: false, paused: false,
    addEventListener: () => {},
  };
  win.SpeechSynthesisUtterance = function (text) {
    this.text = text; this.rate = 1; this.pitch = 1; this.volume = 1;
    this.voice = null; this.lang = ''; this.onend = null; this.onerror = null;
  };
  win.__ttsMock = mock;
}

async function loadPage(p, withSpeech) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win) { if (withSpeech) installSpeechMock(win); },
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

console.log('TTS STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'text-to-speech', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/text-to-speech/">'), 'tts: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'tts: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'tts: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'tts: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'tts: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'tts: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Text to Speech' && app.url === 'https://toolsdaily.vercel.app/text-to-speech/' && app.offers.price === '0', 'tts: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `tts: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator', 'qr-reader', 'background-remover', 'lorem-ipsum-generator', 'random-number-generator', 'tip-calculator', 'url-encoder-decoder', 'image-synthid-remover', 'remove-duplicate-lines', 'audio-transcriber', 'morse-code-translator', 'uuid-generator', 'stopwatch-countdown-timer'];
  ok(others.length === 31 && others.every((s) => html.includes(`href="../${s}/"`)), 'tts: More-tools nav links all other 31 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 33, 'sitemap.xml has 33 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/text-to-speech/'), 'sitemap includes text-to-speech');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 32, 'home has exactly 32 tool cards');
  ok(home.includes('href="text-to-speech/"'), 'home cards + nav include text-to-speech');
  ok(home.includes('Thirty-two handy tools'), 'home lead says Thirty-two tools');
  ok(home.includes('Search 32 tools'), 'home search placeholder says 32 tools');
  ok(home.includes('Text Tools <span class="n">6</span>'), 'home Text Tools chip says 6');
  ok(home.includes('All <span class="n">32</span>'), 'home All chip says 32');
  const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(llms.includes('https://toolsdaily.vercel.app/text-to-speech/'), 'llms.txt lists the new tool');
  ok(llms.includes('browse all 32 free tools'), 'llms.txt says 32 tools');
}

console.log('TTS CORE');
{
  const dom = await loadPage('text-to-speech/', true);
  const w = dom.window, TD = w.TD_tts;
  ok(TD && typeof TD.splitIntoChunks === 'function' && typeof TD.estimateDurationSeconds === 'function' && typeof TD.pickVoice === 'function', 'TD_tts exposed');
  // Clamps.
  ok(TD.clampRate(3) === 2 && TD.clampRate(0.1) === 0.5 && TD.clampRate(1.25) === 1.25 && TD.clampRate('x') === 1, 'clampRate: bounds 0.5-2, non-numeric -> 1');
  ok(TD.clampPitch(0) === 0.5 && TD.clampPitch(9) === 2 && TD.clampPitch(0.75) === 0.75, 'clampPitch: bounds 0.5-2');
  ok(TD.clampVolume(1.5) === 1 && TD.clampVolume(-1) === 0 && TD.clampVolume(0.5) === 0.5 && TD.clampVolume('x') === 1, 'clampVolume: bounds 0-1, non-numeric -> 1');
  // Counts.
  ok(TD.countWords('  hello   world  ') === 2, 'countWords: extra whitespace ignored');
  ok(TD.countWords('') === 0 && TD.countWords('   ') === 0, 'countWords: empty/blank -> 0');
  ok(TD.countWords('one two\nthree\tfour') === 4, 'countWords: newlines/tabs split words');
  ok(TD.countChars('abc') === 3 && TD.countChars('') === 0, 'countChars: plain length');
  // Duration estimate: 150 wpm at 1.00x.
  ok(TD.estimateDurationSeconds('word '.repeat(150).trim(), 1) === 60, 'estimate: 150 words at 1x -> 60 sec');
  ok(TD.estimateDurationSeconds('word '.repeat(75).trim(), 2) === 15, 'estimate: 75 words at 2x -> 15 sec');
  ok(TD.estimateDurationSeconds('word '.repeat(150).trim(), 0.5) === 120, 'estimate: 150 words at 0.5x -> 120 sec');
  ok(TD.estimateDurationSeconds('', 1) === 0, 'estimate: empty text -> 0');
  ok(TD.formatDuration(0) === '0 sec' && TD.formatDuration(45) === '45 sec', 'formatDuration: under a minute');
  ok(TD.formatDuration(60) === '1 min' && TD.formatDuration(75) === '1 min 15 sec' && TD.formatDuration(125) === '2 min 5 sec', 'formatDuration: minutes + seconds');
  // Chunking.
  ok(TD.splitIntoChunks('', 200).length === 0, 'chunks: empty text -> no chunks');
  ok(JSON.stringify(TD.splitIntoChunks('Hello world.', 200)) === '["Hello world."]', 'chunks: short text -> one chunk');
  ok(JSON.stringify(TD.splitSentences('Hello! How are you? I am fine.')) === '["Hello!","How are you?","I am fine."]', 'splitSentences: splits on ! ? .');
  const five = Array(5).fill('The quick brown fox jumps over the lazy dog.').join(' ');
  const c5 = TD.splitIntoChunks(five, 200);
  ok(c5.length === 2 && c5.every((c) => c.length <= 200) && c5.join(' ') === five, 'chunks: 5x45-char sentences pack into 2 chunks <= 200, lossless');
  const longWordy = 'word '.repeat(60).trim();
  const cw = TD.splitIntoChunks(longWordy, 200);
  ok(cw.length === 2 && cw.every((c) => c.length <= 200) && cw.join(' ') === longWordy, 'chunks: 300-char sentence with no punctuation splits at word boundaries, lossless');
  const commaText = Array(8).fill('alpha, beta, gamma, delta, epsilon, zeta, eta, theta').join(' ') + '.';
  const cc = TD.splitIntoChunks(commaText, 200);
  ok(cc.length >= 2 && cc.every((c) => c.length <= 200) && cc.join(' ') === commaText, 'chunks: long comma sentence splits at clauses, lossless');
  ok(TD.splitIntoChunks('Short. ' + 'word '.repeat(80).trim() + '.', 200).length === 3, 'chunks: short sentence + long sentence -> 3 chunks');
  // Voices.
  const voices = [
    { name: 'Zulu', lang: 'zu-ZA', default: false },
    { name: 'Anna', lang: 'en-GB', default: false },
    { name: 'Brian', lang: 'en-US', default: true },
    { name: 'Amy', lang: 'en-US', default: false },
  ];
  ok(TD.sortVoices(voices).map((v) => v.name).join(',') === 'Anna,Amy,Brian,Zulu', 'sortVoices: by lang then name');
  ok(TD.voiceLabel({ name: 'Google US English', lang: 'en-US' }) === 'Google US English (en-US)', 'voiceLabel: Name (lang)');
  ok(TD.pickVoice(voices, 'Anna').name === 'Anna', 'pickVoice: exact name match');
  ok(TD.pickVoice(voices, 'Nobody').name === 'Brian', 'pickVoice: unknown name -> default voice');
  ok(TD.pickVoice(voices, '').name === 'Brian', 'pickVoice: no name -> default voice');
  ok(TD.pickVoice([{ name: 'A', lang: 'en' }, { name: 'B', lang: 'en' }], '').name === 'A', 'pickVoice: no default -> first voice');
  ok(TD.pickVoice([], 'x') === null, 'pickVoice: no voices -> null');
  ok(TD.isSupported() === true, 'isSupported: true with the mock installed');
  dom.window.close();
}

console.log('TTS UI (mocked speech)');
{
  const dom = await loadPage('text-to-speech/', true);
  const w = dom.window, d = w.document, mock = w.__ttsMock;
  const q = (s) => d.querySelector(s);
  // Voices populated from the mock, sorted en-GB first, default en-US selected.
  ok(q('#voice').options.length === 3, 'UI: voice dropdown has 3 mock voices');
  ok(q('#voice').value === 'Google US English', 'UI: default voice pre-selected');
  ok(q('#voice').options[0].textContent === 'Google UK English Female (en-GB)', 'UI: voices sorted by language');
  // Empty text errors.
  q('#speak').click();
  ok(q('#msg').textContent === 'Type or paste some text first.' && q('#msg').className.includes('err'), 'UI: Speak with empty text errors');
  ok(mock.spoken.length === 0, 'UI: empty Speak speaks nothing');
  // Stats update live.
  setVal(w, '#text-in', 'Hello world. This is a test.');
  ok(q('#st-words').textContent === '6', 'UI: word count 6');
  ok(q('#st-chars').textContent === '28', 'UI: char count 28');
  ok(q('#st-time').textContent === '2 sec', 'UI: estimated time 2 sec at 1x');
  ok(q('#st-chunks').textContent === '1', 'UI: 1 chunk for short text');
  // Sliders.
  setVal(w, '#rate', '1.5');
  ok(q('#rate-val').textContent === '1.50×', 'UI: rate label shows 1.50x');
  ok(q('#st-time').textContent === '2 sec', 'UI: 6 words at 1.5x still rounds to 2 sec');
  setVal(w, '#pitch', '0.5');
  ok(q('#pitch-val').textContent === '0.50', 'UI: pitch label shows 0.50');
  setVal(w, '#volume', '0.5');
  ok(q('#volume-val').textContent === '50%', 'UI: volume label shows 50%');
  // Speak a one-chunk text: utterance carries the settings + chosen voice.
  setVal(w, '#voice', 'Microsoft Zira');
  q('#speak').click();
  ok(mock.spoken.length === 1, 'UI: Speak queues one utterance for one chunk');
  const u = mock.spoken[0];
  ok(u.text === 'Hello world. This is a test.' && u.rate === 1.5 && u.pitch === 0.5 && u.volume === 0.5, 'UI: utterance text/rate/pitch/volume match the controls');
  ok(u.voice && u.voice.name === 'Microsoft Zira', 'UI: utterance uses the selected voice');
  ok(q('#status').textContent === 'Speaking… part 1 of 1.', 'UI: status shows part 1 of 1');
  ok(q('#speak').disabled === true && q('#pause').disabled === false && q('#stop').disabled === false, 'UI: buttons while speaking (Speak off, Pause/Stop on)');
  ok(q('#current').textContent.includes('Hello world.'), 'UI: current chunk shown while speaking');
  mock.fireEnd();
  await sleep(50);
  ok(q('#status').textContent === 'Finished reading.', 'UI: status Finished after last chunk ends');
  ok(q('#msg').textContent === 'Finished reading.', 'UI: finished message shown');
  ok(q('#speak').disabled === false && q('#stop').disabled === true, 'UI: buttons reset after finish');
  // Two-chunk flow with pause / resume / stop.
  const twoChunk = Array(5).fill('The quick brown fox jumps over the lazy dog.').join(' ');
  setVal(w, '#text-in', twoChunk);
  ok(q('#st-chunks').textContent === '2', 'UI: 5 sentences -> 2 chunks');
  q('#speak').click();
  ok(mock.spoken.length === 2 && q('#status').textContent === 'Speaking… part 1 of 2.', 'UI: two-chunk speak starts at part 1 of 2');
  q('#pause').click();
  ok(mock.pauseCount === 1 && q('#status').textContent === 'Paused at part 1 of 2.', 'UI: Pause calls synth.pause + status');
  ok(q('#resume').disabled === false && q('#pause').disabled === true, 'UI: Resume enabled while paused');
  q('#resume').click();
  ok(mock.resumeCount === 1 && q('#status').textContent === 'Speaking… part 1 of 2.', 'UI: Resume calls synth.resume + status');
  mock.fireEnd();
  await sleep(50);
  ok(q('#status').textContent === 'Speaking… part 2 of 2.', 'UI: after chunk 1 ends, part 2 of 2 starts');
  q('#stop').click();
  ok(mock.cancelCount >= 1 && q('#status').textContent === 'Stopped.', 'UI: Stop cancels + status Stopped');
  ok(q('#speak').disabled === false, 'UI: Speak re-enabled after Stop');
  // Sample + clear.
  q('#sample').click();
  ok(q('#text-in').value.length > 100 && Number(q('#st-words').textContent) > 20, 'UI: Sample fills text + updates stats');
  q('#clear').click();
  ok(q('#text-in').value === '' && q('#st-words').textContent === '0', 'UI: Clear empties text + stats');
  dom.window.close();
}

console.log('TTS UI (unsupported browser)');
{
  const dom = await loadPage('text-to-speech/', false);
  const w = dom.window, d = w.document, q = (s) => d.querySelector(s);
  ok(w.TD_tts.isSupported() === false, 'unsupported: isSupported false without speechSynthesis');
  ok(q('#speak').disabled === true, 'unsupported: Speak disabled');
  ok(q('#msg').textContent.includes('does not support speech synthesis'), 'unsupported: explanatory message shown');
  ok(q('#voice').options[0].textContent === 'Speech not supported in this browser', 'unsupported: voice dropdown explains itself');
  dom.window.close();
}

console.log(`\nTTS TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
