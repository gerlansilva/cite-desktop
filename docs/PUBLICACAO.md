# Publicação no GitHub

## 1. Preparar o repositório local

O projeto não deve versionar dependências nem artefatos de build. O `.gitignore` já exclui `node_modules/`, `dist/`, `test-results/`, `playwright-report/`, DMGs e instaladores.

```bash
cd /Users/gerlansilva/Documents/refdesk-desktop
git init -b main
git add .
git commit -m "Versão inicial do Cite"
```

## 2. Criar o repositório

### Com GitHub CLI

```bash
gh repo create cite-desktop --private --source=. --remote=origin --push
```

Para um repositório público, troque `--private` por `--public`.

Também é possível informar descrição:

```bash
gh repo create cite-desktop \
  --private \
  --description "Gerenciador de referências local para macOS e Windows" \
  --source=. \
  --remote=origin \
  --push
```

### Pela interface do GitHub

1. Acesse <https://github.com/new>.
2. Escolha o nome `cite-desktop`.
3. Defina a visibilidade.
4. Não marque a criação de README, `.gitignore` ou licença, porque esses arquivos já existem localmente.
5. Copie os comandos exibidos e execute:

```bash
git remote add origin https://github.com/gerlansilva/cite-desktop.git
git branch -M main
git push -u origin main
```

## 3. Publicar os instaladores como release

Não envie DMG ou EXE pelo histórico do Git. O limite por arquivo no Git é 100 MB e o DMG tem cerca de 118 MB. Use os anexos de release, que aceitam arquivos maiores.

```bash
git tag v0.2.0
git push origin v0.2.0

gh release create v0.2.0 \
  dist/Cite-0.2.0-arm64.dmg \
  dist/Cite-Setup-0.2.0.exe \
  --title "Cite 0.2.0" \
  --notes-file CHANGELOG.md
```

Se a release já existir:

```bash
gh release upload v0.2.0 \
  dist/Cite-0.2.0-arm64.dmg \
  dist/Cite-Setup-0.2.0.exe \
  --clobber
```

## 4. Checklist de release

- [ ] Atualizar a versão em `package.json`.
- [ ] Atualizar `CHANGELOG.md`.
- [ ] Executar `npx playwright test`.
- [ ] Executar `npm run test:data`.
- [ ] Gerar o DMG no macOS.
- [ ] Gerar o instalador Windows com `npm run build:win`.
- [ ] Testar a instalação em uma máquina Windows real.
- [ ] Criar a tag `vX.Y.Z`.
- [ ] Anexar os instaladores à release.
- [ ] Revisar se nenhum dado pessoal ou token foi incluído no repositório.

## 5. Assinatura de código

Os builds atuais não são assinados.

- macOS: Gatekeeper pode bloquear o aplicativo. Para distribuição pública, configure um certificado Developer ID e notarização.
- Windows: SmartScreen pode avisar. Para distribuição pública, configure um certificado de assinatura de código.

Nunca comite certificados, senhas ou tokens. Use secrets do GitHub Actions ou variáveis de ambiente.

## 6. Licença

Defina uma licença antes de tornar o repositório público. Sem uma licença, o código permanece protegido por direitos autorais por padrão, mesmo que esteja visível no GitHub.
