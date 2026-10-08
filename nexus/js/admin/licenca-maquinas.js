// src/app/js/admin/licenca-maquinas.js
// Painel SUPER ADMIN: "Máquinas autorizadas" da licença da DLL Civil 3D.
// Módulo SEPARADO de propósito (o index.html é gigante e pode estar em edição por
// outro trabalho). Para ligar, ver src/app/js/admin/README-licenca-maquinas.md
// (2 linhas no index.html). Enquanto não ligado, este arquivo é inerte.
//
// Segue os padrões do painel existente (mapeados na aba Admin do index.html):
//   - window.sb.rpc(...) com p_caller_code = window._currentUserData?.access_code
//   - esc() em todo HTML dinâmico
//   - cores só via var(--token)
//   - window.askPrompt para pedir número (o Electron 29 não tem prompt())
//   - window.toastError / window.toastSuccess para feedback
//
// RPCs usadas (migração 20260914160000_licenca_curta_maquina.sql):
//   admin_listar_maquinas(p_caller_code, p_usuario_id) -> setof licenca_maquinas
//   admin_autorizar_maquina(p_caller_code, p_maquina_id, p_autorizar) -> bool
//   admin_remover_maquina(p_caller_code, p_maquina_id) -> bool
//   admin_set_limite_maquinas(p_caller_code, p_usuario_id, p_max) -> int
(function () {
  'use strict';
  const esc = (s) => (window.esc ? window.esc(String(s ?? '')) : String(s ?? ''));
  const code = () => window._currentUserData?.access_code || '';
  const sb = () => window.sb;

  function fmtData(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  }
  function hwCurto(hw) { return hw ? (String(hw).slice(0, 8) + '…') : '—'; }

  async function render(userId, containerId) {
    const box = document.getElementById(containerId || ('maq-row-' + userId));
    if (!box) return;
    box.innerHTML = '<span style="font-size:11px;color:var(--text3)">⏳ carregando máquinas…</span>';
    const { data, error } = await sb().rpc('admin_listar_maquinas', {
      p_caller_code: code(), p_usuario_id: userId,
    });
    if (error) { box.innerHTML = '<span style="font-size:11px;color:var(--danger,#dc2626)">Erro: ' + esc(error.message) + '</span>'; return; }

    const maquinas = data || [];
    const titulo = '<span style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-right:4px">Máquinas Civil 3D:</span>';
    const btnLimite = '<button class="action-btn" style="font-size:10px;padding:3px 8px" ' +
      'onclick="window.NexusLicencaMaquinas.setLimite(\'' + esc(userId) + '\')" title="Máximo de máquinas por licença">⚙ limite</button>';

    if (maquinas.length === 0) {
      box.innerHTML = titulo + '<span style="font-size:11px;color:var(--text3)">nenhuma máquina registrada ainda</span> ' + btnLimite;
      return;
    }

    const cards = maquinas.map((m) => {
      const ok = m.autorizada === true;
      const cor = ok ? 'var(--success,#16a34a)' : 'var(--text3)';
      const selo = ok ? 'Autorizada' : 'Pendente';
      const acaoTxt = ok ? 'Revogar' : 'Liberar';
      return '<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface)">' +
        '<span title="' + esc(m.hardware_id) + '" style="font-size:11px;font-weight:600;color:var(--text)">' + esc(m.hostname || hwCurto(m.hardware_id)) + '</span>' +
        '<span style="font-size:10px;color:' + cor + '">● ' + selo + '</span>' +
        '<span style="font-size:10px;color:var(--text3)">visto ' + esc(fmtData(m.ultimo_visto)) + '</span>' +
        '<button class="action-btn" style="font-size:10px;padding:3px 8px" ' +
          'onclick="window.NexusLicencaMaquinas.autorizar(\'' + esc(userId) + '\',\'' + esc(m.id) + '\',' + (!ok) + ')">' + acaoTxt + '</button>' +
        '<button class="action-btn danger" style="font-size:10px;padding:3px 8px" ' +
          'onclick="window.NexusLicencaMaquinas.remover(\'' + esc(userId) + '\',\'' + esc(m.id) + '\')" title="Remover máquina">×</button>' +
        '</div>';
    }).join(' ');

    box.innerHTML = titulo + cards + ' ' + btnLimite;
  }

  async function autorizar(userId, maquinaId, autorizar) {
    const { error } = await sb().rpc('admin_autorizar_maquina', {
      p_caller_code: code(), p_maquina_id: maquinaId, p_autorizar: autorizar,
    });
    if (error) { window.toastError?.('Erro: ' + error.message); return; }
    window.toastSuccess?.(autorizar ? 'Máquina liberada.' : 'Máquina revogada.');
    render(userId);
  }

  async function remover(userId, maquinaId) {
    const { error } = await sb().rpc('admin_remover_maquina', {
      p_caller_code: code(), p_maquina_id: maquinaId,
    });
    if (error) { window.toastError?.('Erro: ' + error.message); return; }
    window.toastSuccess?.('Máquina removida.');
    render(userId);
  }

  async function setLimite(userId) {
    const r = await window.askPrompt?.({
      title: 'Limite de máquinas por licença',
      fields: [{ key: 'max', label: 'Máximo de máquinas (1 a 50)', type: 'text', value: '2' }],
    });
    if (!r) return;
    const max = parseInt(r.max, 10);
    if (!(max >= 1 && max <= 50)) { window.toastError?.('Informe um número de 1 a 50.'); return; }
    const { error } = await sb().rpc('admin_set_limite_maquinas', {
      p_caller_code: code(), p_usuario_id: userId, p_max: max,
    });
    if (error) { window.toastError?.('Erro: ' + error.message); return; }
    window.toastSuccess?.('Limite definido: ' + max + ' máquina(s).');
    render(userId);
  }

  window.NexusLicencaMaquinas = { render, autorizar, remover, setLimite };
})();
