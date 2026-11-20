const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const pdfjs = path.join(root, 'node_modules', 'pdfjs-dist');

async function bundle(entry, outfile, options = {}) {
  await esbuild.build({
    entryPoints: [path.join(src, entry)],
    outfile: path.join(src, outfile),
    bundle: true,
    format: 'iife',
    minify: true,
    logLevel: 'warning',
    ...options
  });
}

async function main() {
  await bundle('pdf-viewer.js', 'pdf-viewer.bundle.js');
  await bundle('pdf-text.js', 'pdf-text.bundle.js', { globalName: 'PdfText' });
  await esbuild.build({
    entryPoints: [path.join(pdfjs, 'legacy', 'build', 'pdf.worker.mjs')],
    outfile: path.join(src, 'pdf.worker.bundle.js'),
    bundle: true,
    format: 'iife',
    minify: true,
    logLevel: 'warning'
  });

  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  for (const file of fs.readdirSync(src).filter((name) => name.endsWith('.html'))) {
    const target = path.join(src, file);
    const html = fs.readFileSync(target, 'utf8').replace(
      /(src|href)="\.\/([^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g,
      `$1="./$2?v=${version}"`
    );
    fs.writeFileSync(target, html);
  }

  const target = path.join(src, 'pdfjs');
  for (const folder of ['cmaps', 'standard_fonts']) {
    const from = path.join(pdfjs, folder);
    const to = path.join(target, folder);
    if (fs.existsSync(from)) {
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(from, to, { recursive: true });
    }
  }
  console.log('assets do visualizador de PDF gerados em src/');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
