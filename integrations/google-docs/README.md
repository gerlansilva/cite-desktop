# Add-in do Cite para Google Docs

O add-in lê o `bibliography.json` publicado pelo Cite no GitHub e insere citações no cursor do documento.

## 1. Publique a bibliografia

No Cite, abra **Ferramentas → Integrações**, configure o GitHub e clique em **Publicar no GitHub**.

A URL pública do arquivo será parecida com:

```text
https://raw.githubusercontent.com/USUARIO/REPO/main/cite/bibliography.json
```

## 2. Crie o Apps Script

1. Abra o Google Docs.
2. Vá em **Extensões → Apps Script**.
3. Crie os arquivos `Code.gs` e `Sidebar.html` com o conteúdo desta pasta.
4. Em **Configurações do projeto**, marque **Mostrar o arquivo de manifesto `appsscript.json`** e substitua o conteúdo pelo `appsscript.json` desta pasta.
5. Salve e execute `showSidebar` uma vez para autorizar os escopos.

## 3. Abra o painel

No documento, use o menu **Cite → Abrir painel**.

Na primeira vez:

1. Cole a URL do `bibliography.json`.
2. Clique em **Carregar**.
3. Busque a referência e escolha o estilo.
4. Posicione o cursor no texto e clique em **Inserir citação**.

A URL fica salva nas propriedades daquele documento.

## 4. Vários documentos

Este projeto é um complemento **container-bound**, ou seja, fica ligado ao documento onde o Apps Script foi criado. Para usar em outro documento, crie uma cópia do projeto ou mantenha um documento-modelo com o add-in instalado.

O arquivo do GitHub precisa ser público. Para repositórios privados, use uma URL assinada ou um proxy autenticado; o Apps Script não recebe o token do Cite.
