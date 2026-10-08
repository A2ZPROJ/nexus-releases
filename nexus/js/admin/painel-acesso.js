// src/app/js/admin/painel-acesso.js
// Painel de ACESSO de um usuário: clico no nome dele no Admin e abre isto.
//
// Por que existe: até aqui as permissões eram 34 caixinhas soltas na linha do
// usuário, sem agrupamento e sem separar "vê a tela" de "pode fazer". Agora é
// MÓDULO → abas do módulo → funções do módulo, e cada nível é explícito.
//
// Regra (Lucas, 29/09/2026): caixa MARCADA = tem acesso. Lista vazia = NÃO tem
// acesso a nada. Usuário novo nasce com tudo desligado e o Lucas vai ligando.
//
// ⚠ Esconder botão NÃO é permissão. Quem guarda de verdade é o banco:
//    - abas    -> usuarios.allowed_tabs  (gate na abertura do app)
//    - funções -> usuarios.allowed_funcs, conferidas por nx_pode() DENTRO das
//      RPCs do PDV/almoxarifado. Esta tela só escreve; quem barra é o banco.
// Gravação por admin_set_acesso() (security definer, só super admin, recusa
// mexer no próprio acesso).
//
// Módulo IIFE auto-contido. Expõe window.NexusAcesso.abrir(userId).
(function () {
  'use strict';
  const sb = () => window.sb;
  const esc = (s) => (window.esc ? window.esc(String(s ?? '')) : String(s ?? ''));

  // O catálogo de funções mora no banco (permissoes_catalogo) e a coluna
  // `modulo` usa o nome do negócio; aqui casa com o id do módulo da tela.
  const MODULO_DE = { pdv: 'pdv', almoxarifado: 'estoque_compras' };

  // Abas que não pertencem a nenhum módulo do grid (conta, perfil, sistema).
  const GRUPO_SOLTO = {
    id: '_sistema',
    name: 'Sistema e conta',
    desc: 'Telas que não pertencem a um módulo de trabalho',
    color: '#64748b',
  };

  // Modelos de acesso: o Lucas repete o mesmo desenho a cada pessoa nova. O
  // modelo só PREENCHE as caixas — quem grava é ele, no botão Salvar, depois de
  // olhar. Nada aqui manda no banco por conta própria.
  const MODELOS = {
    projetista: {
      nome: 'Projetista (saneamento)',
      tabs: ['generator', 'projects', 'dashboard', 'grd', 'conferencia', 'gerar-pdf-ose',
             'renomear', 'relatorios', 'perfil', 'sobre'],
      funcs: [],
    },
    orcamentista: {
      nome: 'Orçamentista',
      tabs: ['projects', 'orcamento', 'orcamento-elevatoria', 'relatorios', 'perfil', 'sobre'],
      funcs: [],
    },
    caixa: {
      nome: 'Caixa (só vende)',
      tabs: ['pdv', 'pdv-vendas', 'perfil', 'sobre'],
      funcs: ['pdv.vender'],
    },
    gerente_loja: {
      nome: 'Gerente de loja',
      tabs: ['pdv', 'pdv-produtos', 'pdv-vendas', 'pdv-faturamento', 'perfil', 'sobre'],
      funcs: ['pdv.vender', 'pdv.desconto', 'pdv.devolver', 'pdv.faturamento', 'pdv.produtos'],
    },
    almoxarife: {
      nome: 'Almoxarife',
      tabs: ['estoque', 'pedidos', 'perfil', 'sobre'],
      funcs: ['almox.movimentar', 'almox.cadastrar', 'almox.pedido'],
    },
    gestor_almox: {
      nome: 'Gestor do almoxarifado',
      tabs: ['estoque', 'pedidos', 'relatorios', 'perfil', 'sobre'],
      funcs: ['almox.movimentar', 'almox.ajustar', 'almox.cadastrar', 'almox.pedido'],
    },
  };

  let catalogo = null;   // cache: [{chave, modulo, nome, descricao}]
  let estado = null;     // { user, tabs:Set, funcs:Set }

  async function carregarCatalogo() {
    if (catalogo) return catalogo;
    const { data, error } = await sb()
      .from('permissoes_catalogo').select('chave,modulo,nome,descricao,ordem')
      .order('modulo').order('ordem');
    if (error) throw error;
    catalogo = data || [];
    return catalogo;
  }

  // Monta a lista de blocos: cada módulo do grid + o bloco de abas soltas.
  function montarBlocos() {
    const TAB_MAP = window._TAB_MAP || {};
    const MODULES = window.MODULES || {};
    const usadas = new Set();
    const blocos = [];

    for (const [id, m] of Object.entries(MODULES)) {
      const abas = (m.tabs || []).filter((t) => TAB_MAP[t]);
      abas.forEach((t) => usadas.add(t));
      const funcs = (catalogo || []).filter((f) => MODULO_DE[f.modulo] === id);
      if (!abas.length && !funcs.length) continue;
      blocos.push({ id, name: m.name, desc: m.desc, color: m.color, abas, funcs });
    }

    const soltas = Object.keys(TAB_MAP).filter((t) => !usadas.has(t));
    if (soltas.length) blocos.push({ ...GRUPO_SOLTO, abas: soltas, funcs: [] });
    return blocos;
  }

  function contagem(bloco) {
    const nAbas = bloco.abas.filter((t) => estado.tabs.has(t)).length;
    const nFun = bloco.funcs.filter((f) => estado.funcs.has(f.chave)).length;
    return { nAbas, nFun, total: bloco.abas.length, totalFun: bloco.funcs.length };
  }

  function pintarBloco(bloco) {
    const c = contagem(bloco);
    const cab = document.getElementById(`acs-cont-${bloco.id}`);
    if (cab) {
      cab.textContent = c.total
        ? `${c.nAbas} de ${c.total} tela${c.total === 1 ? '' : 's'}` +
          (c.totalFun ? ` · ${c.nFun} de ${c.totalFun} ${c.totalFun === 1 ? 'função' : 'funções'}` : '')
        : `${c.nFun} de ${c.totalFun} funções`;
    }
    const tudo = document.getElementById(`acs-todo-${bloco.id}`);
    if (tudo) {
      const marcados = c.nAbas + c.nFun;
      const totalGeral = c.total + c.totalFun;
      tudo.checked = marcados === totalGeral && totalGeral > 0;
      tudo.indeterminate = marcados > 0 && marcados < totalGeral;
    }
    // Função sem nenhuma tela do módulo não serve pra nada: deixo visível que
    // está desligada em vez de gravar permissão que ninguém consegue usar.
    const semTela = c.total > 0 && c.nAbas === 0;
    const caixaFun = document.getElementById(`acs-funcs-${bloco.id}`);
    if (caixaFun) {
      caixaFun.style.opacity = semTela ? '.45' : '1';
      caixaFun.querySelectorAll('input[type=checkbox]').forEach((cb) => { cb.disabled = semTela; });
      const avisoFun = document.getElementById(`acs-funaviso-${bloco.id}`);
      if (avisoFun) avisoFun.style.display = semTela ? '' : 'none';
    }
  }

  // Redesenha TODAS as caixas a partir do estado (usado por modelo e por cópia).
  function redesenharCaixas() {
    document.querySelectorAll('#acsCorpo input[type=checkbox][data-acs-bloco]').forEach((cb) => {
      const f = cb.dataset.acsFunc;
      cb.checked = f ? estado.funcs.has(f) : estado.tabs.has(cb.dataset.acsTab);
    });
    estado.blocos.forEach(pintarBloco);
    atualizarResumo();
  }

  function atualizarResumo() {
    const el = document.getElementById('acsResumo');
    if (!el) return;
    el.textContent = `${estado.tabs.size} tela${estado.tabs.size === 1 ? '' : 's'} · ` +
                     `${estado.funcs.size} ${estado.funcs.size === 1 ? 'função' : 'funções'}`;
  }

  window.NexusAcesso = {
    // Marca/desmarca tudo de um módulo (abas + funções).
    tudoDoModulo(blocoId, ligar) {
      const bloco = estado.blocos.find((b) => b.id === blocoId);
      if (!bloco) return;
      bloco.abas.forEach((t) => { ligar ? estado.tabs.add(t) : estado.tabs.delete(t); });
      bloco.funcs.forEach((f) => { ligar ? estado.funcs.add(f.chave) : estado.funcs.delete(f.chave); });
      document.querySelectorAll(`[data-acs-bloco="${blocoId}"]`).forEach((cb) => { cb.checked = ligar; });
      pintarBloco(bloco);
      atualizarResumo();
    },

    marcarAba(blocoId, tab, ligar) {
      ligar ? estado.tabs.add(tab) : estado.tabs.delete(tab);
      const bloco = estado.blocos.find((b) => b.id === blocoId);
      // Perdeu a última tela do módulo: as funções dele vão junto.
      if (!ligar && bloco && !bloco.abas.some((t) => estado.tabs.has(t))) {
        bloco.funcs.forEach((f) => {
          estado.funcs.delete(f.chave);
          const cb = document.querySelector(`[data-acs-func="${f.chave}"]`);
          if (cb) cb.checked = false;
        });
      }
      if (bloco) pintarBloco(bloco);
      atualizarResumo();
    },

    marcarFunc(blocoId, chave, ligar) {
      ligar ? estado.funcs.add(chave) : estado.funcs.delete(chave);
      const bloco = estado.blocos.find((b) => b.id === blocoId);
      if (bloco) pintarBloco(bloco);
      atualizarResumo();
    },

    todosOsModulos(ligar) {
      estado.blocos.forEach((b) => window.NexusAcesso.tudoDoModulo(b.id, ligar));
    },

    // Preenche as caixas a partir de um modelo. NÃO grava: o Lucas confere e salva.
    aplicarModelo(chave) {
      const m = MODELOS[chave];
      if (!m) return;
      const TAB_MAP = window._TAB_MAP || {};
      estado.tabs = new Set(m.tabs.filter((t) => TAB_MAP[t]));
      estado.funcs = new Set(m.funcs);
      // Aba do modelo que não existe mais neste Nexus é avisada, não engolida.
      const fantasmas = m.tabs.filter((t) => !TAB_MAP[t]);
      if (fantasmas.length) console.warn('[acesso] modelo cita aba inexistente:', fantasmas);
      redesenharCaixas();
      window.toastSuccess?.(`Modelo "${m.nome}" preenchido. Confira e clique em Salvar acesso.`);
    },

    // Copia o acesso de outra pessoa (também só preenche).
    copiarDe(userId) {
      if (!userId) return;
      const o = (window._adminUsersCache || []).find((u) => u.id === userId);
      if (!o) return;
      if (o.is_super_admin) {
        window.toastError?.('Super admin não tem lista: o acesso dele não vem de caixas marcadas.');
        return;
      }
      estado.tabs = new Set(Array.isArray(o.allowed_tabs) ? o.allowed_tabs : []);
      estado.funcs = new Set(Array.isArray(o.allowed_funcs) ? o.allowed_funcs : []);
      redesenharCaixas();
      window.toastSuccess?.(`Acesso copiado de ${o.nome}. Confira e clique em Salvar acesso.`);
    },

    fechar() {
      document.getElementById('acsOverlay')?.remove();
      document.removeEventListener('keydown', onEsc);
      estado = null;
    },

    async salvar() {
      const btn = document.getElementById('acsSalvar');
      if (!btn) return;
      btn.disabled = true; btn.textContent = 'Salvando...';
      try {
        const { data, error } = await sb().rpc('admin_set_acesso', {
          p_user_id: estado.user.id,
          p_tabs: [...estado.tabs],
          p_funcs: [...estado.funcs],
        });
        if (error) throw error;
        // Espelha no cache do Admin pra lista já mostrar o número novo.
        const u = (window._adminUsersCache || []).find((x) => x.id === estado.user.id);
        if (u) { u.allowed_tabs = [...estado.tabs]; u.allowed_funcs = [...estado.funcs]; }
        window.toastSuccess?.(`Acesso de ${estado.user.nome} atualizado: ` +
          `${estado.tabs.size} telas, ${estado.funcs.size} funções.`);
        window.NexusAcesso.fechar();
        window.applyAdminFilters?.();
        window.NexusAdminIndicadores?.recarregar?.();
        return data;
      } catch (e) {
        // Falha de gravação NUNCA pode ser silenciosa: o Lucas sairia da tela
        // acreditando que liberou acesso que não foi gravado.
        const msg = e?.message || String(e);
        window.toastError?.('Não consegui salvar o acesso: ' + msg);
        console.error('[acesso] salvar falhou:', e);
        btn.disabled = false; btn.textContent = 'Salvar acesso';
      }
    },

    async abrir(userId) {
      const user = (window._adminUsersCache || []).find((u) => u.id === userId);
      if (!user) { window.toastError?.('Usuário não está na lista carregada.'); return; }

      try { await carregarCatalogo(); }
      catch (e) { window.toastError?.('Não consegui ler o catálogo de funções: ' + (e.message || e)); return; }

      const tabs = Array.isArray(user.allowed_tabs) ? user.allowed_tabs : [];
      const funcs = Array.isArray(user.allowed_funcs) ? user.allowed_funcs : [];
      estado = { user, tabs: new Set(tabs), funcs: new Set(funcs), blocos: montarBlocos() };

      const ehEu = user.id === window._currentUserData?.id;
      const ehSuper = !!user.is_super_admin;
      const somenteLeitura = ehEu || ehSuper;

      document.getElementById('acsOverlay')?.remove();
      const ov = document.createElement('div');
      ov.id = 'acsOverlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:20000;' +
        'display:flex;align-items:center;justify-content:center;padding:24px';
      ov.addEventListener('click', (ev) => { if (ev.target === ov) window.NexusAcesso.fechar(); });

      const iniciais = (user.nome || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
      const aviso = ehSuper
        ? '<div style="margin:12px 20px 0;padding:10px 12px;border-radius:8px;background:rgba(124,58,237,.10);border:1px solid rgba(124,58,237,.35);font-size:12px;color:var(--text2)">' +
          '<b>Super Admin.</b> Vê tudo por definição — o acesso dele não passa por esta lista. ' +
          'Para restringir, tire o Super Admin primeiro.</div>'
        : ehEu
        ? '<div style="margin:12px 20px 0;padding:10px 12px;border-radius:8px;background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.35);font-size:12px;color:var(--text2)">' +
          '<b>Este é você.</b> O banco recusa alterar o próprio acesso — é o que evita alguém se trancar fora do Admin.</div>'
        : '';

      ov.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;width:min(980px,96vw);
                  max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.35)">
        <div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center">
          <div class="user-avatar" style="flex-shrink:0">${esc(iniciais)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:700;color:var(--text)">${esc(user.nome)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">
              ${esc(user.empresa || '—')} · ${esc(user.role || '—')}${user.access_code ? ' · ' + esc(user.access_code) : ''}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text3)">Acesso atual</div>
            <div id="acsResumo" style="font-size:12px;font-weight:600;color:var(--accent)"></div>
          </div>
          <button class="action-btn" onclick="window.NexusAcesso.fechar()" style="font-size:16px;padding:4px 10px">×</button>
        </div>
        ${aviso}
        ${somenteLeitura ? '' : `
        <div style="padding:10px 20px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--surface2)">
          <select onchange="if(this.value){window.NexusAcesso.aplicarModelo(this.value);this.value='';}"
                  style="padding:6px 9px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:11px;cursor:pointer">
            <option value="">Preencher por modelo...</option>
            ${Object.entries(MODELOS).map(([k, m]) => `<option value="${esc(k)}">${esc(m.nome)}</option>`).join('')}
          </select>
          <select onchange="if(this.value){window.NexusAcesso.copiarDe(this.value);this.value='';}"
                  style="padding:6px 9px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:11px;cursor:pointer;max-width:220px">
            <option value="">Copiar acesso de...</option>
            ${(window._adminUsersCache || [])
              .filter((o) => o.id !== user.id && !o.is_super_admin)
              .map((o) => `<option value="${esc(o.id)}">${esc(o.nome)}</option>`).join('')}
          </select>
          <span style="font-size:11px;color:var(--text3)">Caixa marcada = tem acesso.</span>
          <button class="action-btn" onclick="window.NexusAcesso.todosOsModulos(true)" style="margin-left:auto;font-size:11px">✓ Liberar tudo</button>
          <button class="action-btn" onclick="window.NexusAcesso.todosOsModulos(false)" style="font-size:11px">✗ Tirar tudo</button>
        </div>`}
        <div id="acsCorpo" style="flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px"></div>
        <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;background:var(--surface2)">
          <button class="action-btn" onclick="window.NexusAcesso.fechar()">Fechar</button>
          ${somenteLeitura ? '' : '<button class="action-btn" id="acsSalvar" onclick="window.NexusAcesso.salvar()" style="background:var(--accent);color:#fff;border-color:var(--accent);font-weight:600">Salvar acesso</button>'}
        </div>
      </div>`;
      document.body.appendChild(ov);

      const TAB_MAP = window._TAB_MAP || {};
      const dis = somenteLeitura ? ' disabled' : '';
      document.getElementById('acsCorpo').innerHTML = estado.blocos.map((b) => {
        const abasHtml = b.abas.map((t) => {
          const on = ehSuper || estado.tabs.has(t);
          return `<label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--text2);cursor:${somenteLeitura ? 'default' : 'pointer'};padding:4px 9px;border:1px solid var(--border);border-radius:6px;background:var(--surface)">
            <input type="checkbox" data-acs-bloco="${esc(b.id)}" data-acs-tab="${esc(t)}"${on ? ' checked' : ''}${dis}
                   onchange="window.NexusAcesso.marcarAba('${esc(b.id)}','${esc(t)}',this.checked)"
                   style="cursor:inherit;accent-color:var(--accent)">${esc(TAB_MAP[t] || t)}</label>`;
        }).join(' ');

        const funcsHtml = !b.funcs.length ? '' : `
          <div id="acs-funcs-${esc(b.id)}" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text3);margin-bottom:6px">
              O que pode fazer dentro do módulo
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${b.funcs.map((f) => {
                const on = ehSuper || estado.funcs.has(f.chave);
                return `<label style="display:flex;align-items:flex-start;gap:7px;font-size:12px;color:var(--text2);cursor:${somenteLeitura ? 'default' : 'pointer'}">
                  <input type="checkbox" data-acs-bloco="${esc(b.id)}" data-acs-func="${esc(f.chave)}"${on ? ' checked' : ''}${dis}
                         onchange="window.NexusAcesso.marcarFunc('${esc(b.id)}','${esc(f.chave)}',this.checked)"
                         style="margin-top:2px;cursor:inherit;accent-color:var(--accent)">
                  <span><b style="color:var(--text)">${esc(f.nome)}</b>
                    <span style="color:var(--text3)"> — ${esc(f.descricao || '')}</span></span></label>`;
              }).join('')}
            </div>
            <div id="acs-funaviso-${esc(b.id)}" style="display:none;margin-top:6px;font-size:11px;color:#d97706">
              Sem nenhuma tela deste módulo liberada, estas funções não têm onde ser usadas.
            </div>
          </div>`;

        // flex-shrink:0 é obrigatório: #acsCorpo é um flex em coluna e, sem isto,
        // o navegador ESMAGA cada bloco para caber na altura e o overflow:hidden
        // corta as telas e as funções. Na tela aparecia só o cabeçalho.
        return `
        <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;flex-shrink:0">
          <div style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--surface2);border-bottom:1px solid var(--border)">
            <span style="width:10px;height:10px;border-radius:3px;background:${esc(b.color || '#64748b')};flex-shrink:0"></span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:var(--text)">${esc(b.name)}</div>
              <div id="acs-cont-${esc(b.id)}" style="font-size:11px;color:var(--text3)"></div>
            </div>
            ${somenteLeitura ? '' : `<label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text2);cursor:pointer">
              <input type="checkbox" id="acs-todo-${esc(b.id)}"
                     onchange="window.NexusAcesso.tudoDoModulo('${esc(b.id)}',this.checked)"
                     style="cursor:pointer;accent-color:var(--accent)">módulo inteiro</label>`}
          </div>
          <div style="padding:12px 14px">
            <div style="display:flex;flex-wrap:wrap;gap:6px">${abasHtml || '<span style="font-size:11px;color:var(--text3)">Sem telas próprias.</span>'}</div>
            ${funcsHtml}
          </div>
        </div>`;
      }).join('');

      estado.blocos.forEach(pintarBloco);
      atualizarResumo();
      document.addEventListener('keydown', onEsc);
    },
  };

  function onEsc(ev) { if (ev.key === 'Escape') window.NexusAcesso.fechar(); }
})();
