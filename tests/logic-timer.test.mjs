// Logic + UI tests for the Stopwatch & Countdown Timer tool (2026-11-12 daily tool).
// Drives the real page code through jsdom; core functions are window.TD_timer.
// The timer cores take an injectable clock / explicit timestamps, so tests are deterministic.
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

console.log('TIMER STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'stopwatch-countdown-timer', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/stopwatch-countdown-timer/">'), 'timer: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'timer: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'timer: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'timer: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'timer: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'timer: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Stopwatch & Countdown Timer' && app.url === 'https://toolsdaily.vercel.app/stopwatch-countdown-timer/' && app.offers.price === '0', 'timer: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `timer: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const others = ['qr-generator', 'image-compressor', 'image-converter', 'word-counter', 'password-generator', 'age-calculator', 'unit-converter', 'color-converter', 'text-case-converter', 'json-formatter', 'pdf-merge', 'pdf-split', 'image-to-pdf', 'bmi-calculator', 'emi-calculator', 'percentage-calculator', 'image-resizer', 'base64-encoder-decoder', 'date-difference-calculator', 'qr-reader', 'background-remover', 'lorem-ipsum-generator', 'random-number-generator', 'tip-calculator', 'url-encoder-decoder', 'image-synthid-remover', 'remove-duplicate-lines', 'audio-transcriber', 'morse-code-translator', 'uuid-generator'];
  ok(others.length === 30 && others.every((s) => html.includes(`href="../${s}/"`)), 'timer: More-tools nav links all other 30 tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 33, 'sitemap.xml has 32 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/stopwatch-countdown-timer/'), 'sitemap includes stopwatch-countdown-timer');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card"/g) || []).length === 32, 'home has exactly 32 tool cards');
  ok(home.includes('href="stopwatch-countdown-timer/"'), 'home cards + nav include stopwatch-countdown-timer');
  ok(home.includes('Thirty-two handy tools'), 'home lead says Thirty-two tools');
  ok(home.includes('Search 32 tools'), 'home search placeholder says 32 tools');
  ok(home.includes('Calculators <span class="n">7</span>'), 'home Calculators chip says 7');
  const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(llms.includes('https://toolsdaily.vercel.app/stopwatch-countdown-timer/'), 'llms.txt lists the new tool');
  ok(llms.includes('browse all 32 free tools'), 'llms.txt says 32 tools');
}

console.log('TIMER CORE');
{
  const dom = await loadPage('stopwatch-countdown-timer/');
  const w = dom.window, TD = w.TD_timer;
  ok(TD && typeof TD.formatElapsed === 'function' && typeof TD.createStopwatch === 'function' && typeof TD.createCountdown === 'function', 'TD_timer exposed');
  // formatElapsed: MM:SS.cc, HH:MM:SS.cc past one hour.
  ok(TD.formatElapsed(0) === '00:00.00', 'formatElapsed: 0 -> 00:00.00');
  ok(TD.formatElapsed(12345) === '00:12.34', 'formatElapsed: 12345 ms -> 00:12.34 (centiseconds truncate, not round)');
  ok(TD.formatElapsed(59999) === '00:59.99', 'formatElapsed: 59999 ms -> 00:59.99');
  ok(TD.formatElapsed(60000) === '01:00.00', 'formatElapsed: 60000 ms -> 01:00.00');
  ok(TD.formatElapsed(3723456) === '01:02:03.45', 'formatElapsed: 3723456 ms -> 01:02:03.45 (hours shown)');
  ok(TD.formatElapsed(3600000) === '01:00:00.00', 'formatElapsed: exactly 1 hour -> 01:00:00.00');
  ok(TD.formatElapsed(-500) === '00:00.00', 'formatElapsed: negative clamps to 00:00.00');
  ok(TD.formatElapsed(10) === '00:00.01', 'formatElapsed: 10 ms -> 00:00.01');
  // formatCountdown: MM:SS / HH:MM:SS, rounds UP to the next whole second.
  ok(TD.formatCountdown(300000) === '05:00', 'formatCountdown: 300000 ms -> 05:00');
  ok(TD.formatCountdown(0) === '00:00', 'formatCountdown: 0 -> 00:00');
  ok(TD.formatCountdown(500) === '00:01', 'formatCountdown: 500 ms -> 00:01 (ceil, not floor)');
  ok(TD.formatCountdown(59999) === '01:00', 'formatCountdown: 59999 ms -> 01:00 (ceil to the next second)');
  ok(TD.formatCountdown(3661000) === '01:01:01', 'formatCountdown: 3661000 ms -> 01:01:01 (hours shown)');
  ok(TD.formatCountdown(3600000) === '01:00:00', 'formatCountdown: exactly 1 hour -> 01:00:00');
  ok(TD.formatCountdown(-100) === '00:00', 'formatCountdown: negative clamps to 00:00');
  // parseDuration: clamps fields, errors only on a zero total.
  let d = TD.parseDuration(0, 5, 0);
  ok(d.ms === 300000 && d.hours === 0 && d.minutes === 5 && d.seconds === 0 && !d.error, 'parseDuration: 0/5/0 -> 300000 ms');
  d = TD.parseDuration(1, 30, 45);
  ok(d.ms === 5445000, 'parseDuration: 1/30/45 -> 5445000 ms');
  d = TD.parseDuration(0, 0, 0);
  ok(!!d.error, 'parseDuration: 0/0/0 errors');
  d = TD.parseDuration('', '', '');
  ok(!!d.error, 'parseDuration: blank inputs error');
  d = TD.parseDuration(0, 90, 0);
  ok(d.ms === 3540000 && d.minutes === 59, 'parseDuration: minutes 90 clamps to 59');
  d = TD.parseDuration(99, 0, 0);
  ok(d.hours === 23 && d.ms === 82800000, 'parseDuration: hours 99 clamps to 23');
  d = TD.parseDuration(0, 0, -5);
  ok(!!d.error, 'parseDuration: negative seconds clamp to 0, total 0 errors');
  d = TD.parseDuration('2', 'x', '30');
  ok(d.ms === 7230000 && d.minutes === 0, 'parseDuration: non-numeric minutes fall back to 0');
  // presetToParts.
  ok(JSON.stringify(TD.presetToParts(60)) === '{"hours":0,"minutes":1,"seconds":0}', 'presetToParts: 60 s -> 0/1/0');
  ok(JSON.stringify(TD.presetToParts(1500)) === '{"hours":0,"minutes":25,"seconds":0}', 'presetToParts: 1500 s -> 0/25/0 (Pomodoro)');
  ok(JSON.stringify(TD.presetToParts(3600)) === '{"hours":1,"minutes":0,"seconds":0}', 'presetToParts: 3600 s -> 1/0/0');
  ok(JSON.stringify(TD.presetToParts(3661)) === '{"hours":1,"minutes":1,"seconds":1}', 'presetToParts: 3661 s -> 1/1/1');
  // Stopwatch state machine with a fake clock (timestamps in ms).
  let now = 1000000;
  const sw = TD.createStopwatch(() => now);
  ok(sw.elapsed() === 0 && sw.isRunning() === false, 'stopwatch: starts at 0, not running');
  ok(sw.lap() === null, 'stopwatch: lap before start returns null');
  ok(sw.pause() === false, 'stopwatch: pause before start returns false');
  ok(sw.start() === true, 'stopwatch: start returns true');
  ok(sw.start() === false, 'stopwatch: second start returns false (already running)');
  now += 12345;
  ok(sw.elapsed() === 12345, 'stopwatch: 12345 ms after start -> elapsed 12345');
  let lap = sw.lap();
  ok(lap && lap.n === 1 && lap.lapMs === 12345 && lap.totalMs === 12345, 'stopwatch: first lap at 12345 ms -> lap 12345, total 12345');
  now += 5000;
  lap = sw.lap();
  ok(lap && lap.n === 2 && lap.lapMs === 5000 && lap.totalMs === 17345, 'stopwatch: second lap 5000 ms later -> lap 5000, total 17345');
  ok(sw.pause() === true && sw.isRunning() === false, 'stopwatch: pause returns true and stops running');
  now += 99999; // time passes while paused
  ok(sw.elapsed() === 17345, 'stopwatch: elapsed frozen at 17345 while paused');
  ok(sw.start() === true, 'stopwatch: resume returns true');
  now += 1000;
  ok(sw.elapsed() === 18345, 'stopwatch: resume adds only the running time (18345)');
  sw.reset();
  ok(sw.elapsed() === 0 && sw.isRunning() === false && sw.getLaps().length === 0, 'stopwatch: reset clears elapsed, running and laps');
  // Explicit-timestamp API (no clock needed).
  const sw2 = TD.createStopwatch(() => 0);
  sw2.start(5000);
  ok(sw2.elapsed(8000) === 3000, 'stopwatch: explicit timestamps work (start 5000, at 8000 -> 3000)');
  const st = sw2.getState(9000);
  ok(st.running === true && st.elapsedMs === 4000 && st.laps.length === 0, 'stopwatch: getState reports running + elapsed 4000');
  // computeLapStats.
  let stats = TD.computeLapStats([]);
  ok(stats.fastest === null && stats.slowest === null, 'lap stats: no laps -> nulls');
  stats = TD.computeLapStats([{ n: 1, lapMs: 5000, totalMs: 5000 }]);
  ok(stats.fastest.n === 1 && stats.slowest.n === 1, 'lap stats: single lap is both fastest and slowest');
  stats = TD.computeLapStats([
    { n: 1, lapMs: 10000, totalMs: 10000 },
    { n: 2, lapMs: 4000, totalMs: 14000 },
    { n: 3, lapMs: 7000, totalMs: 21000 },
  ]);
  ok(stats.fastest.n === 2 && stats.slowest.n === 1, 'lap stats: fastest lap 2 (4000), slowest lap 1 (10000)');
  // Countdown state machine with a fake clock.
  let fires = 0;
  let cnow = 2000000;
  const cd = TD.createCountdown(5000, () => cnow, () => { fires++; });
  ok(cd.remaining() === 5000 && cd.isRunning() === false && cd.isFinished() === false, 'countdown: starts at full duration, not running');
  ok(cd.start() === true, 'countdown: start returns true');
  cnow += 2000;
  let cs = cd.getState();
  ok(cs.remainingMs === 3000 && cs.finished === false && Math.abs(cs.progress - 0.6) < 1e-9, 'countdown: 2000 ms in -> 3000 ms left, progress 0.6');
  ok(cd.pause() === true, 'countdown: pause returns true');
  cnow += 10000; // time passes while paused
  ok(cd.remaining() === 3000, 'countdown: remaining frozen at 3000 while paused');
  ok(cd.start() === true, 'countdown: resume returns true');
  cnow += 2999;
  cs = cd.getState();
  ok(cs.remainingMs === 1 && cs.finished === false && fires === 0, 'countdown: 1 ms left, not finished, onFinish not fired');
  cnow += 1;
  cs = cd.getState();
  ok(cs.remainingMs === 0 && cs.finished === true && cs.running === false && fires === 1, 'countdown: at zero -> finished, running false, onFinish fired once');
  cs = cd.getState();
  ok(fires === 1, 'countdown: repeated ticks after finish do not fire onFinish again');
  ok(cd.start() === false, 'countdown: start after finish returns false (must reset)');
  cd.reset();
  ok(cd.remaining() === 5000 && cd.isFinished() === false, 'countdown: reset restores full duration and clears finished');
  // Overshoot: jumping past zero in one tick still finishes exactly once.
  let fires2 = 0;
  const cd2 = TD.createCountdown(1000, () => 0, () => { fires2++; });
  cd2.start(0);
  const s2 = cd2.tick(5000);
  ok(s2.remainingMs === 0 && s2.finished === true && fires2 === 1, 'countdown: overshoot jump to 5000 ms finishes once at 0');
  // progressFraction.
  ok(TD.progressFraction(1500, 3000) === 0.5, 'progress: half remaining -> 0.5');
  ok(TD.progressFraction(0, 3000) === 0, 'progress: 0 remaining -> 0');
  ok(TD.progressFraction(3000, 3000) === 1, 'progress: full remaining -> 1');
  ok(TD.progressFraction(5000, 3000) === 1, 'progress: over-full clamps to 1');
  ok(TD.progressFraction(100, 0) === 0, 'progress: zero total -> 0');
  dom.window.close();
}

console.log('TIMER UI');
{
  const dom = await loadPage('stopwatch-countdown-timer/');
  const w = dom.window;
  // Defaults: stopwatch tab active, display 00:00.00, countdown shows 05:00.
  ok(w.document.querySelector('#sw-display').textContent === '00:00.00', 'UI defaults: stopwatch display 00:00.00');
  ok(w.document.querySelector('#cd-display').textContent === '05:00', 'UI defaults: countdown display 05:00');
  ok(!w.document.querySelector('#section-stopwatch').classList.contains('hidden') && w.document.querySelector('#section-timer').classList.contains('hidden'), 'UI defaults: stopwatch section visible, timer section hidden');
  ok(w.document.querySelector('#tab-stopwatch').classList.contains('active') && !w.document.querySelector('#tab-timer').classList.contains('active'), 'UI defaults: Stopwatch tab active');
  ok(w.document.querySelector('#sw-start').textContent === 'Start', 'UI defaults: stopwatch button says Start');
  ok(w.document.querySelector('#st-laps').textContent === '0' && w.document.querySelector('#st-fastest').textContent === '–', 'UI defaults: lap stats 0 / –');
  ok(!w.document.querySelector('#sw-no-laps').classList.contains('hidden'), 'UI defaults: "No laps yet" note visible');
  // Stopwatch: start, run, pause freezes the display.
  w.document.querySelector('#sw-start').click();
  ok(w.document.querySelector('#sw-start').textContent === 'Pause', 'UI stopwatch: Start -> button says Pause');
  await sleep(160);
  const running = w.document.querySelector('#sw-display').textContent;
  ok(running !== '00:00.00', `UI stopwatch: display advances while running (now ${running})`);
  w.document.querySelector('#sw-start').click();
  ok(w.document.querySelector('#sw-start').textContent === 'Resume', 'UI stopwatch: Pause -> button says Resume');
  const frozen = w.document.querySelector('#sw-display').textContent;
  await sleep(150);
  ok(w.document.querySelector('#sw-display').textContent === frozen, 'UI stopwatch: display frozen while paused');
  ok(w.document.querySelector('#sw-msg').textContent.startsWith('Paused at '), 'UI stopwatch: pause shows a visible message');
  // Lap while paused does nothing useful; resume then lap.
  w.document.querySelector('#sw-start').click();
  await sleep(80);
  w.document.querySelector('#sw-lap').click();
  ok(w.document.querySelectorAll('#sw-laps li').length === 1, 'UI lap: one lap row after pressing Lap');
  ok(w.document.querySelector('#sw-laps li').textContent.startsWith('Lap 1 — '), 'UI lap: row reads "Lap 1 — …"');
  ok(w.document.querySelector('#st-laps').textContent === '1', 'UI lap: stats show 1 lap');
  ok(w.document.querySelector('#sw-no-laps').classList.contains('hidden'), 'UI lap: "No laps yet" note hidden after a lap');
  await sleep(80);
  w.document.querySelector('#sw-lap').click();
  ok(w.document.querySelectorAll('#sw-laps li').length === 2, 'UI lap: second lap adds a second row');
  ok(w.document.querySelector('#st-fastest').textContent !== '–' && w.document.querySelector('#st-slowest').textContent !== '–', 'UI lap: fastest/slowest stats filled after 2 laps');
  // Reset clears everything.
  w.document.querySelector('#sw-reset').click();
  ok(w.document.querySelector('#sw-display').textContent === '00:00.00', 'UI reset: display back to 00:00.00');
  ok(w.document.querySelectorAll('#sw-laps li').length === 0 && w.document.querySelector('#st-laps').textContent === '0', 'UI reset: laps cleared, stats back to 0');
  ok(w.document.querySelector('#sw-start').textContent === 'Start', 'UI reset: button back to Start');
  ok(w.document.querySelector('#sw-msg').textContent === 'Stopwatch reset.' && w.document.querySelector('#sw-msg').className === 'msg ok', 'UI reset: visible success message');
  // Lap with the stopwatch stopped shows an error.
  w.document.querySelector('#sw-lap').click();
  ok(w.document.querySelector('#sw-msg').textContent.includes('Start the stopwatch first') && w.document.querySelector('#sw-msg').className === 'msg err', 'UI lap: pressing Lap while stopped shows an error message');
  // Tab switch to the countdown timer.
  w.document.querySelector('#tab-timer').click();
  ok(w.document.querySelector('#section-timer').classList.contains('hidden') === false && w.document.querySelector('#section-stopwatch').classList.contains('hidden'), 'UI tabs: timer section visible, stopwatch section hidden');
  ok(w.document.querySelector('#tab-timer').classList.contains('active'), 'UI tabs: Timer tab active after click');
  // Preset: 25-minute Pomodoro.
  w.document.querySelector('[data-preset="1500"]').click();
  ok(w.document.querySelector('#cd-minutes').value === '25' && w.document.querySelector('#cd-seconds').value === '0', 'UI preset: 25-min preset sets 25 minutes, 0 seconds');
  ok(w.document.querySelector('#cd-display').textContent === '25:00', 'UI preset: display shows 25:00');
  ok(w.document.querySelector('#cd-msg').textContent.includes('Preset: 25:00'), 'UI preset: visible preset message');
  // 1-hour preset.
  w.document.querySelector('[data-preset="3600"]').click();
  ok(w.document.querySelector('#cd-hours').value === '1' && w.document.querySelector('#cd-display').textContent === '01:00:00', 'UI preset: 1-hour preset sets 1 hour, display 01:00:00');
  // Countdown: set 1 second, start, wait for it to finish.
  setVal(w, '#cd-seconds', '1');
  setVal(w, '#cd-minutes', '0');
  setVal(w, '#cd-hours', '0');
  ok(w.document.querySelector('#cd-display').textContent === '00:01', 'UI countdown: 1-second duration shows 00:01');
  w.document.querySelector('#cd-start').click();
  ok(w.document.querySelector('#cd-start').textContent === 'Pause', 'UI countdown: Start -> button says Pause');
  await sleep(400);
  const mid = w.document.querySelector('#cd-display').textContent;
  ok(mid === '00:01' || mid === '00:00', `UI countdown: display counting down (now ${mid})`);
  await sleep(1300);
  ok(w.document.querySelector('#cd-display').textContent === '00:00', 'UI countdown: display reaches 00:00');
  ok(w.document.querySelector('#cd-msg').textContent === "Time's up!" && w.document.querySelector('#cd-msg').className === 'msg ok', 'UI countdown: "Time\'s up!" message shown');
  ok(w.document.querySelector('#cd-bar').style.width === '0%', 'UI countdown: progress bar at 0% when finished');
  ok(w.document.querySelector('#cd-display').classList.contains('done'), 'UI countdown: display marked done');
  ok(w.document.querySelector('#cd-start').textContent === 'Start', 'UI countdown: button back to Start after finishing');
  // Reset after finishing restores the 1-second duration.
  w.document.querySelector('#cd-reset').click();
  ok(w.document.querySelector('#cd-display').textContent === '00:01' && w.document.querySelector('#cd-bar').style.width === '100%', 'UI countdown reset: display 00:01, bar back to 100%');
  // Zero duration errors instead of starting.
  setVal(w, '#cd-seconds', '0');
  w.document.querySelector('#cd-start').click();
  ok(w.document.querySelector('#cd-msg').textContent.includes('greater than zero') && w.document.querySelector('#cd-msg').className === 'msg err', 'UI countdown: zero duration shows an error and does not start');
  ok(w.document.querySelector('#cd-start').textContent === 'Start', 'UI countdown: button stays Start after the zero-duration error');
  // Back to the stopwatch tab.
  w.document.querySelector('#tab-stopwatch').click();
  ok(!w.document.querySelector('#section-stopwatch').classList.contains('hidden') && w.document.querySelector('#section-timer').classList.contains('hidden'), 'UI tabs: back on the stopwatch tab');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'timer');
  let visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'stopwatch-countdown-timer/', 'home search "timer" finds the new tool');
  setVal(hw, '#tool-search', 'stopwatch');
  visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'stopwatch-countdown-timer/', 'home search "stopwatch" finds the new tool');
  setVal(hw, '#tool-search', 'pomodoro');
  visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'stopwatch-countdown-timer/', 'home search "pomodoro" finds the new tool');
  setVal(hw, '#tool-search', 'calculator');
  visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 6, 'home search "calculator" still finds exactly 6 (new tool is not a calculator)');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-TIMER TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
