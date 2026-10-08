// ═══════════════════════════════════════════════════════════════════════════
// ABA LEMBRETES — agendamento de e-mails
//
// Extraído do index.html em 22/08/2026 (era o bloco das linhas 44320-44630).
// Primeiro módulo do split por aba: o index.html tem 46k linhas e um único
// escopo global, o que torna qualquer mexida em layout arriscada.
//
// A IIFE foi mantida de propósito: módulo ES já tem escopo próprio, mas manter
// o wrapper deixa o diff trivial de revisar e elimina qualquer chance de
// diferença sutil de escopo nesta primeira extração.
//
// Contrato com o resto do app (NÃO mudou):
//   expõe  -> window.lembretesInit, lembretesListRender, openLembreteModal,
//             cancelarLembrete, reenviarLembrete, dispararLembreteAgora,
//             _lembSalvar, _lembExcluir, _lembAddDest, _lembLimparFiltros
//   consome-> window.sb, nexusConfirm, toastSuccess/Error/Warning/Info,
//             sendNexusEmail, _currentUserData
//   chamado por: switchTab('lembretes') -> window.lembretesInit?.()
//                e pelos onclick/oninput inline do #tab-lembretes
//
// 23/08/2026 — 1ª aba migrada pro sistema visual NX (src/app/css/nx.css).
// Mudou só a APARÊNCIA: cartão de indicador único, cor apenas onde há desvio,
// estado vazio único e mais densidade. Nenhuma regra de negócio foi tocada.
// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO LEMBRETES — Agendamento de emails (Fase 6)
// ══════════════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleString('pt-BR'); };
  const fmtDateShort = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR'); };

  const LEMBRETE_STATUS = {
    pendente:  { l:'Pendente',  c:'#f59e0b' },
    enviado:   { l:'Enviado',   c:'#16a34a' },
    cancelado: { l:'Cancelado', c:'#94a3b8' },
    falhou:    { l:'Falhou',    c:'#dc2626' },
  };

  let _lembretesCache = [];

  // ────────────────────────────────────────────────────────────────────
  // Init / Load
  // ────────────────────────────────────────────────────────────────────
  window.lembretesInit = async () => {
    const list = document.getElementById('lembretesList');
    if (!list) return;
    list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;grid-column:1/-1">Carregando…</div>';
    try {
      const { data, error } = await window.sb.from('lembretes').select('*').order('datahora_disparo', { ascending: false });
      if (error) throw error;
      _lembretesCache = data || [];
      _renderLembreteKpis();
      window.lembretesListRender();
    } catch (e) {
      list.innerHTML = '<div style="padding:30px;text-align:center;color:#dc2626;font-size:13px;grid-column:1/-1">Erro: '+esc(e.message)+'</div>';
    }
  };

  // ────────────────────────────────────────────────────────────────────
  // KPIs
  // ────────────────────────────────────────────────────────────────────
  // Sistema NX: COR SÓ ONDE HÁ DESVIO.
  // Antes, "Pendentes" era sempre âmbar e "Falharam" sempre vermelho — mesmo
  // valendo zero. Cartão vermelho com 0 dentro alarma à toa e, de tanto
  // aparecer, ensina a pessoa a ignorar o vermelho. Agora a classe de estado
  // só entra quando o número realmente pede alguma coisa; zerado, o cartão
  // volta a ser neutro sozinho.
  function _renderLembreteKpis() {
    const k = document.getElementById('lembreteKpis'); if (!k) return;
    const agora = new Date();
    const total = _lembretesCache.length;
    const pend  = _lembretesCache.filter(r => r.status==='pendente');
    const atras = pend.filter(r => { const d = new Date(r.datahora_disparo); return !isNaN(d) && d < agora; }).length;
    const enviados = _lembretesCache.filter(r => r.status==='enviado').length;
    const falharam = _lembretesCache.filter(r => r.status==='falhou').length;

    // (rótulo, valor, rodapé, classe de estado)
    const tile = (l, v, f, cls) =>
      '<div class="nx-kpi' + (cls ? ' ' + cls : '') + '">'
      +   '<div class="nx-kpi-l" title="' + esc(l) + '">' + esc(l) + '</div>'
      +   '<div><div class="nx-kpi-v">' + v + '</div>'
      +   (f ? '<div class="nx-kpi-f">' + esc(f) + '</div>' : '') + '</div>'
      + '</div>';

    k.innerHTML =
        tile('Total', total, total === 1 ? 'lembrete' : 'lembretes', '')
      + tile('Pendentes', pend.length,
             atras ? (atras === 1 ? '1 atrasado' : atras + ' atrasados') : 'no prazo',
             atras ? 'is-warn' : '')
      + tile('Enviados', enviados, 'concluídos', '')
      + tile('Falharam', falharam, falharam ? 'exigem ação' : 'nenhuma falha',
             falharam ? 'is-danger' : '');
  }

  // ────────────────────────────────────────────────────────────────────
  // Lista
  // ────────────────────────────────────────────────────────────────────
  // Usado pelo botão do estado vazio "nenhum lembrete corresponde ao filtro".
  window._lembLimparFiltros = () => {
    const b = document.getElementById('lembreteFiltroBusca');
    const s = document.getElementById('lembreteFiltroStatus');
    if (b) b.value = '';
    if (s) s.value = '';
    window.lembretesListRender();
  };

  window.lembretesListRender = (filter) => {
    const list = document.getElementById('lembretesList'); if (!list) return;
    const q = (document.getElementById('lembreteFiltroBusca')?.value || '').toLowerCase().trim();
    const st = document.getElementById('lembreteFiltroStatus')?.value || '';
    let arr = _lembretesCache.slice();
    if (q) arr = arr.filter(r => {
      const destStr = (r.destinatarios||[]).map(d => (d.nome||'')+' '+(d.valor||'')).join(' ').toLowerCase();
      return (r.titulo||'').toLowerCase().includes(q) || (r.descricao||'').toLowerCase().includes(q) || destStr.includes(q);
    });
    if (st) arr = arr.filter(r => r.status === st);
    // Estado vazio único (NX). Distingue "não existe nada" de "o filtro não
    // achou" — são situações diferentes e a saída de cada uma é diferente:
    // na primeira a pessoa precisa criar, na segunda precisa limpar o filtro.
    if (!arr.length) {
      const vazioDeVerdade = _lembretesCache.length === 0;
      list.innerHTML =
        '<div class="nx-empty">'
        + (vazioDeVerdade
            ? '<div class="nx-empty-t">Nenhum lembrete cadastrado</div>'
              + '<div class="nx-empty-s">Agende o primeiro para não depender de memória.</div>'
              + '<button class="nx-btn nx-btn-primary" onclick="window.openLembreteModal()">+ Novo Lembrete</button>'
            : '<div class="nx-empty-t">Nenhum lembrete corresponde ao filtro</div>'
              + '<div class="nx-empty-s">Há ' + _lembretesCache.length + ' cadastrado(s) fora deste recorte.</div>'
              + '<button class="nx-btn" onclick="window._lembLimparFiltros()">Limpar filtros</button>')
        + '</div>';
      return;
    }
    list.innerHTML = arr.map(r => {
      const s = LEMBRETE_STATUS[r.status] || LEMBRETE_STATUS.pendente;
      const dests = (r.destinatarios||[]);
      const destLabel = dests.length === 0 ? 'Sem destinatários' : dests.length === 1 ? esc(dests[0].nome || dests[0].valor) : esc(dests[0].nome || dests[0].valor) + ' +' + (dests.length - 1);
      const isPast = r.status === 'pendente' && new Date(r.datahora_disparo) < new Date();
      // NX: o hover era translate + sombra forte (a lista inteira "pulava" ao
      // passar o mouse). Agora só a borda responde — ver .nx-card no nx.css.
      return '<div class="nx-card'+(isPast?' is-late':'')+'" onclick="window.openLembreteModal(\''+esc(r.id)+'\')">'
        + '<div class="nx-card-top">'
        +   '<span class="nx-card-kind">Email</span>'
        +   '<span class="nx-pill" style="background:'+s.c+'1f;color:'+s.c+';border-color:'+s.c+'40">'+s.l+'</span>'
        + '</div>'
        + '<div class="nx-card-t">'+esc(r.titulo||'(sem título)')+'</div>'
        + (r.descricao ? '<div class="nx-card-d">'+esc(r.descricao)+'</div>' : '')
        + '<div class="nx-card-foot">'
        +   '<span title="Data de disparo">'+(isPast?'&#9888; ':'')+'Disparo: '+fmtDate(r.datahora_disparo)+'</span>'
        +   '<span title="Destinatários">'+destLabel+'</span>'
        + '</div>'
        + (r.status==='enviado' && r.enviado_em ? '<div class="nx-card-note ok">Enviado em '+fmtDate(r.enviado_em)+'</div>' : '')
        + (r.status==='falhou' && r.falha_motivo ? '<div class="nx-card-note bad">'+esc(r.falha_motivo)+'</div>' : '')
      + '</div>';
    }).join('');
  };

  // ────────────────────────────────────────────────────────────────────
  // Modal criar/editar
  // ────────────────────────────────────────────────────────────────────
  window.openLembreteModal = (existingId) => {
    const r = existingId ? _lembretesCache.find(x => x.id === existingId) : null;
    const isEdit = !!r;
    const mid = 'mdLemb' + Date.now();

    // Parse existing destinatarios
    const dests = r ? (r.destinatarios||[]) : [];
    // Default data/hora: tomorrow 9:00
    let defDate = '', defTime = '09:00';
    if (r && r.datahora_disparo) {
      const dd = new Date(r.datahora_disparo);
      if (!isNaN(dd)) {
        defDate = dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')+'-'+String(dd.getDate()).padStart(2,'0');
        defTime = String(dd.getHours()).padStart(2,'0')+':'+String(dd.getMinutes()).padStart(2,'0');
      }
    } else {
      const tom = new Date(); tom.setDate(tom.getDate()+1);
      defDate = tom.getFullYear()+'-'+String(tom.getMonth()+1).padStart(2,'0')+'-'+String(tom.getDate()).padStart(2,'0');
    }

    const destsHtml = dests.length > 0
      ? dests.map((d,i) => _destRow(mid, i, d.nome||'', d.valor||'')).join('')
      : _destRow(mid, 0, '', '');

    const readOnly = r && (r.status==='enviado'||r.status==='cancelado');

    const html = '<div id="'+mid+'" style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99998;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto" onclick="if(event.target.id===\''+mid+'\') document.getElementById(\''+mid+'\').remove()">'
      + '<div style="background:var(--surface);border-radius:12px;width:100%;max-width:640px;border:1px solid var(--border);margin:auto">'
      +   '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'
      +     '<div style="font-size:16px;font-weight:700">'+(isEdit ? 'Editar Lembrete' : 'Novo Lembrete')+'</div>'
      +     '<button onclick="document.getElementById(\''+mid+'\').remove()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer">×</button>'
      +   '</div>'
      +   '<div style="padding:20px 22px">'
      // Titulo
      +     '<div style="margin-bottom:12px"><label style="font-size:11px;color:var(--text3);font-weight:600">Título *</label><input id="'+mid+'_titulo" type="text" value="'+esc(r?.titulo||'')+'" placeholder="Ex: Vencimento ASO — Joao" '+(readOnly?'disabled ':'')+'style="width:100%;padding:9px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;margin-top:4px"></div>'
      // Descricao
      +     '<div style="margin-bottom:12px"><label style="font-size:11px;color:var(--text3);font-weight:600">Descrição</label><textarea id="'+mid+'_desc" rows="3" placeholder="Detalhes do lembrete (opcional)" '+(readOnly?'disabled ':'')+'style="width:100%;padding:9px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;resize:vertical;font-family:inherit;margin-top:4px">'+esc(r?.descricao||'')+'</textarea></div>'
      // Data + Hora
      +     '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">'
      +       '<div><label style="font-size:11px;color:var(--text3);font-weight:600">Data *</label><input id="'+mid+'_data" type="date" value="'+defDate+'" '+(readOnly?'disabled ':'')+'style="width:100%;padding:9px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;margin-top:4px"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3);font-weight:600">Hora *</label><input id="'+mid+'_hora" type="time" value="'+defTime+'" '+(readOnly?'disabled ':'')+'style="width:100%;padding:9px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;margin-top:4px"></div>'
      +     '</div>'
      // Canal
      +     '<div style="margin-bottom:12px"><label style="font-size:11px;color:var(--text3);font-weight:600">Canal</label><select id="'+mid+'_canal" disabled style="width:100%;padding:9px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;margin-top:4px"><option value="email" selected>Email (Resend)</option></select></div>'
      // Destinatarios
      +     '<div style="margin-bottom:12px">'
      +       '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><label style="font-size:11px;color:var(--text3);font-weight:600">Destinatários *</label>'
      +       (readOnly ? '' : '<button onclick="window._lembAddDest(\''+mid+'\')" style="background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:2px 10px;font-size:11px;cursor:pointer;font-weight:600">+ Adicionar</button>')
      +       '</div>'
      +       '<div id="'+mid+'_dests" style="display:flex;flex-direction:column;gap:6px">'+destsHtml+'</div>'
      +     '</div>'
      // Status info (edit only)
      +     (isEdit ? '<div style="background:var(--surface2);border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--text2)">'
        + '<b>Status:</b> '+(LEMBRETE_STATUS[r.status]||{l:r.status}).l
        + (r.enviado_em ? ' &middot; Enviado em '+fmtDate(r.enviado_em) : '')
        + (r.falha_motivo ? '<br><b>Motivo da falha:</b> '+esc(r.falha_motivo) : '')
        + '<br><b>Criado em:</b> '+fmtDate(r.criado_em)
        + '</div>' : '')
      +   '</div>'
      // Footer
      +   '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +     '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      +       (isEdit && r.status==='pendente' ? '<button onclick="window.cancelarLembrete(\''+esc(r.id)+'\',\''+mid+'\')" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:9px 14px;font-size:12px;cursor:pointer">Cancelar lembrete</button>' : '')
      +       (isEdit && (r.status==='falhou'||r.status==='cancelado') ? '<button onclick="window.reenviarLembrete(\''+esc(r.id)+'\',\''+mid+'\')" style="background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent);border-radius:6px;padding:9px 14px;font-size:12px;cursor:pointer;font-weight:600">Reenviar</button>' : '')
      +       (isEdit && r.status==='pendente' ? '<button onclick="window.dispararLembreteAgora(\''+esc(r.id)+'\',\''+mid+'\')" style="background:#16a34a22;color:#16a34a;border:1px solid #16a34a;border-radius:6px;padding:9px 14px;font-size:12px;cursor:pointer;font-weight:600">Enviar agora</button>' : '')
      +       (isEdit ? '<button onclick="window._lembExcluir(\''+esc(r.id)+'\',\''+mid+'\')" style="background:var(--red-l,#dc262611);color:#dc2626;border:1px solid #dc2626;border-radius:6px;padding:9px 14px;font-size:12px;cursor:pointer">Excluir</button>' : '')
      +     '</div>'
      +     '<div style="display:flex;gap:8px">'
      +       '<button onclick="document.getElementById(\''+mid+'\').remove()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px">Fechar</button>'
      +       (readOnly ? '' : '<button onclick="window._lembSalvar(\''+esc(existingId||'')+'\',\''+mid+'\')" style="background:var(--accent);color:#fff;padding:9px 22px;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">Salvar</button>')
      +     '</div>'
      +   '</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  };

  function _destRow(mid, idx, nome, valor) {
    return '<div style="display:grid;grid-template-columns:1fr 1.4fr 30px;gap:6px;align-items:center">'
      + '<input type="text" placeholder="Nome" value="'+esc(nome)+'" data-dest-nome style="padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px">'
      + '<input type="email" placeholder="email@exemplo.com" value="'+esc(valor)+'" data-dest-valor style="padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px">'
      + '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#dc2626;font-size:18px;cursor:pointer;padding:0;line-height:1" title="Remover">×</button>'
      + '</div>';
  }

  window._lembAddDest = (mid) => {
    const container = document.getElementById(mid+'_dests');
    if (!container) return;
    const idx = container.children.length;
    container.insertAdjacentHTML('beforeend', _destRow(mid, idx, '', ''));
  };

  // ────────────────────────────────────────────────────────────────────
  // Salvar (create/update)
  // ────────────────────────────────────────────────────────────────────
  window._lembSalvar = async (existingId, mid) => {
    const titulo = (document.getElementById(mid+'_titulo')?.value || '').trim();
    if (!titulo) { window.toastError?.('Titulo e obrigatorio'); return; }
    const descricao = (document.getElementById(mid+'_desc')?.value || '').trim() || null;
    const dataVal = document.getElementById(mid+'_data')?.value;
    const horaVal = document.getElementById(mid+'_hora')?.value || '09:00';
    if (!dataVal) { window.toastError?.('Data e obrigatoria'); return; }

    const datahora_disparo = new Date(dataVal + 'T' + horaVal + ':00').toISOString();

    // Collect destinatarios
    const destsContainer = document.getElementById(mid+'_dests');
    const destinatarios = [];
    if (destsContainer) {
      destsContainer.querySelectorAll('[data-dest-valor]').forEach((el, i) => {
        const valor = (el.value||'').trim();
        const nomeEl = el.parentElement.querySelector('[data-dest-nome]');
        const nome = (nomeEl?.value||'').trim();
        if (valor) destinatarios.push({ tipo:'email', valor, nome });
      });
    }
    if (destinatarios.length === 0) { window.toastError?.('Adicione pelo menos 1 destinatario'); return; }

    const payload = {
      titulo,
      descricao,
      datahora_disparo,
      canal: 'email',
      destinatarios,
    };

    try {
      if (existingId) {
        const { error } = await window.sb.from('lembretes').update(payload).eq('id', existingId);
        if (error) throw error;
        window.toastSuccess?.('Lembrete atualizado');
      } else {
        payload.tenant_id = window._currentUserData?.tenant_id;
        payload.criado_por = window._currentUserData?.id;
        payload.status = 'pendente';
        const { error } = await window.sb.from('lembretes').insert(payload);
        if (error) throw error;
        window.toastSuccess?.('Lembrete criado');
      }
      document.getElementById(mid)?.remove();
      window.lembretesInit();
    } catch (e) {
      window.toastError?.('Erro ao salvar: ' + (e.message||e));
    }
  };

  // ────────────────────────────────────────────────────────────────────
  // Actions
  // ────────────────────────────────────────────────────────────────────
  window.cancelarLembrete = async (id, mid) => {
    const ok = await window.nexusConfirm?.('Cancelar este lembrete? Ele nao sera mais disparado.');
    if (!ok) return;
    try {
      const { error } = await window.sb.from('lembretes').update({ status: 'cancelado' }).eq('id', id);
      if (error) throw error;
      window.toastSuccess?.('Lembrete cancelado');
      document.getElementById(mid)?.remove();
      window.lembretesInit();
    } catch (e) { window.toastError?.('Erro: '+(e.message||e)); }
  };

  window.reenviarLembrete = async (id, mid) => {
    try {
      const { error } = await window.sb.from('lembretes').update({ status: 'pendente', falha_motivo: null, enviado_em: null }).eq('id', id);
      if (error) throw error;
      window.toastSuccess?.('Lembrete reativado como pendente');
      document.getElementById(mid)?.remove();
      window.lembretesInit();
    } catch (e) { window.toastError?.('Erro: '+(e.message||e)); }
  };

  window.dispararLembreteAgora = async (id, mid) => {
    const r = _lembretesCache.find(x => x.id === id);
    if (!r) return;
    const dests = r.destinatarios || [];
    if (!dests.length) { window.toastError?.('Sem destinatários'); return; }

    const remetenteNome = window._currentUserData?.nome || 'Nexus';

    try {
      // Send to all destinatarios
      const emails = dests.map(d => d.valor).filter(Boolean);
      if (!emails.length) { window.toastError?.('Nenhum email valido nos destinatarios'); return; }

      const result = await window.sendNexusEmail('lembrete', emails, {
        titulo: r.titulo || 'Lembrete',
        descricao: r.descricao || '',
        remetente_nome: remetenteNome,
      });

      await window.sb.from('lembretes').update({
        status: 'enviado',
        enviado_em: new Date().toISOString(),
        falha_motivo: null,
      }).eq('id', id);
      window.toastSuccess?.('Email enviado com sucesso');
      document.getElementById(mid)?.remove();
      window.lembretesInit();
    } catch (e) {
      await window.sb.from('lembretes').update({
        status: 'falhou',
        falha_motivo: e.message || String(e),
      }).eq('id', id);
      window.toastError?.('Falha ao enviar: '+(e.message||e));
      document.getElementById(mid)?.remove();
      window.lembretesInit();
    }
  };

  window._lembExcluir = async (id, mid) => {
    const ok = await window.nexusConfirm?.('Excluir este lembrete permanentemente?');
    if (!ok) return;
    try {
      const { error } = await window.sb.from('lembretes').delete().eq('id', id);
      if (error) throw error;
      window.toastSuccess?.('Lembrete excluido');
      document.getElementById(mid)?.remove();
      window.lembretesInit();
    } catch (e) { window.toastError?.('Erro: '+(e.message||e)); }
  };
})();
