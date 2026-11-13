// Logic + structure tests for the AI Audio Transcriber (2026-11-10 daily tool).
// Static fidelity checks (SEO head, JSON-LD vs visible FAQ, interlinking, vercel
// headers), worker source checks, and jsdom tests of the page's pure helpers
// (window.TD_transcriber: buildSrt / formatSrtTime / formatClock) + file picking.
// The Whisper engine itself is proven end-to-end in Node (see the JFK e2e run:
// onnx-community/whisper-tiny, dtype q8, transcript contains "fellow americans").
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

console.log('TRANSCRIBER STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'audio-transcriber', 'index.html'), 'utf8');
  ok(html.includes('<title>AI Audio Transcriber'), 'transcriber: title mentions AI Audio Transcriber');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/audio-transcriber/">'), 'transcriber: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'transcriber: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'transcriber: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'transcriber: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'transcriber: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'transcriber: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'AI Audio Transcriber' && app.url === 'https://toolsdaily.vercel.app/audio-transcriber/' && app.offers.price === '0', 'transcriber: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `transcriber: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator', 'qr-reader', 'background-remover', 'lorem-ipsum-generator', 'random-number-generator', 'tip-calculator', 'url-encoder-decoder', 'image-synthid-remover', 'remove-duplicate-lines'];
  ok(others.length === 27 && others.every((s) => html.includes(`href="../${s}/"`)), 'transcriber: More-tools nav links all other 27 tools');
  // Cross-linking: every other tool page links back here (bg-remover pattern).
  let linked = 0;
  for (const s of others) {
    if (fs.readFileSync(path.join(SITE, s, 'index.html'), 'utf8').includes('href="../audio-transcriber/"')) linked++;
  }
  ok(linked === 27, `transcriber: cross-linked from ${linked}/27 other tool pages`);
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 33, 'sitemap.xml has 32 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/audio-transcriber/'), 'sitemap includes audio-transcriber');
  ok(/audio-transcriber\/<\/loc>\s*<lastmod>2026-11-10<\/lastmod>/.test(sitemap), 'sitemap audio-transcriber lastmod is 2026-11-10');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 32, 'home has exactly 32 tool cards');
  ok(home.includes('href="audio-transcriber/"'), 'home card links audio-transcriber');
  ok(home.includes('AI Audio Transcriber</h3>'), 'home has the transcriber card');
  ok(home.includes('Thirty-two handy tools'), 'home lead says Thirty-two tools');
  const vj = JSON.parse(fs.readFileSync(path.join(SITE, 'vercel.json'), 'utf8'));
  const all = JSON.stringify(vj);
  ok(all.includes('/audio-transcriber'), 'vercel.json has COOP/COEP for /audio-transcriber');
  ok(all.includes('/audio-transcriber/(.*)'), 'vercel.json COOP/COEP covers the tool subpaths, incl. asr-worker.js');
}

console.log('TRANSCRIBER WORKER');
{
  const wpath = path.join(SITE, 'audio-transcriber', 'asr-worker.js');
  ok(fs.existsSync(wpath), 'asr-worker.js exists');
  let syntaxOk = true;
  try { execFileSync('node', ['--check', wpath], { stdio: 'pipe' }); } catch (e) { syntaxOk = false; console.log('    worker syntax error:', String(e.stderr || e.message)); }
  ok(syntaxOk, 'asr-worker.js parses without syntax errors (node --check)');
  const src = fs.readFileSync(wpath, 'utf8');
  ok(src.includes("from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js'"), 'worker imports Transformers.js v3.8.1 from the jsDelivr CDN (not vendored)');
  ok(src.includes("pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny'"), 'worker builds the ASR pipeline on onnx-community/whisper-tiny');
  ok(src.includes("dtype: 'q8'"), 'worker uses the quantized (q8) model files');
  ok(src.includes("device: 'wasm'"), 'worker runs on WASM (no WebGPU dependency)');
  ok(src.includes('return_timestamps: true'), 'worker requests chunk timestamps (needed for .srt)');
  ok(src.includes('allowLocalModels = false'), 'worker loads the model from the HF CDN only');
  ok(src.includes('crossOriginIsolated') && src.includes('numThreads'), 'worker sets WASM threads defensively (no SharedArrayBuffer requirement)');
  const page = fs.readFileSync(path.join(SITE, 'audio-transcriber', 'index.html'), 'utf8');
  ok(page.includes("new Worker('asr-worker.js',{type:'module'})"), 'page runs the engine in the module worker');
  ok(page.includes('worker.terminate()'), 'page recovers/cancels by terminating the worker');
}

console.log('TRANSCRIBER CORE');
{
  const dom = await loadPage('audio-transcriber/');
  const w = dom.window, TD = w.TD_transcriber;
  ok(TD && typeof TD.buildSrt === 'function' && typeof TD.formatSrtTime === 'function' && typeof TD.formatClock === 'function', 'TD_transcriber exposed with buildSrt/formatSrtTime/formatClock');
  ok(TD.formatSrtTime(0) === '00:00:00,000', 'srt time: 0 -> 00:00:00,000');
  ok(TD.formatSrtTime(1.5) === '00:00:01,500', 'srt time: 1.5 -> 00:00:01,500');
  ok(TD.formatSrtTime(61.25) === '00:01:01,250', 'srt time: 61.25 -> 00:01:01,250');
  ok(TD.formatSrtTime(3661.007) === '01:01:01,007', 'srt time: 3661.007 -> 01:01:01,007');
  ok(TD.formatSrtTime(-3) === '00:00:00,000' && TD.formatSrtTime(NaN) === '00:00:00,000', 'srt time: negative/NaN clamp to zero');
  ok(TD.formatClock(47) === '0:47' && TD.formatClock(83) === '1:23' && TD.formatClock(3671) === '1:01:11', 'clock: 47 -> 0:47, 83 -> 1:23, 3671 -> 1:01:11');
  const srt = TD.buildSrt([
    { text: ' Hello there.', timestamp: [0, 2.5] },
    { text: ' General Kenobi.', timestamp: [2.5, 5] },
  ], 5);
  ok(srt === '1\n00:00:00,000 --> 00:00:02,500\nHello there.\n\n2\n00:00:02,500 --> 00:00:05,000\nGeneral Kenobi.\n', 'buildSrt: two chunks produce exact SRT (trimmed text, numbered, timed)');
  const srt2 = TD.buildSrt([
    { text: 'One', timestamp: [0, null] },
    { text: 'Two', timestamp: [4, null] },
  ], 9);
  ok(srt2 === '1\n00:00:00,000 --> 00:00:04,000\nOne\n\n2\n00:00:04,000 --> 00:00:09,000\nTwo\n', 'buildSrt: null end falls back to next start, then to the audio duration');
  const srt3 = TD.buildSrt([{ text: 'Solo', timestamp: [3, null] }]);
  ok(srt3 === '1\n00:00:03,000 --> 00:00:08,000\nSolo\n', 'buildSrt: null end with no next/duration falls back to start+5');
  ok(TD.buildSrt([], 10) === '' && TD.buildSrt([{ text: '   ', timestamp: [0, 1] }], 10) === '', 'buildSrt: no speech chunks -> empty string (page hides the .srt button)');
  // Language options required by the spec.
  const langVals = [...w.document.querySelectorAll('#lang option')].map((o) => o.value);
  for (const v of ['', 'english', 'bengali', 'hindi', 'urdu', 'spanish', 'french', 'arabic']) {
    ok(langVals.includes(v), `language option present: ${v || 'auto detect'}`);
  }
  ok(w.document.querySelector('#go').disabled === true, 'Transcribe starts disabled (no file chosen)');
  // File picking: an audio file enables the button; a non-audio file errors.
  const input = w.document.querySelector('#file');
  const fAudio = new w.File([new w.Uint8Array([1, 2, 3])], 'memo.mp3', { type: 'audio/mpeg' });
  Object.defineProperty(input, 'files', { value: [fAudio], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.document.querySelector('#go').disabled === false, 'audio file enables Transcribe');
  ok(w.document.querySelector('#selmsg').textContent.includes('memo.mp3'), 'selection message names the file');
  const fTxt = new w.File(['hello'], 'notes.txt', { type: 'text/plain' });
  Object.defineProperty(input, 'files', { value: [fTxt], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.document.querySelector('#selmsg').textContent.includes('does not look like audio'), 'non-audio file shows the friendly error');
  dom.window.close();
}

console.log(`\nTRANSCRIBER TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
