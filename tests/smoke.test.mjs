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
  { path: 'image-compressor/', name: 'image-compressor', selectors: ['#file', '#quality', '#maxw', '#compress', '#download', '#drop'] },
  { path: 'image-converter/', name: 'image-converter', selectors: ['#file', '#format', '#convert', '#download'] },
  { path: 'word-counter/', name: 'word-counter', selectors: ['#text', '#c-words', '#c-chars', '#clean'] },
  { path: 'password-generator/', name: 'password-generator', selectors: ['#pwd', '#length', '#gen', '#copy', '#strength'] },
  { path: 'age-calculator/', name: 'age-calculator', selectors: ['#dob', '#at', '#calc', '#results'] },
  { path: 'unit-converter/', name: 'unit-converter', selectors: ['#cat', '#from', '#to', '#val', '#result', '#swap'] },
  { path: 'color-converter/', name: 'color-converter', selectors: ['#picker', '#hex', '#v-rgb', '#v-hsl', '#v-hsv'] },
  { path: 'text-case-converter/', name: 'text-case-converter', selectors: ['#text', '[data-case="upper"]', '[data-case="reverse"]', '#copy', '#download'] },
  { path: 'json-formatter/', name: 'json-formatter', selectors: ['#json-in', '#json-out', '#fmt', '#min', '#validate', '#dl-json'] },
  { path: 'pdf-merge/', name: 'pdf-merge', selectors: ['#file', '#merge', '#clear', '#file-list', '#dl', '#download', '#drop'] },
  { path: 'pdf-split/', name: 'pdf-split', selectors: ['#file', '#range', '#split', '#file-info', '#dl', '#download', '#drop'] },
  { path: 'image-to-pdf/', name: 'image-to-pdf', selectors: ['#file', '#convert', '#clear', '#file-list', '#dl', '#download', '#drop'] },
  { path: 'bmi-calculator/', name: 'bmi-calculator', selectors: ['#weight', '#height-unit', '#height-cm', '#height-ft', '#height-in', '#calc', '#results'] },
  { path: 'emi-calculator/', name: 'emi-calculator', selectors: ['#amount', '#rate', '#tenure', '#tenure-unit', '#r-emi', '#r-interest', '#r-total', '#download'] },
  { path: 'percentage-calculator/', name: 'percentage-calculator', selectors: ['#a-x', '#a-y', '#a-result', '#b-part', '#b-whole', '#b-result', '#c-from', '#c-to', '#c-result'] },
  { path: 'image-resizer/', name: 'image-resizer', selectors: ['#file', '#mode', '#width', '#height', '#percent', '#lock', '#format', '#resize', '#download', '#results'] },
  { path: 'image-synthid-remover/', name: 'image-synthid-remover', selectors: ['#file', '#drop', '#clean', '#download', '#dl', '#msg', '#preview'] },
  { path: 'base64-encoder-decoder/', name: 'base64-encoder-decoder', selectors: ['#text-in', '#btn-encode', '#btn-decode', '#text-out', '#file-in', '#btn-file-encode', '#btn-file-download', '#file-out', '#b64-in', '#dl-name', '#btn-b64-decode', '#btn-b64-download', '#b64-dl'] },
  { path: 'date-difference-calculator/', name: 'date-difference-calculator', selectors: ['#date-from', '#date-to', '#include-end', '#calc', '#swap', '#results', '#add-date', '#add-days', '#add-calc', '#add-result'] },
  { path: 'qr-reader/', name: 'qr-reader', selectors: ['#file', '#drop', '#preview', '#decode', '#clear', '#copy', '#download', '#result', '#open-link', '#msg'] },
  { path: 'background-remover/', name: 'background-remover', selectors: ['#file', '#go', '#drop', '#out', '#dl', '#download', '#cmp', '#bar'] },
  { path: 'lorem-ipsum-generator/', name: 'lorem-ipsum-generator', selectors: ['#gen-type', '#gen-count', '#classic-start', '#generate', '#copy', '#download', '#output', '#st-words', '#st-chars'] },
  { path: 'random-number-generator/', name: 'random-number-generator', selectors: ['#rng-min', '#rng-max', '#rng-count', '#rng-unique', '#rng-sort', '#generate', '#copy', '#download', '#output', '#st-count', '#st-min', '#st-max'] },
  { path: 'tip-calculator/', name: 'tip-calculator', selectors: ['#bill', '#tip-pct', '#people', '[data-tip="20"]', '#tip-amount', '#total', '#per-person', '#per-person-tip', '#copy', '#download', '#dl'] },
  { path: 'url-encoder-decoder/', name: 'url-encoder-decoder', selectors: ['#text-in', '#mode-component', '#mode-full', '#plus-space', '#btn-encode', '#btn-decode', '#copy-out', '#download', '#text-out', '#st-in', '#st-out', '#st-encoded'] },
  { path: 'remove-duplicate-lines/', name: 'remove-duplicate-lines', selectors: ['#text-in', '#opt-insensitive', '#opt-trim', '#opt-empty', '#opt-sort', '#btn-dedupe', '#copy-out', '#download', '#text-out', '#st-in', '#st-out', '#st-removed', '#st-empty'] },
  { path: 'audio-transcriber/', name: 'audio-transcriber', selectors: ['#file', '#drop', '#lang', '#go', '#cancel', '#bar', '#out-text', '#copy', '#download-txt', '#download-srt', '#dl-txt', '#dl-srt', '#msg'] },
  { path: 'morse-code-translator/', name: 'morse-code-translator', selectors: ['#text-in', '#mode-encode', '#mode-decode', '#btn-swap', '#word-sep', '#wpm', '#btn-play', '#btn-convert', '#copy-out', '#download', '#text-out', '#st-in', '#st-out', '#st-symbols', '#st-words'] },
  { path: 'uuid-generator/', name: 'uuid-generator', selectors: ['#uuid-version-v4', '#uuid-version-v1', '#uuid-count', '#uuid-uppercase', '#uuid-no-hyphens', '#uuid-braces', '#uuid-sep', '#generate', '#copy', '#download', '#output', '#st-count', '#st-unique', '#st-version', '#validate-in', '#validate-btn', '#validate-msg'] },
  { path: 'stopwatch-countdown-timer/', name: 'stopwatch-countdown-timer', selectors: ['#tab-stopwatch', '#tab-timer', '#section-stopwatch', '#section-timer', '#sw-display', '#sw-start', '#sw-lap', '#sw-reset', '#sw-laps', '#st-laps', '#st-fastest', '#st-slowest', '#cd-display', '#cd-hours', '#cd-minutes', '#cd-seconds', '#cd-start', '#cd-reset', '#cd-bar', '#download', '[data-preset="1500"]'] },
  { path: 'text-to-speech/', name: 'text-to-speech', selectors: ['#text-in', '#voice', '#rate', '#pitch', '#volume', '#speak', '#pause', '#resume', '#stop', '#download', '#dl-barwrap', '#dl-bar', '#sample', '#clear', '#st-words', '#st-chars', '#st-time', '#st-chunks', '#msg', '#status', '#current'] },
  { path: 'image-cropper/', name: 'image-cropper', selectors: ['#file', '#drop', '#stage', '#stage-img', '#crop-box', '#cx', '#cy', '#cw', '#ch', '#format', '#crop', '#download', '#results'] },
  { path: 'fancy-text-generator/', name: 'fancy-text-generator', selectors: ['#text-in', '#styles-list', '#download', '#dl', '#st-chars', '#st-words', '#st-styles', '.style-row', '[data-copy="bold"]', '#out-bold'] },
  { path: 'gpa-calculator/', name: 'gpa-calculator', selectors: ['#courses', '#add-course', '#clear-courses', '#st-gpa', '#st-credits', '#st-courses', '#r-gpa', '#download', '#dl', '#msg', '#target-current', '#target-completed', '#target-goal', '#target-planned', '#target-calc', '#target-result', '#target-needed', '.course-row'] },
  { path: 'binary-text-converter/', name: 'binary-text-converter', selectors: ['#mode-encode', '#mode-decode', '#text-in', '#sep', '#btn-convert', '#btn-swap', '#text-out', '#st-in', '#st-out', '#st-bits', '#copy-out', '#download', '#dl', '#msg'] },
  { path: 'dice-roller-coin-flip/', name: 'dice-roller-coin-flip', selectors: ['#dice-sides', '#dice-count', '#roll', '#clear-history', '#dice-results', '#dice-total', '#st-rolls', '#st-highest', '#st-lowest', '#dice-history', '#coin-flip', '#coin-result', '#coin-heads', '#coin-tails', '#coin-flips', '#msg', '#coin-msg'] },
  { path: 'username-generator/', name: 'username-generator', selectors: ['#keyword', '#style', '#count', '#generate', '#copy-all', '#download', '#dl', '#msg', '#st-count', '#st-style', '#st-keyword', '#results-list', '.name-row', '[data-copy]'] },
  { path: 'pdf-compressor/', name: 'pdf-compressor', selectors: ['#file', '#quality', '#compress', '#download', '#dl', '#drop', '#results'] },
  { path: 'pdf-to-word/', name: 'pdf-to-word', selectors: ['#file', '#convert', '#download', '#dl', '#drop', '#file-info'] },
  { path: 'pdf-to-image/', name: 'pdf-to-image', selectors: ['#file', '#format', '#dpi', '#convert', '#download', '#dl', '#drop', '#thumbs'] },
  { path: 'sign-pdf/', name: 'sign-pdf', selectors: ['#file', '#sig-canvas', '#sig-name', '#sig-file', '#sign', '#download', '#dl', '#drop', '#pages-mode', '#position'] },
  { path: 'unlock-pdf/', name: 'unlock-pdf', selectors: ['#file', '#password', '#unlock', '#download', '#dl', '#drop'] },
  { path: 'protect-pdf/', name: 'protect-pdf', selectors: ['#file', '#password', '#confirm-password', '#protect', '#download', '#dl', '#drop'] },
  { path: 'organize-pdf/', name: 'organize-pdf', selectors: ['#file', '#pages', '#save', '#reset', '#download', '#dl', '#drop'] },
  { path: 'watermark-pdf/', name: 'watermark-pdf', selectors: ['#file', '#wm-text', '#opacity', '#angle', '#watermark', '#download', '#dl', '#drop', '#tab-text', '#tab-image'] },
  { path: 'add-page-numbers/', name: 'add-page-numbers', selectors: ['#file', '#format', '#position', '#start-page', '#add-numbers', '#download', '#dl', '#drop'] },
  { path: 'ocr-pdf/', name: 'ocr-pdf', selectors: ['#file', '#ocr', '#download', '#dl', '#drop', '#results', '#status'] },
  { path: 'word-frequency-counter/', name: 'word-frequency-counter', selectors: ['#text-in', '#opt-ignore-case', '#opt-stop-words', '#opt-top-n', '#btn-analyze', '#freq-table', '#freq-body', '#st-words', '#st-unique', '#st-top', '#copy', '#download', '#dl', '#msg'] },
  { path: 'compound-interest-calculator/', name: 'compound-interest-calculator', selectors: ['#principal', '#monthly', '#rate', '#years', '#frequency', '#calc', '#r-future', '#r-contrib', '#r-interest', '#year-table', '#year-body', '#chart', '#download', '#dl', '#msg'] },
  { path: 'loan-calculator/', name: 'loan-calculator', selectors: ['#amount', '#rate', '#term', '#term-unit', '#extra', '#calc', '#r-payment', '#r-interest', '#r-total', '#r-months', '#sched-table', '#sched-body', '#download', '#dl', '#msg'] },
  { path: 'mortgage-calculator/', name: 'mortgage-calculator', selectors: ['#price', '#down', '#rate', '#term', '#tax', '#insurance', '#pmi-rate', '#calc', '#r-pi', '#r-tax', '#r-ins', '#r-pmi', '#r-total', '#r-loan', '#pmi-note', '#sched-table', '#sched-body', '#download', '#dl', '#msg'] },
  { path: 'calorie-tdee-calculator/', name: 'calorie-tdee-calculator', selectors: ['#age', '#sex', '#unit', '#weight', '#height-cm', '#weight-lb', '#height-ft', '#height-in', '#activity', '#calc', '#r-bmr', '#r-tdee', '#r-cut', '#r-maintain', '#r-bulk', '#goal-note', '#msg'] },
  { path: 'discount-calculator/', name: 'discount-calculator', selectors: ['#price', '#pct', '#qty', '#calc', '#copy', '#download', '#dl', '#r-final', '#r-savings', '#r-orig', '#r-each', '#msg'] },
  { path: 'currency-converter/', name: 'currency-converter', selectors: ['#amount', '#from', '#to', '#swap', '#result', '#rate-line', '#rate-source', '#msg'] },
  { path: 'salary-pay-calculator/', name: 'salary-pay-calculator', selectors: ['#pay', '#period', '#hours', '#ot', '#ot-hours', '#calc', '#copy', '#download', '#dl', '#r-hourly', '#r-weekly', '#r-biweekly', '#r-monthly', '#r-annual', '#r-ot', '#msg'] },
  { path: 'vat-tax-calculator/', name: 'vat-tax-calculator', selectors: ['#amount', '#rate', '#mode', '#calc', '#copy', '#download', '#dl', '#r-net', '#r-tax', '#r-gross', '#msg'] },
  { path: 'markup-margin-calculator/', name: 'markup-margin-calculator', selectors: ['#cost', '#price', '#target-margin', '#calc', '#calc-price', '#copy', '#download', '#dl', '#r-markup', '#r-margin', '#r-profit', '#r-price', '#msg'] },
  { path: 'feedback/', name: 'feedback', selectors: ['#feedback-form', '#fb-tool', '#fb-message', '#fb-name', '#fb-email', '#fb-submit', '#fb-target', '#fb-msg'] },
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
