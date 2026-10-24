(() => {
  const CITATION_PREFIX = 'cite:citation:';
  const BIBLIOGRAPHY_TAG = 'cite:bibliography';

  function surname(author) {
    const raw = String(author || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    if (raw.includes(',')) return raw.slice(0, raw.indexOf(',')).trim();
    if (raw.includes('.')) return raw.slice(0, raw.indexOf('.')).trim();
    const parts = raw.split(' ');
    return parts[parts.length - 1];
  }

  function inTextCitation(item, style) {
    const names = (item?.authors || []).map(surname).filter(Boolean);
    const year = item?.year || 's.d.';
    if (!names.length) return `(${String(item?.title || 'sem título').slice(0, 35)}, ${year})`;
    if (style === 'ABNT') {
      const upper = names.map((name) => name.toUpperCase());
      if (upper.length > 3) return `(${upper[0]} et al., ${year})`;
      return `(${upper.join('; ')}, ${year})`;
    }
    if (style === 'APA' || style === 'Vancouver') {
      if (names.length > 2) return `(${names[0]} et al., ${year})`;
      if (names.length === 2) return `(${names[0]} & ${names[1]}, ${year})`;
      return `(${names[0]}, ${year})`;
    }
    if (style === 'MLA' || style === 'Chicago') {
      if (names.length > 2) return `(${names[0]} et al. ${year})`;
      if (names.length === 2) return `(${names[0]} and ${names[1]} ${year})`;
      return `(${names[0]} ${year})`;
    }
    return `(${names.join(', ')}, ${year})`;
  }

  function referenceText(item, style) {
    return item?.citations?.[style] || item?.citations?.ABNT || [
      item?.authors?.join('; '),
      item?.title,
      item?.year
    ].filter(Boolean).join('. ');
  }

  function bibliographyText(items, style) {
    const list = [...(items || [])].sort((a, b) =>
      String(surname(a.authors?.[0]) || a.title || '').localeCompare(String(surname(b.authors?.[0]) || b.title || ''), 'pt-BR')
    );
    return list.map((item) => referenceText(item, style)).join('\n\n');
  }

  function citationTag(ids) {
    return CITATION_PREFIX + ids.map(String).join(',');
  }

  function parseCitationTag(tag) {
    if (typeof tag !== 'string' || !tag.startsWith(CITATION_PREFIX)) return null;
    const ids = tag.slice(CITATION_PREFIX.length).split(',').filter(Boolean);
    return ids.length ? ids : null;
  }

  function available() {
    return typeof Word !== 'undefined' && typeof Word.run === 'function';
  }

  function requireWord() {
    if (!available()) throw new Error('Abra este painel dentro do Word para inserir conteúdo.');
  }

  function hideControl(control) {
    try {
      if (Word.ContentControlAppearance?.hidden) {
        control.appearance = Word.ContentControlAppearance.hidden;
      }
    } catch {}
  }

  async function insertCitation(item, style) {
    requireWord();
    const text = inTextCitation(item, style);
    await Word.run(async (context) => {
      const range = context.document.getSelection();
      const inserted = range.insertText(text, Word.InsertLocation.replace);
      const control = inserted.insertContentControl();
      control.tag = citationTag([item.id]);
      control.title = 'Citação Cite';
      control.cannotEdit = false;
      hideControl(control);
      await context.sync();
    });
    return text;
  }

  async function insertBibliography(items, style) {
    requireWord();
    if (!items?.length) throw new Error('Nenhuma referência na biblioteca.');
    const text = bibliographyText(items, style);
    await Word.run(async (context) => {
      const controls = context.document.contentControls.getByTag(BIBLIOGRAPHY_TAG);
      controls.load('items');
      await context.sync();

      if (controls.items.length) {
        controls.items[0].insertText(text, Word.InsertLocation.replace);
        await context.sync();
        return;
      }

      const control = context.document.body.insertContentControl();
      control.tag = BIBLIOGRAPHY_TAG;
      control.title = 'Bibliografia Cite';
      control.cannotEdit = false;
      hideControl(control);
      control.insertText(text, Word.InsertLocation.replace);
      await context.sync();
    });
    return text;
  }

  async function updateSelectedCitation(item, style) {
    requireWord();
    let updated = false;
    await Word.run(async (context) => {
      const control = context.document.getSelection().parentContentControlOrNullObject;
      control.load('tag');
      await context.sync();
      if (control.isNullObject || !parseCitationTag(control.tag)) return;
      control.tag = citationTag([item.id]);
      control.insertText(inTextCitation(item, style), Word.InsertLocation.replace);
      await context.sync();
      updated = true;
    });
    return updated;
  }

  async function refreshDocument(items, style) {
    requireWord();
    const byId = new Map((items || []).map((item) => [String(item.id), item]));
    let citations = 0;
    let bibliographies = 0;

    await Word.run(async (context) => {
      const controls = context.document.contentControls;
      controls.load('items/tag');
      await context.sync();

      for (const control of controls.items) {
        const ids = parseCitationTag(control.tag);
        if (!ids) continue;
        const selected = ids.map((id) => byId.get(id)).filter(Boolean);
        if (!selected.length) continue;
        control.insertText(selected.map((item) => inTextCitation(item, style)).join('; '), Word.InsertLocation.replace);
        citations += 1;
      }
      await context.sync();

      for (const control of controls.items) {
        if (control.tag !== BIBLIOGRAPHY_TAG) continue;
        if (!items?.length) continue;
        control.insertText(bibliographyText(items, style), Word.InsertLocation.replace);
        bibliographies += 1;
      }
      await context.sync();
    });

    return { citations, bibliographies };
  }

  async function unlinkDocument() {
    requireWord();
    let count = 0;
    await Word.run(async (context) => {
      const controls = context.document.contentControls;
      controls.load('items/tag');
      await context.sync();
      for (const control of controls.items) {
        if (parseCitationTag(control.tag) || control.tag === BIBLIOGRAPHY_TAG) {
          control.delete(true);
          count += 1;
        }
      }
      await context.sync();
    });
    return count;
  }

  async function countFields() {
    if (!available()) return { citations: 0, bibliographies: 0 };
    const counts = { citations: 0, bibliographies: 0 };
    await Word.run(async (context) => {
      const controls = context.document.contentControls;
      controls.load('items/tag');
      await context.sync();
      for (const control of controls.items) {
        if (parseCitationTag(control.tag)) counts.citations += 1;
        else if (control.tag === BIBLIOGRAPHY_TAG) counts.bibliographies += 1;
      }
    });
    return counts;
  }

  async function selectedCitationIds() {
    if (!available()) return null;
    let ids = null;
    await Word.run(async (context) => {
      const control = context.document.getSelection().parentContentControlOrNullObject;
      control.load('tag');
      await context.sync();
      if (!control.isNullObject) ids = parseCitationTag(control.tag);
    });
    return ids;
  }

  window.CiteFields = {
    CITATION_PREFIX,
    BIBLIOGRAPHY_TAG,
    surname,
    inTextCitation,
    referenceText,
    bibliographyText,
    citationTag,
    parseCitationTag,
    insertCitation,
    insertBibliography,
    updateSelectedCitation,
    refreshDocument,
    unlinkDocument,
    countFields,
    selectedCitationIds,
    available
  };
})();
