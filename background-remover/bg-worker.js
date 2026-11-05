/* ToolsDaily — AI Background Remover engine worker.
 *
 * Runs ONNX Runtime Web (WASM) + the ISNet model off the main thread, so the
 * page stays responsive while the AI works.
 *
 * Design rules, learned from live failures on 2026-11-05:
 *  - Exactly ONE InferenceSession.create() per worker lifetime. A failed or
 *    timed-out create can leave the WASM runtime half-initialised, and any
 *    second attempt then dies with "multiple calls to 'initWasm()' detected".
 *    Recovery is therefore always: the page terminates this worker and spawns
 *    a fresh one. This worker never retries a create.
 *  - WASM only, no WebGPU. The WebGPU/JSEP path hung for minutes on a real
 *    desktop with the fp16 model and poisoned every later fallback attempt.
 *    Multi-threaded WASM (SIMD) is the proven path.
 */
'use strict';

importScripts('/assets/vendor/ort/ort.wasm.min.js');

var session = null;
var modelBuf = null;

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

function fetchPart(url, onBytes) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error('model download failed (' + r.status + ')');
    if (!r.body || !r.body.getReader) {
      return r.arrayBuffer().then(function (ab) { onBytes(ab.byteLength); return ab; });
    }
    var reader = r.body.getReader(), chunks = [], got = 0;
    function pump() {
      return reader.read().then(function (res) {
        if (res.done) {
          var ab = new Uint8Array(got), off = 0;
          chunks.forEach(function (c) { ab.set(c, off); off += c.length; });
          return ab.buffer;
        }
        chunks.push(res.value); got += res.value.length; onBytes(res.value.length);
        return pump();
      });
    }
    return pump();
  });
}

function sha256Hex(buf) {
  return crypto.subtle.digest('SHA-256', buf).then(function (h) {
    var bytes = new Uint8Array(h), hex = '';
    for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
    return hex;
  });
}

async function downloadModel() {
  var manifest = await (await fetch('/assets/models/manifest.json')).json();
  var total = manifest.totalBytes, done = 0, bufs = new Array(manifest.parts.length);
  var idx = 0;
  async function pull() {
    while (idx < manifest.parts.length) {
      var i = idx++;
      bufs[i] = await fetchPart('/assets/models/' + manifest.parts[i], function (n) {
        done += n;
        post({ type: 'progress', done: done, total: total });
      });
    }
  }
  await Promise.all([pull(), pull(), pull()]);
  var whole = new Uint8Array(total), off = 0;
  bufs.forEach(function (b) { whole.set(new Uint8Array(b), off); off += b.byteLength; });
  if (whole.byteLength !== total) throw new Error('model download was incomplete — please reload and try again');
  var hex = await sha256Hex(whole.buffer);
  if (hex !== manifest.sha256) throw new Error('model download did not verify — please reload and try again');
  return whole.buffer;
}

async function init(light) {
  if (session) { post({ type: 'ready', threads: ort.env.wasm.numThreads }); return; }
  if (!modelBuf) modelBuf = await downloadModel();
  post({ type: 'starting' });
  var threads = light ? 1 : (self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1);
  ort.env.wasm.wasmPaths = '/assets/vendor/ort/';
  ort.env.wasm.numThreads = threads;
  // The single session create allowed in this worker's lifetime.
  session = await ort.InferenceSession.create(modelBuf, { executionProviders: ['wasm'] });
  post({ type: 'ready', threads: threads });
}

async function run(buf) {
  if (!session) throw new Error('engine not ready');
  var input = new ort.Tensor('float32', new Float32Array(buf), [1, 3, 1024, 1024]);
  var feeds = {};
  feeds[session.inputNames[0]] = input;
  var out = await session.run(feeds);
  var mask = out[session.outputNames[0]].data;
  var copy = new Float32Array(mask);
  post({ type: 'result', mask: copy.buffer }, [copy.buffer]);
}

self.onmessage = function (e) {
  var m = e.data || {};
  if (m.type === 'init') {
    init(!!m.light).catch(function (err) {
      post({ type: 'error', phase: 'init', message: String(err && err.message ? err.message : err) });
    });
  } else if (m.type === 'run') {
    run(m.buffer).catch(function (err) {
      post({ type: 'error', phase: 'run', message: String(err && err.message ? err.message : err) });
    });
  }
};
