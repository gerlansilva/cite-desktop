const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadFields() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'integrations', 'word', 'fields.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.CiteFields;
}

test('formats in-text citations for the supported styles', () => {
  const fields = loadFields();
  assert.equal(fields.inTextCitation({ authors: ['Silva, Gerlan'], year: '2026' }, 'ABNT'), '(SILVA, 2026)');
  assert.equal(fields.inTextCitation({ authors: ['Silva', 'Costa'], year: '2020' }, 'APA'), '(Silva & Costa, 2020)');
  assert.equal(fields.inTextCitation({ authors: ['Silva', 'Costa', 'Lopes'], year: '2019' }, 'ABNT'), '(SILVA; COSTA; LOPES, 2019)');
  assert.equal(fields.inTextCitation({ authors: ['Silva', 'Costa', 'Lopes', 'Reis'], year: '2019' }, 'ABNT'), '(SILVA et al., 2019)');
  assert.equal(fields.inTextCitation({ title: 'Sem autoria', year: '2018' }, 'ABNT'), '(Sem autoria, 2018)');
});

test('builds and parses citation tags', () => {
  const fields = loadFields();
  const tag = fields.citationTag(['abc123']);
  assert.equal(tag, 'cite:citation:abc123');
  assert.deepEqual([...fields.parseCitationTag(tag)], ['abc123']);
  assert.equal(fields.parseCitationTag('cite:bibliography'), null);
  assert.equal(fields.parseCitationTag('outra'), null);
});

test('sorts the bibliography by first author', () => {
  const fields = loadFields();
  const text = fields.bibliographyText([
    { id: '2', authors: ['Zeta, Z.'], title: 'Zeta', year: '2020' },
    { id: '1', authors: ['Alfa, A.'], title: 'Alfa', year: '2021' }
  ], 'ABNT');
  assert.ok(text.indexOf('Alfa') < text.indexOf('Zeta'));
  assert.match(text, /\n\n/);
});

test('uses the formatted citation for the chosen style', () => {
  const fields = loadFields();
  const item = { authors: ['Silva, G.'], title: 'Livro', year: '2024', citations: { ABNT: 'SILVA, G. Livro. 2024.', APA: 'Silva, G. (2024). Livro.' } };
  assert.equal(fields.referenceText(item, 'APA'), 'Silva, G. (2024). Livro.');
  assert.equal(fields.referenceText(item, 'ABNT'), 'SILVA, G. Livro. 2024.');
});

function makeWordMock() {
  const controls = [];
  let selectionControl = null;
  const snapshot = () => [...controls];

  function createControl() {
    const control = {
      tag: '',
      title: '',
      cannotEdit: false,
      appearance: '',
      text: '',
      isNullObject: false,
      insertText(value) { this.text = value; return this; },
      load() {},
      delete() { const index = controls.indexOf(this); if (index >= 0) controls.splice(index, 1); }
    };
    return control;
  }

  const selection = {
    text: '',
    insertText(value) { this.text = value; return this; },
    insertContentControl() {
      const control = createControl();
      control.text = this.text;
      controls.push(control);
      return control;
    },
    get parentContentControlOrNullObject() {
      return selectionControl || { isNullObject: true, load() {}, tag: '' };
    },
    load() {}
  };

  const context = {
    document: {
      getSelection: () => selection,
      contentControls: {
        get items() { return snapshot(); },
        load() {},
        getByTag(tag) {
          return { items: controls.filter((control) => control.tag === tag), load() {} };
        }
      },
      body: {
        insertContentControl() {
          const control = createControl();
          controls.push(control);
          return control;
        },
        insertText() {}
      }
    },
    sync: async () => {}
  };

  return {
    controls,
    selection,
    setSelectionControl(control) { selectionControl = control; },
    Word: {
      run: async (fn) => { await fn(context); await context.sync(); },
      InsertLocation: { replace: 'Replace', end: 'End' },
      ContentControlAppearance: { hidden: 'Hidden' }
    }
  };
}

function loadFieldsWithWord() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'integrations', 'word', 'fields.js'), 'utf8');
  const mock = makeWordMock();
  const sandbox = { window: {}, Word: mock.Word };
  vm.runInNewContext(code, sandbox);
  return { fields: sandbox.window.CiteFields, mock };
}

test('inserts linked citations and bibliography content controls', async () => {
  const { fields, mock } = loadFieldsWithWord();
  const item = { id: 'ref-1', authors: ['Silva, G.'], year: '2026', title: 'Livro', citations: { ABNT: 'SILVA, G. Livro. 2026.' } };

  await fields.insertCitation(item, 'ABNT');
  assert.equal(mock.controls.length, 1);
  assert.equal(mock.controls[0].tag, 'cite:citation:ref-1');
  assert.equal(mock.controls[0].text, '(SILVA, 2026)');
  assert.equal(mock.controls[0].appearance, 'Hidden');

  await fields.insertBibliography([item], 'ABNT');
  assert.equal(mock.controls.length, 2);
  assert.equal(mock.controls[1].tag, 'cite:bibliography');
  assert.equal(mock.controls[1].text, 'SILVA, G. Livro. 2026.');

  await fields.refreshDocument([item], 'APA');
  assert.equal(mock.controls[0].text, '(Silva, 2026)');
  assert.equal(mock.controls[1].text, 'SILVA, G. Livro. 2026.');

  const count = await fields.unlinkDocument();
  assert.equal(count, 2);
  assert.equal(mock.controls.length, 0);
});

test('edits the citation under the cursor', async () => {
  const { fields, mock } = loadFieldsWithWord();
  const first = { id: 'a', authors: ['Silva, G.'], year: '2020' };
  const second = { id: 'b', authors: ['Costa, M.'], year: '2024' };

  await fields.insertCitation(first, 'ABNT');
  mock.setSelectionControl(mock.controls[0]);
  const updated = await fields.updateSelectedCitation(second, 'ABNT');
  assert.equal(updated, true);
  assert.equal(mock.controls[0].tag, 'cite:citation:b');
  assert.equal(mock.controls[0].text, '(COSTA, 2024)');
});
