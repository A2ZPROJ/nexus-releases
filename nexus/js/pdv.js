/* Nexus · PDV — frente de caixa ligada ao Estoque (28/09/2026).
 *
 * Três telas: Caixa, Vendas e Faturamento. O Estoque continua sendo o dono dos
 * produtos e do saldo; aqui só se vende.
 *
 * Por que quase nada é calculado aqui: a baixa de estoque, os totais, a
 * numeração e a conferência de saldo vivem em funções do banco
 * (pdv_abrir_venda, pdv_definir_itens, pdv_registrar_pagamento,
 * pdv_concluir_venda, pdv_devolver_venda). Uma chamada, uma transação — a venda
 * e a baixa dão certo juntas ou nenhuma das duas acontece. Esta tela manda a
 * intenção e mostra o que o banco respondeu.
 *
 * Três regras que NÃO se afrouxam na interface:
 *   1. Nada é baixado do estoque antes de concluir a venda.
 *   2. A chave de idempotência nasce ao abrir o pagamento e é reusada em toda
 *      tentativa de concluir — clique duplo ou reenvio depois de queda de rede
 *      não baixam duas vezes.
 *   3. Cartão/pix só ficam aprovados com retorno da integração. O operador não
 *      tem botão para "aprovar" cartão; o banco também recusa.
 */
(function () {
  'use strict';

  const S = window.PDV = {
    empresas: [],
    empresaAtiva: null,
    produtos: [],
    venda: null,          // { id, chave }
    carrinho: [],         // { item_id, nome, codigo, unidade, qtd, preco, desconto, saldo }
    descontoGeral: 0,
    pagamentos: [],       // { id, forma, valor, status, origem }
    ocupado: false,
  };

  const sb = () => window.sb;
  const moeda = (v) => 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',');
  const num = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (id) => document.getElementById(id);

  // ⚠ O dia do caixa é o dia de BRASÍLIA, não o dia em UTC.
  // toISOString() devolve a data UTC: depois das 21h daqui já é o dia seguinte
  // lá, e o caixa diria "nenhuma venda hoje" com venda feita há minutos. O banco
  // agrupa em America/Sao_Paulo; a tela tem que perguntar pelo mesmo dia.
  const FUSO = 'America/Sao_Paulo';
  const dataLocal = (d) => (d || new Date()).toLocaleDateString('en-CA', { timeZone: FUSO });

  // ── Permissões de função (desconto, devolução, preço...) ─────────────────
  // FECHADO por padrão: se a lista não chegou, nada de sensível aparece. O
  // contrário — mostrar e deixar o banco recusar no clique — faria a pessoa
  // preencher a venda inteira para levar "sem permissão" no fim.
  // ⚠ Isto é APARÊNCIA. A trava real é nx_pode() dentro das RPCs do banco.
  const podeF = (f) => !!(window.nxPode && window.nxPode(f));

  // Chamado quando a lista de funções chega do banco (o boot avisa).
  window.pdvAplicarPermissoes = function () {
    if (document.getElementById('pdvCaixaBox')) { try { renderCaixa(); } catch (e) { /* tela não montada ainda */ } }
  };

  function aviso(msg, tipo) {
    if (tipo === 'erro' && window.toastError) return window.toastError(msg);
    if (tipo === 'ok' && window.toastSuccess) return window.toastSuccess(msg);
    if (window.toastInfo) return window.toastInfo(msg);
    if (window.toast) return window.toast(msg);
    console.log('[pdv]', msg);
  }

  // A mensagem do banco é a mensagem do usuário: as funções foram escritas com
  // texto em português explicando o motivo da recusa. Nada de "erro inesperado".
  function motivo(erro) {
    if (!erro) return 'Falha sem mensagem — nada foi gravado.';
    return erro.message || erro.details || erro.hint || String(erro);
  }

  async function rpc(fn, args) {
    const { data, error } = await sb().rpc(fn, args || {});
    if (error) throw error;
    return data;
  }

  // ─────────────────────────────────────────────── empresa ativa
  // Quem atende mais de uma empresa escolhe explicitamente, e a escolha fica
  // visível o tempo todo. Não existe "todas as empresas" no caixa: venda sem
  // empresa definida é justamente o que a gente quer impedir.
  const chaveEmpresa = () => 'nx_pdv_empresa_' + (window._currentUserData && window._currentUserData.id || 'x');

  async function carregarEmpresas() {
    const { data, error } = await sb().from('estoque_empresas').select('id,nome').order('nome');
    if (error) throw error;
    S.empresas = data || [];
    if (!S.empresas.length) return;
    // Uma empresa só: não há o que escolher.
    if (S.empresas.length === 1) { S.empresaAtiva = S.empresas[0].id; S.confirmouEmpresa = true; return; }
    // Mais de uma: a escolha é EXPLÍCITA, uma vez por sessão do app. A última
    // empresa usada aparece em destaque, mas ninguém começa a vender sem dizer
    // em qual empresa está — vender na empresa errada é o erro que não dá para
    // desfazer sem estorno.
    try { S.ultimaEmpresa = localStorage.getItem(chaveEmpresa()); } catch (e) { S.ultimaEmpresa = null; }
    if (!S.confirmouEmpresa) S.empresaAtiva = null;
  }

  function nomeEmpresa(id) {
    const e = S.empresas.find((x) => x.id === (id || S.empresaAtiva));
    return e ? e.nome : '(nenhuma)';
  }

  window.pdvTrocarEmpresa = async function (id) {
    if (!id) return;
    if (S.carrinho.length && !confirm('Trocar de empresa esvazia o carrinho. Continuar?')) {
      const sel = el('pdvEmpresaSel');
      if (sel) sel.value = S.empresaAtiva || '';
      return;
    }
    S.empresaAtiva = id;
    S.confirmouEmpresa = true;
    try { localStorage.setItem(chaveEmpresa(), id); } catch (e) { /* segue sem lembrar */ }
    await descartarVenda();
    await carregarProdutos();
    atualizarBarraEmpresa();
    renderCaixa();
  };

  // A empresa ativa fica visível o tempo todo, em qualquer uma das três telas —
  // e o seletor tem que refletir a escolha, não continuar em "— escolha —".
  function atualizarBarraEmpresa() {
    const barra = el('pdvBarraEmpresa');
    if (barra) barra.innerHTML = seletorEmpresa();
    document.querySelectorAll('#pdvEmpresaSel').forEach((s) => {
      if (S.empresaAtiva) s.value = S.empresaAtiva;
    });
  }

  function seletorEmpresa() {
    const opts = S.empresas.map((e) =>
      '<option value="' + e.id + '"' + (e.id === S.empresaAtiva ? ' selected' : '') + '>' +
      esc(e.nome) + '</option>').join('');
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="font-size:12px;color:var(--text2);font-weight:600">Empresa</span>' +
      '<select class="nx-select" id="pdvEmpresaSel" onchange="window.pdvTrocarEmpresa(this.value)"' +
      (S.empresas.length > 1 ? '' : ' disabled') + '>' +
      (S.empresaAtiva ? '' : '<option value="">— escolha —</option>') + opts + '</select></div>';
  }

  // ─────────────────────────────────────────────── produtos
  // O caixa só enxerga o que é DE VENDA. Material de almoxarifado (que sai para
  // uma pessoa e volta) não entra aqui nem por engano — é o que separa o Nexus
  // do lojista do Nexus da obra.
  async function carregarProdutos() {
    S.produtos = [];
    if (!S.empresaAtiva) return;
    const { data, error } = await sb().from('estoque_items')
      .select('id,nome,codigo,codigo_barras,unidade,quantidade,preco_venda,empresa_id,finalidade')
      .eq('empresa_id', S.empresaAtiva)
      .in('finalidade', ['venda', 'ambos'])
      .is('deleted_at', null)
      .order('nome');
    if (error) throw error;
    S.produtos = data || [];
  }

  function buscar(termo) {
    const t = (termo || '').trim().toLowerCase();
    if (!t) return [];
    const exato = S.produtos.filter((p) => (p.codigo_barras || '').toLowerCase() === t
      || (p.codigo || '').toLowerCase() === t);
    if (exato.length) return exato;
    return S.produtos.filter((p) => (p.nome || '').toLowerCase().includes(t)
      || (p.codigo || '').toLowerCase().includes(t)).slice(0, 12);
  }

  // ─────────────────────────────────────────────── carrinho (só memória)
  function addCarrinho(prod, qtd) {
    const q = num(qtd || 1);
    if (q <= 0) return aviso('Quantidade tem que ser maior que zero.', 'erro');
    if (prod.preco_venda == null) {
      aviso('"' + prod.nome + '" está sem preço de venda. Cadastre o preço no Estoque antes de vender.', 'erro');
      return;
    }
    const ja = S.carrinho.find((l) => l.item_id === prod.id);
    const novoTotal = (ja ? ja.qtd : 0) + q;
    if (novoTotal > Number(prod.quantidade || 0)) {
      aviso('Saldo insuficiente: ' + prod.nome + ' tem ' + prod.quantidade + ' ' + (prod.unidade || 'un') + '.', 'erro');
      return;
    }
    if (ja) ja.qtd = novoTotal;
    else S.carrinho.push({
      item_id: prod.id, nome: prod.nome, codigo: prod.codigo, unidade: prod.unidade,
      qtd: q, preco: Number(prod.preco_venda), desconto: 0, saldo: Number(prod.quantidade || 0),
    });
    renderCarrinho();
  }

  window.pdvAddBusca = function () {
    const inp = el('pdvBusca');
    if (!inp) return;
    const achados = buscar(inp.value);
    if (!achados.length) return aviso('Nada encontrado para "' + inp.value + '".', 'erro');
    if (achados.length === 1) {
      addCarrinho(achados[0], Number(el('pdvQtd') && el('pdvQtd').value) || 1);
      inp.value = '';
      if (el('pdvQtd')) el('pdvQtd').value = '1';
      inp.focus();
      renderSugestoes([]);
      return;
    }
    renderSugestoes(achados);
  };

  window.pdvAddProduto = function (id) {
    const p = S.produtos.find((x) => x.id === id);
    if (p) addCarrinho(p, Number(el('pdvQtd') && el('pdvQtd').value) || 1);
    const inp = el('pdvBusca');
    if (inp) { inp.value = ''; inp.focus(); }
    renderSugestoes([]);
  };

  window.pdvRemoveLinha = function (i) { S.carrinho.splice(i, 1); renderCarrinho(); };

  window.pdvSetLinha = function (i, campo, valor) {
    const l = S.carrinho[i];
    if (!l) return;
    const v = num(valor);
    if (campo === 'qtd') {
      if (v <= 0) return renderCarrinho();
      if (v > l.saldo) { aviso('Saldo do item é ' + l.saldo + '.', 'erro'); return renderCarrinho(); }
      l.qtd = v;
    } else if (campo === 'preco') { l.preco = Math.max(0, v); }
    else if (campo === 'desconto') { l.desconto = Math.max(0, v); }
    renderCarrinho();
  };

  window.pdvSetDescontoGeral = function (v) { S.descontoGeral = Math.max(0, num(v)); renderCarrinho(); };

  const totalLinha = (l) => num(l.qtd * l.preco - l.desconto);
  const subtotal = () => num(S.carrinho.reduce((s, l) => s + totalLinha(l), 0));
  const totalVenda = () => num(Math.max(0, subtotal() - S.descontoGeral));

  // ─────────────────────────────────────────────── venda no banco
  async function garantirVenda() {
    if (S.venda) return S.venda;
    const id = await rpc('pdv_abrir_venda', {
      p_empresa_id: S.empresaAtiva,
      p_cliente_nome: (el('pdvCliente') && el('pdvCliente').value) || null,
    });
    S.venda = { id: id, chave: null };
    return S.venda;
  }

  async function descartarVenda() {
    if (S.venda) {
      try { await rpc('pdv_cancelar_venda', { p_venda_id: S.venda.id, p_motivo: 'Descartada no caixa' }); }
      catch (e) { console.warn('[pdv] não deu para cancelar a venda aberta:', motivo(e)); }
    }
    S.venda = null;
    S.carrinho = [];
    S.pagamentos = [];
    S.descontoGeral = 0;
  }

  window.pdvLimpar = async function () {
    if (S.carrinho.length && !confirm('Descartar esta venda?')) return;
    await descartarVenda();
    renderCaixa();
  };

  // Sincroniza o carrinho da tela com a venda do banco (nada é baixado aqui).
  async function sincronizar() {
    await garantirVenda();
    return rpc('pdv_definir_itens', {
      p_venda_id: S.venda.id,
      p_itens: S.carrinho.map((l) => ({
        item_id: l.item_id, quantidade: l.qtd, preco_unitario: l.preco, desconto: l.desconto,
      })),
      p_desconto: S.descontoGeral,
    });
  }

  window.pdvAbrirPagamento = async function () {
    if (!S.empresaAtiva) return aviso('Escolha a empresa.', 'erro');
    if (!S.carrinho.length) return aviso('Carrinho vazio.', 'erro');
    if (S.ocupado) return;
    S.ocupado = true;
    try {
      const r = await sincronizar();
      // A chave nasce aqui e é a MESMA em toda tentativa de concluir.
      S.venda.chave = 'pdv:' + S.venda.id + ':' + (Date.now());
      S.pagamentos = [];
      renderPagamento(r);
    } catch (e) {
      aviso(motivo(e), 'erro');
    } finally { S.ocupado = false; }
  };

  window.pdvRegistrarPagamento = async function (forma) {
    if (!S.venda) return;
    const falta = num(totalVenda() - S.pagamentos.filter((p) => p.status === 'aprovado')
      .reduce((s, p) => s + p.valor, 0));
    const campo = el('pdvValorPgto');
    const valor = num((campo && campo.value) || falta);
    if (valor <= 0) return aviso('Valor inválido.', 'erro');

    try {
      let r;
      if (forma === 'dinheiro' || forma === 'outro') {
        // Alguém assume o recebimento; fica gravado quem foi e quando.
        r = await rpc('pdv_registrar_pagamento', {
          p_venda_id: S.venda.id, p_forma: forma, p_valor: valor, p_aprovado: true,
        });
      } else {
        // Cartão/pix/transferência: entra PENDENTE. Só a integração aprova.
        r = await rpc('pdv_registrar_pagamento', {
          p_venda_id: S.venda.id, p_forma: forma, p_valor: valor, p_aprovado: false,
        });
      }
      S.pagamentos.push({
        id: r.pagamento_id, forma: forma, valor: valor,
        status: r.status, origem: r.origem_confirmacao,
      });
      renderPagamento();
    } catch (e) { aviso(motivo(e), 'erro'); }
  };

  window.pdvConcluir = async function () {
    if (!S.venda || S.ocupado) return;
    const btn = el('pdvBtnConcluir');
    if (btn) { btn.disabled = true; btn.textContent = 'Concluindo…'; }
    S.ocupado = true;
    try {
      const r = await rpc('pdv_concluir_venda', { p_venda_id: S.venda.id, p_chave: S.venda.chave });
      const dados = {
        numero: r.numero, total: r.total, empresa: nomeEmpresa(),
        itens: S.carrinho.slice(), desconto: S.descontoGeral,
        pagamentos: S.pagamentos.slice(),
        cliente: (el('pdvCliente') && el('pdvCliente').value) || '',
      };
      if (r.repetido) aviso('Esta venda já tinha sido concluída (' + r.numero + '). Nada foi baixado duas vezes.');
      else aviso('Venda ' + r.numero + ' concluída — ' + moeda(r.total), 'ok');
      S.venda = null; S.carrinho = []; S.pagamentos = []; S.descontoGeral = 0;
      fecharModal();
      await carregarProdutos();
      renderCaixa();
      window.pdvUltimaVenda = dados;
      if (confirm('Imprimir comprovante da venda ' + dados.numero + '?')) window.pdvImprimir(dados);
    } catch (e) {
      aviso(motivo(e), 'erro');
      if (btn) { btn.disabled = false; btn.textContent = 'Concluir venda'; }
    } finally { S.ocupado = false; }
  };

  // ─────────────────────────────────────────────── leitor de código de barras
  // Leitor USB funciona como teclado: digita o código e manda Enter. Não precisa
  // driver nem biblioteca — só distinguir a leitura (rápida, uniforme) da
  // digitação humana. Se o operador digitar devagar, cai no caminho normal.
  let buf = '', ultimaTecla = 0, timer = null;
  const MAX_MS_ENTRE_TECLAS = 35;   // leitor costuma ficar em ~10-30 ms
  const MIN_CHARS = 6;

  function ouvirLeitor(ev) {
    const abaAtiva = document.querySelector('#tab-pdv.active') || document.querySelector('#tab-pdv.show');
    const tabPdv = el('tab-pdv');
    if (!tabPdv || tabPdv.style.display === 'none') { /* segue: a checagem real é abaixo */ }
    if (!tabPdv || !tabPdv.offsetParent) { buf = ''; return; }
    const agora = Date.now();
    const intervalo = agora - ultimaTecla;
    ultimaTecla = agora;

    if (ev.key === 'Enter') {
      if (buf.length >= MIN_CHARS) {
        const codigo = buf;
        buf = '';
        const achados = buscar(codigo);
        if (achados.length === 1) { addCarrinho(achados[0], 1); ev.preventDefault(); }
        else aviso('Código lido (' + codigo + ') não está cadastrado nesta empresa.', 'erro');
      }
      buf = '';
      return;
    }
    if (ev.key.length !== 1) return;
    if (intervalo > MAX_MS_ENTRE_TECLAS) buf = '';
    buf += ev.key;
    clearTimeout(timer);
    timer = setTimeout(() => { buf = ''; }, 200);
  }

  // ─────────────────────────────────────────────── comprovante
  // NÃO É DOCUMENTO FISCAL — está escrito no papel, de propósito.
  window.pdvImprimir = function (v) {
    if (!v) v = window.pdvUltimaVenda;
    if (!v) return aviso('Nada para imprimir.', 'erro');
    const linhas = v.itens.map((l) =>
      '<tr><td>' + esc(l.nome) + '<br><small>' + l.qtd + ' x ' + moeda(l.preco) +
      (l.desconto ? ' - ' + moeda(l.desconto) : '') + '</small></td>' +
      '<td style="text-align:right">' + moeda(totalLinha(l)) + '</td></tr>').join('');
    const pgtos = (v.pagamentos || []).map((p) =>
      '<tr><td>' + esc(p.forma) + (p.status !== 'aprovado' ? ' (' + esc(p.status) + ')' : '') +
      '</td><td style="text-align:right">' + moeda(p.valor) + '</td></tr>').join('');
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(v.numero) + '</title>' +
      '<style>@page{margin:4mm}body{font:12px/1.35 "Courier New",monospace;width:72mm;margin:0}' +
      'h1{font-size:13px;margin:0 0 2px;text-align:center}table{width:100%;border-collapse:collapse}' +
      'td{padding:2px 0;vertical-align:top}small{font-size:10px;color:#333}' +
      '.sep{border-top:1px dashed #000;margin:6px 0}.tot{font-weight:bold;font-size:14px}' +
      '.fisc{margin-top:8px;text-align:center;font-size:10px;border:1px solid #000;padding:4px}' +
      '</style></head><body>' +
      '<h1>' + esc(v.empresa) + '</h1>' +
      '<div style="text-align:center">Comprovante ' + esc(v.numero) + '<br>' +
      new Date().toLocaleString('pt-BR') + '</div>' +
      (v.cliente ? '<div>Cliente: ' + esc(v.cliente) + '</div>' : '') +
      '<div class="sep"></div><table>' + linhas + '</table><div class="sep"></div>' +
      (v.desconto ? '<table><tr><td>Desconto</td><td style="text-align:right">- ' + moeda(v.desconto) + '</td></tr></table>' : '') +
      '<table><tr class="tot"><td>TOTAL</td><td style="text-align:right">' + moeda(v.total) + '</td></tr></table>' +
      (pgtos ? '<div class="sep"></div><table>' + pgtos + '</table>' : '') +
      '<div class="fisc">NÃO É DOCUMENTO FISCAL<br>Comprovante de venda interno</div>' +
      '</body></html>';

    // iframe oculto: imprime só o comprovante, sem abrir janela e sem levar a
    // folha de estilo do app junto.
    let f = el('pdvPrintFrame');
    if (!f) {
      f = document.createElement('iframe');
      f.id = 'pdvPrintFrame';
      f.style.cssText = 'position:fixed;left:-9999px;width:80mm;height:200mm;border:0';
      document.body.appendChild(f);
    }
    const d = f.contentDocument || f.contentWindow.document;
    d.open(); d.write(html); d.close();
    setTimeout(() => {
      try { f.contentWindow.focus(); f.contentWindow.print(); }
      catch (e) { aviso('Não foi possível abrir a impressão: ' + e.message, 'erro'); }
    }, 120);
  };

  // ─────────────────────────────────────────────── render: caixa
  function renderSugestoes(lista) {
    const box = el('pdvSugestoes');
    if (!box) return;
    if (!lista.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = '';
    box.innerHTML = lista.map((p) =>
      '<button class="nx-btn nx-btn--sm" style="display:block;width:100%;text-align:left;margin-bottom:4px"' +
      ' onclick="window.pdvAddProduto(\'' + p.id + '\')">' +
      esc(p.nome) + ' · ' + (p.preco_venda != null ? moeda(p.preco_venda) : '<b>sem preço</b>') +
      ' · saldo ' + p.quantidade + '</button>').join('');
  }

  function renderCarrinho() {
    const box = el('pdvCarrinho');
    if (!box) return;
    if (!S.carrinho.length) {
      box.innerHTML = '<div class="nx-empty"><div class="nx-empty-t">Carrinho vazio</div>' +
        '<div class="nx-empty-s">Passe o leitor de código de barras ou busque o produto pelo nome.</div></div>';
    } else {
      box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr style="text-align:left;color:var(--text2);font-size:11px">' +
        '<th style="padding:4px">Produto</th><th style="width:90px">Qtd</th>' +
        '<th style="width:110px">Preço</th><th style="width:110px">Desconto</th>' +
        '<th style="width:100px;text-align:right">Total</th><th style="width:36px"></th></tr></thead><tbody>' +
        S.carrinho.map((l, i) =>
          '<tr style="border-top:1px solid var(--border)">' +
          '<td style="padding:6px 4px">' + esc(l.nome) +
          '<br><small style="color:var(--text2)">' + esc(l.codigo || '') + ' · saldo ' + l.saldo + '</small></td>' +
          '<td><input class="nx-input" type="number" step="any" min="0" value="' + l.qtd +
          '" onchange="window.pdvSetLinha(' + i + ',\'qtd\',this.value)" style="width:80px"></td>' +
          '<td><input class="nx-input" type="number" step="0.01" min="0" value="' + l.preco +
          '" onchange="window.pdvSetLinha(' + i + ',\'preco\',this.value)" style="width:100px"></td>' +
          '<td>' + (podeF('pdv.desconto')
            ? '<input class="nx-input" type="number" step="0.01" min="0" value="' + l.desconto +
              '" onchange="window.pdvSetLinha(' + i + ',\'desconto\',this.value)" style="width:100px">'
            : '<span title="Você não tem permissão para dar desconto" style="color:var(--text3)">' + moeda(l.desconto) + '</span>') + '</td>' +
          '<td style="text-align:right;font-weight:600">' + moeda(totalLinha(l)) + '</td>' +
          '<td><button class="nx-btn nx-btn--sm" onclick="window.pdvRemoveLinha(' + i + ')" title="Remover">&times;</button></td>' +
          '</tr>').join('') + '</tbody></table>';
    }
    const res = el('pdvResumo');
    if (res) {
      res.innerHTML =
        '<div class="nx-kpis"><div class="nx-kpi"><span>Subtotal</span><b>' + moeda(subtotal()) + '</b></div>' +
        '<div class="nx-kpi"><span>Desconto</span><b>' + moeda(S.descontoGeral) + '</b></div>' +
        '<div class="nx-kpi"><span>Total</span><b style="font-size:20px">' + moeda(totalVenda()) + '</b></div></div>';
    }
    const b = el('pdvBtnPagar');
    if (b) b.disabled = !S.carrinho.length;
  }

  function renderCaixa() {
    const raiz = el('pdvCaixaBox');
    if (!raiz) return;
    if (!S.empresas.length) {
      raiz.innerHTML = '<div class="nx-empty"><div class="nx-empty-t">Nenhuma empresa cadastrada</div>' +
        '<div class="nx-empty-s">Cadastre a empresa no módulo Estoque (botão Empresas) antes de vender.</div></div>';
      return;
    }
    if (!S.empresaAtiva) {
      const ult = S.empresas.find((e) => e.id === S.ultimaEmpresa);
      raiz.innerHTML = '<div class="nx-panel"><div class="nx-panel-h"><div class="nx-panel-t">' +
        'Em qual empresa você vai vender?</div></div><div class="nx-panel-b">' +
        '<p style="font-size:13px;color:var(--text2);margin:0 0 12px">Você atende mais de uma empresa. ' +
        'A venda, a baixa no estoque e o faturamento vão para a empresa escolhida aqui — por isso ela ' +
        'não é escolhida sozinha.</p>' +
        (ult ? '<div style="margin-bottom:10px"><button class="nx-btn nx-btn-primary"' +
          ' onclick="window.pdvTrocarEmpresa(\'' + ult.id + '\')">Continuar em ' + esc(ult.nome) +
          '</button> <span style="font-size:11px;color:var(--text2)">(última que você usou)</span></div>' : '') +
        '<div style="display:flex;flex-direction:column;gap:6px;max-width:360px">' +
        S.empresas.filter((e) => e.id !== (ult && ult.id)).map((e) =>
          '<button class="nx-btn" style="text-align:left" onclick="window.pdvTrocarEmpresa(\'' + e.id + '\')">' +
          esc(e.nome) + '</button>').join('') +
        '</div></div></div>';
      return;
    }
    raiz.innerHTML =
      '<div class="nx-panel"><div class="nx-panel-h"><div class="nx-panel-t">Produto</div></div>' +
      '<div class="nx-panel-b">' +
      '<div class="nx-wrap-row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
      '<div style="flex:1;min-width:240px"><label style="font-size:11px;color:var(--text2)">Código de barras, código interno ou nome</label>' +
      '<input class="nx-input" id="pdvBusca" placeholder="passe o leitor ou digite" autocomplete="off" style="width:100%"></div>' +
      '<div><label style="font-size:11px;color:var(--text2)">Qtd</label>' +
      '<input class="nx-input" id="pdvQtd" type="number" step="any" min="0" value="1" style="width:90px"></div>' +
      '<button class="nx-btn nx-btn-primary" onclick="window.pdvAddBusca()">Adicionar</button>' +
      '</div><div id="pdvSugestoes" style="margin-top:8px;display:none"></div>' +
      '<div style="margin-top:8px"><label style="font-size:11px;color:var(--text2)">Cliente (opcional)</label>' +
      '<input class="nx-input" id="pdvCliente" placeholder="nome do cliente" style="width:100%;max-width:340px"></div>' +
      '</div></div>' +
      '<div class="nx-panel" style="margin-top:12px"><div class="nx-panel-h"><div class="nx-panel-t">Carrinho</div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
      (podeF('pdv.desconto')
        ? '<span style="font-size:11px;color:var(--text2)">Desconto na venda</span>' +
          '<input class="nx-input" type="number" step="0.01" min="0" value="' + S.descontoGeral +
          '" onchange="window.pdvSetDescontoGeral(this.value)" style="width:110px">'
        : '') +
      '<button class="nx-btn nx-btn--sm" onclick="window.pdvLimpar()">Descartar</button></div></div>' +
      '<div class="nx-panel-b"><div id="pdvCarrinho"></div>' +
      '<div id="pdvResumo" style="margin-top:12px"></div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="nx-btn nx-btn-primary" id="pdvBtnPagar" onclick="window.pdvAbrirPagamento()" disabled>Pagamento</button>' +
      '</div></div></div>';
    const inp = el('pdvBusca');
    if (inp) {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && buf.length < MIN_CHARS) { e.preventDefault(); window.pdvAddBusca(); }
      });
      inp.addEventListener('input', () => renderSugestoes(buscar(inp.value).length > 1 ? buscar(inp.value) : []));
      setTimeout(() => inp.focus(), 60);
    }
    renderCarrinho();
  }

  // ─────────────────────────────────────────────── render: pagamento
  function fecharModal() {
    const m = el('pdvModal');
    if (m) m.remove();
  }
  window.pdvFecharModal = fecharModal;

  function renderPagamento() {
    const aprovado = num(S.pagamentos.filter((p) => p.status === 'aprovado').reduce((s, p) => s + p.valor, 0));
    const pendente = num(S.pagamentos.filter((p) => p.status === 'pendente').reduce((s, p) => s + p.valor, 0));
    const falta = num(Math.max(0, totalVenda() - aprovado));

    const corpo =
      '<div class="nx-kpis"><div class="nx-kpi"><span>Total</span><b>' + moeda(totalVenda()) + '</b></div>' +
      '<div class="nx-kpi"><span>Confirmado</span><b>' + moeda(aprovado) + '</b></div>' +
      '<div class="nx-kpi"><span>Falta</span><b style="color:' + (falta ? '#dc2626' : '#16a34a') + '">' +
      moeda(falta) + '</b></div></div>' +
      (pendente ? '<div class="nx-note" style="margin-top:8px"><div class="nx-note-t">' +
        moeda(pendente) + ' aguardando confirmação</div><div class="nx-note-b">Cartão e pix só entram como pagos ' +
        'quando a integração responder. Sem integração configurada, esse valor não confirma — receba em dinheiro ' +
        'ou registre como recebido fora do sistema.</div></div>' : '') +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
      '<div><label style="font-size:11px;color:var(--text2)">Valor</label>' +
      '<input class="nx-input" id="pdvValorPgto" type="number" step="0.01" min="0" value="' + falta + '" style="width:120px"></div>' +
      '<button class="nx-btn" onclick="window.pdvRegistrarPagamento(\'dinheiro\')">Dinheiro</button>' +
      '<button class="nx-btn" onclick="window.pdvRegistrarPagamento(\'outro\')" title="Recebido fora do sistema — fica registrado quem assumiu">Recebido fora do sistema</button>' +
      '<button class="nx-btn" onclick="window.pdvRegistrarPagamento(\'pix\')">Pix</button>' +
      '<button class="nx-btn" onclick="window.pdvRegistrarPagamento(\'debito\')">Débito</button>' +
      '<button class="nx-btn" onclick="window.pdvRegistrarPagamento(\'credito\')">Crédito</button>' +
      '</div>' +
      (S.pagamentos.length ? '<table style="width:100%;margin-top:12px;font-size:13px;border-collapse:collapse">' +
        S.pagamentos.map((p) => '<tr style="border-top:1px solid var(--border)">' +
          '<td style="padding:5px 0">' + esc(p.forma) + '</td>' +
          '<td>' + moeda(p.valor) + '</td>' +
          '<td style="text-align:right"><span class="nx-pill">' + esc(p.status) +
          (p.origem ? ' · ' + esc(p.origem) : '') + '</span></td></tr>').join('') + '</table>' : '') +
      '<div class="nx-note" style="margin-top:12px"><div class="nx-note-t">Sem documento fiscal</div>' +
      '<div class="nx-note-b">O Nexus não emite NF-e nem NFC-e. O comprovante impresso é interno e diz isso no rodapé.</div></div>' +
      '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="nx-btn" onclick="window.pdvFecharModal()">Voltar</button>' +
      '<button class="nx-btn nx-btn-primary" id="pdvBtnConcluir" onclick="window.pdvConcluir()"' +
      (falta > 0 ? ' disabled title="Falta confirmar ' + moeda(falta) + '"' : '') +
      '>Concluir venda</button></div>';

    let m = el('pdvModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'pdvModal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;' +
        'align-items:center;justify-content:center;padding:20px';
      m.innerHTML = '<div class="nx" style="background:var(--surface);border:1px solid var(--border);' +
        'border-radius:12px;max-width:620px;width:100%;max-height:90vh;overflow:auto;padding:20px">' +
        '<h3 style="margin:0 0 12px">Pagamento · ' + esc(nomeEmpresa()) + '</h3><div id="pdvModalBody"></div></div>';
      document.body.appendChild(m);
    }
    el('pdvModalBody').innerHTML = corpo;
  }

  // ─────────────────────────────────────────────── produtos à venda
  // Um lojista não deveria precisar entrar no Almoxarifado para cadastrar preço.
  window.pdvProdutosInit = async function () {
    const box = el('pdvProdutosBox');
    if (!box) return;
    box.innerHTML = '<div class="nx-empty"><div class="nx-empty-t">Carregando…</div></div>';
    try {
      if (!S.empresas.length) await carregarEmpresas();
      if (!S.empresaAtiva) {
        box.innerHTML = '<div class="nx-empty"><div class="nx-empty-t">Escolha a empresa no Caixa</div>' +
          '<div class="nx-empty-s">Os produtos pertencem a uma empresa.</div></div>';
        return;
      }
      await carregarProdutos();
      // Material do almoxarifado desta empresa, para quem quiser colocar à venda
      const { data: almox } = await sb().from('estoque_items')
        .select('id,nome,codigo,unidade,quantidade')
        .eq('empresa_id', S.empresaAtiva).eq('finalidade', 'almoxarifado')
        .is('deleted_at', null).order('nome').limit(500);

      const semPreco = S.produtos.filter((p) => p.preco_venda == null).length;
      const cab = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        seletorEmpresa() + '<button class="nx-btn nx-btn--sm" onclick="window.pdvProdutosInit()">Atualizar</button></div>' +
        (semPreco ? '<div class="nx-note" style="margin-bottom:10px"><div class="nx-note-t">' + semPreco +
          ' produto(s) sem preço</div><div class="nx-note-b">Produto sem preço de venda não aparece no caixa. ' +
          'Isso é de propósito: melhor não vender do que vender por um valor que ninguém decidiu.</div></div>' : '');

      const tabela = !S.produtos.length
        ? '<div class="nx-empty"><div class="nx-empty-t">Nenhum produto à venda</div>' +
          '<div class="nx-empty-s">Traga um item do almoxarifado para a venda usando a lista abaixo, ' +
          'ou cadastre no módulo Almoxarifado marcando a finalidade como "venda".</div></div>'
        : '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead>' +
          '<tr style="text-align:left;color:var(--text2);font-size:11px"><th style="padding:5px">Produto</th>' +
          '<th>Código de barras</th><th style="text-align:right">Saldo</th>' +
          '<th style="width:140px;text-align:right">Preço</th><th style="width:90px"></th></tr></thead><tbody>' +
          S.produtos.map((p) => '<tr style="border-top:1px solid var(--border)">' +
            '<td style="padding:6px 5px">' + esc(p.nome) +
            '<br><small style="color:var(--text2)">' + esc(p.codigo || '') +
            (p.finalidade === 'ambos' ? ' · também é almoxarifado' : '') + '</small></td>' +
            '<td><input class="nx-input" value="' + esc(p.codigo_barras || '') +
            '" placeholder="passe o leitor" data-cb="' + p.id + '" style="width:170px"></td>' +
            '<td style="text-align:right">' + p.quantidade + ' ' + esc(p.unidade || 'un') + '</td>' +
            '<td style="text-align:right"><input class="nx-input" type="number" step="0.01" min="0" value="' +
            (p.preco_venda != null ? p.preco_venda : '') + '" data-preco="' + p.id + '" style="width:120px"></td>' +
            '<td style="text-align:right"><button class="nx-btn nx-btn--sm" onclick="window.pdvSalvarProduto(\'' +
            p.id + '\')">Salvar</button></td></tr>').join('') + '</tbody></table>';

      const trazer = (almox && almox.length)
        ? '<div class="nx-panel" style="margin-top:16px"><div class="nx-panel-h"><div class="nx-panel-t">' +
          'Trazer do almoxarifado</div></div><div class="nx-panel-b">' +
          '<p style="font-size:12px;color:var(--text2);margin:0 0 10px">O item continua sendo o mesmo e o saldo é ' +
          'um só — ele passa a aparecer também no caixa.</p>' +
          '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">' +
          '<select class="nx-select" id="pdvAlmoxSel" style="min-width:280px">' +
          almox.map((a) => '<option value="' + a.id + '">' + esc(a.nome) + ' (saldo ' + a.quantidade + ')</option>').join('') +
          '</select>' +
          '<div><label style="font-size:11px;color:var(--text2)">Preço de venda</label>' +
          '<input class="nx-input" type="number" step="0.01" min="0" id="pdvAlmoxPreco" style="width:120px"></div>' +
          '<button class="nx-btn" onclick="window.pdvTrazerDoAlmoxarifado()">Colocar à venda</button>' +
          '</div></div></div>'
        : '';

      box.innerHTML = cab + tabela + trazer;
    } catch (e) {
      box.innerHTML = '<div class="nx-note"><div class="nx-note-t">Não deu para carregar os produtos</div>' +
        '<div class="nx-note-b">' + esc(motivo(e)) + '</div></div>';
    }
  };

  window.pdvSalvarProduto = async function (id) {
    if (!podeF('pdv.produtos')) {
      return aviso('Você não tem permissão para definir preço de venda ou código de barras.', 'erro');
    }
    try {
      const preco = document.querySelector('[data-preco="' + id + '"]');
      const cb = document.querySelector('[data-cb="' + id + '"]');
      const patch = {
        preco_venda: preco && preco.value !== '' ? num(preco.value) : null,
        codigo_barras: cb && cb.value.trim() ? cb.value.trim() : null,
      };
      const { error } = await sb().from('estoque_items').update(patch).eq('id', id);
      if (error) throw error;
      aviso('Produto atualizado.', 'ok');
      await window.pdvProdutosInit();
    } catch (e) { aviso(motivo(e), 'erro'); }
  };

  window.pdvTrazerDoAlmoxarifado = async function () {
    if (!podeF('pdv.produtos')) {
      return aviso('Você não tem permissão para colocar item à venda (precisa de "Definir preço").', 'erro');
    }
    try {
      const sel = el('pdvAlmoxSel');
      const preco = el('pdvAlmoxPreco');
      if (!sel || !sel.value) return aviso('Escolha o item.', 'erro');
      if (!preco || preco.value === '') return aviso('Informe o preço de venda.', 'erro');
      // 'ambos': continua servindo para uso interno E passa a aparecer no caixa.
      const { error } = await sb().from('estoque_items')
        .update({ finalidade: 'ambos', preco_venda: num(preco.value) }).eq('id', sel.value);
      if (error) throw error;
      aviso('Item colocado à venda.', 'ok');
      await window.pdvProdutosInit();
    } catch (e) { aviso(motivo(e), 'erro'); }
  };

  // ─────────────────────────────────────────────── vendas do dia
  window.pdvVendasInit = async function () {
    const box = el('pdvVendasBox');
    if (!box) return;
    box.innerHTML = '<div class="nx-empty"><div class="nx-empty-t">Carregando…</div></div>';
    try {
      if (!S.empresas.length) await carregarEmpresas();
      if (!S.empresaAtiva) {
        box.innerHTML = '<div class="nx-empty"><div class="nx-empty-t">Escolha a empresa no Caixa</div></div>';
        return;
      }
      const hoje = dataLocal();
      const lanc = await rpc('pdv_faturamento_lancamentos',
        { p_empresa_id: S.empresaAtiva, p_de: hoje, p_ate: hoje });
      const cab = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        seletorEmpresa() + '<button class="nx-btn nx-btn--sm" onclick="window.pdvVendasInit()">Atualizar</button></div>';
      if (!lanc.length) {
        box.innerHTML = cab + '<div class="nx-empty"><div class="nx-empty-t">Nenhuma venda hoje</div></div>';
        return;
      }
      box.innerHTML = cab + '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr style="text-align:left;color:var(--text2);font-size:11px">' +
        '<th style="padding:5px">Nº</th><th>Hora</th><th>Cliente</th><th>Operador</th>' +
        '<th>Pagamento</th><th style="text-align:right">Total</th><th></th></tr></thead><tbody>' +
        lanc.map((v) => '<tr style="border-top:1px solid var(--border)">' +
          '<td style="padding:6px 5px"><b>' + esc(v.numero) + '</b>' +
          (v.tipo === 'devolucao' ? '<br><small style="color:#dc2626">devolução de ' + esc(v.origem_numero || '') + '</small>' : '') + '</td>' +
          '<td>' + new Date(v.quando).toLocaleTimeString('pt-BR') + '</td>' +
          '<td>' + esc(v.cliente || '—') + '</td>' +
          '<td>' + esc(v.operador || '—') + '</td>' +
          '<td>' + esc(v.formas || '—') + (v.confirmacao ? '<br><small style="color:var(--text2)">' + esc(v.confirmacao) + '</small>' : '') + '</td>' +
          '<td style="text-align:right;font-weight:600' + (v.tipo === 'devolucao' ? ';color:#dc2626' : '') + '">' +
          (v.tipo === 'devolucao' ? '- ' : '') + moeda(v.total) + '</td>' +
          '<td style="text-align:right">' + (v.tipo === 'venda' && podeF('pdv.devolver') ?
            '<button class="nx-btn nx-btn--sm" onclick="window.pdvAbrirDevolucao(\'' + v.venda_id + '\',\'' + esc(v.numero) + '\')">Devolver</button>' : '') +
          '</td></tr>').join('') + '</tbody></table>';
    } catch (e) {
      box.innerHTML = '<div class="nx-note"><div class="nx-note-t">Não deu para carregar as vendas</div>' +
        '<div class="nx-note-b">' + esc(motivo(e)) + '</div></div>';
    }
  };

  window.pdvAbrirDevolucao = async function (vendaId, numero) {
    try {
      const { data: itens, error } = await sb().from('pdv_venda_itens')
        .select('id,item_nome,quantidade,total').eq('venda_id', vendaId);
      if (error) throw error;
      const corpo = '<p style="font-size:13px;color:var(--text2)">A venda ' + esc(numero) +
        ' <b>não é apagada nem alterada</b>. A devolução entra como lançamento próprio, ligado a ela, ' +
        'e devolve o saldo ao estoque com movimento registrado.</p>' +
        '<table style="width:100%;font-size:13px;border-collapse:collapse">' +
        itens.map((i) => '<tr style="border-top:1px solid var(--border)">' +
          '<td style="padding:6px 0">' + esc(i.item_nome) + '<br><small style="color:var(--text2)">vendido ' +
          i.quantidade + '</small></td><td style="width:110px">' +
          '<input class="nx-input" type="number" step="any" min="0" max="' + i.quantidade +
          '" value="0" data-dev="' + i.id + '" style="width:100px"></td></tr>').join('') + '</table>' +
        '<div style="margin-top:10px"><label style="font-size:11px;color:var(--text2)">Motivo</label>' +
        '<input class="nx-input" id="pdvDevMotivo" placeholder="por que está voltando" style="width:100%"></div>' +
        '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="nx-btn" onclick="window.pdvFecharModal()">Cancelar</button>' +
        '<button class="nx-btn nx-btn-primary" id="pdvBtnDev" onclick="window.pdvConfirmarDevolucao(\'' + vendaId + '\')">Confirmar devolução</button></div>';
      let m = el('pdvModal');
      if (m) m.remove();
      m = document.createElement('div');
      m.id = 'pdvModal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;' +
        'align-items:center;justify-content:center;padding:20px';
      m.innerHTML = '<div class="nx" style="background:var(--surface);border:1px solid var(--border);' +
        'border-radius:12px;max-width:560px;width:100%;max-height:90vh;overflow:auto;padding:20px">' +
        '<h3 style="margin:0 0 10px">Devolução da venda ' + esc(numero) + '</h3>' +
        '<div id="pdvModalBody">' + corpo + '</div></div>';
      document.body.appendChild(m);
    } catch (e) { aviso(motivo(e), 'erro'); }
  };

  window.pdvConfirmarDevolucao = async function (vendaId) {
    const btn = el('pdvBtnDev');
    if (btn) btn.disabled = true;
    try {
      const itens = [];
      document.querySelectorAll('[data-dev]').forEach((i) => {
        const q = num(i.value);
        if (q > 0) itens.push({ venda_item_id: i.getAttribute('data-dev'), quantidade: q });
      });
      if (!itens.length) { aviso('Informe a quantidade a devolver.', 'erro'); if (btn) btn.disabled = false; return; }
      const r = await rpc('pdv_devolver_venda', {
        p_venda_id: vendaId, p_itens: itens,
        p_motivo: (el('pdvDevMotivo') && el('pdvDevMotivo').value) || null,
        p_chave: 'dev:' + vendaId + ':' + Date.now(),
      });
      aviso('Devolução ' + r.numero + ' registrada — ' + moeda(r.total), 'ok');
      fecharModal();
      await carregarProdutos();
      window.pdvVendasInit();
    } catch (e) {
      aviso(motivo(e), 'erro');
      if (btn) btn.disabled = false;
    }
  };

  // ─────────────────────────────────────────────── faturamento
  const FAT = { visao: 'dia', de: null, ate: null, forma: '' };

  window.pdvFatVisao = function (v) {
    FAT.visao = v;
    const hoje = new Date();
    const iso = dataLocal;
    if (v === 'dia') { FAT.de = FAT.ate = iso(hoje); }
    else if (v === 'mes') { FAT.de = iso(new Date(hoje.getFullYear(), 0, 1)); FAT.ate = iso(new Date(hoje.getFullYear(), 11, 31)); }
    else if (v === 'ano') { FAT.de = iso(new Date(hoje.getFullYear() - 4, 0, 1)); FAT.ate = iso(new Date(hoje.getFullYear(), 11, 31)); }
    else if (v === 'produto') { FAT.de = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)); FAT.ate = iso(hoje); }
    else if (v === 'periodo') { if (!FAT.de) { FAT.de = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)); FAT.ate = iso(hoje); } }
    window.pdvFaturamentoInit();
  };

  window.pdvFatPeriodo = function () {
    FAT.de = (el('pdvFatDe') && el('pdvFatDe').value) || FAT.de;
    FAT.ate = (el('pdvFatAte') && el('pdvFatAte').value) || FAT.ate;
    FAT.forma = (el('pdvFatForma') && el('pdvFatForma').value) || '';
    window.pdvFaturamentoInit();
  };

  window.pdvFaturamentoInit = async function () {
    const box = el('pdvFatBox');
    if (!box) return;
    try {
      if (!S.empresas.length) await carregarEmpresas();
      if (!FAT.de) { const h = dataLocal(); FAT.de = FAT.ate = h; }
      if (!S.empresaAtiva) {
        box.innerHTML = '<div class="nx-empty"><div class="nx-empty-t">Escolha a empresa</div></div>';
        return;
      }
      const abas = [['dia', 'Diário'], ['periodo', 'Período'], ['mes', 'Mensal'], ['ano', 'Anual'], ['produto', 'Por produto']];
      const lateral = '<div style="min-width:150px;display:flex;flex-direction:column;gap:4px">' +
        abas.map(([k, n]) => '<button class="nx-btn nx-btn--sm' + (FAT.visao === k ? ' nx-btn-primary' : '') +
          '" style="text-align:left" onclick="window.pdvFatVisao(\'' + k + '\')">' + n + '</button>').join('') +
        '</div>';

      const filtros = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">' +
        seletorEmpresa() +
        '<div><label style="font-size:11px;color:var(--text2)">De</label><input class="nx-input" type="date" id="pdvFatDe" value="' + FAT.de + '"></div>' +
        '<div><label style="font-size:11px;color:var(--text2)">Até</label><input class="nx-input" type="date" id="pdvFatAte" value="' + FAT.ate + '"></div>' +
        '<div><label style="font-size:11px;color:var(--text2)">Forma</label><select class="nx-select" id="pdvFatForma">' +
        ['', 'dinheiro', 'pix', 'credito', 'debito', 'transferencia', 'outro'].map((f) =>
          '<option value="' + f + '"' + (FAT.forma === f ? ' selected' : '') + '>' + (f || 'todas') + '</option>').join('') +
        '</select></div>' +
        '<button class="nx-btn nx-btn--sm" onclick="window.pdvFatPeriodo()">Aplicar</button></div>';

      let conteudo;
      if (FAT.visao === 'produto') {
        const prod = await rpc('pdv_faturamento_por_produto',
          { p_empresa_id: S.empresaAtiva, p_de: FAT.de, p_ate: FAT.ate, p_forma: FAT.forma || null });
        conteudo = !prod.length ? '<div class="nx-empty"><div class="nx-empty-t">Nada no período</div></div>' :
          '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead>' +
          '<tr style="text-align:left;color:var(--text2);font-size:11px"><th style="padding:5px">Produto</th>' +
          '<th style="text-align:right">Vendida</th><th style="text-align:right">Devolvida</th>' +
          '<th style="text-align:right">Bruto</th><th style="text-align:right">Devoluções</th>' +
          '<th style="text-align:right">Líquido</th></tr></thead><tbody>' +
          prod.map((p) => '<tr style="border-top:1px solid var(--border);cursor:pointer"' +
            ' onclick="window.pdvFatLancamentos(\'' + p.item_id + '\')" title="ver os lançamentos">' +
            '<td style="padding:6px 5px">' + esc(p.item_nome) + '<br><small style="color:var(--text2)">' + esc(p.item_codigo || '') + '</small></td>' +
            '<td style="text-align:right">' + p.qtd_vendida + '</td>' +
            '<td style="text-align:right">' + p.qtd_devolvida + '</td>' +
            '<td style="text-align:right">' + moeda(p.bruto) + '</td>' +
            '<td style="text-align:right;color:#dc2626">' + moeda(p.devolucoes) + '</td>' +
            '<td style="text-align:right;font-weight:600">' + moeda(p.liquido) + '</td></tr>').join('') +
          '</tbody></table>';
      } else {
        const gran = FAT.visao === 'mes' ? 'mes' : (FAT.visao === 'ano' ? 'ano' : 'dia');
        const res = await rpc('pdv_faturamento_resumo',
          { p_empresa_id: S.empresaAtiva, p_de: FAT.de, p_ate: FAT.ate, p_granularidade: gran, p_forma: FAT.forma || null });
        const tot = res.reduce((a, r) => ({
          bruto: a.bruto + Number(r.bruto), desc: a.desc + Number(r.descontos),
          dev: a.dev + Number(r.devolucoes), liq: a.liq + Number(r.liquido),
          vendas: a.vendas + Number(r.vendas),
        }), { bruto: 0, desc: 0, dev: 0, liq: 0, vendas: 0 });
        conteudo =
          '<div class="nx-kpis"><div class="nx-kpi"><span>Vendas</span><b>' + tot.vendas + '</b></div>' +
          '<div class="nx-kpi"><span>Bruto</span><b>' + moeda(tot.bruto) + '</b></div>' +
          '<div class="nx-kpi"><span>Descontos</span><b>' + moeda(tot.desc) + '</b></div>' +
          '<div class="nx-kpi"><span>Devoluções</span><b style="color:#dc2626">' + moeda(tot.dev) + '</b></div>' +
          '<div class="nx-kpi"><span>Líquido</span><b style="font-size:20px">' + moeda(tot.liq) + '</b></div></div>' +
          (!res.length ? '<div class="nx-empty" style="margin-top:10px"><div class="nx-empty-t">Nada no período</div></div>' :
            '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px"><thead>' +
            '<tr style="text-align:left;color:var(--text2);font-size:11px"><th style="padding:5px">Período</th>' +
            '<th style="text-align:right">Vendas</th><th style="text-align:right">Itens</th>' +
            '<th style="text-align:right">Bruto</th><th style="text-align:right">Descontos</th>' +
            '<th style="text-align:right">Devoluções</th><th style="text-align:right">Líquido</th>' +
            '<th style="text-align:right">Confirmado pela integração</th></tr></thead><tbody>' +
            res.map((r) => '<tr style="border-top:1px solid var(--border);cursor:pointer"' +
              ' onclick="window.pdvFatLancamentos(null,\'' + r.periodo + '\')" title="ver os lançamentos">' +
              '<td style="padding:6px 5px">' + esc(r.periodo) + '</td>' +
              '<td style="text-align:right">' + r.vendas + '</td>' +
              '<td style="text-align:right">' + r.itens + '</td>' +
              '<td style="text-align:right">' + moeda(r.bruto) + '</td>' +
              '<td style="text-align:right">' + moeda(r.descontos) + '</td>' +
              '<td style="text-align:right;color:#dc2626">' + moeda(r.devolucoes) + '</td>' +
              '<td style="text-align:right;font-weight:600">' + moeda(r.liquido) + '</td>' +
              '<td style="text-align:right">' + moeda(r.por_integracao) + '</td></tr>').join('') +
            '</tbody></table>' +
            '<p style="font-size:11px;color:var(--text2);margin-top:8px">Clique em qualquer linha para abrir os ' +
            'lançamentos que formam o total. "Confirmado pela integração" separa o que a maquininha respondeu do ' +
            'que alguém registrou no caixa.</p>');
      }
      box.innerHTML = filtros + '<div style="display:flex;gap:14px;align-items:flex-start">' + lateral +
        '<div style="flex:1;min-width:0">' + conteudo + '</div></div>';
    } catch (e) {
      box.innerHTML = '<div class="nx-note"><div class="nx-note-t">Não deu para montar o faturamento</div>' +
        '<div class="nx-note-b">' + esc(motivo(e)) + '</div></div>';
    }
  };

  window.pdvFatLancamentos = async function (itemId, periodo) {
    try {
      const de = periodo && FAT.visao === 'dia' ? periodo : FAT.de;
      const ate = periodo && FAT.visao === 'dia' ? periodo : FAT.ate;
      const lanc = await rpc('pdv_faturamento_lancamentos', {
        p_empresa_id: S.empresaAtiva, p_de: de, p_ate: ate,
        p_forma: FAT.forma || null, p_item_id: itemId || null,
      });
      const corpo = !lanc.length ? '<div class="nx-empty"><div class="nx-empty-t">Nenhum lançamento</div></div>' :
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        lanc.map((v) => '<tr style="border-top:1px solid var(--border)">' +
          '<td style="padding:6px 0"><b>' + esc(v.numero) + '</b>' +
          (v.tipo === 'devolucao' ? ' <small style="color:#dc2626">(devolução de ' + esc(v.origem_numero || '') + ')</small>' : '') +
          '<br><small style="color:var(--text2)">' + new Date(v.quando).toLocaleString('pt-BR') +
          ' · ' + esc(v.operador || '') + '</small></td>' +
          '<td>' + esc(v.formas || '—') + '</td>' +
          '<td style="text-align:right;font-weight:600' + (v.tipo === 'devolucao' ? ';color:#dc2626' : '') + '">' +
          (v.tipo === 'devolucao' ? '- ' : '') + moeda(v.total) + '</td></tr>').join('') + '</table>';
      let m = el('pdvModal');
      if (m) m.remove();
      m = document.createElement('div');
      m.id = 'pdvModal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;' +
        'align-items:center;justify-content:center;padding:20px';
      m.innerHTML = '<div class="nx" style="background:var(--surface);border:1px solid var(--border);' +
        'border-radius:12px;max-width:680px;width:100%;max-height:90vh;overflow:auto;padding:20px">' +
        '<h3 style="margin:0 0 10px">Lançamentos · ' + esc(de) + (de !== ate ? ' a ' + esc(ate) : '') + '</h3>' +
        corpo + '<div style="margin-top:14px;text-align:right">' +
        '<button class="nx-btn" onclick="window.pdvFecharModal()">Fechar</button></div></div>';
      document.body.appendChild(m);
    } catch (e) { aviso(motivo(e), 'erro'); }
  };

  // ─────────────────────────────────────────────── entrada do módulo
  window.pdvInit = async function () {
    const box = el('pdvCaixaBox');
    if (!box) return;
    box.innerHTML = '<div class="nx-empty"><div class="nx-empty-t">Carregando…</div></div>';
    try {
      await carregarEmpresas();
      atualizarBarraEmpresa();
      await carregarProdutos();
      renderCaixa();
    } catch (e) {
      box.innerHTML = '<div class="nx-note"><div class="nx-note-t">Não deu para abrir o caixa</div>' +
        '<div class="nx-note-b">' + esc(motivo(e)) + '</div></div>';
    }
  };

  document.addEventListener('keydown', ouvirLeitor, true);
})();
