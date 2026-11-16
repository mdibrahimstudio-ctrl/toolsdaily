// Logic + UI tests for the Calorie & TDEE Calculator tool (2026-11-16).
// Drives the real page code through jsdom; core functions are window.TD_calorie.
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

console.log('CALORIE STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'calorie-tdee-calculator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/calorie-tdee-calculator/">'), 'calorie: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'calorie: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'calorie: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'calorie: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'calorie: GA4 tag present');
  ok(html.includes('Calculators · No. 53'), 'calorie: eyebrow is Calculators · No. 53');
  ok((html.match(/<h1/g) || []).length === 1, 'calorie: exactly one h1');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'calorie: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'Calorie & TDEE Calculator' && app.url === 'https://toolsdaily.vercel.app/calorie-tdee-calculator/' && app.offers.price === '0', 'calorie: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(visible.length === 3 && JSON.stringify(visible) === JSON.stringify(schema), `calorie: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['bmi-calculator', 'age-calculator', 'percentage-calculator', 'unit-converter', 'tip-calculator'];
  ok((nav.match(/<li>/g) || []).length === related.length && related.every((s) => nav.includes(`href="../${s}/"`)), 'calorie: More-tools nav links exactly its 5 related tools');
  ok(!html.includes('id="dl"') && !html.includes('id="download"') && !html.includes('Download ') && !html.includes('download'), 'calorie: no download button and no #dl element on the page');
  ok(!html.includes('id="dl"'), 'calorie: no element with id="dl"');
  ok(html.includes('<p id="goal-note">'), 'calorie: goal-note present');
  ok(html.includes('TDEE minus 500') && html.includes('TDEE plus 500'), 'calorie: goal-note explains cut/maintain/bulk offsets');
}

console.log('CALORIE CORE');
{
  const dom = await loadPage('calorie-tdee-calculator/');
  const w = dom.window, TD = w.TD_calorie;
  ok(TD && typeof TD.bmr === 'function' && typeof TD.calc === 'function' && typeof TD.toMetric === 'function' && typeof TD.fmt === 'function', 'TD_calorie exposed with bmr/calc/toMetric/fmt');
  // Hand-check: male, 30y, 80 kg, 180 cm -> BMR 1780; TDEE at 1.55 -> 2759.
  ok(TD.bmr({ sex: 'male', age: 30, weightKg: 80, heightCm: 180 }) === 1780, 'core: male 30y 80kg 180cm BMR 1780');
  const male = TD.calc({ sex: 'male', age: 30, weightKg: 80, heightCm: 180, activity: 1.55 });
  ok(!male.error && male.bmr === 1780 && male.tdee === 2759 && male.cut === 2259 && male.maintain === 2759 && male.bulk === 3259, 'core: male 1.55 -> TDEE 2759, cut 2259, maintain 2759, bulk 3259');
  // Hand-check: female, 30y, 65 kg, 165 cm -> BMR 1370; TDEE at 1.2 -> 1644.
  ok(TD.bmr({ sex: 'female', age: 30, weightKg: 65, heightCm: 165 }) === 1370, 'core: female 30y 65kg 165cm BMR 1370 (1370.25 rounds down)');
  const female = TD.calc({ sex: 'female', age: 30, weightKg: 65, heightCm: 165, activity: 1.2 });
  ok(!female.error && female.bmr === 1370 && female.tdee === 1644 && female.cut === 1144 && female.maintain === 1644 && female.bulk === 2144, 'core: female 1.2 -> TDEE 1644, cut 1144, maintain 1644, bulk 2144');
  // Sedentary vs extra-active for the same man.
  const sed = TD.calc({ sex: 'male', age: 30, weightKg: 80, heightCm: 180, activity: 1.2 });
  const extra = TD.calc({ sex: 'male', age: 30, weightKg: 80, heightCm: 180, activity: 1.9 });
  ok(!sed.error && sed.tdee === 2136, 'core: same man sedentary TDEE 2136');
  ok(!extra.error && extra.tdee === 3382, 'core: same man extra-active TDEE 3382');
  // Boundary ages: 10 and 120 valid, 9 and 121 errors.
  ok(!TD.calc({ sex: 'male', age: 10, weightKg: 80, heightCm: 180, activity: 1.55 }).error, 'core: age 10 valid');
  ok(!TD.calc({ sex: 'male', age: 120, weightKg: 80, heightCm: 180, activity: 1.55 }).error, 'core: age 120 valid');
  ok(TD.calc({ sex: 'male', age: 9, weightKg: 80, heightCm: 180, activity: 1.55 }).error, 'core: age 9 rejected');
  ok(TD.calc({ sex: 'male', age: 121, weightKg: 80, heightCm: 180, activity: 1.55 }).error, 'core: age 121 rejected');
  ok(TD.calc({ sex: 'male', age: 30.5, weightKg: 80, heightCm: 180, activity: 1.55 }).error, 'core: non-integer age rejected');
  // Invalid inputs each return an error.
  ok(TD.calc({ sex: 'male', age: 0, weightKg: 80, heightCm: 180, activity: 1.55 }).error, 'core: age 0 rejected');
  ok(TD.calc({ sex: 'male', age: -5, weightKg: 80, heightCm: 180, activity: 1.55 }).error, 'core: age -5 rejected');
  ok(TD.calc({ sex: 'male', age: 30, weightKg: 0, heightCm: 180, activity: 1.55 }).error, 'core: weight 0 rejected');
  ok(TD.calc({ sex: 'male', age: 30, weightKg: 501, heightCm: 180, activity: 1.55 }).error, 'core: weight 501 rejected');
  ok(TD.calc({ sex: 'male', age: 30, weightKg: 80, heightCm: 0, activity: 1.55 }).error, 'core: height 0 rejected');
  ok(TD.calc({ sex: 'male', age: 30, weightKg: 80, heightCm: 301, activity: 1.55 }).error, 'core: height 301 rejected');
  ok(TD.calc({ sex: 'male', age: 30, weightKg: 80, heightCm: 180, activity: 2.0 }).error, 'core: activity 2.0 rejected');
  ok(TD.calc({ sex: 'male', age: 30, weightKg: 80, heightCm: 180 }).error, 'core: missing activity rejected');
  // cut < maintain < bulk ordering always holds.
  for (const act of [1.2, 1.375, 1.55, 1.725, 1.9]) {
    const r = TD.calc({ sex: 'female', age: 45, weightKg: 70, heightCm: 170, activity: act });
    ok(!r.error && r.cut < r.maintain && r.maintain < r.bulk && r.cut === r.tdee - 500 && r.bulk === r.tdee + 500, `core: cut < maintain < bulk at activity ${act}`);
  }
  // toMetric conversions.
  const imp = TD.toMetric({ weightLb: 176, heightFt: 5, heightIn: 11 });
  ok(!imp.error && imp.weightKg === 79.8, 'core: toMetric 176 lb -> 79.8 kg');
  ok(!imp.error && imp.heightCm === 180.3, 'core: toMetric 5 ft 11 in -> 180.3 cm');
  ok(TD.toMetric({ weightLb: 100, heightFt: 6, heightIn: 0 }).weightKg === 45.4, 'core: toMetric 100 lb -> 45.4 kg');
  // Rounding: fractional BMR rounds to nearest integer.
  ok(TD.bmr({ sex: 'female', age: 30, weightKg: 65, heightCm: 165 }) === 1370, 'core: BMR 1370.25 rounds to 1370');
  ok(Number.isInteger(TD.bmr({ sex: 'male', age: 33, weightKg: 77.7, heightCm: 177.7 })), 'core: BMR with fractional inputs is a whole number');
  // fmt thousands separators.
  ok(TD.fmt(2759) === '2,759' && TD.fmt(1780) === '1,780' && TD.fmt(999) === '999' && TD.fmt(10000) === '10,000', 'core: fmt adds thousands separators');
  dom.window.close();
}

console.log('CALORIE UI');
{
  const dom = await loadPage('calorie-tdee-calculator/');
  const w = dom.window;
  const txt = (sel) => w.document.querySelector(sel).textContent;
  // Defaults on load: male 30y 80kg 180cm, moderately active.
  ok(txt('#r-bmr') === '1,780' && txt('#r-tdee') === '2,759' && txt('#r-cut') === '2,259' && txt('#r-maintain') === '2,759' && txt('#r-bulk') === '3,259', 'UI defaults: BMR 1,780 / TDEE 2,759 / cut 2,259 / maintain 2,759 / bulk 3,259');
  ok(w.document.querySelector('#age').value === '30' && w.document.querySelector('#sex').value === 'male' && w.document.querySelector('#unit').value === 'metric' && w.document.querySelector('#activity').value === '1.55', 'UI defaults: age 30, male, metric, activity 1.55');
  ok(!w.document.querySelector('#imperial-group').classList.contains('hidden') === false, 'UI defaults: imperial fields hidden');
  ok(!w.document.querySelector('#metric-group').classList.contains('hidden'), 'UI defaults: metric fields visible');
  ok(w.document.querySelector('#download') === null && w.document.querySelector('#dl') === null, 'UI: no #download button and no #dl element');
  // Changing sex to female: 800 + 1125 - 150 - 161 = 1614.
  setVal(w, '#sex', 'female');
  ok(txt('#r-bmr') === '1,614', 'UI sex change: female defaults BMR 1,614');
  ok(txt('#r-tdee') === '2,502', 'UI sex change: female defaults TDEE 2,502 (1614 x 1.55)');
  setVal(w, '#sex', 'male');
  ok(txt('#r-bmr') === '1,780', 'UI sex change back: male BMR 1,780 again');
  // Live update: changing activity to sedentary updates TDEE live.
  setVal(w, '#activity', '1.2');
  ok(txt('#r-tdee') === '2,136' && txt('#r-cut') === '1,636' && txt('#r-bulk') === '2,636', 'UI live update: sedentary TDEE 2,136 / cut 1,636 / bulk 2,636');
  setVal(w, '#activity', '1.55');
  ok(txt('#r-tdee') === '2,759', 'UI live update: back to moderately active TDEE 2,759');
  // Button click recalculates.
  setVal(w, '#age', '40');
  w.document.querySelector('#calc').click();
  ok(txt('#r-bmr') === '1,730', 'UI button click: age 40 male BMR 1,730');
  setVal(w, '#age', '30');
  ok(txt('#r-bmr') === '1,780', 'UI live update: age back to 30, BMR 1,780');
  // Switching to imperial shows imperial fields, hides metric ones.
  setVal(w, '#unit', 'imperial');
  ok(w.document.querySelector('#imperial-group').classList.contains('hidden') === false, 'UI unit switch: imperial fields shown');
  ok(w.document.querySelector('#metric-group').classList.contains('hidden'), 'UI unit switch: metric fields hidden');
  // Entering 176 lb / 5 ft 11 in gives BMR within 2 of the metric 1780.
  setVal(w, '#weight-lb', '176');
  setVal(w, '#height-ft', '5');
  setVal(w, '#height-in', '11');
  const impBmr = parseInt(txt('#r-bmr').replace(/,/g, ''), 10);
  ok(Math.abs(impBmr - 1780) <= 2, `UI imperial: 176 lb / 5 ft 11 in BMR ${impBmr} within 2 of 1780`);
  // Switching back to metric restores the metric results.
  setVal(w, '#unit', 'metric');
  ok(txt('#r-bmr') === '1,780', 'UI unit switch back: metric BMR 1,780 again');
  // Invalid input (age 0) shows a visible error and clears results.
  setVal(w, '#age', '0');
  ok(txt('#msg') === 'Age must be a whole number between 10 and 120.' && w.document.querySelector('#msg').className === 'msg err', 'UI invalid age 0: visible error message');
  ok(txt('#r-bmr') === '–' && txt('#r-tdee') === '–' && txt('#r-cut') === '–' && txt('#r-maintain') === '–' && txt('#r-bulk') === '–', 'UI invalid age 0: results cleared to dashes');
  // Fixing the age restores results.
  setVal(w, '#age', '30');
  ok(txt('#r-bmr') === '1,780' && txt('#msg') === '', 'UI fix age: results restored, message cleared');
  dom.window.close();
}

console.log(`\nLOGIC-CALORIE TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
