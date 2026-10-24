# Histórico de mudanças

## Não lançado

### Adicionado

- Tela inicial com resumo da biblioteca, referências recentes e atalhos para nova referência, busca e importação de PDF.
- Biblioteca padrão automática em `~/Documents/Cite` na primeira execução, com a tela inicial pronta para uso.
- Ação **Alterar pasta** na tela inicial e item **Arquivo > Início** no menu.
- Tela de recuperação quando a pasta da biblioteca é excluída, movida ou fica sem permissão, com as opções **Usar a biblioteca padrão** e **Escolher outra pasta**.
- Testes de primeira execução e de biblioteca ausente.

## 0.2.0

### Adicionado

- Tema escuro persistente na biblioteca e no visualizador de PDF.
- Paginação nas buscas online, com botão **Carregar mais**.
- Tradução de trechos selecionados no PDF.
- Opção de tradução para **Tetum Dili**.
- Instalador Windows x64 com telas padrão de instalação.
- Instalador NSIS, ícone próprio, atalhos e desinstalador.
- Documentação de instalação, desenvolvimento, publicação e release.
- Capturas de tela da biblioteca e da tradução no PDF.
- Integração com o Word: aba **Cite** na faixa de opções, painel de biblioteca, citações autor-data, inserção de bibliografia, modo de demonstração e servidor HTTPS local.

### Corrigido

- Botão **Adicionar** da busca online com o estilo visual correto.
- Normalização de espaços e quebras de linha no painel de tradução.
- Fechamento do painel de tradução ao clicar fora e com `Esc`.
- Abertura de PDFs com caminhos locais do Windows.
- Menu nativo adaptado para Windows.
- Posicionamento do painel de tradução em relação ao botão de fechar o visualizador.

### Validado

- 40 testes Playwright.
- 15 testes de dados.
- Build macOS arm64.
- Estrutura do instalador Windows, ícone, versão e quatro páginas do NSIS.
