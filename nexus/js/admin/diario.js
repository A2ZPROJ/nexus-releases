// src/app/js/admin/diario.js — HISTÓRICO DE AÇÕES por máquina/usuário (5 dias), aberto pelo painel Saúde da Frota.
// Lê pelo RPC admin_diario (security definer, gate licenca_exige_super = só super admin). 27/09/2026.
(function () {
  'use strict';
  // escape PRÓPRIO: o erro vem de fora (anon) — sem cair em "identidade" se window.esc faltar (achado Fable)
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sb = () => window.sb;
  const fmt = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return iso; } };

  async function abrir(hw, rotulo) {
    let ov = document.getElementById('diario-ov'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'diario-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100001;display:flex;align-items:center;justify-content:center';
    ov.innerHTML =
      '<div style="background:var(--surface,#fff);color:var(--text,#111);width:min(1150px,96vw);max-height:90vh;border-radius:10px;box-shadow:0 8px 40px #0006;display:flex;flex-direction:column;overflow:hidden">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border)">' +
          '<div style="font-size:16px;font-weight:700">🕘 Histórico — ' + esc(rotulo || hw) + '</div>' +
          '<label style="font-size:12px;margin-left:12px"><input type="checkbox" id="diario-so-erros"> só erros</label>' +
          '<div id="diario-meta" style="font-size:12px;color:var(--text3)"></div>' +
          '<div style="margin-left:auto;display:flex;gap:8px">' +
            '<button class="action-btn" id="diario-refresh" style="font-size:12px;padding:5px 10px">↻ Atualizar</button>' +
            '<button class="action-btn" id="diario-close" style="font-size:12px;padding:5px 10px">✕ Fechar</button>' +
          '</div>' +
        '</div>' +
        '<div id="diario-body" style="overflow:auto;padding:0 4px"></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#diario-close').onclick = () => ov.remove();
    ov.querySelector('#diario-refresh').onclick = () => carregar(hw);
    ov.querySelector('#diario-so-erros').onchange = () => carregar(hw);
    carregar(hw);
  }

  async function carregar(hw) {
    const body = document.getElementById('diario-body'), meta = document.getElementById('diario-meta');
    if (!body) return;
    body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3)">⏳ carregando…</div>';
    const { data, error } = await sb().rpc('admin_diario', { p_hw: hw, p_login: null, p_dias: 5 });
    if (error) { body.innerHTML = '<div style="padding:30px;color:var(--danger,#dc2626)">Erro: ' + esc(error.message) + '</div>'; return; }
    let rows = data || [];
    const erros = rows.filter((r) => !r.ok).length;
    if (document.getElementById('diario-so-erros')?.checked) rows = rows.filter((r) => !r.ok);
    if (meta) meta.textContent = (data || []).length + ' ação(ões) · ' + erros + ' erro(s)';
    if (!rows.length) { body.innerHTML = '<div style="padding:36px;text-align:center;color:var(--text3)">Nada registrado nos últimos 5 dias.</div>'; return; }
    const td = 'padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top';
    body.innerHTML = '<table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="position:sticky;top:0;background:var(--surface2,var(--surface,#f0f3f6))">' +
      '<th style="text-align:left;padding:8px">Quando</th><th style="text-align:left;padding:8px">Usuário</th><th style="text-align:left;padding:8px">Ação</th>' +
      '<th style="text-align:left;padding:8px">Resultado</th><th style="text-align:left;padding:8px">Detalhe / erro / diagnóstico</th></tr></thead><tbody>' +
      rows.map((r) => {
        const d = r.diagnostico || {};
        const res = r.ok ? '<span style="color:var(--success,#16a34a)">✔ ok</span>' : '<span style="color:var(--danger,#dc2626);font-weight:700">✖ erro</span>';
        const det = r.ok ? esc(JSON.stringify(r.detalhe || '').slice(0, 160))
          : '<div style="color:var(--danger,#dc2626);white-space:pre-wrap;max-height:110px;overflow:auto">' + esc(r.erro || '') + '</div>' +
            (d.titulo ? '<div style="margin-top:4px"><b>' + esc(d.titulo) + '</b> <i style="color:var(--text3)">(' + esc(d.fonte || '') + ')</i><br>' + esc(d.como_resolver || '') + '</div>' : '<div style="color:var(--text3)">aguardando análise do agente…</div>');
        return '<tr><td style="' + td + ';white-space:nowrap">' + esc(fmt(r.quando)) + '</td><td style="' + td + '">' + esc(r.login || '') + '</td>' +
          '<td style="' + td + '"><code>' + esc(r.acao) + '</code><br><span style="color:var(--text3)">' + (r.ms != null ? esc((r.ms / 1000).toFixed(1)) + ' s' : '') + '</span></td>' +
          '<td style="' + td + '">' + res + '</td><td style="' + td + '">' + det + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  window.NexusDiario = { abrir };
})();
