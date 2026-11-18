// Logic + UI tests for the GPA Calculator tool (2026-11-15, 5-tools day).
// Drives the real page code through jsdom; core functions are window.TD_gpa.
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

console.log('GPA STATIC');
{
  const html = fs.readFileSync(path.join(SITE, 'gpa-calculator', 'index.html'), 'utf8');
  ok(html.includes('<link rel="canonical" href="https://toolsdaily.vercel.app/gpa-calculator/">'), 'gpa: canonical present');
  ok(html.includes('<meta property="og:image" content="https://toolsdaily.vercel.app/assets/og-image.png">'), 'gpa: og:image present');
  ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'gpa: twitter card present');
  ok([...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].every((m) => m[1] === 'https://www.googletagmanager.com/gtag/js?id=G-KX85CZXTR4'), 'gpa: no external resource loads except the GA4 tag');
  ok(html.includes('G-KX85CZXTR4'), 'gpa: GA4 tag present');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
  ok(Array.isArray(data) && data.length === 2, 'gpa: JSON-LD parses as [WebApplication, FAQPage]');
  if (Array.isArray(data)) {
    const app = data.find((d) => d['@type'] === 'WebApplication');
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    ok(app && app.name === 'GPA Calculator' && app.url === 'https://toolsdaily.vercel.app/gpa-calculator/' && app.offers.price === '0', 'gpa: WebApplication schema fields correct');
    const visible = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ name: unescapeHtml(m[1].trim()), text: unescapeHtml(m[2].trim()) }));
    const schema = (faq ? faq.mainEntity : []).map((q) => ({ name: q.name, text: q.acceptedAnswer.text }));
    ok(JSON.stringify(visible) === JSON.stringify(schema), `gpa: FAQPage schema exactly matches the ${visible.length} visible FAQs`);
  }
  const nav = html.match(/<nav class="more">[\s\S]*?<\/nav>/)[0];
  const related = ['percentage-calculator', 'bmi-calculator', 'age-calculator', 'emi-calculator', 'date-difference-calculator'];
  ok((nav.match(/<li>/g) || []).length === related.length && related.every((s) => nav.includes(`href="../${s}/"`)), 'gpa: More-tools nav links exactly its 5 related tools');
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 65, 'sitemap.xml has 65 URLs');
  ok(sitemap.includes('https://toolsdaily.vercel.app/gpa-calculator/'), 'sitemap includes gpa-calculator');
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card[\s"]/g) || []).length === 63, 'home has exactly 63 tool cards');
  ok(home.includes('/gpa-calculator/'), 'home cards + nav include gpa-calculator');
  ok(home.includes('Sixty-three handy tools'), 'home lead says Fifty-eight tools');
  ok(home.includes('Calculators <span class="n">19</span>'), 'home Calculators chip says 19');
  const calcSec = home.match(/<section class="cat" id="calculators"[\s\S]*?<\/section>/)[0];
  ok(calcSec.includes('<span class="cat-n">19 tools</span>'), 'home Calculators section says 19 tools');
  const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(llms.includes('browse all 63 free tools'), 'llms.txt says 63 tools');
  ok(llms.includes('https://toolsdaily.vercel.app/gpa-calculator/'), 'llms.txt lists gpa-calculator');
}

console.log('GPA CORE');
{
  const dom = await loadPage('gpa-calculator/');
  const w = dom.window, TD = w.TD_gpa;
  ok(TD && typeof TD.calcGPA === 'function' && typeof TD.requiredGPA === 'function', 'TD_gpa exposed');
  ok(Array.isArray(TD.GRADES) && TD.GRADES.length === 12 && TD.GRADES[0] === 'A' && TD.GRADES[11] === 'F', 'exactly 12 grades A..F');
  ok(TD.MAX_COURSES === 20, 'MAX_COURSES is 20');
  ok(TD.gradePoints('A') === 4.0 && TD.gradePoints('A-') === 3.7 && TD.gradePoints('B+') === 3.3 && TD.gradePoints('B') === 3.0 && TD.gradePoints('C') === 2.0 && TD.gradePoints('D') === 1.0 && TD.gradePoints('F') === 0.0, 'grade points for A/A-/B+/B/C/D/F');
  ok(TD.gradePoints('a') === 4.0 && TD.gradePoints(' b+ ') === 3.3, 'gradePoints is case-insensitive and trims');
  ok(TD.gradePoints('X') === null && TD.gradePoints('') === null && TD.gradePoints(null) === null, 'gradePoints returns null for unknown grades');
  ok(TD.round2(3.674) === 3.67 && TD.round2(3.676) === 3.68 && TD.round2(10 / 3) === 3.33, 'round2 rounds to 2 decimals');
  const sample = [{ grade: 'A', credits: 3 }, { grade: 'B+', credits: 3 }, { grade: 'A-', credits: 4 }];
  const r = TD.calcGPA(sample);
  ok(!r.error && r.gpa === 3.67 && r.points === 36.7 && r.credits === 10 && r.count === 3, 'core: sample rows (A 3cr, B+ 3cr, A- 4cr) give GPA 3.67, 36.7 points, 10 credits');
  const single = TD.calcGPA([{ grade: 'A', credits: 4 }]);
  ok(!single.error && single.gpa === 4 && single.credits === 4 && single.count === 1, 'core: single A 4cr course gives GPA 4.00');
  ok(TD.calcGPA([]).error === 'Add at least one course.', 'core: no courses returns an error');
  ok(TD.calcGPA([{ grade: 'A', credits: 3 }, { grade: '', credits: 3 }]).error === 'Course 2 has no grade selected.', 'core: missing grade names the course');
  ok(TD.calcGPA([{ grade: 'A', credits: 0 }]).error === 'Course 1 needs credit hours between 0 and 30.', 'core: 0 credits rejected');
  ok(TD.calcGPA([{ grade: 'A', credits: 31 }]).error === 'Course 1 needs credit hours between 0 and 30.', 'core: 31 credits rejected');
  const req = TD.requiredGPA(3.0, 30, 3.2, 15);
  ok(!req.error && req.required === 3.6 && !req.impossible && !req.already, 'core requiredGPA(3.0, 30, 3.2, 15) = 3.60');
  const imp = TD.requiredGPA(3.2, 30, 3.5, 15);
  ok(!imp.error && imp.required === 4.1 && imp.impossible === true, 'core requiredGPA(3.2, 30, 3.5, 15) = 4.10, impossible');
  const alr = TD.requiredGPA(4.0, 60, 3.0, 15);
  ok(!alr.error && alr.required === -1 && alr.already === true, 'core requiredGPA(4.0, 60, 3.0, 15) = -1.00, already above target');
  ok(TD.requiredGPA(5, 30, 3.5, 15).error === 'Current GPA must be between 0 and 4.', 'core: current GPA above 4 rejected');
  ok(TD.requiredGPA(3, -1, 3.5, 15).error === 'Completed credits must be 0 or more.', 'core: negative completed credits rejected');
  ok(TD.requiredGPA(3, 30, 4.5, 15).error === 'Target GPA must be between 0 and 4.', 'core: target GPA above 4 rejected');
  ok(TD.requiredGPA(3, 30, 3.5, 0).error === 'Planned credits must be more than 0.', 'core: 0 planned credits rejected');
  const named = [
    { name: 'Mathematics', grade: 'A', credits: 3 },
    { name: 'English', grade: 'B+', credits: 3 },
    { name: 'History', grade: 'A-', credits: 4 },
  ];
  const summary = TD.buildSummary(named, TD.calcGPA(named));
  ok(summary.includes('GPA Summary — ToolsDaily'), 'core buildSummary: header line');
  ok(summary.includes('1. Mathematics — Grade A (4.0 points), 3 credits'), 'core buildSummary: course 1 line');
  ok(summary.includes('2. English — Grade B+ (3.3 points), 3 credits'), 'core buildSummary: course 2 line');
  ok(summary.includes('Total grade points: 36.70'), 'core buildSummary: total points line');
  ok(summary.includes('GPA: 3.67 (4.0 scale)'), 'core buildSummary: GPA line');
  dom.window.close();
}

console.log('GPA UI');
{
  const dom = await loadPage('gpa-calculator/');
  const w = dom.window;
  // Defaults on load: 3 sample rows, GPA 3.67.
  ok(w.document.querySelectorAll('.course-row').length === 3, 'UI defaults: 3 sample course rows');
  ok(w.document.querySelector('#st-gpa').textContent === '3.67' && w.document.querySelector('#st-credits').textContent === '10' && w.document.querySelector('#st-courses').textContent === '3', 'UI defaults: stats 3.67 / 10 credits / 3 courses');
  ok(w.document.querySelector('#r-gpa').textContent === '3.67', 'UI defaults: result GPA 3.67');
  ok(w.document.querySelector('#r-detail').textContent === 'across 3 courses (10 credits, 36.70 grade points).', 'UI defaults: result detail line');
  ok(w.document.querySelector('#msg').textContent === 'GPA updated — edit any course to recalculate instantly.' && w.document.querySelector('#msg').className === 'msg ok', 'UI defaults: visible success message');
  // Changing the first grade from A to B recalculates live.
  setVal(w, '.course-row .c-grade', 'B');
  ok(w.document.querySelector('#st-gpa').textContent === '3.37', 'UI live update: first grade A->B gives GPA 3.37');
  // Adding a course (A, 3cr) updates the total.
  w.document.querySelector('#add-course').click();
  ok(w.document.querySelectorAll('.course-row').length === 4, 'UI add course: 4 rows after adding');
  ok(w.document.querySelector('#st-gpa').textContent === '3.52' && w.document.querySelector('#st-courses').textContent === '4', 'UI add course: GPA 3.52 across 4 courses');
  // Clearing resets to one A 3cr row.
  w.document.querySelector('#clear-courses').click();
  ok(w.document.querySelectorAll('.course-row').length === 1, 'UI clear: 1 row left');
  ok(w.document.querySelector('#st-gpa').textContent === '4.00' && w.document.querySelector('#st-credits').textContent === '3', 'UI clear: GPA 4.00, 3 credits');
  ok(w.document.querySelector('#msg').textContent === 'Courses cleared — add your own courses above.' && w.document.querySelector('#msg').className === 'msg ok', 'UI clear: visible success message');
  // Download with a stubbed createObjectURL.
  w.URL.createObjectURL = () => 'blob:fake';
  w.document.querySelector('#download').click();
  const dl = w.document.querySelector('#dl');
  ok(dl.getAttribute('href') === 'blob:fake' && dl.getAttribute('download') === 'gpa-summary.txt', 'UI download link points at blob with gpa-summary.txt name');
  ok(w.document.querySelector('#msg').textContent === 'Downloaded gpa-summary.txt.' && w.document.querySelector('#msg').className === 'msg ok', 'UI download shows a visible success message');
  // Removing every row errors and clears the stats.
  [...w.document.querySelectorAll('.course-row .rm')].forEach((b) => b.click());
  ok(w.document.querySelectorAll('.course-row').length === 0, 'UI remove all: 0 rows left');
  ok(w.document.querySelector('#st-gpa').textContent === '–' && w.document.querySelector('#st-credits').textContent === '–', 'UI remove all: stats reset to dashes');
  ok(w.document.querySelector('#msg').textContent === 'Add at least one course.' && w.document.querySelector('#msg').className === 'msg err', 'UI remove all: visible error message');
  // Download with no courses errors instead of downloading nothing.
  w.document.querySelector('#download').click();
  ok(w.document.querySelector('#msg').textContent === 'Nothing to download yet — Add at least one course.' && w.document.querySelector('#msg').className === 'msg err', 'UI download with no courses: visible error, nothing downloaded');
  // Target helper: reachable target.
  setVal(w, '#target-current', '3');
  setVal(w, '#target-completed', '30');
  setVal(w, '#target-goal', '3.2');
  setVal(w, '#target-planned', '15');
  w.document.querySelector('#target-calc').click();
  ok(w.document.querySelector('#target-needed').textContent === '3.60', 'UI target helper: required GPA 3.60');
  ok(w.document.querySelector('#target-note').textContent === 'in your planned credits to reach your target.', 'UI target helper: note line');
  ok(w.document.querySelector('#target-msg').textContent === 'That is roughly a B+ average.' && w.document.querySelector('#target-msg').className === 'msg ok', 'UI target helper: B+ hint message');
  ok(!w.document.querySelector('#target-result').classList.contains('hidden'), 'UI target helper: result shown');
  // Target helper: impossible target.
  setVal(w, '#target-current', '3.2');
  setVal(w, '#target-goal', '3.5');
  w.document.querySelector('#target-calc').click();
  ok(w.document.querySelector('#target-needed').textContent === '4.10', 'UI target helper impossible: required GPA 4.10');
  ok(w.document.querySelector('#target-msg').textContent === 'Not reachable: even straight As in your planned credits would not be enough.' && w.document.querySelector('#target-msg').className === 'msg err', 'UI target helper impossible: visible error message');
  // Target helper: already above target.
  setVal(w, '#target-current', '4');
  setVal(w, '#target-completed', '60');
  setVal(w, '#target-goal', '3');
  w.document.querySelector('#target-calc').click();
  ok(w.document.querySelector('#target-needed').textContent === '-1.00', 'UI target helper already: required GPA -1.00');
  ok(w.document.querySelector('#target-msg').textContent === 'Good news — you are already above your target GPA.' && w.document.querySelector('#target-msg').className === 'msg ok', 'UI target helper already: good-news message');
  // Target helper: missing planned credits errors.
  setVal(w, '#target-planned', '');
  w.document.querySelector('#target-calc').click();
  ok(w.document.querySelector('#target-msg').textContent === 'Planned credits must be more than 0.' && w.document.querySelector('#target-msg').className === 'msg err', 'UI target helper error: visible error message');
  ok(w.document.querySelector('#target-result').classList.contains('hidden'), 'UI target helper error: result hidden');
  // Home search finds the new tool.
  const homeDom = await loadPage('');
  const hw = homeDom.window;
  setVal(hw, '#tool-search', 'gpa');
  await sleep(200);
  let visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'https://toolsdaily.vercel.app/gpa-calculator/', 'home search "gpa" finds the new tool');
  setVal(hw, '#tool-search', 'grade point');
  await sleep(200);
  visible = [...hw.document.querySelectorAll('.tool-card')].filter((x) => !x.classList.contains('hidden'));
  ok(visible.length === 1 && visible[0].getAttribute('href') === 'https://toolsdaily.vercel.app/gpa-calculator/', 'home search "grade point" finds the new tool');
  homeDom.window.close();
  dom.window.close();
}

console.log(`\nLOGIC-GPA TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
