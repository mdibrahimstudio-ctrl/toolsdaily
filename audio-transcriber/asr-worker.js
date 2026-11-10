/* ToolsDaily — AI Audio Transcriber engine worker.
 *
 * Runs Transformers.js (v3) + OpenAI's Whisper tiny model (quantized, from the
 * Hugging Face CDN) off the main thread, so the page stays responsive while
 * the AI works. The visitor's audio is decoded on the page and only the raw
 * samples cross into this worker — audio is NEVER uploaded anywhere; the only
 * downloads are the library and the model files themselves.
 *
 * Design rules, mirroring the Background Remover's worker discipline:
 *  - Exactly ONE pipeline is created per worker lifetime. If creation or a
 *    run fails, the page terminates this worker and spawns a fresh one; this
 *    worker never retries in place.
 *  - WASM only, no WebGPU: the WASM path is the proven one for this site,
 *    and thread count adapts to cross-origin isolation (with the tool's
 *    COOP/COEP headers it can use up to 4 threads; without isolation it
 *    safely falls back to 1 — SharedArrayBuffer is never required).
 *  - Cancel = the page terminates the worker. A half-finished generation
 *    cannot be paused, so a clean kill + fresh worker is the honest reset.
 */
'use strict';

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

// Models come from the Hugging Face Hub CDN, never from local files.
env.allowLocalModels = false;
env.allowRemoteModels = true;

// Defensive WASM threading: multi-thread only when cross-origin isolated.
try {
  if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = self.crossOriginIsolated
      ? Math.min(4, self.navigator.hardwareConcurrency || 2)
      : 1;
  }
} catch (e) { /* older runtimes: leave the default in place */ }

var transcriber = null;

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

async function load() {
  if (transcriber) { post({ type: 'ready' }); return; }
  // The single pipeline creation allowed in this worker's lifetime.
  transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: function (p) {
      if (!p) return;
      if (p.status === 'progress' && p.file) {
        post({ type: 'progress', file: p.file, loaded: p.loaded || 0, total: p.total || 0, progress: p.progress || 0 });
      } else if (p.status === 'done' && p.file) {
        post({ type: 'filedone', file: p.file });
      }
    },
  });
  post({ type: 'ready' });
}

async function run(audio, language) {
  if (!transcriber) throw new Error('engine not ready');
  var opts = {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    task: 'transcribe',
  };
  if (language) opts.language = language;
  var out = await transcriber(audio, opts);
  var chunks = (out.chunks || []).map(function (c) {
    return { text: c.text, timestamp: [c.timestamp[0], c.timestamp[1]] };
  });
  post({ type: 'result', text: out.text || '', chunks: chunks });
}

self.onmessage = function (e) {
  var m = e.data || {};
  if (m.type === 'load') {
    load().catch(function (err) {
      post({ type: 'error', phase: 'load', message: String(err && err.message ? err.message : err) });
    });
  } else if (m.type === 'run') {
    run(new Float32Array(m.buffer), m.language || null).catch(function (err) {
      post({ type: 'error', phase: 'run', message: String(err && err.message ? err.message : err) });
    });
  }
};
