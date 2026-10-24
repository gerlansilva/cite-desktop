# Desenvolvimento e arquitetura

## Visão geral

O Cite é um aplicativo Electron com interface em HTML, CSS e JavaScript puro. Não há framework de UI. O processo principal concentra acesso ao sistema de arquivos, rede e janelas; o renderer acessa esses recursos apenas pelo `preload.js`, com `contextIsolation` e `sandbox` ativados.

```mermaid
flowchart LR
  UI[Renderer: ui.html / ui.js] -->|IPC via preload| MAIN[Electron main]
  MAIN --> FILES[Pasta da biblioteca]
  MAIN --> APIS[Crossref, arXiv, PubMed, OpenAlex, GitHub, tradução]
  UI --> WORKER[Data worker]
  WORKER --> DB[(IndexedDB / Dexie)]
  UI --> VIEWER[PDF viewer / pdf.js]
  VIEWER -->|postMessage| UI
```

## Processos e responsabilidades

### `main.js`

- cria a janela principal;
- gerencia a pasta de armazenamento e a migração de dados legados;
- executa chamadas de rede que precisam evitar CORS ou proteger credenciais;
- implementa busca online, DOI, metadados, download de PDF e tradução;
- publica a bibliografia no GitHub;
- constrói o menu nativo, com variantes para macOS e Windows.

### `preload.js`

Expõe uma API pequena em `window.cite`, incluindo dados, DOI, tradução, metadados, PDF, backup, anotações, configurações e integrações. O renderer não recebe acesso direto ao Node.js.

### `src/ui.js`

Controla a biblioteca, coleções, etiquetas, filtros, busca online, detalhes, citações, importação/exportação e o ciclo de vida do visualizador. Também faz a ponte por `postMessage` com o iframe do PDF.

### `src/pdf-viewer.js`

Carrega o PDF com pdf.js, renderiza páginas e a camada de texto, controla ferramentas de anotação, comentários, busca interna, zoom, rotação, temas e tradução por seleção.

### `src/data-worker.js` e `src/data/db.js`

O worker mantém o banco IndexedDB com Dexie. As principais coleções são `Library`, `Attachments`, `Collections`, `Notes`, `Changes`, `LocalSettings` e `Files`. O nome interno do banco permanece `refdesk` para preservar bibliotecas antigas.

## Fluxo de dados

1. No primeiro uso, o `main.js` cria a biblioteca padrão em `~/Documents/Cite` e grava o caminho em `storage.json`.
2. O `main.js` redefine `userData` para essa pasta; o worker abre o IndexedDB e atende chamadas de leitura e escrita.
3. Anexos são salvos em `attachments`, com hash SHA-256 para deduplicação.
4. A interface renderiza a biblioteca a partir do worker, inclusive quando ela está vazia.

### Recuperação da biblioteca

`prepareStorage()` valida a pasta configurada antes de criar qualquer janela de dados. Se a pasta não existir, não for um diretório ou não permitir escrita, ele preenche `storageSetup` e o app abre `src/setup.html` em vez da biblioteca. A tela recebe o estado pelo IPC `storage:setup:state` e oferece:

- `storage:setup:default`: cria ou reutiliza a biblioteca padrão.
- `storage:setup:choose`: abre o seletor nativo de pastas.
- `storage:setup:quit`: encerra o aplicativo.

Depois de configurar, o app grava `storage.json` e reinicia para abrir a biblioteca. Nenhum módulo de dados é carregado enquanto a pasta estiver inacessível, então uma biblioteca excluída não gera erro na inicialização.

Para testes, `CITE_STORAGE_CONFIG` aponta para um `storage.json` alternativo, `CITE_DEFAULT_STORAGE_DIR` troca a biblioteca padrão e `CITE_FORCE_STORAGE_SETUP=1` executa `prepareStorage()` mesmo com `--user-data-dir`.

## Tela inicial

`src/home.html` é a primeira janela do aplicativo. Ela lê os dados pelo mesmo worker (`library:all`, `attachments:all`, `collections:all`), mostra totais, caminho da biblioteca e as últimas referências, e oferece ações rápidas.

O IPC `home:open` cria a janela da biblioteca com um parâmetro de ação:

- `?action=new` abre o formulário de nova referência.
- `?action=search` abre a busca online.
- `?action=import` abre o seletor de PDFs.
- `?focus=<id>` seleciona uma referência.

A janela inicial é fechada ao abrir a biblioteca. O item **Arquivo > Início** (`open-home`) reabre a tela inicial, e `CITE_SKIP_HOME=1` inicia direto na biblioteca, usado pelos testes que não exercitam a tela inicial.

O botão **Alterar pasta** grava um novo `storage.json` e reinicia o app. Se a pasta escolhida ainda estiver vazia, o app confirma antes de criar uma biblioteca nova ali; os dados da pasta anterior continuam intactos. Se a pasta já tiver uma biblioteca, ela é apenas aberta.

## Busca online e PDFs

- Crossref usa `offset` para paginação.
- arXiv usa `start`.
- PubMed usa `retstart`.
- Google Acadêmico usa `start`.
- Metadados são normalizados antes de serem anexados à lista de resultados.
- O download de PDF prioriza links de acesso aberto, incluindo OpenAlex, e valida o conteúdo antes de anexar.

## Visualizador de PDF

O visualizador roda em um iframe e usa:

- `pdfjs-dist` para renderização e camada de texto;
- `pdf-text.bundle.js` para extração de texto;
- `pdf.worker.bundle.js` como worker;
- `postMessage` para pedir anotações, atualizar notas, abrir links externos e traduzir.

A seleção de texto gera um menu flutuante com destaque, sublinhado, tachado, comentário, tradução e cópia com número da página.

## Add-in do Word

O add-in fica em `integrations/word` e usa o manifesto XML de task pane com `VersionOverrides` para criar a aba **Cite**. Os botões da faixa de opções usam `ShowTaskpane`; o `commands.html` funciona como `FunctionFile` e deixa espaço para futuros comandos `ExecuteFunction`.

- `manifest.xml`: produção, com placeholders de usuário/repositório.
- `manifest.localhost.xml`: desenvolvimento local em `https://localhost:3000`.
- `taskpane.html/js`: busca, prévia, estilos e inserção no documento.
- `demo-bibliography.json`: bibliografia fictícia para demonstração.
- `scripts/serve-word-addin.js`: servidor HTTPS local usando o certificado do `office-addin-dev-certs`.

Para executar:

```bash
npx office-addin-dev-certs install
npm run word:serve
```

O painel usa `Word.run` e `context.document.getSelection()` para inserir citações e `context.document.body.insertText(..., Word.InsertLocation.end)` para acrescentar a bibliografia ao final do documento.

## Tradução

O trecho selecionado é normalizado, enviado pelo renderer ao processo principal e traduzido por um endpoint configurável. O padrão é o endpoint web do Google Translate. O limite é de 5.000 caracteres por trecho.

Destinos disponíveis na interface:

- Português
- Tetum Dili
- English
- Español

O painel de tradução fecha ao clicar fora e com `Esc`.

## Testes

```bash
npx playwright test
npm run test:data
```

Os testes Playwright usam um servidor mock para Crossref, Google Acadêmico, tradução e outras rotas. `tests/setup.spec.ts` cobre a primeira execução e a biblioteca excluída. Os testes de dados usam `node:test`.

## Build

### macOS

```bash
npx electron-builder --mac dmg
```

### Windows

```bash
npm run build:win
```

O script `scripts/build-windows-installer.js`:

- empacota `dist/win-unpacked` com `electron-builder`;
- usa `scripts/set-windows-resources.mjs` para aplicar ícone e versão com `resedit`;
- compila `scripts/windows-installer.nsi` com `makensis`.

O instalador usa NSIS e quatro telas padrão: boas-vindas, diretório, instalação e conclusão.

## Convenções

- Interface em português; traduções PT/TET em `src/i18n.js`.
- Não adicionar segredos ao repositório.
- Não versionar `node_modules/`, `dist/`, `test-results/` ou artefatos de build.
- Antes de abrir um pull request, execute os testes e o build da plataforma afetada.
