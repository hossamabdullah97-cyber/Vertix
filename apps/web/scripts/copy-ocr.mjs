// Copies what reading a business card on the phone needs (the Tesseract
// worker, its WebAssembly core, and the Arabic and English data) from
// node_modules into public/ocr, so the app serves them itself: no outside
// CDN sees the request, and it works where such CDNs are blocked. Runs
// before dev and build; the copies are not kept in git.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'ocr');
const require = createRequire(import.meta.url);
const pkg = (name) => dirname(require.resolve(`${name}/package.json`));
const tesseract = pkg('tesseract.js');
const core = dirname(require.resolve('tesseract.js-core/package.json', { paths: [tesseract] }));

const files = [
  [join(tesseract, 'dist', 'worker.min.js'), 'worker.min.js'],
  // The LSTM-only builds: with and without SIMD; the worker picks one.
  [join(core, 'tesseract-core-simd-lstm.wasm.js'), 'core/tesseract-core-simd-lstm.wasm.js'],
  [join(core, 'tesseract-core-lstm.wasm.js'), 'core/tesseract-core-lstm.wasm.js'],
  [join(pkg('@tesseract.js-data/ara'), '4.0.0_best_int', 'ara.traineddata.gz'), 'lang/ara.traineddata.gz'],
  [join(pkg('@tesseract.js-data/eng'), '4.0.0_best_int', 'eng.traineddata.gz'), 'lang/eng.traineddata.gz'],
];

for (const [from, to] of files) {
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest) && statSync(dest).size === statSync(from).size) continue;
  copyFileSync(from, dest);
}
console.log(`ocr: ${files.length} files ready in public/ocr`);
