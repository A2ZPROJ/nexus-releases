# Nexus — releases e página pública

Este repositório é **público de propósito** e contém apenas:

- **os instaladores** (releases) — para o auto-update do Nexus (`electron-updater`)
  baixar **sem token**. Token embutido em app distribuído é segredo vazado.
- **a página pública** servida pelo GitHub Pages (custo zero; Pages de repositório
  privado exigiria plano pago).

**O código-fonte NÃO fica aqui.** Ele vive no repositório privado `A2ZPROJ/nexus`.

## Não coloque aqui
Script de migração (`.sql`), credencial, chave de API, nada de segredo. Em 24/08/2026
dois `.sql` de migração estavam nesta pasta no repositório antigo e ficaram servidos
numa URL pública — um deles com um código de acesso dentro.
