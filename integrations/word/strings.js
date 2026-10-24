(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CiteStrings = api;
})(typeof window !== 'undefined' ? window : null, function () {
  const TETUN = {
    // Cabeçalho
    'Sua biblioteca no Word': 'Ita-nia biblioteka iha Word',
    'Idioma': 'Lian',
    'Idioma do painel': 'Lian painel nian',
    'O idioma do painel segue o aplicativo Cite.': "Painel nia lian tuir aplikasaun Cite.",
    'Português': 'Português',
    'Tetun Dili': 'Tetun Dili',

    // Conexão local
    'Biblioteca do Cite': 'Biblioteka Cite nian',
    'Verificando…': 'Verifika hela…',
    'Procurando o aplicativo neste computador…': "Buka aplikasaun iha komputadór ida-ne'e…",
    'Conectar': 'Konekta',
    'Reconectar': 'Konekta fali',
    'Atualizar': 'Atualiza',
    'Conectado': 'Konektadu',
    'Desconectado': 'La konektadu',
    'Estilo': 'Estilu',
    'Estilo de citação': 'Estilu sitasaun',
    'Abra o aplicativo Cite neste computador e clique em Conectar.': "Loke aplikasaun Cite iha komputadór ida-ne'e no kliku Konekta.",
    'porta': 'porta',

    // Bibliografia publicada
    'Sem o aplicativo aberto: bibliografia publicada': 'Se aplikasaun la loke: bibliografia publika ona',
    'URL do bibliography.json': 'URL bibliography.json nian',
    'Carregar': 'Karrega',
    'Usar exemplo': 'Uza ezemplu',
    'Use esta opção apenas quando o Cite não estiver aberto.': "Uza opsaun ida-ne'e de'it bainhira Cite la loke.",

    // Busca e lista
    'Buscar referência': 'Buka referénsia',
    'Título, autor, ano ou periódico': 'Títulu, autor, tinan ka periódiku',
    'Referências': 'Referénsia sira',
    'Limpar seleção': 'Hamos seleksaun',
    'Carregue uma bibliografia para começar.': 'Karrega bibliografia ida atu hahú.',
    'Nenhuma referência encontrada.': 'La hetan referénsia ida.',
    'Conecte o Cite ou carregue uma bibliografia para começar.': 'Konekta Cite ka karrega bibliografia ida atu hahú.',
    '(sem título)': '(la iha títulu)',
    'item': 'item',
    'itens': 'item sira',
    'selecionada': 'hili ona',
    'selecionadas': 'hili ona',

    // Prévia e ações
    'Citação no texto': 'Sitasaun iha testu',
    'Referência completa': 'Referénsia kompleta',
    'Nenhuma referência selecionada.': "La iha referénsia ne'ebé hili.",
    'Selecione uma referência na lista.': 'Hili referénsia ida iha lista.',
    'Selecione uma ou mais referências na lista.': 'Hili referénsia ida ka liu iha lista.',
    'Inserir citação': 'Hatama sitasaun',
    'Inserir referência': 'Hatama referénsia',
    'Inserir bibliografia': 'Hatama bibliografia',
    'Selecione uma ou mais referências. A citação é inserida no cursor; se o cursor estiver dentro de uma citação, ela é atualizada. A bibliografia inclui apenas as referências citadas no documento.':
      "Hili referénsia ida ka liu. Sitasaun hatama iha kursor; se kursor iha sitasaun ida nia laran, sitasaun ne'e atualiza. Bibliografia inklui de'it referénsia sira ne'ebé sitadu iha dokumentu.",

    // Opções da citação
    'Opções da citação: página, apud, grifo nosso': 'Opsaun sitasaun: pájina, apud, grifu',
    'Prefixo': 'Prefiksu',
    'Página': 'Pájina',
    'Sufixo': 'Sufiksu',
    'Ano': 'Tinan',
    'Apud (obra original, sem a palavra apud)': 'Apud (obra orijinál, la ho liafuan apud)',
    'cf., conforme': 'cf., tuir',
    'Citação narrativa (autor fora dos parênteses)': "Sitasaun narrativa (autor iha paréntesis li'ur)",
    'Omitir autor': 'La tau autor',
    'Omitir ano': 'La tau tinan',
    'A página se aplica à primeira referência. O sufixo entra depois da página. Apud usa o formato parentético e é desativado na citação narrativa.':
      "Pájina aplika ba referénsia dahuluk. Sufiksu tama depois pájina. Apud uza formatu paréntesis no desativa iha sitasaun narrativa.",

    // Documento
    'Documento': 'Dokumentu',
    'Atualizar citações automaticamente': 'Atualiza sitasaun automatikamente',
    'Editar citação do cursor': 'Edita sitasaun iha kursor',
    'Atualizar citações': 'Atualiza sitasaun sira',
    'Desvincular citações': 'Hasai ligasaun sitasaun sira',
    'As citações e a bibliografia ficam vinculadas ao Cite. A bibliografia acompanha as citações: ao remover uma citação, a referência sai da lista na próxima atualização. Para editar, coloque o cursor na citação e use Editar citação do cursor.':
      "Sitasaun sira no bibliografia ligadu ba Cite. Bibliografia tuir sitasaun sira: bainhira hasai sitasaun ida, referénsia sai husi lista iha atualizasaun tuirmai. Atu edita, tau kursor iha sitasaun no uza Edita sitasaun iha kursor.",

    // Ajuda
    'Como conectar sua biblioteca': 'Oinsá konekta ita-nia biblioteka',
    'Com o Cite aberto neste computador, o painel se conecta sozinho à sua biblioteca. Se o aplicativo estiver fechado, publique a bibliografia em Ferramentas → Integrações e informe a URL pública do bibliography.json.':
      "Ho Cite loke iha komputadór ida-ne'e, painel konekta mesak ba ita-nia biblioteka. Se aplikasaun loke ona, publika bibliografia iha Ferramenta → Integrasaun no informa URL públika bibliography.json nian.",

    // Mensagens dinâmicas
    '{n} referências da biblioteca local.': '{n} referénsia husi biblioteka lokál.',
    '{n} referência da biblioteca local.': '{n} referénsia husi biblioteka lokál.',
    '{n} referências atualizadas.': '{n} referénsia atualizadu ona.',
    '{n} referência atualizada.': '{n} referénsia atualizadu ona.',
    '{n} referências carregadas.': '{n} referénsia karregadu ona.',
    '{n} referência carregada.': '{n} referénsia karregadu ona.',
    '{n} citações': '{n} sitasaun',
    '{n} citação': '{n} sitasaun',
    '{n} bibliografias': '{n} bibliografia',
    '{n} bibliografia': '{n} bibliografia',
    '{n} vínculos removidos.': '{n} ligasaun hasai ona.',
    '{n} vínculo removido.': '{n} ligasaun hasai ona.',
    '{n} citações atualizadas': '{n} sitasaun atualizadu ona',
    '{n} citação atualizada': '{n} sitasaun atualizadu ona',
    '{n} itens': '{n} item',
    '{n} item': '{n} item',
    '{n} selecionadas': '{n} hili ona',
    '{n} selecionada': '{n} hili ona',


    '{c} citações atualizadas.': '{c} sitasaun atualizadu ona.',
    '{c} citação atualizada.': '{c} sitasaun atualizadu ona.',
    '{c} citações atualizadas e {b} bibliografias.': '{c} sitasaun atualizadu ona no {b} bibliografia.',
    '{c} citações atualizadas e {b} bibliografia.': '{c} sitasaun atualizadu ona no {b} bibliografia.',
    '{c} citação atualizada e {b} bibliografias.': '{c} sitasaun atualizadu ona no {b} bibliografia.',
    '{c} citação atualizada e {b} bibliografia.': '{c} sitasaun atualizadu ona no {b} bibliografia.',
    'aplicativo não encontrado': 'aplikasaun la hetan',
    'biblioteca indisponível': 'biblioteka la disponível',
    'formato inválido': 'formatu invalidu',
    'Procurando o aplicativo Cite…': 'Buka aplikasaun Cite…',
    'Conectando…': 'Konekta hela…',
    'Não foi possível conectar: {msg}. Abra o aplicativo ou use a bibliografia publicada.':
      "La konsege konekta: {msg}. Loke aplikasaun ka uza bibliografia publika.",
    'O aplicativo Cite não respondeu. Abra-o e clique em Conectar.': 'Aplikasaun Cite la responde. Loke no kliku Konekta.',
    'Informe a URL do bibliography.json.': 'Informa URL bibliography.json nian.',
    'Carregando…': 'Karrega hela…',
    'Não foi possível carregar: {msg}': 'La konsege karrega: {msg}',
    'Conecte o Cite ou carregue a bibliografia para atualizar.': 'Konekta Cite ka karrega bibliografia atu atualiza.',
    'Não foi possível atualizar: {msg}': 'La konsege atualiza: {msg}',
    'Abra este painel dentro do Word para inserir conteúdo.': 'Loke painel ida-ne\'e iha Word laran atu hatama konteúdu.',
    'Citação atualizada com as referências e opções escolhidas.': 'Sitasaun atualizadu ho referénsia no opsaun ne\'ebé hili.',
    'Citação inserida e vinculada ao Cite.': 'Sitasaun hatama ona no ligadu ba Cite.',
    'Citações inseridas na mesma referência.': 'Sitasaun sira hatama iha referénsia hanesan.',
    'Citação inserida como texto; não foi possível vinculá-la: {msg}':
      'Sitasaun hatama hanesan testu; la konsege liga: {msg}',
    'Não foi possível inserir: {msg}': 'La konsege hatama: {msg}',
    'Referência inserida como texto.': 'Referénsia hatama hanesan testu.',
    'Referências inseridas como texto.': 'Referénsia sira hatama hanesan testu.',
    'Nenhuma citação no documento. Insira uma citação antes da bibliografia.': 'La iha sitasaun iha dokumentu. Hatama sitasaun antes bibliografia.',
    'Bibliografia criada ou atualizada com as referências citadas.': 'Bibliografia kria ka atualiza ho referénsia sira ne\'ebé sitadu.',
    'Bibliografia inserida como texto; não foi possível vinculá-la: {msg}':
      'Bibliografia hatama hanesan testu; la konsege liga: {msg}',
    'Desvincular todas as citações e a bibliografia? Elas passam a ser texto comum e não poderão ser atualizadas.':
      'Hasai ligasaun sitasaun hotu no bibliografia? Sira sai testu komún no la bele atualiza tan.',
    'Não foi possível desvincular: {msg}': 'La konsege hasai ligasaun: {msg}',
    'Editando a citação selecionada. Ajuste as referências e as opções e clique em Inserir citação.':
      "Edita hela sitasaun ne'ebé hili. Ajusta referénsia no opsaun sira no kliku Hatama sitasaun.",
    'Escolha o estilo e as opções da próxima citação.': 'Hili estilu no opsaun sitasaun tuirmai nian.',
    'Use Inserir bibliografia para criar ou atualizar a lista.': 'Uza Hatama bibliografia atu kria ka atualiza lista.',
    'Não foi possível carregar os campos do Cite. Reinstale o add-in.':
      'La konsege karrega Cite nia kampu sira. Instala fali add-in.'
  };

  let language = 'pt';
  const textOriginals = new WeakMap();
  const attrOriginals = new WeakMap();
  const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

  function normalize(value) {
    return value === 'tet' ? 'tet' : 'pt';
  }

  function setLanguage(value) {
    language = normalize(value);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language === 'tet' ? 'tet' : 'pt-BR';
      document.documentElement.dataset.language = language;
    }
    return language;
  }

  function getLanguage() {
    return language;
  }

  function translatePhrase(text) {
    if (language !== 'tet' || !text) return text;
    return TETUN[text] || text;
  }

  function t(text, variables) {
    let value = translatePhrase(text);
    if (variables) {
      for (const [key, replacement] of Object.entries(variables)) {
        value = value.split(`{${key}}`).join(String(replacement));
      }
    }
    return value;
  }

  function skip(node) {
    return Boolean(node.parentElement?.closest('[data-no-i18n]'));
  }

  function localize(root) {
    if (!root || typeof document === 'undefined') return;
    if (root.nodeType === Node.TEXT_NODE) {
      const node = root;
      const original = textOriginals.get(node) ?? node.nodeValue;
      textOriginals.set(node, original);
      const trimmed = original.trim();
      node.nodeValue = language === 'tet'
        ? original.replace(trimmed, translatePhrase(trimmed))
        : original;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (SKIP.has(node.parentElement?.tagName) || skip(node)) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const original = textOriginals.get(node) ?? node.nodeValue;
      textOriginals.set(node, original);
      const trimmed = original.trim();
      node.nodeValue = language === 'tet'
        ? original.replace(trimmed, translatePhrase(trimmed))
        : original;
    }

    const elements = [root, ...root.querySelectorAll('*')];
    for (const element of elements) {
      if (!element.getAttribute || element.closest('[data-no-i18n]')) continue;
      let originals = attrOriginals.get(element);
      if (!originals) {
        originals = new Map();
        attrOriginals.set(element, originals);
      }
      for (const name of ATTRIBUTES) {
        const current = element.getAttribute(name);
        if (!current) continue;
        if (!originals.has(name)) originals.set(name, current);
        const original = originals.get(name);
        element.setAttribute(name, language === 'tet' ? translatePhrase(original) : original);
      }
    }
  }

  return { t, setLanguage, getLanguage, localize, has: (text) => Boolean(TETUN[text]), messages: TETUN };
});
