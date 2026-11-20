# Publicação no GitHub

## 1. Preparar o repositório local

O projeto não deve versionar dependências nem artefatos de build. O `.gitignore` já exclui `node_modules/`, `src-tauri/target/`, DMGs, instaladores e logs.

```bash
cd /Users/gerlansilva/Documents/cite-tauri
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

Não envie DMG ou EXE pelo histórico do Git. Use os anexos de release ou baixe os artefatos do workflow `Build`.

```bash
git tag v0.3.9
git push origin v0.3.9

gh release create v0.3.9 \
  src-tauri/target/release/bundle/dmg/Cite_0.3.9_aarch64.dmg \
  src-tauri/target/release/bundle/nsis/Cite_0.3.9_x64-setup.exe \
  --title "Cite 0.3.9" \
  --notes-file CHANGELOG.md
```

Se a release já existir:

```bash
gh release upload v0.3.9 \
  src-tauri/target/release/bundle/dmg/Cite_0.3.9_aarch64.dmg \
  src-tauri/target/release/bundle/nsis/Cite_0.3.9_x64-setup.exe \
  --clobber
```

## 4. Checklist de release

- [ ] Atualizar a versão em `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`.
- [ ] Atualizar `CHANGELOG.md`.
- [ ] Executar `npm test`.
- [ ] Executar `npm run test:data`.
- [ ] Gerar o DMG no macOS com `npm run build`.
- [ ] Gerar o instalador Windows com `npm run build:win` no Windows (ou baixar do GitHub Actions).
- [ ] Testar a instalação em uma máquina Windows real.
- [ ] Criar a tag `vX.Y.Z`.
- [ ] Anexar os instaladores à release.
- [ ] Revisar se nenhum dado pessoal ou token foi incluído no repositório.

## 5. Assinatura de código

Os builds atuais não são assinados.

- macOS: Gatekeeper pode bloquear o aplicativo. Para distribuição pública, configure um certificado Developer ID e notarização nas variáveis `APPLE_CERTIFICATE`, `APPLE_SIGNING_IDENTITY` e credenciais de notarização.
- Windows: SmartScreen pode avisar. Para distribuição pública, configure um certificado de assinatura de código e as variáveis de assinatura do Tauri.

Nunca comite certificados, senhas ou tokens. Use secrets do GitHub Actions ou variáveis de ambiente.

## 6. Licença

Defina uma licença antes de tornar o repositório público. Sem uma licença, o código permanece protegido por direitos autorais por padrão, mesmo que esteja visível no GitHub.
