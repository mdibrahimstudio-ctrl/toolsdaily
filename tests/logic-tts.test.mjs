// Logic + UI tests for the Text to Speech tool (2026-11-13 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_tts.
// speechSynthesis does not exist in jsdom, so UI tests install a mock via
// beforeParse that records utterances and lets the test fire onend manually.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
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
// Download-path page: speech mock + a FakeWorker stand-in for the real
// Kokoro engine + a stubbed createObjectURL so the .wav download can be
// captured. The worker mock records every message; tests drive it with
// worker.deliver({type, ...}) exactly as the real worker's postMessage would.
async function loadDownloadPage(withWorker) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromURL(BASE + 'text-to-speech/', {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win) {
      installSpeechMock(win);
      win.__dlCapture = { blob: null, anchor: null, created: [] };
      if (withWorker) {
        class FakeWorker {
          constructor(url, opts) {
            this.url = url; this.opts = opts;
            this.posted = []; this.terminated = false;
            this.onmessage = null; this.onerror = null;
            win.__dlCapture.created.push(this);
          }
          postMessage(msg) { this.posted.push(msg); }
          terminate() { this.terminated = true; }
          deliver(data) { if (typeof this.onmessage === 'function') this.onmessage({ data }); }
        }
        win.Worker = FakeWorker;
      }
      win.URL.createObjectURL = (blob) => { win.__dlCapture.blob = blob; return 'blob:test-wav'; };
      win.URL.revokeObjectURL = () => {};
    },
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  // Capture the temp anchor the page clicks to trigger the download, and
  // cancel the click's default action so jsdom does not try to navigate.
  dom.window.document.addEventListener('click', (e) => {
    if (e.target && e.target.tagName === 'A') {
      dom.window.__dlCapture.anchor = { href: e.target.href, download: e.target.getAttribute('download') };
      e.preventDefault();
    }
  }, true);
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
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['audio-transcriber', 'word-counter', 'text-case-converter', 'lorem-ipsum-generator', 'remove-duplicate-lines', 'fancy-text-generator'];
  ok((nav.match(/<li>/g) || []).length === related.length && related.every((s) => nav.includes(`href="../${s}/"`)), 'tts: More-tools nav links exactly its 5 related tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 70, 'sitemap.xml has 70 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/text-to-speech/'), 'sitemap includes text-to-speech');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card[\s"]/g) || []).length === 68, 'home has exactly 68 tool cards');
  ok(home.includes('/text-to-speech/'), 'home cards + nav include text-to-speech');
  ok(home.includes('Sixty-eight handy tools'), 'home lead says Sixty-eight tools');
  ok(home.includes('Search 68 tools'), 'home search placeholder says 68 tools');
  ok(home.includes('Text Tools <span class="n">9</span>'), 'home Text Tools chip says 9');
  ok(home.includes('All <span class="n">68</span>'), 'home All chip says 68');
  const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(llms.includes('https://toolsdaily.vercel.app/text-to-speech/'), 'llms.txt lists the new tool');
  ok(llms.includes('browse all 68 free tools'), 'llms.txt says 68 tools');
  // Download WAV UI (2026-11-14).
  ok(html.includes('<button id="download" type="button" class="secondary">') && html.includes('Download WAV</button>') && html.indexOf('id="stop"') < html.indexOf('id="download"'), 'tts: Download WAV button present (secondary style, after Stop)');
  ok(html.includes('id="dl-barwrap"') && html.includes('id="dl-bar"'), 'tts: download progress bar present');
  ok(html.includes('class="dl-note"') && html.includes('Kokoro AI voice') && html.includes('88'), 'tts: download note names the Kokoro voice + ~88 MB model');
  ok(html.includes('Download uses the Kokoro AI voice (American English)'), 'tts: download note states the English-only Kokoro voice');
  ok(html.includes('Can I download the audio as a WAV file?'), 'tts: download FAQ present');
  const faqCount = (html.match(/<details><summary>/g) || []).length;
  ok(faqCount === 5, 'tts: 5 visible FAQs (download FAQ added)');
  ok(html.includes('Press "Download WAV" to save the text as an audio file.'), 'tts: How-to mentions the download step');
  const vj = JSON.parse(fs.readFileSync(path.join(SITE, 'vercel.json'), 'utf8'));
  const vjAll = JSON.stringify(vj);
  ok(vjAll.includes('/text-to-speech'), 'vercel.json has COOP/COEP for /text-to-speech');
  ok(vjAll.includes('/text-to-speech/(.*)'), 'vercel.json COOP/COEP covers the tool subpaths, incl. tts-worker.js');
}

console.log('TTS WORKER');
{
  const wpath = path.join(SITE, 'text-to-speech', 'tts-worker.js');
  ok(fs.existsSync(wpath), 'tts-worker.js exists');
  let syntaxOk = true;
  try { execFileSync('node', ['--check', wpath], { stdio: 'pipe' }); } catch (e) { syntaxOk = false; console.log('    worker syntax error:', String(e.stderr || e.message)); }
  ok(syntaxOk, 'tts-worker.js parses without syntax errors (node --check)');
  const src = fs.readFileSync(wpath, 'utf8');
  ok(src.includes("from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js'"), 'worker imports kokoro-js 1.2.1 browser bundle from the jsDelivr CDN (not vendored)');
  ok(src.includes("KokoroTTS.from_pretrained(MODEL_ID, {") && src.includes("'onnx-community/Kokoro-82M-v1.0-ONNX'"), 'worker loads onnx-community/Kokoro-82M-v1.0-ONNX');
  ok(src.includes("dtype: 'q8'"), 'worker uses the quantized (q8) model files');
  ok(src.includes("device: 'wasm'"), 'worker runs on WASM (no WebGPU dependency)');
  ok(src.includes('TextSplitterStream') && src.includes('tts.stream(splitter'), 'worker streams long text through TextSplitterStream');
  ok(src.includes('progress_callback'), 'worker reports model-download progress');
  ok(src.includes("VOICE = 'af_heart'"), 'worker uses the af_heart voice');
  ok(src.includes('allowLocalModels = false'), 'worker loads the model from the HF CDN only');
  ok(src.includes('crossOriginIsolated') && src.includes('numThreads'), 'worker sets WASM threads defensively (no SharedArrayBuffer requirement)');
  ok(src.includes("type: 'result'") && src.includes('sampling_rate'), 'worker posts merged samples + sampling rate back to the page');
  const page = fs.readFileSync(path.join(SITE, 'text-to-speech', 'index.html'), 'utf8');
  ok(page.includes("new Worker('tts-worker.js', { type: 'module' })"), 'page runs the download engine in the module worker');
  ok(page.includes('dlWorker.terminate()'), 'page recovers by terminating the worker');
  ok((page.match(/new Worker\(/g) || []).length === 1 && page.includes('function dlSpawnWorker()'), 'page creates the worker in exactly one place (dlSpawnWorker, called only from the Download click handler or recovery — lazy, never on page load)');
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
  // WAV encoding (Download path).
  ok(typeof TD.encodeWavBuffer === 'function' && typeof TD.encodeWav === 'function' && typeof TD.formatBytes === 'function', 'TD_tts exposes encodeWavBuffer / encodeWav / formatBytes');
  {
    const buf = TD.encodeWavBuffer(new Float32Array([0, 0.5, -0.5, 1, -1]), 24000);
    const v = new DataView(buf);
    const str = (off, n) => Array.from({ length: n }, (_, i) => String.fromCharCode(v.getUint8(off + i))).join('');
    ok(buf.byteLength === 44 + 10, 'wav: 5 samples -> 54-byte file (44 header + 10 data)');
    ok(str(0, 4) === 'RIFF' && str(8, 4) === 'WAVE' && str(12, 4) === 'fmt ' && str(36, 4) === 'data', 'wav: RIFF/WAVE/fmt/data markers present');
    ok(v.getUint32(4, true) === 36 + 10 && v.getUint32(40, true) === 10, 'wav: chunk sizes correct');
    ok(v.getUint16(20, true) === 1 && v.getUint16(22, true) === 1 && v.getUint32(24, true) === 24000 && v.getUint16(34, true) === 16, 'wav: PCM, mono, 24000 Hz, 16-bit');
    ok(v.getUint32(28, true) === 48000 && v.getUint16(32, true) === 2, 'wav: byte rate 48000, block align 2');
    ok(v.getInt16(44, true) === 0 && v.getInt16(46, true) === 16384 && v.getInt16(48, true) === -16383 && v.getInt16(50, true) === 32767 && v.getInt16(52, true) === -32767, 'wav: samples scale 0/0.5/-0.5/1/-1 -> 0/16384/-16383/32767/-32767');
    const clamped = TD.encodeWavBuffer(new Float32Array([2, -2, NaN, Infinity]), 24000);
    const cv = new DataView(clamped);
    ok(cv.getInt16(44, true) === 32767 && cv.getInt16(46, true) === -32767 && cv.getInt16(48, true) === 0 && cv.getInt16(50, true) === 0, 'wav: out-of-range clamps, NaN/Infinity become silence');
    const empty = TD.encodeWavBuffer(new Float32Array(0), 24000);
    ok(empty.byteLength === 44 && new DataView(empty).getUint32(40, true) === 0, 'wav: empty input -> valid 44-byte header, 0 data');
    const nullIn = TD.encodeWavBuffer(null, 24000);
    ok(nullIn.byteLength === 44, 'wav: null input -> valid empty file, no throw');
    const badRate = TD.encodeWavBuffer(new Float32Array([0]), 'junk');
    ok(new DataView(badRate).getUint32(24, true) === 24000, 'wav: invalid sample rate falls back to 24000');
    const rate16k = TD.encodeWavBuffer(new Float32Array([0]), 16000);
    ok(new DataView(rate16k).getUint32(24, true) === 16000 && new DataView(rate16k).getUint32(28, true) === 32000, 'wav: 16000 Hz honored with matching byte rate');
    const blob = TD.encodeWav(new Float32Array([0, 0.5]), 24000);
    ok(blob && blob.type === 'audio/wav' && blob.size === 48, 'encodeWav: Blob type audio/wav, size 48 for 2 samples');
    ok(TD.formatBytes(0) === '0 B' && TD.formatBytes(512) === '512 B' && TD.formatBytes(1536) === '1.5 KB' && TD.formatBytes(92 * 1024 * 1024) === '92.0 MB', 'formatBytes: B/KB/MB formatting');
  }
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

console.log('TTS DOWNLOAD UI (mocked worker)');
{
  const dom = await loadDownloadPage(true);
  const w = dom.window, d = w.document, q = (s) => d.querySelector(s);
  const cap = w.__dlCapture;
  // Lazy: no worker before the first click.
  ok(cap.created.length === 0, 'dl: no worker created before the first Download click (lazy)');
  ok(q('#dl-barwrap').classList.contains('hidden'), 'dl: progress bar hidden before the first click');
  // Empty text: error, no worker.
  q('#download').click();
  ok(q('#msg').textContent.includes('Type or paste some text first.'), 'dl: empty text -> error message');
  ok(cap.created.length === 0, 'dl: empty text spawns no worker');
  ok(q('#download').disabled === false, 'dl: button stays enabled after the empty-text error');
  // Real click: worker spawns, load posted, button disabled, bar visible.
  q('#text-in').value = 'Hello download world.';
  setVal(w, '#rate', '1.5');
  q('#download').click();
  ok(cap.created.length === 1, 'dl: worker spawned on first click');
  const worker = cap.created[0];
  ok(worker.url === 'tts-worker.js' && worker.opts && worker.opts.type === 'module', 'dl: module worker created for tts-worker.js');
  ok(worker.posted.length === 1 && worker.posted[0].type === 'load', 'dl: load posted to the worker');
  ok(q('#download').disabled === true, 'dl: button disabled while busy');
  ok(!q('#dl-barwrap').classList.contains('hidden'), 'dl: progress bar visible while loading');
  ok(q('#status').textContent.includes('88 MB'), 'dl: status explains the one-time model download');
  // Double-click while busy is ignored.
  q('#download').click();
  ok(cap.created.length === 1 && worker.posted.length === 1, 'dl: second click while busy is ignored');
  // Progress: bar transform follows the aggregate (v2 uses scaleX, not width).
  worker.deliver({ type: 'progress', file: 'model_quantized.onnx', loaded: 46 * 1024 * 1024, total: 92 * 1024 * 1024 });
  ok(q('#dl-bar').style.transform === 'scaleX(0.5)', 'dl: bar shows 50% after half the model');
  ok(q('#status').textContent.includes('Downloading the AI voice model'), 'dl: status shows model-download progress');
  // Ready: run posted with the text + clamped speed.
  worker.deliver({ type: 'ready' });
  ok(worker.posted.length === 2 && worker.posted[1].type === 'run' && worker.posted[1].text === 'Hello download world.' && worker.posted[1].speed === 1.5, 'dl: run posted with the text + speed 1.5 after ready');
  // Chunk: status updates, still busy.
  worker.deliver({ type: 'chunk', index: 1 });
  ok(q('#status').textContent.includes('Synthesizing'), 'dl: chunk -> synthesizing status');
  ok(q('#download').disabled === true, 'dl: button still disabled while synthesizing');
  // Result: a real .wav download is triggered.
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  worker.deliver({ type: 'result', samples: samples.buffer, sampling_rate: 24000 });
  ok(cap.blob !== null && cap.blob.type === 'audio/wav' && cap.blob.size === 54, 'dl: download blob is a 54-byte WAV (5 samples)');
  ok(cap.anchor !== null && cap.anchor.download === 'speech.wav' && cap.anchor.href === 'blob:test-wav', 'dl: temp anchor clicked with download=speech.wav');
  ok(q('#download').disabled === false, 'dl: button re-enabled after success');
  ok(q('#msg').textContent.includes('Downloaded speech.wav'), 'dl: success message shown');
  ok(q('#dl-barwrap').classList.contains('hidden'), 'dl: progress bar hidden after success');
  // Second download reuses the loaded worker (no new worker, no load).
  cap.blob = null; cap.anchor = null;
  q('#text-in').value = 'Second download.';
  q('#download').click();
  ok(cap.created.length === 1, 'dl: second download reuses the same worker');
  ok(worker.posted.length === 3 && worker.posted[2].type === 'run' && worker.posted[2].text === 'Second download.', 'dl: second download posts run directly (no reload)');
  worker.deliver({ type: 'result', samples: new Float32Array([0.25]).buffer, sampling_rate: 24000 });
  ok(cap.blob !== null && cap.blob.size === 46 && cap.anchor.download === 'speech.wav', 'dl: second download also triggers a real WAV file');
  // Run-phase error: one retry, then a plain message.
  q('#download').click();
  ok(worker.posted.length === 4 && worker.posted[3].type === 'run', 'dl: third download starts a run');
  worker.deliver({ type: 'error', phase: 'run', message: 'synthesis exploded' });
  ok(cap.created.length === 2, 'dl: run error retries once with a fresh worker');
  ok(worker.terminated === true, 'dl: wedged worker terminated on retry');
  const worker2 = cap.created[1];
  ok(worker2.posted.length === 1 && worker2.posted[0].type === 'load', 'dl: retry worker gets a load message');
  worker2.deliver({ type: 'ready' });
  ok(worker2.posted.length === 2 && worker2.posted[1].type === 'run', 'dl: retry re-runs the same text after ready');
  worker2.deliver({ type: 'error', phase: 'run', message: 'synthesis exploded again' });
  ok(q('#msg').textContent.includes('could not finish on this device'), 'dl: second failure shows a plain error message');
  ok(q('#download').disabled === false, 'dl: button re-enabled after failure');
  ok(worker2.terminated === true, 'dl: failed worker terminated');
  dom.window.close();
}

console.log('TTS DOWNLOAD (load error + no worker)');
{
  // Load-phase network error: plain connection message, no retry loop.
  const dom = await loadDownloadPage(true);
  const w = dom.window, d = w.document, q = (s) => d.querySelector(s);
  const cap = w.__dlCapture;
  q('#text-in').value = 'Hello.';
  q('#download').click();
  ok(cap.created.length === 1, 'dl-err: worker spawned for the load-error case');
  cap.created[0].deliver({ type: 'error', phase: 'load', message: 'Failed to fetch model file' });
  ok(q('#msg').textContent.includes('could not be downloaded'), 'dl-err: load network error -> connection message');
  ok(q('#download').disabled === false, 'dl-err: button re-enabled after load failure');
  ok(cap.created.length === 1, 'dl-err: load network error does not retry (no second worker)');
  dom.window.close();
  // No-Worker browser: plain not-supported message, nothing spawned.
  const dom2 = await loadDownloadPage(false);
  const w2 = dom2.window, d2 = w2.document, q2 = (s) => d2.querySelector(s);
  q2('#text-in').value = 'Hello.';
  q2('#download').click();
  ok(q2('#msg').textContent.includes('does not support the background worker'), 'dl-noworker: no-Worker browser -> plain not-supported message');
  ok(q2('#download').disabled === false, 'dl-noworker: button stays enabled when Worker is missing');
  dom2.window.close();
}

console.log(`\nTTS TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
