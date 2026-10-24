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
        insertParagraph() {
          return {
            insertContentControl() {
              const control = createControl();
              controls.push(control);
              return control;
            }
          };
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

function loadFieldsWithWord({ Office } = {}) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'integrations', 'word', 'fields.js'), 'utf8');
  const mock = makeWordMock();
  const sandbox = { window: {}, Word: mock.Word };
  if (Office) sandbox.Office = Office;
  vm.runInNewContext(code, sandbox);
  return { fields: sandbox.window.CiteFields, mock };
}

function makeSettings() {
  const data = new Map();
  return {
    data,
    get: (key) => data.get(key),
    set: (key, value) => data.set(key, value),
    remove: (key) => data.delete(key),
    saveAsync: (callback) => callback({ status: 'succeeded' })
  };
}

test('inserts linked citations and bibliography content controls', async () => {
  const { fields, mock } = loadFieldsWithWord();
  const item = { id: 'ref-1', authors: ['Silva, G.'], year: '2026', title: 'Livro', citations: { ABNT: 'SILVA, G. Livro. 2026.' } };

  await fields.insertCitation(item, 'ABNT');
  assert.equal(mock.controls.length, 1);
  assert.deepEqual([...fields.citationIds(mock.controls[0].tag)], ['ref-1']);
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
  assert.deepEqual([...fields.citationIds(mock.controls[0].tag)], ['b']);
  assert.equal(mock.controls[0].text, '(COSTA, 2024)');
});

const CITATION_MATRIX = {
  ABNT: {
    1: '(SILVA, 2026)',
    2: '(SILVA; COSTA, 2026)',
    3: '(SILVA; COSTA; LOPES, 2026)',
    4: '(SILVA et al., 2026)'
  },
  APA: {
    1: '(Silva, 2026)',
    2: '(Silva & Costa, 2026)',
    3: '(Silva et al., 2026)',
    4: '(Silva et al., 2026)'
  },
  MLA: {
    1: '(Silva 2026)',
    2: '(Silva and Costa 2026)',
    3: '(Silva et al. 2026)',
    4: '(Silva et al. 2026)'
  },
  Harvard: {
    1: '(Silva, 2026)',
    2: '(Silva and Costa, 2026)',
    3: '(Silva et al., 2026)',
    4: '(Silva et al., 2026)'
  },
  Chicago: {
    1: '(Silva 2026)',
    2: '(Silva and Costa 2026)',
    3: '(Silva, Costa, and Lopes 2026)',
    4: '(Silva et al. 2026)'
  }
};

const AUTHORS = {
  1: ['Silva, G.'],
  2: ['Silva, G.', 'Costa, M.'],
  3: ['Silva, G.', 'Costa, M.', 'Lopes, R.'],
  4: ['Silva, G.', 'Costa, M.', 'Lopes, R.', 'Reis, A.']
};

for (const [style, expected] of Object.entries(CITATION_MATRIX)) {
  test(`formats ${style} in-text citations for 1 to 4 authors`, () => {
    const fields = loadFields();
    for (const count of [1, 2, 3, 4]) {
      const item = { id: `ref-${count}`, authors: AUTHORS[count], year: '2026', title: 'Título' };
      assert.equal(fields.inTextCitation(item, style), expected[count]);
    }
  });
}

test('formats Vancouver citations as numbers', () => {
  const fields = loadFields();
  const item = { id: 'a', authors: ['Silva, G.'], year: '2026', title: 'Título' };
  assert.equal(fields.isNumericStyle('Vancouver'), true);
  assert.equal(fields.isNumericStyle('ABNT'), false);
  assert.equal(fields.inTextCitation(item, 'Vancouver', 7), '(7)');
  assert.deepEqual(fields.citationNumbers(['cite:citation:b', 'cite:citation:a', 'cite:citation:b']).get('a'), 2);
});

test('falls back to the title and s.d. when metadata is missing', () => {
  const fields = loadFields();
  for (const style of Object.keys(CITATION_MATRIX)) {
    const text = fields.inTextCitation({ id: 'x', title: 'Sem autoria' }, style);
    assert.match(text, /Sem autoria/);
  }
  assert.match(fields.inTextCitation({ id: 'x', authors: ['Silva, G.'] }, 'APA'), /s\.d\./);
});

test('inserts, refreshes and unlinks every citation style', async () => {
  const fields = loadFields();
  const item = { id: 'ref-1', authors: ['Silva, G.'], year: '2026', title: 'Título', citations: { ABNT: 'SILVA, G. Título. 2026.' } };

  for (const style of [...Object.keys(CITATION_MATRIX), 'Vancouver']) {
    const mock = loadFieldsWithWord().mock;
    const sandbox = { window: {}, Word: mock.Word };
    const code = fs.readFileSync(path.join(__dirname, '..', 'integrations', 'word', 'fields.js'), 'utf8');
    vm.runInNewContext(code, sandbox);
    const scoped = sandbox.window.CiteFields;

    await scoped.insertCitation(item, style);
    assert.equal(mock.controls.length, 1, style);
    assert.deepEqual([...scoped.citationIds(mock.controls[0].tag)], ['ref-1'], style);

    await scoped.refreshDocument([item], style);
    assert.equal(mock.controls[0].text, CITATION_MATRIX[style]?.[1] || '(1)', style);

    const count = await scoped.unlinkDocument();
    assert.equal(count, 1, style);
    assert.equal(mock.controls.length, 0, style);
  }
});

test('numbers Vancouver citations and bibliography in document order', async () => {
  const { fields, mock } = loadFieldsWithWord();
  const first = { id: 'a', authors: ['Alfa, A.'], year: '2020', title: 'Alfa', citations: { Vancouver: 'Alfa, A. Alfa. 2020.' } };
  const second = { id: 'b', authors: ['Beta, B.'], year: '2021', title: 'Beta', citations: { Vancouver: 'Beta, B. Beta. 2021.' } };

  await fields.insertCitation(first, 'Vancouver');
  await fields.insertCitation(second, 'Vancouver');
  await fields.insertCitation(first, 'Vancouver');
  assert.deepEqual(mock.controls.map((control) => control.text), ['(1)', '(2)', '(1)']);

  await fields.insertBibliography([second, first], 'Vancouver');
  const bibliography = mock.controls.find((control) => control.tag === 'cite:bibliography');
  assert.match(bibliography.text, /^1\. Alfa/);
  assert.match(bibliography.text, /\n\n2\. Beta/);

  const reordered = [mock.controls[1], mock.controls[0], mock.controls[2], mock.controls[3]];
  mock.controls.splice(0, mock.controls.length, ...reordered);
  await fields.refreshDocument([first, second], 'Vancouver');
  assert.deepEqual(mock.controls.slice(0, 3).map((control) => control.text), ['(1)', '(2)', '(2)']);
  assert.match(mock.controls[3].text, /^1\. Beta/);
  assert.match(mock.controls[3].text, /\n\n2\. Alfa/);
});

test('combines multiple references and applies locator, suffix and apud', () => {
  const fields = loadFields();
  const silva = { id: 's', authors: ['Silva, G.'], year: '2020', title: 'Silva' };
  const costa = { id: 'c', authors: ['Costa, M.'], year: '2001', title: 'Costa' };

  assert.equal(fields.citationText([silva, costa], 'ABNT'), '(SILVA, 2020; COSTA, 2001)');
  assert.equal(fields.citationText([silva], 'ABNT', { locator: 'p. 10' }), '(SILVA, 2020, p. 10)');
  assert.equal(
    fields.citationText([silva], 'ABNT', { locator: 'p. 10', suffix: 'grifo nosso' }),
    '(SILVA, 2020, p. 10, grifo nosso)'
  );
  assert.equal(
    fields.citationText([costa], 'ABNT', { apud: 'SILVA, 1999', locator: 'p. 10' }),
    '(SILVA, 1999 apud COSTA, 2001, p. 10)'
  );
  assert.equal(fields.citationText([silva], 'ABNT', { prefix: 'cf.' }), '(cf. SILVA, 2020)');
  assert.equal(fields.citationText([silva], 'ABNT', { yearSuffix: 'a' }), '(SILVA, 2020a)');
  assert.equal(fields.citationText([silva], 'ABNT', { suppressAuthor: true }), '(2020)');
  assert.equal(fields.citationText([silva], 'ABNT', { suppressYear: true, locator: 'p. 10' }), '(SILVA, p. 10)');
});

test('formats narrative citations for each style', () => {
  const fields = loadFields();
  const item = { authors: ['Silva, G.'], year: '2020', title: 'Título' };
  assert.equal(fields.citationText([item], 'ABNT', { narrative: true }), 'SILVA (2020)');
  assert.equal(fields.citationText([item], 'APA', { narrative: true }), 'Silva (2020)');
  assert.equal(fields.citationText([item], 'MLA', { narrative: true }), 'Silva (2020)');
  assert.equal(
    fields.citationText([item], 'ABNT', { narrative: true, locator: 'p. 10', suffix: 'grifo nosso' }),
    'SILVA (2020, p. 10, grifo nosso)'
  );
});

test('numbers multiple Vancouver references together', () => {
  const fields = loadFields();
  const first = { id: 'a', authors: ['Alfa, A.'], year: '2020', title: 'Alfa' };
  const second = { id: 'b', authors: ['Beta, B.'], year: '2021', title: 'Beta' };
  assert.equal(fields.citationText([first, second], 'Vancouver', { numbers: [3, 4] }), '(3,4)');
  assert.equal(
    fields.citationText([first, second], 'Vancouver', { numbers: [3, 4], locator: 'p. 9', suffix: 'grifo nosso' }),
    '(3,4, p. 9, grifo nosso)'
  );
});

test('inserts and edits a multi-reference citation with options', async () => {
  const { fields, mock } = loadFieldsWithWord();
  const silva = { id: 's', authors: ['Silva, G.'], year: '2020', title: 'Silva' };
  const costa = { id: 'c', authors: ['Costa, M.'], year: '2001', title: 'Costa' };

  await fields.insertCitation([silva, costa], 'ABNT', { locator: 'p. 10', suffix: 'grifo nosso' });
  assert.equal(mock.controls[0].text, '(SILVA, 2020, p. 10; COSTA, 2001, grifo nosso)');
  assert.deepEqual([...fields.citationIds(mock.controls[0].tag)], ['s', 'c']);
  assert.equal(fields.citationRef(mock.controls[0].tag).options.locator, 'p. 10');

  mock.setSelectionControl(mock.controls[0]);
  const selected = await fields.selectedCitation();
  assert.deepEqual(selected.ids, ['s', 'c']);
  assert.equal(selected.options.suffix, 'grifo nosso');

  const updated = await fields.updateSelectedCitation([costa], 'ABNT', { apud: 'SILVA, 1999' });
  assert.equal(updated, true);
  assert.equal(mock.controls[0].text, '(SILVA, 1999 apud COSTA, 2001)');
  assert.deepEqual([...fields.citationIds(mock.controls[0].tag)], ['c']);
});

test('keeps citation options in document settings between sessions', async () => {
  const settings = makeSettings();
  const office = { context: { document: { settings } } };
  const first = loadFieldsWithWord({ Office: office });
  const item = { id: 'ref-1', authors: ['Silva, G.'], year: '2026', title: 'Título' };

  await first.fields.insertCitation(item, 'ABNT', { locator: 'p. 12', suffix: 'grifo nosso' });
  const tag = first.mock.controls[0].tag;
  assert.ok(settings.data.size > 0);

  const second = loadFieldsWithWord({ Office: office });
  assert.deepEqual([...second.fields.citationIds(tag)], ['ref-1']);
  assert.equal(second.fields.citationRef(tag).options.locator, 'p. 12');
  assert.equal(second.fields.citationRef(tag).options.suffix, 'grifo nosso');
});
