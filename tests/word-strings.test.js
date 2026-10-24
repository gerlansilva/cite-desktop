const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const strings = require('../integrations/word/strings.js');

const root = path.join(__dirname, '..');
const taskpaneHtml = fs.readFileSync(path.join(root, 'integrations/word/taskpane.html'), 'utf8');
const taskpaneJs = fs.readFileSync(path.join(root, 'integrations/word/taskpane.js'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'integrations/google-docs/Sidebar.html'), 'utf8');
const codeGs = fs.readFileSync(path.join(root, 'integrations/google-docs/Code.gs'), 'utf8');

test('translates the panel strings and interpolates values', () => {
  assert.equal(strings.t('Inserir citação'), 'Inserir citação');
  strings.setLanguage('tet');
  assert.equal(strings.getLanguage(), 'tet');
  assert.equal(strings.t('Inserir citação'), 'Hatama sitasaun');
  assert.equal(strings.t('{n} referências atualizadas.', { n: 3 }), '3 referénsia atualizadu ona.');
  assert.equal(strings.t('texto sem tradução'), 'texto sem tradução');
  strings.setLanguage('pt');
  assert.equal(strings.t('Inserir citação'), 'Inserir citação');
});

test('translates every static label of the Word panel', () => {
  const body = taskpaneHtml.slice(taskpaneHtml.indexOf('<body>'), taskpaneHtml.indexOf('</body>'));
  const labels = new Set(
    [...body.matchAll(/>([^<>]+)</g)]
      .map((match) => match[1].trim())
      .filter((text) => text && /[a-zà-ú]/i.test(text) && text.length <= 80)
  );
  const keep = new Set(['Cite', '0 itens', 'grifo nosso', 'grifo do autor', 'adaptado de', 'cf.']);
  const missing = [...labels].filter((text) => !keep.has(text) && !strings.has(text));
  assert.deepEqual(missing, []);
});

test('translates every message used by the Word panel script', () => {
  const literals = new Set(
    [...taskpaneJs.matchAll(/\bt\('([^']*)'/g)].map((match) => match[1])
      .concat([...taskpaneJs.matchAll(/setStatus\('([^']*)'/g)].map((match) => match[1]))
      .concat([...taskpaneJs.matchAll(/setLocalState\('([^']*)'/g)].map((match) => match[1]))
  );
  const missing = [...literals].filter((text) => !strings.has(text));
  assert.deepEqual(missing, []);
});

test('loads the shared strings before the panel scripts', () => {
  const stringsIndex = taskpaneHtml.indexOf('./strings.js');
  const fieldsIndex = taskpaneHtml.indexOf('./fields.js');
  assert.ok(stringsIndex > 0);
  assert.ok(stringsIndex < fieldsIndex);
  assert.match(taskpaneHtml, /<select id="language"/);
  assert.match(taskpaneHtml, /<div id="list" data-no-i18n>/);
  assert.match(taskpaneHtml, /id="preview-reference"[^>]*data-no-i18n/);
});

test('follows the language reported by the Cite connector', () => {
  assert.match(taskpaneJs, /adoptLanguage\(found\.ping\?\.language\)/);
  assert.match(taskpaneJs, /function applyLanguage\(/);
  assert.match(taskpaneJs, /\$\('language'\)\.disabled = value/);
});

test('localizes the Google Docs sidebar and saves the language per document', () => {
  assert.match(sidebar, /<select id="language"/);
  assert.match(sidebar, /google\.script\.run\.saveLanguage\(value\)/);
  assert.match(codeGs, /CITE_LANGUAGE/);
  assert.match(codeGs, /function saveLanguage\(/);
  assert.match(codeGs, /language: language === 'tet' \? 'tet' : 'pt'/);

  const labels = [...sidebar.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(labels.length >= 6);
  for (const label of labels) {
    assert.ok(sidebar.includes(`'${label}':`), `missing translation for ${label}`);
  }
});
