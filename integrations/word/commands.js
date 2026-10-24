async function loadBibliography() {
  try {
    const local = await fetch('/library', { cache: 'no-store' });
    if (local.ok) {
      const data = await local.json();
      if (Array.isArray(data?.items)) return data;
    }
  } catch {}

  let url = '';
  try {
    url = localStorage.getItem('cite-bibliography-url') || '';
  } catch {}

  if (!url) throw new Error('biblioteca indisponível');
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data?.items)) throw new Error('biblioteca indisponível');
  return data;
}

function currentStyle() {
  try {
    return localStorage.getItem('cite-citation-style') || 'ABNT';
  } catch {
    return 'ABNT';
  }
}

async function refreshCitations(event) {
  try {
    const data = await loadBibliography();
    await window.CiteFields.refreshDocument(data.items, currentStyle());
  } catch (err) {
    console.error('Falha ao atualizar citações:', err.message);
  } finally {
    event.completed();
  }
}

async function unlinkCitations(event) {
  try {
    await window.CiteFields.unlinkDocument();
  } catch (err) {
    console.error('Falha ao desvincular citações:', err.message);
  } finally {
    event.completed();
  }
}

Office.onReady(() => {
  Office.actions.associate('refreshCitations', refreshCitations);
  Office.actions.associate('unlinkCitations', unlinkCitations);
});
