# Histórico de mudanças

## Não lançado

### Adicionado

- Tela inicial com resumo da biblioteca, referências recentes e atalhos para nova referência, busca e importação de PDF.
- Cartão **Cite no Word** na tela inicial, com instalação do painel local, certificado e manifesto em um clique.
- Conexão local do add-in do Word por HTTPS em `localhost`, sem GitHub e sem internet.
- Painel do Word com status da conexão, atualização automática da lista e modo alternativo com `bibliography.json` publicado.
- Aba **Cite** com botões próprios e ícones distintos para citação, bibliografia, painel e menu **Mais**.
- Citações e bibliografia inseridas como campos vinculados, com **Atualizar citações** e **Desvincular citações** na faixa de opções e no painel.
- Vancouver com citações numéricas e bibliografia numerada na ordem de citação; ABNT, APA, MLA, Harvard e Chicago com regras próprias de autores no texto.
- Edição de uma citação existente: com o cursor dentro dela, escolher outra referência substitui o campo sem perder o vínculo.
- Seleção múltipla de referências no painel, com citação combinada na mesma chamada.
- Opções de citação: prefixo, página, sufixo, complemento do ano, apud, citação narrativa, omitir autor e omitir ano.
- Atalhos para **grifo nosso**, **grifo do autor**, **adaptado de** e **cf.**
- Botão **Editar citação do cursor**, que carrega as referências e opções da citação selecionada.
- Bibliografia viva: lista apenas as referências citadas e remove a referência quando a citação correspondente é apagada.
- Sincronização automática do painel ao editar ou excluir uma citação, ao ganhar foco e a cada 15 segundos, além de remover citações vazias.
- Painel do Word no idioma do aplicativo (português ou Tetun Dili), com seletor quando o Cite está fechado.
- Painel do Google Docs com seletor de idioma salvo nas propriedades do documento.
- Cartão **Documento** no painel, com contagem de citações, atualização automática configurável e as ações de atualizar e desvincular.
- Biblioteca padrão automática em `~/Documents/Cite` na primeira execução, com a tela inicial pronta para uso.
- Ação **Alterar pasta** na tela inicial e item **Arquivo > Início** no menu.
- Tela de recuperação quando a pasta da biblioteca é excluída, movida ou fica sem permissão, com as opções **Usar a biblioteca padrão** e **Escolher outra pasta**.
- Testes de primeira execução e de biblioteca ausente.

### Corrigido

- Paleta do painel do Word e do Google Docs alinhada ao azul do aplicativo.
- Ícones sobrepostos da faixa de opções corrigidos; cada comando agora usa um ícone próprio, e o ícone do painel corresponde ao ícone do aplicativo.
- Harvard e Chicago com formatação correta de um, dois, três e quatro autores no texto.
- Vancouver passou a usar citações numéricas e bibliografia na ordem de citação.
- Autores com iniciais antes do sobrenome, como `SA Costa`, não são mais confundidos com sufixo de empresa na ABNT.
- Cobertura de testes para os seis estilos, de um a quatro autores, e para todos os tipos de referência.
- Inserir bibliografia em um documento novo não substitui mais o conteúdo já existente: a lista é criada em parágrafos próprios ao final.
- Painel do Word passou a recarregar os arquivos atualizados a cada versão, sem cache antigo.
- Testes não alteram mais a instalação real do add-in no Word.

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
