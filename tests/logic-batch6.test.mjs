// Cross-file integration tests for the 2026-11-17 five-tool batch (#23-#27).
// Verifies the new tools are wired into the homepage, sitemap, llms.txt,
// feedback datalist and footer counts. Per-tool logic lives in the
// logic-<tool>.test.mjs files; this file only checks the shared surfaces.
// Run: TD_BASE=http://127.0.0.1:8791/ node tests/logic-batch6.test.mjs  (from the site root)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

const TOOLS = [
  { slug: 'discount-calculator', name: 'Discount Calculator', cardNo: '54', cat: 'Calculators' },
  { slug: 'currency-converter', name: 'Currency Converter', cardNo: '55', cat: 'Converters' },
  { slug: 'salary-pay-calculator', name: 'Salary & Hourly Pay Calculator', cardNo: '56', cat: 'Calculators' },
  { slug: 'vat-tax-calculator', name: 'VAT & Sales Tax Calculator', cardNo: '57', cat: 'Calculators' },
  { slug: 'markup-margin-calculator', name: 'Markup & Margin Calculator', cardNo: '58', cat: 'Calculators' },
];

console.log('BATCH6 STATIC');
{
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === 70, 'sitemap.xml has 70 URLs');
  for (const t of TOOLS) ok(sitemap.includes(`https://toolsdaily.vercel.app/${t.slug}/`), `sitemap includes ${t.slug}`);

  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  ok((home.match(/class="tool-card[\s"]/g) || []).length === 68, 'home has exactly 68 tool cards');
  ok(home.includes('68 free tools'), 'home eyebrow says 68 free tools');
  ok(home.includes('Sixty-eight handy tools'), 'home lead says Sixty-eight tools');
  ok(home.includes('Search 68 tools'), 'home search placeholder says 68 tools');
  ok(home.includes('All <span class="n">68</span>'), 'home All chip says 68');
  ok(home.includes('Calculators <span class="n">21</span>'), 'home Calculators chip says 21');
  ok(home.includes('Converters <span class="n">11</span>'), 'home Converters chip says 11');
  const calcSec = home.match(/<section class="cat" id="calculators"[\s\S]*?<\/section>/)[0];
  ok(calcSec.includes('<span class="cat-n">21 tools</span>'), 'home Calculators section says 21 tools');
  const convSec = home.match(/<section class="cat" id="converters"[\s\S]*?<\/section>/)[0];
  ok(convSec.includes('<span class="cat-n">11 tools</span>'), 'home Converters section says 11 tools');
  ok(home.includes('68 tools · New tools added regularly.'), 'home footer says 68 tools');
  for (const t of TOOLS) {
    ok(home.includes(`/${t.slug}/`), `home includes ${t.slug}`);
    ok(home.includes(`<span class="card-no">${t.cardNo}</span>`), `home card number ${t.cardNo} for ${t.slug}`);
    ok(home.includes(`<h3>${t.name.replace(/&/g, '&amp;')}</h3>`), `home card title is ${t.name}`);
  }
  const nums = [...home.matchAll(/<span class="card-no">(\d+)<\/span>/g)].map((m) => m[1]);
  ok(nums.length === 68 && new Set(nums).size === 68, 'home card numbers are 68 unique values');
  ok(JSON.stringify([...nums].sort()) === JSON.stringify(Array.from({ length: 68 }, (_, i) => String(i + 1).padStart(2, '0'))), 'home card numbers run 01..68 with no gaps');

  const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
  ok(llms.includes('browse all 68 free tools'), 'llms.txt says 68 tools');
  for (const t of TOOLS) ok(llms.includes(`https://toolsdaily.vercel.app/${t.slug}/`), `llms.txt lists ${t.slug}`);

  const fb = fs.readFileSync(path.join(SITE, 'feedback', 'index.html'), 'utf8');
  const datalist = fb.match(/<datalist id="tool-list">([\s\S]*?)<\/datalist>/)[1];
  const options = [...datalist.matchAll(/<option value="([^"]+)"><\/option>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  ok(options.length === 68, 'feedback datalist has exactly 68 tool options');
  for (const t of TOOLS) ok(options.includes(t.name), `feedback datalist includes ${t.name}`);
  ok(new Set(options).size === 68, 'feedback datalist options are unique');
  ok(fb.includes('68 tools'), 'feedback footer says 68 tools');

  // Every tool page footer says 68 tools (63 old + 5 new = 68 tool pages + feedback = 69 dirs).
  const dirs = fs.readdirSync(SITE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'assets' && d.name !== 'tests')
    .map((d) => d.name);
  let footerBad = [];
  for (const d of dirs) {
    const html = fs.readFileSync(path.join(SITE, d, 'index.html'), 'utf8');
    if (!html.includes('68 tools · New tools added regularly.')) footerBad.push(d);
  }
  ok(footerBad.length === 0, `all ${dirs.length} subdir pages footer says 68 tools${footerBad.length ? ' — bad: ' + footerBad.join(', ') : ''}`);

  // Each new page: eyebrow number matches its card number, GA4 + canonical + JSON-LD.
  for (const t of TOOLS) {
    const html = fs.readFileSync(path.join(SITE, t.slug, 'index.html'), 'utf8');
    ok(html.includes(`<p class="eyebrow">${t.cat} · No. ${t.cardNo}</p>`), `${t.slug}: eyebrow is ${t.cat} · No. ${t.cardNo}`);
    ok(html.includes('G-KX85CZXTR4'), `${t.slug}: GA4 present`);
    ok(html.includes(`<link rel="canonical" href="https://toolsdaily.vercel.app/${t.slug}/">`), `${t.slug}: canonical present`);
    ok(html.includes('68 tools · New tools added regularly.'), `${t.slug}: footer says 68 tools`);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    let data = null;
    try { data = JSON.parse(blocks[0]); } catch { /* handled below */ }
    ok(Array.isArray(data) && data.length === 2, `${t.slug}: JSON-LD parses as [WebApplication, FAQPage]`);
  }
  // Currency converter is the download-free one; the other four each have exactly one download button.
  for (const t of TOOLS) {
    const html = fs.readFileSync(path.join(SITE, t.slug, 'index.html'), 'utf8');
    const dlButtons = [...html.matchAll(/<button[^>]*id="download"[^>]*>/g)].length;
    if (t.slug === 'currency-converter') {
      ok(dlButtons === 0 && !html.includes('id="dl"'), 'currency: no download button and no #dl (numbers-only tool)');
    } else {
      ok(dlButtons === 1, `${t.slug}: exactly one #download button`);
      ok(html.includes('id="dl"'), `${t.slug}: hidden #dl anchor present`);
    }
  }
}

console.log(`\nLOGIC-BATCH6 TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
