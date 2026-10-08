# Painel "Máquinas autorizadas" (licença DLL Civil 3D) — como ligar

Módulo: `src/app/js/admin/licenca-maquinas.js` (não altera o `index.html`).

Ele expõe `window.NexusLicencaMaquinas` com `render/autorizar/remover/setLimite`.
Enquanto não for referenciado, é inerte. Para ligar, **2 inserções** no
`index.html` (a fazer quando o arquivo não estiver em edição por outro trabalho):

## 1. Carregar o script
Perto dos outros `<script>` da app (o módulo é auto-executável, IIFE):

```html
<script src="js/admin/licenca-maquinas.js"></script>
```

## 2. Renderizar dentro de cada linha de usuário do painel Admin
No `renderUserRow(u)` (por volta da linha 2598 do `index.html`), logo ABAIXO do
container `prog-row-<id>` (Programas externos), adicionar um container irmão:

```js
${!isMe?`<div id="maq-row-${esc(u.id)}" style="width:100%;margin-top:6px;padding-top:8px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:8px;align-items:center"></div>`:''}
```

E no `loadAdminPanel` (por volta da linha 2469, onde já chama
`renderProgramasUsuario(u.id)` com `setTimeout`), acrescentar na mesma volta:

```js
setTimeout(() => window.NexusLicencaMaquinas?.render(u.id), 120);
```

Pronto. Só super admin vê a aba Admin, e as RPCs abaixo revalidam
`is_super_admin` no servidor pelo `p_caller_code` — o painel é só a interface.

## RPCs usadas (migração `supabase/migrations/20260914120000_licenca_curta_maquina.sql`)
- `admin_listar_maquinas(p_caller_code, p_usuario_id)` — lista as máquinas do usuário.
- `admin_autorizar_maquina(p_caller_code, p_maquina_id, p_autorizar)` — libera/revoga.
- `admin_remover_maquina(p_caller_code, p_maquina_id)` — remove (o PC pode voltar
  a pedir liberação no próximo uso).
- `admin_set_limite_maquinas(p_caller_code, p_usuario_id, p_max)` — teto de máquinas (1..50, padrão 2).

## Comportamento
- Máquina **nova** dentro do limite → autorizada automaticamente (o usuário nem percebe).
- Máquina nova **acima do limite** → aparece aqui como *Bloqueada*; o usuário vê no
  Civil "Máquina não autorizada, peça liberação". O super admin clica **Liberar**.
- **Revogar** uma máquina: no próximo pedido de bilhete (a cada ~2 h ou na abertura)
  ela é recusada; offline, o bilhete de 24 h já emitido ainda vale até vencer.
