// Logic + UI tests for the Dice Roller & Coin Flip tool (2026-11-15, 5-tools day).
// Drives the real page code through jsdom; core functions are window.TD_dice.
// Dice and coin results are transient, so this page has no download button.
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

console.log('DICE STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'dice-roller-coin-flip', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/dice-roller-coin-flip/">'), 'dice: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'dice: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'dice: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'dice: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'dice: GA4 tag present');
  ok(!html.includes('id="download"'), 'dice: no download button (results are transient)');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'dice: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Dice Roller & Coin Flip' && app.url === 'https://toolsdaily.vercel.app/dice-roller-coin-flip/' && app.offers.price === '0', 'dice: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `dice: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['random-number-generator', 'password-generator', 'uuid-generator', 'qr-generator'];
  ok((nav.match(/<li>/g) || []).length === related.length && related.every((s) => nav.includes(`href="../${s}/"`)), 'dice: More-tools nav links exactly its 4 related tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 55, 'sitemap.xml has 55 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/dice-roller-coin-flip/'), 'sitemap includes dice-roller-coin-flip');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card[\s"]/g) || []).length === 53, 'home has exactly 53 tool cards');
  ok(home.includes('/dice-roller-coin-flip/'), 'home cards + nav include dice-roller-coin-flip');
  ok(home.includes('Fifty-three handy tools'), 'home lead says Fifty-three tools');
  ok(home.includes('Generators <span class="n">6</span>'), 'home Generators chip says 6');
  const genSec = home.match(/<section class="cat" id="generators"[\s\S]*?<\/section>/)[0];
  ok(genSec.includes('<span class="cat-n">6 tools</span>'), 'home Generators section says 6 tools');
  const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(llms.includes('browse all 53 free tools'), 'llms.txt says 53 tools');
  ok(llms.includes('https://toolsdaily.vercel.app/dice-roller-coin-flip/'), 'llms.txt lists dice-roller-coin-flip');
}

console.log('DICE CORE');
{
  const dom = await loadPage('dice-roller-coin-flip/');
  const w = dom.window, TD = w.TD_dice;
  ok(TD && typeof TD.rollDie === 'function' && typeof TD.rollDice === 'function' && typeof TD.flipCoin === 'function', 'TD_dice exposed');
  ok(JSON.stringify(TD.SIDES) === JSON.stringify([4, 6, 8, 10, 12, 20]), 'SIDES is [4, 6, 8, 10, 12, 20]');
  ok(TD.MAX_DICE === 10 && TD.MAX_HISTORY === 10, 'MAX_DICE and MAX_HISTORY are 10');
  ok(TD.rollDie(6, () => 0).value === 1, 'core rollDie: rand 0 on d6 gives 1');
  ok(TD.rollDie(6, () => 0.999).value === 6, 'core rollDie: rand 0.999 on d6 gives 6');
  ok(TD.rollDie(6, () => 0.5).value === 4, 'core rollDie: rand 0.5 on d6 gives 4');
  ok(TD.rollDie(20, () => 0.999).value === 20, 'core rollDie: rand 0.999 on d20 gives 20');
  ok(TD.rollDie(4, () => 0).value === 1, 'core rollDie: rand 0 on d4 gives 1');
  ok(TD.rollDie(7).error === 'Pick a die type: d4, d6, d8, d10, d12 or d20.', 'core rollDie: d7 rejected');
  ok(TD.rollDie(3).error === 'Pick a die type: d4, d6, d8, d10, d12 or d20.', 'core rollDie: d3 rejected');
  const two = TD.rollDice(6, 2, () => 0.5);
  ok(!two.error && JSON.stringify(two.rolls) === JSON.stringify([4, 4]) && two.total === 8 && two.sides === 6 && two.count === 2, 'core rollDice: 2d6 with rand 0.5 gives [4, 4], total 8');
  const seq = [0, 0.5, 0.999];
  let i = 0;
  const three = TD.rollDice(6, 3, () => seq[i++ % seq.length]);
  ok(!three.error && JSON.stringify(three.rolls) === JSON.stringify([1, 4, 6]) && three.total === 11, 'core rollDice: 3d6 with rand [0, 0.5, 0.999] gives [1, 4, 6], total 11');
  const one = TD.rollDice(20, 1, () => 0);
  ok(!one.error && JSON.stringify(one.rolls) === JSON.stringify([1]) && one.total === 1, 'core rollDice: 1d20 with rand 0 gives [1]');
  ok(TD.rollDice(6, 0).error === 'Roll between 1 and 10 dice.', 'core rollDice: 0 dice rejected');
  ok(TD.rollDice(6, 11).error === 'Roll between 1 and 10 dice.', 'core rollDice: 11 dice rejected');
  ok(TD.rollDice(6, 2.5).error === 'Roll between 1 and 10 dice.', 'core rollDice: fractional dice count rejected');
  ok(TD.rollDice(7, 2).error === 'Pick a die type: d4, d6, d8, d10, d12 or d20.', 'core rollDice: d7 rejected');
  ok(TD.flipCoin(() => 0.2) === 'Heads', 'core flipCoin: rand 0.2 is Heads');
  ok(TD.flipCoin(() => 0.7) === 'Tails', 'core flipCoin: rand 0.7 is Tails');
  ok(TD.flipCoin(() => 0.5) === 'Tails', 'core flipCoin: rand 0.5 is Tails (not below 0.5)');
  ok(TD.flipCoin(() => 0) === 'Heads', 'core flipCoin: rand 0 is Heads');
  dom.window.close();
}

console.log('DICE UI');
{
  const dom = await loadPage('dice-roller-coin-flip/');
  const w = dom.window;
  // Defaults on load: d6, 2 dice, nothing rolled yet.
  ok(w.document.querySelector('#dice-sides').value === '6' && w.document.querySelector('#dice-count').value === '2', 'UI defaults: d6 selected, 2 dice selected');
  ok(w.document.querySelector('#st-rolls').textContent === '0' && w.document.querySelector('#st-highest').textContent === '–' && w.document.querySelector('#st-lowest').textContent === '–', 'UI defaults: stats 0 rolls, dashes for highest/lowest');
  ok(w.document.querySelector('#dice-total').textContent === '–' && w.document.querySelectorAll('#dice-results .die').length === 0, 'UI defaults: no dice shown, total is a dash');
  ok(w.document.querySelectorAll('#dice-history li').length === 0, 'UI defaults: history empty');
  ok(w.document.querySelector('#coin-result').textContent === '–' && w.document.querySelector('#coin-heads').textContent === '0' && w.document.querySelector('#coin-tails').textContent === '0' && w.document.querySelector('#coin-flips').textContent === '0', 'UI defaults: coin not flipped, counts are 0');
  // Rolling 2d6 shows two dice plus the total, and adds one history entry.
  w.document.querySelector('#roll').click();
  const total1 = Number(w.document.querySelector('#dice-total').textContent);
  ok(total1 >= 2 && total1 <= 12, `UI roll: 2d6 total ${total1} is in range 2..12`);
  ok(w.document.querySelectorAll('#dice-results .die').length === 3, 'UI roll: 2 dice plus the total shown');
  ok(w.document.querySelector('#dice-results .die.total').textContent === '=' + total1, 'UI roll: total die shows =total');
  ok(w.document.querySelectorAll('#dice-history li').length === 1, 'UI roll: 1 history entry');
  ok(/^2d6: \d+ \+ \d+ = \d+$/.test(w.document.querySelector('#dice-history li').textContent), 'UI roll: history entry reads "2d6: a + b = total"');
  ok(w.document.querySelector('#st-rolls').textContent === '1', 'UI roll: 1 roll counted');
  ok(w.document.querySelector('#st-highest').textContent === String(total1) && w.document.querySelector('#st-lowest').textContent === String(total1), 'UI roll: highest and lowest both equal the first total');
  ok(/^Rolled 2d6 — total \d+\.$/.test(w.document.querySelector('#msg').textContent) && w.document.querySelector('#msg').className === 'msg ok', 'UI roll: visible success message');
  // Switching to 1d20 and rolling again prepends a second history entry.
  setVal(w, '#dice-sides', '20');
  setVal(w, '#dice-count', '1');
  w.document.querySelector('#roll').click();
  const total2 = Number(w.document.querySelector('#dice-total').textContent);
  ok(total2 >= 1 && total2 <= 20, `UI roll d20: 1d20 total ${total2} is in range 1..20`);
  ok(w.document.querySelectorAll('#dice-results .die').length === 2, 'UI roll d20: 1 die plus the total shown');
  ok(w.document.querySelectorAll('#dice-history li').length === 2, 'UI roll d20: 2 history entries');
  ok(/^1d20: \d+ = \d+$/.test(w.document.querySelector('#dice-history li').textContent), 'UI roll d20: latest history entry reads "1d20: a = total"');
  ok(w.document.querySelector('#st-rolls').textContent === '2', 'UI roll d20: 2 rolls counted');
  // Clearing the history resets everything.
  w.document.querySelector('#clear-history').click();
  ok(w.document.querySelectorAll('#dice-history li').length === 0, 'UI clear: history empty');
  ok(w.document.querySelectorAll('#dice-results .die').length === 0, 'UI clear: dice results cleared');
  ok(w.document.querySelector('#dice-total').textContent === '–', 'UI clear: total back to a dash');
  ok(w.document.querySelector('#st-rolls').textContent === '0' && w.document.querySelector('#st-highest').textContent === '–' && w.document.querySelector('#st-lowest').textContent === '–', 'UI clear: stats reset');
  ok(w.document.querySelector('#msg').textContent === 'History cleared.' && w.document.querySelector('#msg').className === 'msg ok', 'UI clear: visible success message');
  // Coin flip counts heads and tails.
  w.document.querySelector('#coin-flip').click();
  const first = w.document.querySelector('#coin-result').textContent;
  ok(first === 'Heads!' || first === 'Tails!', `UI coin flip: result is "${first}"`);
  ok(w.document.querySelector('#coin-flips').textContent === '1', 'UI coin flip: 1 flip counted');
  ok(Number(w.document.querySelector('#coin-heads').textContent) + Number(w.document.querySelector('#coin-tails').textContent) === 1, 'UI coin flip: heads + tails = 1');
  ok(/^(Heads|Tails) — \d+ heads, \d+ tails so far\.$/.test(w.document.querySelector('#coin-msg').textContent) && w.document.querySelector('#coin-msg').className === 'msg ok', 'UI coin flip: visible running-total message');
  w.document.querySelector('#coin-flip').click();
  ok(w.document.querySelector('#coin-flips').textContent === '2', 'UI coin flip: 2 flips counted after a second flip');
  ok(Number(w.document.querySelector('#coin-heads').textContent) + Number(w.document.querySelector('#coin-tails').textContent) === 2, 'UI coin flip: heads + tails = 2');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'coin flip');
  await sleep(200);
  let visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'https://toolsdaily.vercel.app/dice-roller-coin-flip/', 'home search "coin flip" finds the new tool');
  setVal(hw, '#tool-search', 'd20');
  await sleep(200);
  visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'https://toolsdaily.vercel.app/dice-roller-coin-flip/', 'home search "d20" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-DICE TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
