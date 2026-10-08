// src/app/js/admin/saude-frota.js
// Painel SUPER ADMIN: "Saúde da Frota" — mostra o retrato de cada máquina que
// roda o Nexus (versões, .NET, bundle, carga da DLL, log) pra diagnosticar sem
// acessar a máquina. Dados da telemetria VIDA (tabela nexus_saude).
//
// Leitura PRIVADA: vem do RPC admin_saude_frota() (security definer), que só
// devolve se o chamador for super admin (mesmo gate do painel de licença,
// licenca_exige_super -> usuarios.is_super_admin). Ninguém comum vê.
//
// Módulo IIFE auto-contido (o index.html é gigante). Expõe window.NexusSaudeFrota.abrir().
// Padrões do app: window.sb, esc(), cores só por var(--token), toastError/Success.
(function () {
  'use strict';
  const esc = (s) => (window.esc ? window.esc(String(s ?? '')) : String(s ?? ''));
  const sb = () => window.sb;

  function fmtData(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return String(iso).slice(0, 16); }
  }
  function idade(iso) {
    if (!iso) return '—';
    try {
      const h = (Date.now() - new Date(iso).getTime()) / 36e5;
      if (h < 1) return Math.max(0, Math.round(h * 60)) + ' min';
      if (h < 48) return Math.round(h) + ' h';
      return Math.round(h / 24) + ' d';
    } catch { return '—'; }
  }
  function anosDe(civ) {
    const t = (civ || []).join(' ');
    const anos = ['2024', '2025', '2026', '2027'].filter((a) => t.includes(a));
    return { anos, temC3d: t.includes('Civil 3D') };
  }

  // DLL a partir da qual ela grava o carimbo de carga (ExtensionInit).
  const CARIMBO_MIN = '2.55.480.0';
  function cmpVer(a, b) {
    const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y ? 1 : -1; }
    return 0;
  }

  // Bandeiras de diagnóstico. ⚠ O plugin carrega por AppLoader OU TrustedPath —
  // só é bloqueio se FALTAM OS DOIS (achado 24/09: TrustedPath vazio em todas as
  // máquinas, mas carregam pelo AppLoader). E "sem carga" não é falha quando a DLL
  // sabe carimbar e o Civil só não foi aberto desde o start do Nexus (o carimbo é
  // escrito na abertura do Civil; o retrato é do start do Nexus).
  function flags(m) {
    const fs = [];
    const civ = m.civil_instalados || [];
    const { anos, temC3d } = anosDe(civ);
    const bundle = m.dll_bundle_2026 || m.dll_bundle_2027;
    const reg = { '2025': 'R25.0', '2026': 'R25.1', '2027': 'R26.0' };
    const tp = m.trustedpath || {}, pe = m.profile_existe || {}, al = m.apploader || {};
    const carrega = (a) => { const rv = reg[a]; return al[rv] === true || tp[rv] === true; };

    if (m.dll_carregada && bundle && m.dll_carregada !== bundle)
      fs.push(['err', 'DLL velha em memória (' + esc(m.dll_carregada) + ' ≠ ' + esc(bundle) + ')']);
    if (anos.includes('2024')) fs.push(['err', 'Civil 2024 — DLL não roda']);
    if (civ.length && !temC3d && !anos.length) fs.push(['warn', 'sem Civil 3D']);

    // bloqueio REAL de carga: perfil existe mas nenhum mecanismo (AppLoader/TrustedPath)
    anos.forEach((a) => { if (pe[reg[a]] && !carrega(a)) fs.push(['err', 'carga bloqueada (' + a + ') — sem AppLoader nem TrustedPath']); });

    // carga confirmada pelo carimbo (quando a DLL sabe carimbar)
    const carimbaOk = bundle && cmpVer(bundle, CARIMBO_MIN) >= 0;
    if (anos.length && carrega(anos[0])) {
      if (m.ultima_carga_em) fs.push(['ok', 'carregou']);
      else if (carimbaOk) fs.push(['info', 'carga não confirmada nesta sessão']);
      // DLL antiga (sem carimbo): não dá pra saber — não flaga
    }

    const deps = m.deps || {};
    Object.keys(deps).forEach((v) => {
      const dd = deps[v]; if (dd && typeof dd === 'object') {
        const falta = Object.keys(dd).filter((k) => dd[k] === false);
        if (falta.length) fs.push(['warn', 'dep faltando ' + esc(v) + ': ' + esc(falta.join(', ').slice(0, 50))]);
      }
    });
    if (!fs.length) fs.push(['ok', 'ok']);
    return fs;
  }
  function chip([t, txt]) {
    const c = t === 'err' ? 'var(--danger,#dc2626)' : t === 'warn' ? 'var(--warning,#d97706)'
      : t === 'info' ? 'var(--text3,#6b7280)' : 'var(--success,#16a34a)';
    return '<span style="background:' + c + ';color:#fff;border-radius:10px;padding:1px 8px;margin:1px;display:inline-block;font-size:10px">' + esc(txt) + '</span> ';
  }

  function linha(m) {
    const dn = (m.dotnet_desktop || []).join(', ');
    return '<tr>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border)"><b>' + esc(m.maquina || '?') + '</b><br><span style="font-size:10px;color:var(--text3)">' + esc(m.login || '') + '</span></td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border)">' + esc((m.civil_instalados || []).join(', ') || '?') + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border)">' + esc(m.nexus_versao || '?') + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border)">' + esc(m.dll_bundle_2026 || m.dll_bundle_2027 || '?') + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border)">' + esc(dn || '?') + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border)">' + flags(m).map(chip).join('') + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text3)" title="' + esc(fmtData(m.atualizado_em)) + '">' + esc(idade(m.atualizado_em)) + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border)"><button class="action-btn" data-hist="' + esc(m.hardware_id) + '" data-rot="' +
        esc((m.maquina || '') + (m.login ? ' · ' + m.login : '')) + '" style="font-size:11px;padding:3px 8px">🕘 Histórico</button></td>' +
      '</tr>';
  }

  async function abrir() {
    let ov = document.getElementById('saude-frota-ov');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'saude-frota-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center';
    ov.innerHTML =
      '<div style="background:var(--surface,#fff);color:var(--text,#111);width:min(1100px,95vw);max-height:88vh;border-radius:10px;box-shadow:0 8px 40px #0006;display:flex;flex-direction:column;overflow:hidden">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border)">' +
          '<div style="font-size:16px;font-weight:700">🩺 Saúde da Frota</div>' +
          '<div id="saude-frota-meta" style="font-size:12px;color:var(--text3)"></div>' +
          '<div style="margin-left:auto;display:flex;gap:8px">' +
            '<button class="action-btn" id="saude-frota-refresh" style="font-size:12px;padding:5px 10px">↻ Atualizar</button>' +
            '<button class="action-btn" id="saude-frota-close" style="font-size:12px;padding:5px 10px">✕ Fechar</button>' +
          '</div>' +
        '</div>' +
        '<div id="saude-frota-body" style="overflow:auto;padding:0 4px"></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#saude-frota-close').onclick = () => ov.remove();
    ov.querySelector('#saude-frota-refresh').onclick = () => carregar();
    carregar();
  }

  async function carregar() {
    const body = document.getElementById('saude-frota-body');
    const meta = document.getElementById('saude-frota-meta');
    if (!body) return;
    body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3)">⏳ carregando…</div>';
    const { data, error } = await sb().rpc('admin_saude_frota');
    if (error) {
      body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--danger,#dc2626)">Erro: ' + esc(error.message) + '</div>';
      return;
    }
    const rows = data || [];
    if (meta) meta.textContent = rows.length + ' máquina(s)';
    if (!rows.length) {
      body.innerHTML = '<div style="padding:36px;text-align:center;color:var(--text3)">Nenhuma máquina reportou ainda.<br><span style="font-size:12px">Conforme a equipe abrir o Nexus atualizado, os retratos aparecem aqui.</span></div>';
      return;
    }
    body.innerHTML =
      '<table style="border-collapse:collapse;width:100%;font-size:13px">' +
      '<thead><tr style="position:sticky;top:0;background:var(--surface2,var(--surface,#f0f3f6))">' +
        '<th style="text-align:left;padding:8px">Máquina / usuário</th>' +
        '<th style="text-align:left;padding:8px">Civil</th>' +
        '<th style="text-align:left;padding:8px">Nexus</th>' +
        '<th style="text-align:left;padding:8px">DLL</th>' +
        '<th style="text-align:left;padding:8px">.NET Desktop</th>' +
        '<th style="text-align:left;padding:8px">Situação</th>' +
        '<th style="text-align:left;padding:8px">Visto</th>' +
        '<th style="text-align:left;padding:8px"></th>' +
      '</tr></thead><tbody>' + rows.map(linha).join('') + '</tbody></table>';
    body.querySelectorAll('[data-hist]').forEach((b) => {
      b.onclick = () => window.NexusDiario && window.NexusDiario.abrir(b.getAttribute('data-hist'), b.getAttribute('data-rot'));
    });
  }

  window.NexusSaudeFrota = { abrir };
})();
