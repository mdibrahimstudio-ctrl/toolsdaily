# Vendored libraries — ToolsDaily

All libraries below are self-hosted in `assets/vendor/` — no CDN at runtime
(except GA4 + lazy-loaded Kokoro for TTS, which are separate). Pinned versions,
downloaded 2026-11-16. When upgrading, re-check the API against live docs first.

## PDF engines (added 2026-11-16 for the 10 new PDF tools)

| File | Library | Version | Source | License |
|---|---|---|---|---|
| `pdf-lib.min.js` | pdf-lib | 1.17.x (vendored 2026-10-31) | npm pdf-lib | MIT |
| `pdf.min.js` + `pdf.worker.min.js` (+ `pdf.worker.js`, same content) | pdf.js (Mozilla) | **3.11.174** | jsdelivr `pdfjs-dist@3.11.174/build/` | Apache-2.0 |
| `docx.umd.js` | docx | **9.15.4** | npm docx `dist/index.umd.cjs`, renamed to `.js` | MIT |
| `qpdf/qpdf.js` + `qpdf/qpdf.wasm` | @neslinesli93/qpdf-wasm (QPDF compiled to WASM) | **0.3.1** | npm @neslinesli93/qpdf-wasm | ISC wrapper / Apache-2.0 (QPDF) |
| `tesseract/*` | tesseract.js + tesseract.js-core + eng data | **7.0.0** + core **7.0.0** | npm tesseract.js, tesseract.js-core; traineddata from tessdata.projectnaptha.com `4.0.0_fast` | Apache-2.0 |

### Why pdf.js 3.11.174 (not the latest 6.x)?
pdf.js 4.x and later ship ESM-only builds. ToolsDaily tool pages use classic
`<script>` tags (matching the pdf-lib pattern and the jsdom test harness).
3.11.174 is the last UMD build (`pdf.min.js` + `pdf.worker.min.js`); the API
surface we use (`getDocument`, `getTextContent`, `render`, `workerSrc`) is
unchanged in later versions. Load with:
`<script src="../assets/vendor/pdf.min.js"></script>` then
`pdfjsLib.GlobalWorkerOptions.workerSrc = '../assets/vendor/pdf.worker.min.js'`.
`pdf.worker.js` is a byte-identical copy of the worker that exists ONLY so
Node-based tests work: pdf.js in Node uses an in-process ("fake") worker that
requires `./pdf.worker.js` next to `pdf.min.js`. Do not delete it.
Verified 2026-11-16: qpdf-encrypted output throws `PasswordException`
("No password given") in pdf.js without a password and opens with it.

### docx.js
UMD build sets `window.docx` (1.06 MB). Loaded ONLY on the pdf-to-word page.
API used: `new docx.Document({ sections: [{ children: [new docx.Paragraph(...) ] }] })`,
`docx.Packer.toBlob(doc)`. Verified against docx 9.x docs 2026-11-16.

### qpdf WASM (protect-pdf only, lazy-loaded on first use)
Emscripten build; classic `<script src="../assets/vendor/qpdf/qpdf.js">` exposes
a global `Module` factory. Usage (per the package README):
```js
const qpdf = await Module({ locateFile: () => '../assets/vendor/qpdf/qpdf.wasm' });
qpdf.FS.writeFile('/input.pdf', uint8Array);
qpdf.callMain(['/input.pdf', '--encrypt', userPass, ownerPass, '256', '--', '/output.pdf']);
const out = qpdf.FS.readFile('/output.pdf');
```
Encrypts with AES-256. Verify output by opening it in pdf.js — it must demand
the password. pdf-lib CANNOT encrypt; this is the only client-side path.

### Tesseract (ocr-pdf only, lazy-loaded on first use — Kokoro precedent)
- `tesseract.min.js` (63 KB) + `worker.min.js` (111 KB) — tesseract.js 7.0.0.
- Core: all three LSTM variants vendored because the worker picks by CPU
  feature detection (relaxed-SIMD → simd → plain): `tesseract-core-{relaxedsimd-lstm,simd-lstm,lstm}.wasm.js` + matching `.wasm` files (~20 MB total).
  Set `corePath` to the vendored directory so the worker finds them.
- `eng.traineddata.gz` — the **fast** English model (4.0.0_fast, 2 MB), the
  standard web tradeoff vs the 11 MB full model. Set `langPath` to the
  vendored directory. English only in v1.
- API (v7): `const worker = await Tesseract.createWorker('eng', 1, { workerPath, corePath, langPath, logger })`, then `worker.recognize(image)`.
  Never load any of this until the user clicks "Start OCR".

## Older vendored files (pre-existing)
- `jsqr.js` (QR reader), `qrcode.js` (QR generator), `ort/` (ONNX runtime +
  ISNet model for the AI Background Remover).

| `jszip.min.js` | JSZip | **3.10.1** | jsdelivr `jszip@3.10.1/dist/jszip.min.js` | MIT |
