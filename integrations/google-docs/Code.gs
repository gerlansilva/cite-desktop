function onOpen() {
  DocumentApp.getUi()
    .createMenu('Cite')
    .addItem('Abrir painel', 'showSidebar')
    .addToUi();
}

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Cite');
  DocumentApp.getUi().showSidebar(html);
}

function getConfig() {
  return {
    url: PropertiesService.getDocumentProperties().getProperty('CITE_BIBLIOGRAPHY_URL') || ''
  };
}

function saveBibliographyUrl(url) {
  const value = String(url || '').trim();
  if (!/^https:\/\//i.test(value)) throw new Error('Informe uma URL HTTPS pública.');
  PropertiesService.getDocumentProperties().setProperty('CITE_BIBLIOGRAPHY_URL', value);
  return { url: value };
}

function loadBibliography(url) {
  const value = String(url || '').trim();
  if (!/^https:\/\//i.test(value)) throw new Error('Informe uma URL HTTPS pública.');
  const cache = CacheService.getDocumentCache();
  const cacheKey = `cite-bib-${value}`;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = UrlFetchApp.fetch(value, { muteHttpExceptions: true });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error(`HTTP ${response.getResponseCode()} ao carregar a bibliografia.`);
  }
  const data = JSON.parse(response.getContentText());
  if (!data || !Array.isArray(data.items)) throw new Error('Formato de bibliografia inválido.');
  cache.put(cacheKey, JSON.stringify(data), 300);
  return data;
}

function insertCitation(text) {
  const doc = DocumentApp.getActiveDocument();
  const cursor = doc.getCursor();
  if (!cursor) throw new Error('Coloque o cursor no ponto onde a citação deve ser inserida.');
  cursor.insertText(String(text || ''));
  return true;
}

function insertBibliography(texts) {
  const doc = DocumentApp.getActiveDocument();
  const cursor = doc.getCursor();
  if (!cursor) throw new Error('Coloque o cursor no ponto onde a bibliografia deve ser inserida.');
  const value = (texts || []).filter(Boolean).join('\n\n');
  cursor.insertText(value);
  return true;
}
