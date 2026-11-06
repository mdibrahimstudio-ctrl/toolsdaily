// Smoke tests: every page loads over HTTP with zero JS errors and has its key elements.
// Run: start a static server at the site root, then TD_BASE=http://127.0.0.1:8791/ node tests/smoke.test.mjs
import { createRequire } from 'node:module';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

const PAGES = [
  { path: '', name: 'home', selectors: ['#tool-search', '.tool-card', 'footer.site'] },
  { path: 'qr-generator/', name: 'qr-generator', selectors: ['#qr-text', '#qr-size', '#qr-generate', '#dl-png', '#qr-out'] },
  { path: 'image-compressor/', name: 'image-compressor', selectors: ['#file', '#quality', '#maxw', '#compress', '#drop'] },
  { path: 'image-converter/', name: 'image-converter', selectors: ['#file', '#format', '#convert'] },
  { path: 'word-counter/', name: 'word-counter', selectors: ['#text', '#c-words', '#c-chars', '#clean'] },
  { path: 'password-generator/', name: 'password-generator', selectors: ['#pwd', '#length', '#gen', '#copy', '#strength'] },
  { path: 'age-calculator/', name: 'age-calculator', selectors: ['#dob', '#at', '#calc', '#results'] },
  { path: 'unit-converter/', name: 'unit-converter', selectors: ['#cat', '#from', '#to', '#val', '#result', '#swap'] },
  { path: 'color-converter/', name: 'color-converter', selectors: ['#picker', '#hex', '#v-rgb', '#v-hsl', '#v-hsv'] },
  { path: 'text-case-converter/', name: 'text-case-converter', selectors: ['#text', '[data-case="upper"]', '[data-case="reverse"]', '#copy'] },
  { path: 'json-formatter/', name: 'json-formatter', selectors: ['#json-in', '#json-out', '#fmt', '#min', '#validate'] },
  { path: 'pdf-merge/', name: 'pdf-merge', selectors: ['#file', '#merge', '#clear', '#file-list', '#dl', '#drop'] },
  { path: 'pdf-split/', name: 'pdf-split', selectors: ['#file', '#range', '#split', '#file-info', '#dl', '#drop'] },
  { path: 'image-to-pdf/', name: 'image-to-pdf', selectors: ['#file', '#convert', '#clear', '#file-list', '#dl', '#drop'] },
  { path: 'bmi-calculator/', name: 'bmi-calculator', selectors: ['#weight', '#height-unit', '#height-cm', '#height-ft', '#height-in', '#calc', '#results'] },
  { path: 'emi-calculator/', name: 'emi-calculator', selectors: ['#amount', '#rate', '#tenure', '#tenure-unit', '#r-emi', '#r-interest', '#r-total'] },
  { path: 'percentage-calculator/', name: 'percentage-calculator', selectors: ['#a-x', '#a-y', '#a-result', '#b-part', '#b-whole', '#b-result', '#c-from', '#c-to', '#c-result'] },
  { path: 'image-resizer/', name: 'image-resizer', selectors: ['#file', '#mode', '#width', '#height', '#percent', '#lock', '#format', '#resize', '#results'] },
  { path: 'base64-encoder-decoder/', name: 'base64-encoder-decoder', selectors: ['#text-in', '#btn-encode', '#btn-decode', '#text-out', '#file-in', '#btn-file-encode', '#file-out', '#b64-in', '#dl-name', '#btn-b64-decode', '#b64-dl'] },
  { path: 'date-difference-calculator/', name: 'date-difference-calculator', selectors: ['#date-from', '#date-to', '#include-end', '#calc', '#swap', '#results', '#add-date', '#add-days', '#add-calc', '#add-result'] },
  { path: 'qr-reader/', name: 'qr-reader', selectors: ['#file', '#drop', '#preview', '#decode', '#clear', '#copy', '#result', '#open-link', '#msg'] },
  { path: 'background-remover/', name: 'background-remover', selectors: ['#file', '#go', '#drop', '#out', '#dl', '#cmp', '#bar'] },
  { path: 'lorem-ipsum-generator/', name: 'lorem-ipsum-generator', selectors: ['#gen-type', '#gen-count', '#classic-start', '#generate', '#copy', '#download', '#output', '#st-words', '#st-chars'] },
  { path: 'random-number-generator/', name: 'random-number-generator', selectors: ['#rng-min', '#rng-max', '#rng-count', '#rng-unique', '#rng-sort', '#generate', '#copy', '#download', '#output', '#st-count', '#st-min', '#st-max'] },
];

async function loadPage(path) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String((e.detail && e.detail.message) || e.message)));
  const dom = await JSDOM.fromURL(BASE + path, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 3000);
  });
  await new Promise((r) => setTimeout(r, 150));
  return { dom, errors };
}

for (const page of PAGES) {
  console.log('PAGE', page.name);
  try {
    const { dom, errors } = await loadPage(page.path);
    ok(errors.length === 0, `${page.name}: zero JS/resource errors${errors.length ? ' — got: ' + errors.join(' | ') : ''}`);
    ok(dom.window.document.querySelectorAll('h1').length === 1, `${page.name}: exactly one H1`);
    ok(!!dom.window.document.title && dom.window.document.title.length > 3, `${page.name}: has a title`);
    for (const sel of page.selectors) ok(!!dom.window.document.querySelector(sel), `${page.name}: element ${sel} exists`);
    dom.window.close();
  } catch (e) {
    ok(false, `${page.name}: page loaded (${e.message})`);
  }
}
console.log(`\nSMOKE TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
