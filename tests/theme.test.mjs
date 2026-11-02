// Theme tests: dark-mode toggle exists, defaults to light, switches + persists via localStorage.
// Run: start a static server at the site root, then TD_BASE=http://127.0.0.1:8791/ node tests/theme.test.mjs
import { createRequire } from 'node:module';
const require = createRequire('/tmp/tooltests/package.json');
const { JSDOM } = require('jsdom');
const BASE = process.env.TD_BASE || 'http://127.0.0.1:8791/';
let pass=0, fail=0;
const ok=(c,n)=>{ if(c){pass++;console.log('  PASS',n);} else {fail++;console.log('  FAIL',n);} };

// 1) fresh visit: default light, toggle present, click -> dark + saved, click -> light + saved
{
  const dom = await JSDOM.fromURL(BASE, { resources:'usable', runScripts:'dangerously', pretendToBeVisual:true });
  await new Promise(r=>{ if(dom.window.document.readyState==='complete') r(); else dom.window.addEventListener('load', r); });
  const d = dom.window.document;
  ok(!!d.getElementById('theme-toggle'), 'home: toggle button exists');
  ok(d.documentElement.getAttribute('data-theme') !== 'dark', 'home: default is light (no data-theme=dark)');
  d.getElementById('theme-toggle').click();
  ok(d.documentElement.getAttribute('data-theme') === 'dark', 'home: click switches to dark');
  ok(dom.window.localStorage.getItem('td-theme') === 'dark', 'home: dark choice saved');
  ok(d.getElementById('theme-toggle').textContent.includes('☀'), 'home: toggle icon becomes sun in dark');
  d.getElementById('theme-toggle').click();
  ok(d.documentElement.getAttribute('data-theme') === 'light', 'home: second click back to light');
  ok(dom.window.localStorage.getItem('td-theme') === 'light', 'home: light choice saved');
  dom.window.close();
}
// 2) saved dark choice is applied on load by the inline init script
{
  const dom = await JSDOM.fromURL(BASE + 'qr-generator/', { resources:'usable', runScripts:'dangerously', pretendToBeVisual:true,
    beforeParse(window){ try{ window.localStorage.setItem('td-theme','dark'); }catch(e){} } });
  await new Promise(r=>{ if(dom.window.document.readyState==='complete') r(); else dom.window.addEventListener('load', r); });
  ok(dom.window.document.documentElement.getAttribute('data-theme') === 'dark', 'qr page: saved dark applied on load');
  ok(dom.window.document.getElementById('theme-toggle').textContent.includes('☀'), 'qr page: toggle shows sun when dark');
  dom.window.close();
}
console.log(`THEME TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
