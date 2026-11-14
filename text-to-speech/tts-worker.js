/* ToolsDaily — Text to Speech download engine worker.
 *
 * Runs Kokoro-82M (StyleTTS 2) TTS via kokoro-js + Transformers.js off the
 * main thread, so the page stays responsive while the AI works. The visitor's
 * text is sent into this worker only as plain text — text is NEVER uploaded
 * anywhere; the only downloads are the library and the model files
 * themselves (from the Hugging Face Hub CDN), which the browser then caches.
 *
 * Verified against live docs 2026-11-14 (see research note):
 *  - kokoro-js 1.2.1 (Apache-2.0), README + onnx-community/Kokoro-82M-v1.0-ONNX
 *    model card: KokoroTTS.from_pretrained(model_id, { dtype, device,
 *    progress_callback }); TextSplitterStream + tts.stream(splitter,
 *    { voice, speed }) yields { text, audio } RawAudio chunks; af_heart is
 *    the grade-A voice; output sampling rate is 24000 Hz.
 *  - transformers.js RawAudio: .audio is a Float32Array, .sampling_rate the
 *    rate; .toBlob() encodes a WAV blob (the page encodes its own WAV from
 *    the raw samples instead, so the bytes are unit-tested here).
 *  - kokoro-web (xenova/kokoro-web src/worker.ts) is the canonical browser
 *    pattern this worker follows: q8 dtype on WASM, fp32 on WebGPU.
 *
 * Design rules, mirroring the Audio Transcriber's worker discipline:
 *  - Exactly ONE KokoroTTS instance per worker lifetime. If creation or a
 *    run fails, the page terminates this worker and spawns a fresh one; this
 *    worker never retries in place.
 *  - WASM only, no WebGPU: the WASM path is the proven one for this site,
 *    and thread count adapts to cross-origin isolation (with the tool's
 *    COOP/COEP headers it can use up to 4 threads; without isolation it
 *    safely falls back to 1 — SharedArrayBuffer is never required).
 *  - dtype 'q8' (the ~88 MB quantized model). Never 'fp16': the fp16 export
 *    is known to produce NaN samples for some inputs (hexgrad/kokoro #74).
 *  - Cancel = the page terminates the worker. A half-finished synthesis
 *    cannot be paused, so a clean kill + fresh worker is the honest reset.
 *  - English only: kokoro-js 1.2.1 ships an English-only voice map and an
 *    English-only phonemizer. Non-English text is read with English
 *    phonemes. The page says so next to the Download button.
 */
'use strict';

import { env, KokoroTTS, TextSplitterStream } from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';

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

var MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
var VOICE = 'af_heart'; // grade-A voice (kokoro-js README voice table)
var tts = null;

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

async function load() {
  if (tts) { post({ type: 'ready' }); return; }
  // The single pipeline creation allowed in this worker's lifetime.
  tts = await KokoroTTS.from_pretrained(MODEL_ID, {
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

async function run(text, speed) {
  if (!tts) throw new Error('engine not ready');
  // TextSplitterStream splits long text into synthesis-sized pieces (Kokoro's
  // context is 510 tokens), so the whole text can be pushed at once.
  var splitter = new TextSplitterStream();
  splitter.push(text);
  splitter.close();
  var stream = tts.stream(splitter, { voice: VOICE, speed: speed });
  var chunks = [], samplingRate = 24000, count = 0;
  for await (var part of stream) {
    var audio = part && part.audio;
    if (audio && audio.audio && audio.audio.length) {
      if (audio.sampling_rate) samplingRate = audio.sampling_rate;
      chunks.push(audio.audio);
      count++;
      post({ type: 'chunk', index: count });
    }
  }
  if (!chunks.length) throw new Error('no audio generated');
  var total = 0;
  chunks.forEach(function (c) { total += c.length; });
  var merged = new Float32Array(total), off = 0;
  chunks.forEach(function (c) { merged.set(c, off); off += c.length; });
  // Transfer the merged samples (zero-copy) — the page encodes the WAV.
  post({ type: 'result', samples: merged.buffer, sampling_rate: samplingRate }, [merged.buffer]);
}

self.onmessage = function (e) {
  var m = e.data || {};
  if (m.type === 'load') {
    load().catch(function (err) {
      post({ type: 'error', phase: 'load', message: String(err && err.message ? err.message : err) });
    });
  } else if (m.type === 'run') {
    run(String(m.text || ''), m.speed).catch(function (err) {
      post({ type: 'error', phase: 'run', message: String(err && err.message ? err.message : err) });
    });
  }
};
