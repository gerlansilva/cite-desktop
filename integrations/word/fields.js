(() => {
  const CITATION_PREFIX = 'cite:citation:';
  const BIBLIOGRAPHY_TAG = 'cite:bibliography';
  const META_PREFIX = 'cite.citation.';
  const memoryMeta = new Map();

  function surname(author) {
    const raw = String(author || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    if (raw.includes(',')) return raw.slice(0, raw.indexOf(',')).trim();
    if (raw.includes('.')) return raw.slice(0, raw.indexOf('.')).trim();
    const parts = raw.split(' ');
    return parts[parts.length - 1];
  }

  function isNumericStyle(style) {
    return style === 'Vancouver';
  }

  function normalizeItems(input) {
    if (Array.isArray(input)) return input.filter(Boolean);
    return input ? [input] : [];
  }

  function normalizeOptions(options = {}) {
    const value = options && typeof options === 'object' ? options : {};
    return {
      prefix: String(value.prefix || '').trim(),
      suffix: String(value.suffix || '').trim(),
      locator: String(value.locator || '').trim(),
      yearSuffix: String(value.yearSuffix || '').trim(),
      apud: String(value.apud || '').replace(/\s+apud\.?$/i, '').trim(),
      narrative: Boolean(value.narrative),
      suppressAuthor: Boolean(value.suppressAuthor),
      suppressYear: Boolean(value.suppressYear),
      numbers: Array.isArray(value.numbers) ? value.numbers : null
    };
  }

  function appendClause(base, value, separator = ', ') {
    if (!value) return base;
    if (!base) return value;
    if (/^[,;:.!?]/.test(value)) return `${base}${value}`;
    return `${base}${separator}${value}`;
  }

  function yearText(item, options) {
    return `${item?.year || 's.d.'}${options.yearSuffix || ''}`;
  }

  function authorPart(item, style) {
    const names = (item?.authors || []).map(surname).filter(Boolean);
    if (!names.length) return String(item?.title || 'sem título').slice(0, 35);
    if (style === 'ABNT') {
      const upper = names.map((name) => name.toUpperCase());
      return upper.length > 3 ? `${upper[0]} et al.` : upper.join('; ');
    }
    if (style === 'APA') {
      if (names.length > 2) return `${names[0]} et al.`;
      if (names.length === 2) return `${names[0]} & ${names[1]}`;
      return names[0];
    }
    if (style === 'Harvard') {
      if (names.length > 2) return `${names[0]} et al.`;
      if (names.length === 2) return `${names[0]} and ${names[1]}`;
      return names[0];
    }
    if (style === 'MLA') {
      if (names.length > 2) return `${names[0]} et al.`;
      if (names.length === 2) return `${names[0]} and ${names[1]}`;
      return names[0];
    }
    if (style === 'Chicago') {
      if (names.length > 3) return `${names[0]} et al.`;
      if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
      if (names.length === 2) return `${names[0]} and ${names[1]}`;
      return names[0];
    }
    return names.join(', ');
  }

  function citationCore(item, style, options) {
    const author = options.suppressAuthor ? '' : authorPart(item, style);
    const year = options.suppressYear ? '' : yearText(item, options);
    const separator = style === 'MLA' || style === 'Chicago' ? ' ' : ', ';
    const core = [author, year].filter(Boolean).join(separator);
    return appendClause(core, options.locator);
  }

  function citationText(input, style, options = {}) {
    const items = normalizeItems(input);
    if (!items.length) return '';
    const opts = normalizeOptions(options);

    if (isNumericStyle(style)) {
      const numbers = opts.numbers?.length ? opts.numbers : items.map((_, index) => index + 1);
      let body = numbers.join(',');
      body = appendClause(body, opts.locator);
      body = appendClause(body, opts.suffix);
      if (opts.apud) body = `${opts.apud} apud ${body}`;
      if (opts.prefix) body = `${opts.prefix} ${body}`;
      return `(${body})`;
    }

    if (opts.narrative) {
      const parts = items.map((item, index) => {
        const itemOptions = index === 0 ? opts : { ...opts, locator: '', suffix: '' };
        const author = itemOptions.suppressAuthor ? '' : authorPart(item, style);
        const year = itemOptions.suppressYear ? '' : yearText(item, itemOptions);
        let inner = year;
        inner = appendClause(inner, itemOptions.locator);
        inner = appendClause(inner, itemOptions.suffix);
        return `${author}${inner ? ` (${inner})` : ''}`.trim();
      });
      let body = parts.join('; ');
      if (opts.apud) body = `${opts.apud} apud ${body}`;
      if (opts.prefix) body = `${opts.prefix} ${body}`;
      return body;
    }

    const parts = items.map((item, index) =>
      citationCore(item, style, index === 0 ? opts : { ...opts, locator: '', suffix: '' })
    );
    let body = parts.join('; ');
    body = appendClause(body, opts.suffix);
    if (opts.apud) body = `${opts.apud} apud ${body}`;
    if (opts.prefix) body = `${opts.prefix} ${body}`;
    return `(${body})`;
  }

  function inTextCitation(item, style, optionsOrNumber) {
    if (isNumericStyle(style)) {
      if (typeof optionsOrNumber === 'number') return citationText([item], style, { numbers: [optionsOrNumber] });
      if (optionsOrNumber && typeof optionsOrNumber === 'object') {
        const options = { ...optionsOrNumber };
        if (!options.numbers) options.numbers = [options.number || 1];
        return citationText([item], style, options);
      }
      return citationText([item], style, { numbers: [1] });
    }
    return citationText([item], style, optionsOrNumber);
  }

  function referenceText(item, style) {
    return item?.citations?.[style] || item?.citations?.ABNT || [
      item?.authors?.join('; '),
      item?.title,
      item?.year
    ].filter(Boolean).join('. ');
  }

  function compareItems(a, b) {
    return String(surname(a.authors?.[0]) || a.title || '').localeCompare(
      String(surname(b.authors?.[0]) || b.title || ''),
      'pt-BR'
    );
  }

  function bibliographyText(items, style, numbers) {
    const source = [...(items || [])];
    if (isNumericStyle(style)) {
      const map = numbers instanceof Map ? numbers : new Map();
      const sorted = source.sort((a, b) => {
        const first = map.get(String(a.id));
        const second = map.get(String(b.id));
        if (first && second) return first - second;
        if (first) return -1;
        if (second) return 1;
        return compareItems(a, b);
      });
      let next = Math.max(0, ...map.values());
      return sorted
        .map((item) => {
          const number = map.get(String(item.id)) || ++next;
          return `${number}. ${referenceText(item, style)}`;
        })
        .join('\n\n');
    }
    return source.sort(compareItems).map((item) => referenceText(item, style)).join('\n\n');
  }

  function citationTag(ids) {
    return CITATION_PREFIX + ids.map(String).join(',');
  }

  function parseCitationTag(tag) {
    if (typeof tag !== 'string' || !tag.startsWith(CITATION_PREFIX)) return null;
    const ids = tag.slice(CITATION_PREFIX.length).split(',').filter(Boolean);
    return ids.length ? ids : null;
  }

  function fieldTag(token) {
    return CITATION_PREFIX + token;
  }

  function settingsStore() {
    try {
      return typeof Office !== 'undefined' && Office.context?.document?.settings
        ? Office.context.document.settings
        : null;
    } catch {
      return null;
    }
  }

  function saveSettings() {
    const store = settingsStore();
    if (!store?.saveAsync) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        store.saveAsync(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  function readMeta(token) {
    const key = META_PREFIX + token;
    if (memoryMeta.has(key)) return memoryMeta.get(key);
    const store = settingsStore();
    if (store) {
      try {
        const value = store.get(key);
        if (value) {
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;
          if (parsed?.ids) {
            memoryMeta.set(key, parsed);
            return parsed;
          }
        }
      } catch {}
    }
    return null;
  }

  async function writeMeta(token, meta) {
    const key = META_PREFIX + token;
    memoryMeta.set(key, meta);
    const store = settingsStore();
    if (store) {
      try {
        store.set(key, JSON.stringify(meta));
        await saveSettings();
      } catch {}
    }
  }

  function removeMeta(token) {
    const key = META_PREFIX + token;
    memoryMeta.delete(key);
    const store = settingsStore();
    if (store) {
      try {
        store.remove(key);
      } catch {}
    }
  }

  function newToken() {
    let token = '';
    do {
      token = Math.random().toString(36).slice(2, 9);
    } while (!token || readMeta(token));
    return token;
  }

  function citationRef(tag) {
    if (typeof tag !== 'string' || !tag.startsWith(CITATION_PREFIX)) return null;
    const raw = tag.slice(CITATION_PREFIX.length);
    if (!raw) return null;
    if (!raw.includes(',')) {
      const meta = readMeta(raw);
      if (meta?.ids?.length) {
        return { token: raw, ids: meta.ids.map(String), options: normalizeOptions(meta.options || {}) };
      }
      return { token: null, ids: [raw], options: normalizeOptions({}) };
    }
    const ids = parseCitationTag(tag);
    return ids ? { token: null, ids, options: normalizeOptions({}) } : null;
  }

  function citationIds(tag) {
    return citationRef(tag)?.ids || null;
  }

  function citationNumbers(tags) {
    const numbers = new Map();
    let next = 1;
    for (const tag of tags || []) {
      const ids = citationIds(tag);
      if (!ids) continue;
      for (const id of ids) {
        const key = String(id);
        if (!numbers.has(key)) numbers.set(key, next++);
      }
    }
    return numbers;
  }

  function assignNumbers(tags, ids) {
    const numbers = citationNumbers(tags);
    let next = Math.max(0, ...numbers.values()) + 1;
    return ids.map((id) => {
      const key = String(id);
      if (numbers.has(key)) return numbers.get(key);
      numbers.set(key, next);
      return next++;
    });
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

  async function insertCitation(input, style, options = {}) {
    requireWord();
    const items = normalizeItems(input);
    if (!items.length) throw new Error('Selecione ao menos uma referência.');
    const opts = normalizeOptions(options);
    const ids = items.map((item) => String(item.id));
    const token = newToken();
    await writeMeta(token, { ids, options: opts });

    let text = '';
    await Word.run(async (context) => {
      const existing = context.document.contentControls;
      existing.load('items/tag');
      await context.sync();
      const numbers = isNumericStyle(style)
        ? assignNumbers(existing.items.map((control) => control.tag), ids)
        : null;
      text = citationText(items, style, { ...opts, numbers });

      const range = context.document.getSelection();
      const inserted = range.insertText(text, Word.InsertLocation.replace);
      const control = inserted.insertContentControl();
      control.tag = fieldTag(token);
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
    let text = '';
    await Word.run(async (context) => {
      const all = context.document.contentControls;
      all.load('items/tag');
      const controls = context.document.contentControls.getByTag(BIBLIOGRAPHY_TAG);
      controls.load('items');
      await context.sync();

      const numbers = citationNumbers(all.items.map((control) => control.tag));
      text = bibliographyText(items, style, numbers);

      if (controls.items.length) {
        controls.items[0].insertText(text, Word.InsertLocation.replace);
        await context.sync();
        return;
      }

      context.document.body.insertParagraph('', Word.InsertLocation.end);
      const paragraph = context.document.body.insertParagraph('', Word.InsertLocation.end);
      const control = paragraph.insertContentControl();
      control.tag = BIBLIOGRAPHY_TAG;
      control.title = 'Bibliografia Cite';
      control.cannotEdit = false;
      hideControl(control);
      control.insertText(text, Word.InsertLocation.replace);
      await context.sync();
    });
    return text;
  }

  async function updateSelectedCitation(input, style, options = {}) {
    requireWord();
    const items = normalizeItems(input);
    if (!items.length) throw new Error('Selecione ao menos uma referência.');
    const opts = normalizeOptions(options);
    const ids = items.map((item) => String(item.id));
    let updated = false;
    let token = null;

    await Word.run(async (context) => {
      const all = context.document.contentControls;
      all.load('items/id/tag');
      const control = context.document.getSelection().parentContentControlOrNullObject;
      control.load('id/tag');
      await context.sync();
      if (control.isNullObject) return;
      const ref = citationRef(control.tag);
      if (!ref) return;

      token = ref.token || newToken();
      const others = all.items.filter((entry) => entry.id !== control.id).map((entry) => entry.tag);
      const numbers = isNumericStyle(style) ? assignNumbers(others, ids) : null;
      control.tag = fieldTag(token);
      control.insertText(citationText(items, style, { ...opts, numbers }), Word.InsertLocation.replace);
      await context.sync();
      updated = true;
    });

    if (updated) await writeMeta(token, { ids, options: opts });
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

      const numbers = citationNumbers(controls.items.map((control) => control.tag));

      for (const control of controls.items) {
        const ref = citationRef(control.tag);
        if (!ref) continue;
        const pairs = ref.ids
          .map((id) => ({ item: byId.get(String(id)), number: numbers.get(String(id)) }))
          .filter((entry) => entry.item);
        if (!pairs.length) continue;
        const options = { ...ref.options, numbers: pairs.map((entry) => entry.number) };
        control.insertText(citationText(pairs.map((entry) => entry.item), style, options), Word.InsertLocation.replace);
        citations += 1;
      }
      await context.sync();

      for (const control of controls.items) {
        if (control.tag !== BIBLIOGRAPHY_TAG) continue;
        if (!items?.length) continue;
        control.insertText(bibliographyText(items, style, numbers), Word.InsertLocation.replace);
        bibliographies += 1;
      }
      await context.sync();
    });

    return { citations, bibliographies };
  }

  async function unlinkDocument() {
    requireWord();
    let count = 0;
    const tokens = [];
    await Word.run(async (context) => {
      const controls = context.document.contentControls;
      controls.load('items/tag');
      await context.sync();
      for (const control of controls.items) {
        const ref = citationRef(control.tag);
        if (ref) {
          if (ref.token) tokens.push(ref.token);
          control.delete(true);
          count += 1;
        } else if (control.tag === BIBLIOGRAPHY_TAG) {
          control.delete(true);
          count += 1;
        }
      }
      await context.sync();
    });
    tokens.forEach(removeMeta);
    if (tokens.length) await saveSettings();
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
        if (citationRef(control.tag)) counts.citations += 1;
        else if (control.tag === BIBLIOGRAPHY_TAG) counts.bibliographies += 1;
      }
    });
    return counts;
  }

  async function selectedCitation() {
    if (!available()) return null;
    let result = null;
    await Word.run(async (context) => {
      const control = context.document.getSelection().parentContentControlOrNullObject;
      control.load('tag');
      await context.sync();
      if (control.isNullObject) return;
      const ref = citationRef(control.tag);
      if (ref) result = { ids: ref.ids, options: ref.options, token: ref.token };
    });
    return result;
  }

  async function selectedCitationIds() {
    const citation = await selectedCitation();
    return citation?.ids || null;
  }

  window.CiteFields = {
    CITATION_PREFIX,
    BIBLIOGRAPHY_TAG,
    surname,
    isNumericStyle,
    normalizeOptions,
    citationText,
    inTextCitation,
    referenceText,
    bibliographyText,
    citationNumbers,
    citationIds,
    citationRef,
    citationTag,
    parseCitationTag,
    fieldTag,
    insertCitation,
    insertBibliography,
    updateSelectedCitation,
    refreshDocument,
    unlinkDocument,
    countFields,
    selectedCitation,
    selectedCitationIds,
    available
  };
})();
