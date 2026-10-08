// src/app/js/admin/indicadores.js
// Faixa de indicadores do topo do Admin: o retrato do Nexus numa olhada —
// pessoas, empresas, vendas e almoxarifado.
//
// Tudo vem de admin_indicadores() (security definer, SÓ super admin). Nenhuma
// conta é feita aqui: número somado no navegador diverge do banco na hora que
// alguém abre duas telas. A tela mostra o que o banco respondeu e a hora da
// medida, para ninguém olhar um número velho pensando que é de agora.
(function () {
  'use strict';
  const sb = () => window.sb;

  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');

  function cartao(rotulo, valor, apoio, cor, alerta) {
    return `
    <div style="flex:1;min-width:150px;background:var(--surface);border:1px solid ${alerta ? 'rgba(220,38,38,.45)' : 'var(--border)'};
                border-radius:10px;padding:13px 15px;border-left:3px solid ${cor}">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text3)">${rotulo}</div>
      <div style="font-size:21px;font-weight:700;color:${alerta ? '#dc2626' : 'var(--text)'};line-height:1.25;margin-top:3px">${valor}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:1px">${apoio || '&nbsp;'}</div>
    </div>`;
  }

  function bloco(titulo, cartoes) {
    return `
    <div style="margin-bottom:12px">
      <div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text3);margin-bottom:6px">${titulo}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${cartoes.join('')}</div>
    </div>`;
  }

  window.NexusAdminIndicadores = {
    async recarregar() {
      const el = document.getElementById('adminIndicadores');
      if (!el) return;
      el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:6px 0">Medindo...</div>';
      let d;
      try {
        const { data, error } = await sb().rpc('admin_indicadores');
        if (error) throw error;
        d = data;
      } catch (e) {
        // Só super admin lê; para os demais o painel simplesmente não aparece.
        const negado = /42501|apenas super admin|permission/i.test(e?.message || '');
        el.innerHTML = negado ? '' :
          `<div style="font-size:12px;color:#d97706;padding:8px 10px;border:1px solid rgba(217,119,6,.35);border-radius:8px">
             Não consegui medir os indicadores: ${String(e?.message || e)}
           </div>`;
        return;
      }

      const u = d.usuarios || {}, t = d.tenants || {}, v = d.vendas || {}, a = d.almoxarifado || {};
      const hora = d.gerado_em
        ? new Date(d.gerado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '—';

      el.innerHTML =
        bloco('Pessoas e empresas', [
          cartao('Usuários ativos', num(u.ativos), `${num(u.inativos)} desativados`, '#0891b2'),
          cartao('Sem nenhum acesso', num(u.sem_acesso),
                 u.sem_acesso ? 'esperando você liberar' : 'todos com acesso definido',
                 '#d97706', Number(u.sem_acesso) > 0),
          cartao('Entraram em 24 h', num(u.online_24h), 'último acesso registrado', '#16a34a'),
          cartao('Empresas', num(t.ativos), `${num(t.total)} cadastradas`, '#7c3aed'),
        ]) +
        bloco('Vendas (PDV)', [
          cartao('Hoje', brl(v.hoje_valor), `${num(v.hoje_qtd)} venda${Number(v.hoje_qtd) === 1 ? '' : 's'}`, '#0369a1'),
          cartao('No mês', brl(v.mes_valor), `${num(v.mes_qtd)} venda${Number(v.mes_qtd) === 1 ? '' : 's'}`, '#0369a1'),
          cartao('Devoluções no mês', brl(v.devolucoes_mes), 'estornado ao estoque', '#dc2626'),
          cartao('Líquido no mês', brl(Number(v.mes_valor || 0) - Number(v.devolucoes_mes || 0)),
                 'vendas menos devoluções', '#16a34a'),
        ]) +
        bloco('Almoxarifado', [
          cartao('Itens cadastrados', num(a.itens), 'material de uso interno', '#ea580c'),
          cartao('Abaixo do mínimo', num(a.abaixo_minimo),
                 a.abaixo_minimo ? 'precisa repor' : 'nada para repor', '#d97706',
                 Number(a.abaixo_minimo) > 0),
          cartao('Movimentos em 30 dias', num(a.movimentos_30d), 'entradas, saídas e ajustes', '#64748b'),
        ]) +
        `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text3)">
           <span>Medido às ${hora}</span>
           <button class="action-btn" onclick="window.NexusAdminIndicadores.recarregar()" style="font-size:10px;padding:3px 9px">Atualizar</button>
         </div>`;
    },
  };
})();
