// src/app/js/core/diario-aviso.js — AVISO NA TELA quando uma ação do Nexus não dá certo (27/09/2026).
// O main (src/diario.js) manda {titulo, porque, como_resolver, conserto?, fonte} pelo canal 'diario:aviso':
//  - fonte 'catalogo' → erro conhecido, explicação na hora (e botão "Consertar" quando existe conserto);
//  - fonte 'pendente' → erro novo: "o assistente está analisando" — a resposta chega depois como fonte 'agente'.
// Cartão no canto inferior direito; fica até a pessoa fechar. No máx. 5 empilhados, um por ação.
(function () {
  'use strict';
  const api = window.electronAPI && window.electronAPI.diario;
  if (!api) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function pilha() {
    let p = document.getElementById('diario-avisos');
    if (!p) {
      p = document.createElement('div');
      p.id = 'diario-avisos';
      p.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:100000;display:flex;flex-direction:column;gap:10px;max-width:min(420px,92vw)';
      document.body.appendChild(p);
    }
    return p;
  }

  // o aviso "pendente" de uma ação é substituído quando a resposta do agente chega
  const pendentes = new Map();

  const MAX_CARTOES = 5;
  function mostrar(a) {
    if (!a) return;
    const chave = a.acao || '?';
    // um cartão por ação: a resposta nova (ou a repetição do mesmo erro) substitui a anterior (achado Fable)
    if (pendentes.has(chave)) { pendentes.get(chave).remove(); pendentes.delete(chave); }
    const p = pilha();
    while (p.children.length >= MAX_CARTOES) p.firstElementChild.remove();
    const cor = a.fonte === 'pendente' ? 'var(--warning,#d97706)' : 'var(--danger,#dc2626)';
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--surface,#fff);color:var(--text,#111);border-left:5px solid ' + cor +
      ';border-radius:8px;box-shadow:0 6px 24px #0005;padding:12px 14px;font-size:13px;line-height:1.4';
    card.innerHTML =
      '<div style="display:flex;gap:8px;align-items:flex-start">' +
        '<div style="font-weight:700;flex:1">' + esc(a.titulo || 'Não deu certo') + '</div>' +
        '<button data-x style="background:none;border:0;cursor:pointer;font-size:14px;color:var(--text3,#666)" title="Fechar">✕</button>' +
      '</div>' +
      (a.porque ? '<div style="margin-top:6px"><b>Por quê:</b> ' + esc(a.porque) + '</div>' : '') +
      (a.como_resolver ? '<div style="margin-top:6px"><b>Como resolver:</b> ' + esc(a.como_resolver) + '</div>' : '') +
      '<div style="margin-top:8px;display:flex;gap:8px;align-items:center">' +
        (a.conserto ? '<button data-fix class="action-btn" style="font-size:12px;padding:4px 10px">🔧 Consertar</button>' : '') +
        '<span data-st style="font-size:11px;color:var(--text3,#666)">' +
          esc(a.fonte === 'agente' ? 'Análise do assistente' : a.fonte === 'pendente' ? 'Registrado para análise' : '') + '</span>' +
      '</div>';
    card.querySelector('[data-x]').onclick = () => { card.remove(); pendentes.delete(chave); };
    const fix = card.querySelector('[data-fix]');
    if (fix) fix.onclick = async () => {
      const st = card.querySelector('[data-st]');
      fix.disabled = true; st.textContent = '⏳ consertando…';
      try {
        const r = await api.consertar(a.conserto);
        st.textContent = r && r.ok ? '✅ ' + (r.msg || 'Pronto. Tente de novo.') : '❌ ' + ((r && r.erro) || 'Não consegui consertar.');
      } catch (e) { st.textContent = '❌ ' + (e && e.message); }
      fix.disabled = false;
    };
    p.appendChild(card);
    pendentes.set(chave, card);
  }

  api.onAviso(mostrar);
  window.NexusDiarioAviso = { mostrar };   // p/ teste manual no console
})();
