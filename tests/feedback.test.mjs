// Tests for the Feedback page (2026-11-16): a site page, not a tool — no tool
// number, no homepage card. With JS the form POSTs to a Google Form backend
// via fetch (no-cors); without JS it posts natively to a hidden iframe.
// These tests verify wiring and validation WITHOUT submitting anything (no
// real POST is ever made — window.fetch is stubbed, and form submissions are
// simulated by dispatching events).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORM_ACTION = 'https://docs.google.com/forms/d/e/1FAIpQLSfD5uphzzmHjnjOpBZ4OgOPUkR6fa55gMd3gZjpHuWspOz8qw/formResponse';
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function loadPage(p) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String((e.detail && e.detail.message) || e.message)));
  const dom = await JSDOM.fromURL(BASE + p, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  await new Promise((res) => {
    if (dom.window.document.readyState === 'complete') res();
    else dom.window.addEventListener('load', res);
    setTimeout(res, 5000);
  });
  await sleep(150);
  return { dom, errors };
}

console.log('FEEDBACK STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'feedback', 'index.html'), 'utf8');
  ok(html.includes('<title>Feedback — Suggest a tool or report a problem | ToolsDaily</title>'), 'feedback: exact title');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/feedback/">'), 'feedback: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'feedback: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'feedback: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'feedback: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'feedback: GA4 tag present');
  ok(!html.includes('No. '), 'feedback: no tool number anywhere (it is a page, not a tool)');
  ok(html.includes('48 tools'), 'feedback: footer still says "48 tools"');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(data && !Array.isArray(data) && data['@type'] === 'FAQPage', 'feedback: JSON-LD parses as a single FAQPage object');
  if (data && data['@type'] === 'FAQPage') {
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (data.mainEntity || []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), 'feedback: FAQPage schema exactly matches the 3 visible FAQs');
  }
  // Form wiring: exact action, method, target, all 5 entry names.
  ok(html.includes(`<form id="feedback-form" method="POST" action="${FORM_ACTION}" target="fb-target">`), 'feedback: form action is the exact formResponse URL, POST, target fb-target');
  for (const entry of ['entry.710891572', 'entry.1158283484', 'entry.504355358', 'entry.1980865801', 'entry.373892500']) {
    ok(html.includes(`name="${entry}"`), `feedback: entry ${entry} present`);
  }
  const typeValues = [...html.matchAll(/name="entry\.710891572" value="([^"]+)"/g)].map((m) => m[1]);
  ok(JSON.stringify(typeValues) === JSON.stringify(['Suggest a new tool', 'Report a problem', 'Other feedback']), 'feedback: type options are exactly the 3 Google Form values');
  ok(html.includes('name="entry.710891572" value="Suggest a new tool" required checked'), 'feedback: "Suggest a new tool" is the required default');
  ok(/<textarea[^>]*name="entry\.504355358"[^>]*minlength="10"[^>]*required/.test(html) || /<textarea[^>]*name="entry\.504355358"[^>]*required[^>]*minlength="10"/.test(html), 'feedback: message textarea is required with minlength 10');
  ok(html.includes('<input type="email" id="fb-email" name="entry.373892500"'), 'feedback: email input is type=email');
  ok(!/name="entry\.1980865801"[^>]*required/.test(html) && !/name="entry\.373892500"[^>]*required/.test(html), 'feedback: name and email are optional (no required)');
  ok(html.includes('<input type="text" id="fb-hp" name="website"'), 'feedback: honeypot input present');
  ok(html.includes('class="hp"'), 'feedback: honeypot wrapper is visually hidden');
  const datalist = html.match(/<datalist id="tool-list">([\s\S]*?)<\/datalist>/)[1];
  const options = [...datalist.matchAll(/<option value="([^"]+)"><\/option>/g)].map((m) => unescapeHtml(m[1]));
  ok(options.length === 48, 'feedback: datalist has exactly 48 tool options');
  ok(options.includes('Compress PDF') && options.includes('QR Code Generator') && options.includes('Dice Roller & Coin Flip'), 'feedback: datalist includes real tool names incl. an &-name');
  ok(new Set(options).size === 48, 'feedback: datalist options are unique');
  ok(html.includes('<iframe name="fb-target" id="fb-target"'), 'feedback: hidden iframe named fb-target present');
  ok(html.includes('Your email is only used to reply to you. We never share it.'), 'feedback: privacy line present');
  ok(html.includes('Prefer email? Write to us via the form above — it lands in our inbox.'), 'feedback: fallback line present');
  ok(html.includes('<noscript>') && html.includes('your message is still recorded when you press Send feedback'), 'feedback: noscript note present');
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  ok((nav.match(/<li>/g) || []).length === 5, 'feedback: More-tools nav has 5 links');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 50, 'sitemap.xml has 50 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/feedback/'), 'sitemap includes feedback');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card[\s"]/g) || []).length === 48, 'home still has exactly 48 tool cards (feedback is not a card)');
  ok(!home.includes('/feedback/" class="tool-card'), 'home has no feedback tool card');
  // Footer Feedback link: homepage + 3 sample tool pages + the feedback page itself.
  ok(home.includes('<a href="/feedback/">Feedback</a>'), 'feedback: homepage footer links to /feedback/');
  for (const slug of ['pdf-compressor', 'word-counter', 'qr-generator']) {
    const page = fs.readFileSync(path.join(SITE, slug, 'index.html'), 'utf8');
    ok(page.includes('<a href="../feedback/">Feedback</a>'), `feedback: ${slug} footer links to ../feedback/`);
  }
  ok(html.includes('<a href="../feedback/">Feedback</a>'), 'feedback: its own footer links to ../feedback/');
  const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(llms.includes('[Feedback](https://toolsdaily.vercel.app/feedback/)'), 'llms.txt mentions the feedback page');
}

console.log('FEEDBACK UI');
{
  const { dom, errors } = await loadPage('feedback/');
  const w = dom.window, d = w.document;
  ok(errors.length === 0, `feedback: zero JS/resource errors${errors.length ? ' — got: ' + errors.join(' | ') : ''}`);
  ok(d.querySelectorAll('h1').length === 1 && d.querySelector('h1').textContent === 'Feedback', 'feedback: exactly one H1, "Feedback"');
  ok(d.title === 'Feedback — Suggest a tool or report a problem | ToolsDaily', 'feedback: document title correct');
  const form = d.querySelector('#feedback-form');
  ok(!!form && form.getAttribute('action') === FORM_ACTION, 'feedback: loaded form action is the exact formResponse URL');
  ok(form.getAttribute('method').toUpperCase() === 'POST' && form.getAttribute('target') === 'fb-target', 'feedback: loaded form is POST to the hidden iframe');
  ok(!!d.querySelector('#fb-tool') && !!d.querySelector('#fb-message') && !!d.querySelector('#fb-name') && !!d.querySelector('#fb-email') && !!d.querySelector('#fb-submit') && !!d.querySelector('#fb-target') && !!d.querySelector('#fb-msg'), 'feedback: all form elements exist');
  ok(w.TD_feedback && w.TD_feedback.minMessageLength === 10, 'feedback: TD_feedback exposed with minMessageLength 10');
  const checked = d.querySelector('input[name="entry.710891572"]:checked');
  ok(checked && checked.value === 'Suggest a new tool', 'feedback: default type is "Suggest a new tool"');
  ok(checked.closest('.pill').classList.contains('on'), 'feedback: default pill carries the .on highlight');
  // Switching pills moves the checked state and the highlight.
  const problem = d.querySelector('input[name="entry.710891572"][value="Report a problem"]');
  problem.checked = true;
  problem.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(d.querySelector('input[name="entry.710891572"]:checked').value === 'Report a problem', 'feedback: clicking "Report a problem" checks it');
  ok(problem.closest('.pill').classList.contains('on') && !checked.closest('.pill').classList.contains('on'), 'feedback: highlight follows the checked pill');
  // Native validation: empty / too-short message fails, 10+ chars passes.
  const message = d.querySelector('#fb-message');
  const submitBtn = d.querySelector('#fb-submit');
  const msgEl = d.querySelector('#fb-msg');
  message.value = '';
  ok(form.checkValidity() === false, 'feedback: empty message fails native validation');
  // jsdom does not enforce minlength in checkValidity, so assert the attribute
  // here (real-browser minlength behaviour is covered by the Playwright check);
  // the JS layer's own length check is tested below.
  ok(message.minLength === 10, 'feedback: message minLength attribute is 10');
  message.value = 'ten chars!';
  ok(form.checkValidity() === true, 'feedback: 10-char message passes native validation');
  // Honeypot filled -> submit blocked silently, button untouched, no message.
  message.value = 'a proper message, long enough';
  d.querySelector('#fb-hp').value = 'http://spam.example';
  const evBot = new w.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(evBot);
  ok(evBot.defaultPrevented === true, 'feedback: honeypot-filled submit is prevented');
  ok(submitBtn.disabled === false && msgEl.textContent === '', 'feedback: honeypot block is silent (button untouched, no message shown)');
  d.querySelector('#fb-hp').value = '';
  // Short message via dispatched submit -> JS layer blocks with a friendly error.
  message.value = 'short';
  const evShort = new w.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(evShort);
  ok(evShort.defaultPrevented === true, 'feedback: short-message submit is prevented by the JS layer');
  ok(msgEl.className.includes('err') && msgEl.textContent.includes('at least 10 characters'), 'feedback: short message shows the friendly inline error');
  // Valid submit -> fetch POSTs the entries (stubbed: no real POST), button
  // disables while sending, then the success state shows and the form resets.
  let fetchArgs = null;
  w.fetch = (url, opts) => { fetchArgs = { url, opts }; return Promise.resolve({}); };
  message.value = 'Please add a Pomodoro timer tool, it would help my study sessions.';
  d.querySelector('#fb-tool').value = 'Compress PDF';
  d.querySelector('#fb-name').value = 'Test User';
  d.querySelector('#fb-email').value = 'test@example.com';
  const evOk = new w.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(evOk);
  ok(evOk.defaultPrevented === true, 'feedback: valid submit is handled by JS (native submit prevented)');
  ok(submitBtn.disabled === true && submitBtn.textContent === 'Sending…', 'feedback: submit button disables and shows Sending… while sending');
  await sleep(50);
  ok(fetchArgs !== null && fetchArgs.url === FORM_ACTION, 'feedback: fetch POSTs to the exact formResponse URL');
  ok(fetchArgs && fetchArgs.opts.method === 'POST' && fetchArgs.opts.mode === 'no-cors', 'feedback: fetch is a no-cors POST');
  const body = fetchArgs ? String(fetchArgs.opts.body) : '';
  ok(body.includes('entry.710891572=Report+a+problem'), 'feedback: fetch body carries the type entry (Report a problem)');
  ok(body.includes('entry.1158283484=Compress+PDF'), 'feedback: fetch body carries the tool entry');
  ok(body.includes('entry.504355358=Please+add+a+Pomodoro'), 'feedback: fetch body carries the message entry');
  ok(body.includes('entry.1980865801=Test+User'), 'feedback: fetch body carries the name entry');
  ok(body.includes('entry.373892500=test%40example.com'), 'feedback: fetch body carries the email entry');
  ok(msgEl.className.includes('ok') && msgEl.textContent === 'Thanks — your message is on its way. We read every one.', 'feedback: fetch success shows the exact success message');
  ok(message.value === '' && d.querySelector('input[name="entry.710891572"]:checked').value === 'Suggest a new tool', 'feedback: form resets after success (message cleared, default type restored)');
  ok(submitBtn.disabled === false && submitBtn.textContent === 'Send feedback', 'feedback: submit button re-enables with its original label after success');
  // A failed fetch shows an honest error (never a fake success) and keeps the
  // message so the user can retry.
  w.fetch = () => Promise.reject(new Error('network down'));
  message.value = 'This send will fail, please keep my text.';
  const evFail = new w.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(evFail);
  await sleep(50);
  ok(msgEl.className.includes('err') && msgEl.textContent.includes('could not be sent'), 'feedback: failed fetch shows the honest error message');
  ok(message.value === 'This send will fail, please keep my text.', 'feedback: failed send keeps the message for a retry');
  ok(submitBtn.disabled === false && submitBtn.textContent === 'Send feedback', 'feedback: submit button re-enables after a failed send');
  // A stray iframe load does nothing (success is driven by fetch, not the iframe).
  msgEl.textContent = '';
  msgEl.className = 'msg';
  d.querySelector('#fb-target').dispatchEvent(new w.Event('load'));
  ok(msgEl.textContent === '', 'feedback: iframe load shows nothing');
  dom.window.close();
}

console.log(`\nFEEDBACK TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
