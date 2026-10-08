// ==========================================================================
// ABA RH-FOLHA
//
// Extraido do index.html em 22/08/2026 (linhas 43376-43804).
// So o JS saiu; o HTML continua no #tab-rh-folha. A IIFE foi mantida de
// proposito (ver tests/smoke/README.md e a memoria do split).
//
// expoe  -> _rhFolhaDelete, _rhFolhaImprimir, _rhFolhaSave, _rhLancAdd, _rhLancDelete, _rhLancUpdate, rhFolhaGerarMassa, rhFolhaInit, rhFolhaListRender, rhFolhaOpenModal
// consome-> window._currentUserData, window.open, window.print, window.sb, window.toastError, window.toastSuccess, window.toastWarning
// ==========================================================================
(function(){
  const esc = (s) => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtBRL = (n) => 'R$ ' + (Number(n)||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s+'T00:00:00'); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR'); };
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  let _holeritesCache = [];
  let _funcionariosCache = []; // pra pré-popular novo holerite

  const STATUS = {
    rascunho:   { l:'Rascunho',   c:'#94a3b8' },
    finalizado: { l:'Finalizado', c:'#0891b2' },
    pago:       { l:'Pago',       c:'#16a34a' },
    cancelado:  { l:'Cancelado',  c:'#dc2626' },
  };

  // Template default de lançamentos quando cria holerite a partir do salário do funcionário
  function _gerarLancamentosTemplate(salario) {
    const sal = Number(salario) || 0;
    if (!sal) return [];
    // INSS — alíquota efetiva ~7.5/9/12/14 progressiva. Pra MVP, calcula INSS 2026 simplificado:
    const inss = _calcInss2026(sal);
    const irrf = _calcIrrf2026(sal - inss);
    const fgts = +(sal * 0.08).toFixed(2);
    return [
      { tipo:'provento', codigo:'001', descricao:'Salário base',     referencia:'30 dias', base_calculo: sal, valor: sal, ordem: 10 },
      { tipo:'desconto', codigo:'201', descricao:'INSS',             referencia:_inssAlqStr(sal), base_calculo: sal, valor: inss, ordem: 90 },
      { tipo:'desconto', codigo:'211', descricao:'IRRF',             referencia:_irrfAlqStr(sal-inss), base_calculo: +(sal-inss).toFixed(2), valor: irrf, ordem: 91 },
      { tipo:'info',     codigo:'901', descricao:'Base FGTS',        base_calculo: sal, valor: sal,  ordem: 200 },
      { tipo:'info',     codigo:'911', descricao:'FGTS do mês (8%)', base_calculo: sal, valor: fgts, ordem: 201 },
    ];
  }

  // INSS 2026 simplificado (faixas progressivas — valor da contribuição)
  function _calcInss2026(base) {
    const f = [
      { ate: 1518.00,   alq: 0.075, ded: 0     },
      { ate: 2793.88,   alq: 0.09,  ded: 22.77 },
      { ate: 4190.83,   alq: 0.12,  ded: 106.59 },
      { ate: 8157.41,   alq: 0.14,  ded: 190.40 },
    ];
    const teto = 8157.41;
    let b = Math.min(base, teto);
    for (const x of f) if (b <= x.ate) return +(b * x.alq - x.ded).toFixed(2);
    return +(teto * 0.14 - 190.40).toFixed(2);
  }
  function _inssAlqStr(base) {
    if (base <= 1518)    return '7.5%';
    if (base <= 2793.88) return '9%';
    if (base <= 4190.83) return '12%';
    return '14%';
  }

  // IRRF 2026 simplificado (faixas mensais)
  function _calcIrrf2026(base) {
    const f = [
      { ate: 2428.80,   alq: 0,     ded: 0      },
      { ate: 2826.65,   alq: 0.075, ded: 182.16 },
      { ate: 3751.05,   alq: 0.15,  ded: 394.16 },
      { ate: 4664.68,   alq: 0.225, ded: 675.49 },
    ];
    for (const x of f) if (base <= x.ate) {
      const v = base * x.alq - x.ded;
      return v > 0 ? +v.toFixed(2) : 0;
    }
    return +(base * 0.275 - 908.73).toFixed(2);
  }
  function _irrfAlqStr(base) {
    if (base <= 2428.80) return 'Isento';
    if (base <= 2826.65) return '7.5%';
    if (base <= 3751.05) return '15%';
    if (base <= 4664.68) return '22.5%';
    return '27.5%';
  }

  // ──────────────────────────────────────────────────
  // Lista
  // ──────────────────────────────────────────────────
  window.rhFolhaInit = async () => {
    const list = document.getElementById('rhFolhaList');
    if (!list) return;
    _initSelectorMesAno();
    list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px">Carregando…</div>';
    try {
      const mes = parseInt(document.getElementById('rhFolhaMes')?.value) || (new Date().getMonth()+1);
      const ano = parseInt(document.getElementById('rhFolhaAno')?.value) || new Date().getFullYear();
      const [hRes, fRes] = await Promise.all([
        window.sb.from('rh_holerites').select('*').eq('mes_ref', mes).eq('ano_ref', ano).order('funcionario_nome'),
        window.sb.from('rh_funcionarios').select('id,nome,codigo,cargo,departamento,salario,modalidade,status').eq('status','ativo').order('nome'),
      ]);
      if (hRes.error) throw hRes.error;
      _holeritesCache = hRes.data || [];
      _funcionariosCache = fRes.data || [];
      _renderFolhaKpis();
      window.rhFolhaListRender();
    } catch (e) {
      list.innerHTML = '<div style="padding:30px;text-align:center;color:#dc2626;font-size:13px">Erro: '+esc(e.message)+'</div>';
    }
  };

  function _initSelectorMesAno() {
    const sm = document.getElementById('rhFolhaMes');
    const sa = document.getElementById('rhFolhaAno');
    if (!sm || !sa) return;
    if (sm.options.length) return; // já populado
    const hoje = new Date();
    const mAtu = hoje.getMonth()+1; const aAtu = hoje.getFullYear();
    sm.innerHTML = MESES.map((n,i)=>'<option value="'+(i+1)+'"'+((i+1)===mAtu?' selected':'')+'>'+n+'</option>').join('');
    const anos = []; for (let a=aAtu+1; a>=aAtu-5; a--) anos.push(a);
    sa.innerHTML = anos.map(a=>'<option value="'+a+'"'+(a===aAtu?' selected':'')+'>'+a+'</option>').join('');
  }

  function _renderFolhaKpis() {
    const k = document.getElementById('rhFolhaKpis'); if (!k) return;
    const total = _holeritesCache.length;
    const prov = _holeritesCache.reduce((s,h)=>s+(Number(h.total_proventos)||0),0);
    const desc = _holeritesCache.reduce((s,h)=>s+(Number(h.total_descontos)||0),0);
    const liq  = _holeritesCache.reduce((s,h)=>s+(Number(h.total_liquido)||0),0);
    const fgts = _holeritesCache.reduce((s,h)=>{
      const base = Number(h.total_proventos)||0;
      return s + +(base*0.08).toFixed(2);
    },0);
    const tile = (l, v, c) => '<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px"><div style="font-size:10px;color:var(--text3);font-weight:600;letter-spacing:.5px">'+l+'</div><div style="font-size:18px;font-weight:700;color:'+c+';margin-top:2px">'+v+'</div></div>';
    k.innerHTML = tile('HOLERITES', total, 'var(--text)') + tile('PROVENTOS', fmtBRL(prov), '#16a34a') + tile('DESCONTOS', fmtBRL(desc), '#dc2626') + tile('LÍQUIDO', fmtBRL(liq), 'var(--accent)') + tile('FGTS (8%)', fmtBRL(fgts), '#7c3aed');
  }

  window.rhFolhaListRender = () => {
    const list = document.getElementById('rhFolhaList'); if (!list) return;
    const q = (document.getElementById('rhFolhaFiltroBusca')?.value || '').toLowerCase().trim();
    const st = document.getElementById('rhFolhaFiltroStatus')?.value || '';
    let arr = _holeritesCache.slice();
    if (q) arr = arr.filter(h => (h.funcionario_nome||'').toLowerCase().includes(q) || (h.codigo||'').toLowerCase().includes(q) || (h.funcionario_cargo||'').toLowerCase().includes(q));
    if (st) arr = arr.filter(h => h.status === st);
    if (!arr.length) { list.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;background:var(--surface2);border-radius:8px">Nenhum holerite pra esta competência. Use "Gerar p/ todos" pra criar em massa ou "+ Novo holerite" pra adicionar individual.</div>'; return; }
    list.innerHTML = arr.map(h => {
      const s = STATUS[h.status] || STATUS.rascunho;
      return '<div onclick="window.rhFolhaOpenModal(\''+esc(h.id)+'\')" style="background:var(--surface);border-radius:8px;border:1px solid var(--border);padding:12px 16px;cursor:pointer;display:grid;grid-template-columns:90px 1fr 110px 110px 130px 90px;gap:12px;align-items:center;transition:border-color .15s" onmouseover="this.style.borderColor=\'var(--accent)\'" onmouseout="this.style.borderColor=\'var(--border)\'">'
        + '<div><div style="font-size:11px;color:var(--text3);font-weight:600">'+esc(h.codigo||'')+'</div><div style="font-size:10px;color:var(--text3)">'+esc(h.competencia||'')+'</div></div>'
        + '<div><div style="font-size:13px;font-weight:600;color:var(--text)">'+esc(h.funcionario_nome||'')+'</div><div style="font-size:11px;color:var(--text2)">'+esc(h.funcionario_cargo||'')+(h.funcionario_dept?' · '+esc(h.funcionario_dept):'')+'</div></div>'
        + '<div style="text-align:right"><div style="font-size:9px;color:var(--text3);letter-spacing:.5px">PROV</div><div style="font-size:13px;font-weight:600;color:#16a34a">'+fmtBRL(h.total_proventos)+'</div></div>'
        + '<div style="text-align:right"><div style="font-size:9px;color:var(--text3);letter-spacing:.5px">DESC</div><div style="font-size:13px;font-weight:600;color:#dc2626">'+fmtBRL(h.total_descontos)+'</div></div>'
        + '<div style="text-align:right"><div style="font-size:9px;color:var(--text3);letter-spacing:.5px">LÍQUIDO</div><div style="font-size:14px;font-weight:700;color:var(--accent)">'+fmtBRL(h.total_liquido)+'</div></div>'
        + '<div style="text-align:right"><span style="font-size:10px;font-weight:700;background:'+s.c+'22;color:'+s.c+';padding:3px 9px;border-radius:10px;letter-spacing:.4px;text-transform:uppercase">'+s.l+'</span></div>'
      + '</div>';
    }).join('');
  };

  // ──────────────────────────────────────────────────
  // Modal
  // ──────────────────────────────────────────────────
  window.rhFolhaOpenModal = async (id) => {
    let h = id ? _holeritesCache.find(x => x.id === id) : null;
    let lancs = [];
    if (id) {
      const { data: ls } = await window.sb.from('rh_lancamentos').select('*').eq('holerite_id', id).order('tipo').order('ordem');
      lancs = ls || [];
    }
    const mes = parseInt(document.getElementById('rhFolhaMes')?.value) || (new Date().getMonth()+1);
    const ano = parseInt(document.getElementById('rhFolhaAno')?.value) || new Date().getFullYear();
    const mid = 'modalHol' + Date.now();
    // Lista de funcionários ativos pro select (só pra novo)
    const funcOptions = _funcionariosCache.map(f => '<option value="'+esc(f.id)+'">'+esc(f.nome)+(f.codigo?' · '+esc(f.codigo):'')+'</option>').join('');
    const html = '<div id="'+mid+'" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto" onclick="if(event.target.id===\''+mid+'\') document.getElementById(\''+mid+'\').remove()">'
      + '<div style="background:var(--surface);border-radius:12px;width:100%;max-width:1100px;border:1px solid var(--border);margin:auto">'
      +   '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--surface);z-index:1;border-radius:12px 12px 0 0">'
      +     '<div style="font-size:16px;font-weight:700">'+(h?'Holerite · '+esc(h.codigo)+' · '+esc(h.funcionario_nome)+' · '+esc(h.competencia):'Novo holerite · '+MESES[mes-1]+'/'+ano)+'</div>'
      +     '<button onclick="document.getElementById(\''+mid+'\').remove();window.rhFolhaInit()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer">×</button>'
      +   '</div>'
      +   '<div style="padding:20px 22px">'
      +     '<div id="'+mid+'_alert" style="display:none;padding:10px 14px;background:var(--red-l);border:1px solid var(--red);border-radius:6px;font-size:12px;color:var(--red);margin-bottom:14px"></div>'
      +     (h
        ? '<div style="display:grid;grid-template-columns:1fr 140px 140px 160px;gap:10px;margin-bottom:14px">'
          + '<div style="background:var(--surface2);border-radius:6px;padding:10px 14px"><div style="font-size:10px;color:var(--text3);letter-spacing:.5px">FUNCIONÁRIO</div><div style="font-size:13px;font-weight:600">'+esc(h.funcionario_nome)+'</div><div style="font-size:11px;color:var(--text2)">'+esc(h.funcionario_cargo||'')+(h.funcionario_dept?' · '+esc(h.funcionario_dept):'')+'</div></div>'
          + '<div><label style="font-size:11px;color:var(--text3)">Status</label><select id="'+mid+'_status" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)">'+Object.entries(STATUS).map(([k,v])=>'<option value="'+k+'"'+(h.status===k?' selected':'')+'>'+v.l+'</option>').join('')+'</select></div>'
          + '<div><label style="font-size:11px;color:var(--text3)">Data pagamento</label><input id="'+mid+'_datapg" type="date" value="'+esc(h.data_pagamento||'')+'" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
          + '<div><button onclick="window._rhFolhaImprimir(\''+esc(h.id)+'\')" style="width:100%;padding:8px;background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent);border-radius:6px;font-size:12px;cursor:pointer;font-weight:600">🖨 Holerite</button></div>'
          + '</div>'
        : '<div style="display:grid;grid-template-columns:1fr 140px 140px;gap:10px;margin-bottom:14px">'
          + '<div><label style="font-size:11px;color:var(--text3)">Funcionário *</label><select id="'+mid+'_funcsel" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"><option value="">— selecione —</option>'+funcOptions+'</select></div>'
          + '<div><label style="font-size:11px;color:var(--text3)">Mês</label><select id="'+mid+'_mesnov" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)">'+MESES.map((n,i)=>'<option value="'+(i+1)+'"'+((i+1)===mes?' selected':'')+'>'+n+'</option>').join('')+'</select></div>'
          + '<div><label style="font-size:11px;color:var(--text3)">Ano</label><input id="'+mid+'_anonov" type="number" value="'+ano+'" min="2000" max="2100" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
          + '</div>'
          + '<div style="background:var(--accent-soft);border:1px solid var(--accent);border-radius:6px;padding:10px 14px;font-size:12px;color:var(--text2);margin-bottom:14px">Ao salvar, o holerite vai ser pré-populado com os lançamentos padrão (Salário, INSS, IRRF, Base FGTS, FGTS) usando o salário cadastrado do funcionário. Você pode editar ou adicionar lançamentos depois.</div>')
      +     (h
        ? '<div style="border-top:1px solid var(--border);padding-top:14px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
          +   '<div style="font-size:13px;font-weight:700">Lançamentos</div>'
          +   '<div style="display:flex;gap:6px">'
          +     '<button onclick="window._rhLancAdd(\''+esc(h.id)+'\',\'provento\',\''+mid+'\')" style="background:#16a34a22;color:#16a34a;border:1px solid #16a34a;border-radius:5px;padding:5px 11px;font-size:11px;cursor:pointer;font-weight:600">+ Provento</button>'
          +     '<button onclick="window._rhLancAdd(\''+esc(h.id)+'\',\'desconto\',\''+mid+'\')" style="background:#dc262622;color:#dc2626;border:1px solid #dc2626;border-radius:5px;padding:5px 11px;font-size:11px;cursor:pointer;font-weight:600">+ Desconto</button>'
          +     '<button onclick="window._rhLancAdd(\''+esc(h.id)+'\',\'info\',\''+mid+'\')" style="background:var(--surface2);color:var(--text2);border:1px solid var(--border);border-radius:5px;padding:5px 11px;font-size:11px;cursor:pointer;font-weight:600">+ Informativo</button>'
          +   '</div>'
          + '</div>'
          + '<div id="'+mid+'_lancs">'+_renderLancs(lancs, mid)+'</div>'
          + '<div style="margin-top:14px;padding:14px 18px;background:var(--surface2);border-radius:8px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">'
          +   '<div><div style="font-size:10px;color:var(--text3);letter-spacing:.5px">PROVENTOS</div><div style="font-size:18px;font-weight:700;color:#16a34a">'+fmtBRL(h.total_proventos)+'</div></div>'
          +   '<div><div style="font-size:10px;color:var(--text3);letter-spacing:.5px">DESCONTOS</div><div style="font-size:18px;font-weight:700;color:#dc2626">'+fmtBRL(h.total_descontos)+'</div></div>'
          +   '<div style="text-align:right"><div style="font-size:10px;color:var(--text3);letter-spacing:.5px">LÍQUIDO</div><div style="font-size:22px;font-weight:700;color:var(--accent)">'+fmtBRL(h.total_liquido)+'</div></div>'
          + '</div>'
          + (h.observacoes !== null && h.observacoes !== undefined ? '<div style="margin-top:14px"><label style="font-size:11px;color:var(--text3)">Observações</label><textarea id="'+mid+'_obs" rows="2" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical;font-family:inherit">'+esc(h.observacoes||'')+'</textarea></div>' : '<div style="margin-top:14px"><label style="font-size:11px;color:var(--text3)">Observações</label><textarea id="'+mid+'_obs" rows="2" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical;font-family:inherit"></textarea></div>')
        + '</div>'
        : '')
      +   '</div>'
      +   '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;position:sticky;bottom:0;background:var(--surface);border-radius:0 0 12px 12px">'
      +     '<div>'+(h?'<button onclick="window._rhFolhaDelete(\''+esc(h.id)+'\',\''+mid+'\')" style="background:var(--red-l);color:var(--red);border:1px solid var(--red);padding:8px 14px;border-radius:6px;font-size:12px;cursor:pointer">Excluir holerite</button>':'')+'</div>'
      +     '<div style="display:flex;gap:8px">'
      +       '<button onclick="document.getElementById(\''+mid+'\').remove();window.rhFolhaInit()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px">Fechar</button>'
      +       '<button onclick="window._rhFolhaSave(\''+(h?esc(h.id):'')+'\',\''+mid+'\')" style="background:var(--accent);color:#fff;padding:9px 22px;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">'+(h?'Salvar':'Criar')+'</button>'
      +     '</div>'
      +   '</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  };

  function _renderLancs(lancs, mid) {
    const SECT = [
      { tipo:'provento', label:'Proventos',     cor:'#16a34a' },
      { tipo:'desconto', label:'Descontos',     cor:'#dc2626' },
      { tipo:'info',     label:'Informativos',  cor:'#7c3aed' },
    ];
    return SECT.map(s => {
      const arr = lancs.filter(l => l.tipo === s.tipo);
      if (!arr.length) return '<div style="margin-bottom:10px;padding:8px 12px;background:var(--surface2);border-radius:6px;font-size:11px;color:var(--text3)">Nenhum '+s.label.toLowerCase()+'.</div>';
      return '<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;color:'+s.cor+';letter-spacing:.4px;margin-bottom:6px">'+s.label.toUpperCase()+'</div>'
        + '<div style="display:grid;grid-template-columns:60px 1fr 90px 110px 110px 130px 30px;gap:6px;padding:4px 8px;font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.5px;text-transform:uppercase">'
        +   '<div>Cód.</div><div>Descrição</div><div>Ref.</div><div style="text-align:right">Base</div><div style="text-align:right">Qtd/%</div><div style="text-align:right">Valor</div><div></div>'
        + '</div>'
        + arr.map(l => '<div data-l-id="'+esc(l.id)+'" style="display:grid;grid-template-columns:60px 1fr 90px 110px 110px 130px 30px;gap:6px;align-items:center;padding:5px 8px;background:var(--surface);border-radius:5px;margin-bottom:3px;border:1px solid var(--border)">'
          + '<input type="text" value="'+esc(l.codigo||'')+'" onblur="window._rhLancUpdate(\''+esc(l.id)+'\',\'codigo\',this.value,\''+mid+'\')" style="border:none;background:transparent;font-size:11px;color:var(--text2);outline:none;padding:3px;font-family:monospace">'
          + '<input type="text" value="'+esc(l.descricao||'')+'" onblur="window._rhLancUpdate(\''+esc(l.id)+'\',\'descricao\',this.value,\''+mid+'\')" style="border:none;background:transparent;font-size:12px;color:var(--text);outline:none;padding:3px">'
          + '<input type="text" value="'+esc(l.referencia||'')+'" onblur="window._rhLancUpdate(\''+esc(l.id)+'\',\'referencia\',this.value,\''+mid+'\')" placeholder="—" style="border:none;background:transparent;font-size:11px;color:var(--text2);outline:none;padding:3px">'
          + '<input type="number" step="0.01" value="'+(l.base_calculo!=null?Number(l.base_calculo):'')+'" onblur="window._rhLancUpdate(\''+esc(l.id)+'\',\'base_calculo\',this.value===\'\'?null:Number(this.value),\''+mid+'\')" style="border:none;background:transparent;font-size:11px;color:var(--text2);outline:none;padding:3px;text-align:right">'
          + '<input type="number" step="0.0001" value="'+(l.quantidade!=null?Number(l.quantidade):'')+'" onblur="window._rhLancUpdate(\''+esc(l.id)+'\',\'quantidade\',this.value===\'\'?null:Number(this.value),\''+mid+'\')" style="border:none;background:transparent;font-size:11px;color:var(--text2);outline:none;padding:3px;text-align:right">'
          + '<input type="number" step="0.01" value="'+(Number(l.valor)||0)+'" onblur="window._rhLancUpdate(\''+esc(l.id)+'\',\'valor\',Number(this.value)||0,\''+mid+'\')" style="border:none;background:transparent;font-size:12px;color:'+s.cor+';font-weight:700;outline:none;padding:3px;text-align:right">'
          + '<button onclick="window._rhLancDelete(\''+esc(l.id)+'\',\''+mid+'\')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:13px">×</button>'
          + '</div>').join('')
      + '</div>';
    }).join('');
  }

  // ──────────────────────────────────────────────────
  // Save / Delete / Lancamentos CRUD
  // ──────────────────────────────────────────────────
  window._rhFolhaSave = async (id, mid) => {
    const get = (k) => document.getElementById(mid+'_'+k)?.value || '';
    const alert_ = (msg) => { const a = document.getElementById(mid+'_alert'); if (a){a.textContent=msg;a.style.display='block';setTimeout(()=>a.style.display='none',5000);} };
    if (id) {
      const payload = {
        status: get('status') || 'rascunho',
        data_pagamento: get('datapg') || null,
        observacoes: get('obs').trim() || null,
        atualizado_em: new Date().toISOString(),
      };
      const { error } = await window.sb.from('rh_holerites').update(payload).eq('id', id);
      if (error) return alert_('Erro: '+error.message);
      window.toastSuccess?.('Holerite salvo');
      document.getElementById(mid)?.remove();
      window.rhFolhaInit();
    } else {
      const funcId = get('funcsel'); if (!funcId) return alert_('Selecione um funcionário.');
      const mes = parseInt(get('mesnov')); const ano = parseInt(get('anonov'));
      if (!mes || !ano) return alert_('Mês/ano inválidos.');
      const f = _funcionariosCache.find(x => x.id === funcId);
      if (!f) return alert_('Funcionário não encontrado.');
      const payload = {
        tenant_id: window._currentUserData?.tenant_id,
        funcionario_id: funcId,
        mes_ref: mes, ano_ref: ano,
        funcionario_nome: f.nome, funcionario_cargo: f.cargo,
        funcionario_dept: f.departamento, funcionario_matricula: null,
        status: 'rascunho',
      };
      const { data: hol, error } = await window.sb.from('rh_holerites').insert(payload).select().single();
      if (error) {
        if (String(error.message||'').includes('rh_holerites_unique_mes')) return alert_('Já existe holerite deste funcionário neste mês.');
        return alert_('Erro: '+error.message);
      }
      // Pré-popula lançamentos a partir do salário
      const lancs = _gerarLancamentosTemplate(f.salario);
      if (lancs.length) {
        const rows = lancs.map(l => ({ ...l, holerite_id: hol.id }));
        await window.sb.from('rh_lancamentos').insert(rows);
      }
      window.toastSuccess?.('Holerite criado');
      document.getElementById(mid)?.remove();
      await window.rhFolhaInit();
      window.rhFolhaOpenModal(hol.id);
    }
  };

  window._rhFolhaDelete = async (id, mid) => {
    if (!await nexusConfirm('Excluir este holerite e todos os lançamentos?')) return;
    const { error } = await window.sb.from('rh_holerites').delete().eq('id', id);
    if (error) return nexusAlert('Erro: '+error.message);
    window.toastSuccess?.('Holerite excluído');
    document.getElementById(mid)?.remove();
    window.rhFolhaInit();
  };

  window._rhLancAdd = async (holeriteId, tipo, mid) => {
    const ord = Date.now();
    const { error } = await window.sb.from('rh_lancamentos').insert({
      holerite_id: holeriteId, tipo, codigo: '', descricao: tipo==='provento'?'Novo provento':tipo==='desconto'?'Novo desconto':'Informativo',
      valor: 0, ordem: ord,
    });
    if (error) return nexusAlert('Erro: '+error.message);
    document.getElementById(mid)?.remove();
    await window.rhFolhaInit();
    window.rhFolhaOpenModal(holeriteId);
  };

  window._rhLancUpdate = async (id, field, value, mid) => {
    const upd = {}; upd[field] = value;
    const { error } = await window.sb.from('rh_lancamentos').update(upd).eq('id', id);
    if (error) { window.toastError?.('Erro: '+error.message); return; }
    // Se mudou valor, recarrega o modal pra atualizar totais
    if (field === 'valor') {
      const hdr = document.querySelector('#'+mid+' div[style*="font-size:16px"]')?.textContent || '';
      const match = hdr.match(/HOL-\d+/);
      if (match) {
        const cached = _holeritesCache.find(x => x.codigo === match[0]);
        if (cached) { document.getElementById(mid)?.remove(); await window.rhFolhaInit(); window.rhFolhaOpenModal(cached.id); }
      }
    }
  };

  window._rhLancDelete = async (id, mid) => {
    const { error } = await window.sb.from('rh_lancamentos').delete().eq('id', id);
    if (error) return nexusAlert('Erro: '+error.message);
    const hdr = document.querySelector('#'+mid+' div[style*="font-size:16px"]')?.textContent || '';
    const match = hdr.match(/HOL-\d+/);
    if (match) {
      const cached = _holeritesCache.find(x => x.codigo === match[0]);
      if (cached) { document.getElementById(mid)?.remove(); await window.rhFolhaInit(); window.rhFolhaOpenModal(cached.id); }
    }
  };

  // ──────────────────────────────────────────────────
  // Geração em massa
  // ──────────────────────────────────────────────────
  window.rhFolhaGerarMassa = async () => {
    const mes = parseInt(document.getElementById('rhFolhaMes')?.value);
    const ano = parseInt(document.getElementById('rhFolhaAno')?.value);
    if (!mes || !ano) return;
    if (!_funcionariosCache.length) return window.toastWarning?.('Nenhum funcionário ativo');
    const semSalario = _funcionariosCache.filter(f => !Number(f.salario));
    if (!await nexusConfirm('Gerar holerite em RASCUNHO pra '+_funcionariosCache.length+' funcionário(s) ativo(s) em '+MESES[mes-1]+'/'+ano+'?\n\n'+(semSalario.length?'⚠ '+semSalario.length+' sem salário cadastrado serão pulados.\n\n':'')+'Holerites já existentes neste mês não serão alterados.')) return;
    let criados = 0; let pulados = 0;
    for (const f of _funcionariosCache) {
      if (!Number(f.salario)) { pulados++; continue; }
      const payload = {
        tenant_id: window._currentUserData?.tenant_id,
        funcionario_id: f.id, mes_ref: mes, ano_ref: ano,
        funcionario_nome: f.nome, funcionario_cargo: f.cargo,
        funcionario_dept: f.departamento, status: 'rascunho',
      };
      const { data: hol, error } = await window.sb.from('rh_holerites').insert(payload).select().single();
      if (error) { pulados++; continue; }
      const lancs = _gerarLancamentosTemplate(f.salario).map(l => ({ ...l, holerite_id: hol.id }));
      if (lancs.length) await window.sb.from('rh_lancamentos').insert(lancs);
      criados++;
    }
    window.toastSuccess?.(criados+' holerite(s) criados · '+pulados+' pulado(s)');
    window.rhFolhaInit();
  };

  // ──────────────────────────────────────────────────
  // Holerite imprimível (HTML em janela nova)
  // ──────────────────────────────────────────────────
  window._rhFolhaImprimir = async (id) => {
    const { data: h, error: he } = await window.sb.from('rh_holerites').select('*').eq('id', id).single();
    if (he) return nexusAlert('Erro: '+he.message);
    const { data: ls } = await window.sb.from('rh_lancamentos').select('*').eq('holerite_id', id).order('tipo').order('ordem');
    const lancs = ls || [];
    const proventos = lancs.filter(l => l.tipo === 'provento');
    const descontos = lancs.filter(l => l.tipo === 'desconto');
    const infos = lancs.filter(l => l.tipo === 'info');
    const tenantNome = window._currentUserData?.tenant_nome || window._currentUserData?.empresa_nome || 'Empresa';
    const row = (l) => '<tr><td style="padding:4px 8px;font-family:monospace;font-size:10px;color:#666">'+esc(l.codigo||'')+'</td><td style="padding:4px 8px">'+esc(l.descricao||'')+'</td><td style="padding:4px 8px;text-align:center;font-size:11px;color:#666">'+esc(l.referencia||'')+'</td><td style="padding:4px 8px;text-align:right;font-family:monospace">'+(l.tipo==='provento'?fmtBRL(l.valor):'')+'</td><td style="padding:4px 8px;text-align:right;font-family:monospace">'+(l.tipo==='desconto'?fmtBRL(l.valor):'')+'</td></tr>';
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Holerite '+esc(h.codigo)+' · '+esc(h.funcionario_nome)+'</title>'
      + '<style>'
      + '*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;color:#222;padding:20px;background:#f1f5f9}'
      + '.recibo{max-width:780px;margin:0 auto;background:#fff;padding:30px;border:1px solid #ccc;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.06)}'
      + 'h1{font-size:18px;margin:0 0 4px;letter-spacing:-.3px}h2{font-size:13px;margin:18px 0 6px;font-weight:700;color:#0891b2;border-bottom:1px solid #e2e8f0;padding-bottom:4px}'
      + 'table{width:100%;border-collapse:collapse;font-size:12px}thead th{background:#f8fafc;padding:6px 8px;text-align:left;font-size:10px;font-weight:700;color:#666;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid #e2e8f0}'
      + 'tbody tr:nth-child(even){background:#f8fafc}'
      + '.totais{margin-top:14px;padding:12px 16px;background:#f1f5f9;border-radius:8px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}'
      + '.totais .v{font-size:20px;font-weight:700;font-family:monospace}'
      + '.lbl{font-size:9px;color:#666;letter-spacing:.5px}'
      + '.cab{display:grid;grid-template-columns:1fr auto;gap:14px;border-bottom:2px solid #0891b2;padding-bottom:14px;margin-bottom:14px}'
      + '.fb{display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:12px;color:#444}'
      + '.assina{margin-top:30px;padding-top:14px;border-top:1px solid #ccc;font-size:11px;color:#666;text-align:center}'
      + '@media print{body{background:#fff;padding:0}.recibo{box-shadow:none;border:none}}'
      + '@page{size:A4;margin:14mm}'
      + '</style></head><body>'
      + '<div class="recibo">'
      +   '<div class="cab">'
      +     '<div><h1>'+esc(tenantNome)+'</h1><div style="font-size:11px;color:#666">RECIBO DE PAGAMENTO DE SALÁRIO · COMPETÊNCIA '+esc(h.competencia)+'</div></div>'
      +     '<div style="text-align:right;font-size:11px;color:#666"><div>Cód: '+esc(h.codigo)+'</div><div>Status: '+esc((STATUS[h.status]||{l:''}).l)+'</div>'+(h.data_pagamento?'<div>Pagamento: '+fmtDate(h.data_pagamento)+'</div>':'')+'</div>'
      +   '</div>'
      +   '<div class="fb">'
      +     '<div><div class="lbl">FUNCIONÁRIO</div><div style="font-weight:700">'+esc(h.funcionario_nome)+'</div>'+(h.funcionario_cpf?'<div style="font-size:11px;color:#666">CPF: '+esc(h.funcionario_cpf)+'</div>':'')+'</div>'
      +     '<div><div class="lbl">CARGO / DEPARTAMENTO</div><div>'+esc(h.funcionario_cargo||'—')+(h.funcionario_dept?' · '+esc(h.funcionario_dept):'')+'</div>'+(h.funcionario_admissao?'<div style="font-size:11px;color:#666">Admissão: '+fmtDate(h.funcionario_admissao)+'</div>':'')+'</div>'
      +   '</div>'
      +   '<h2>Proventos e Descontos</h2>'
      +   '<table><thead><tr><th>Cód</th><th>Descrição</th><th style="text-align:center">Ref.</th><th style="text-align:right">Provento</th><th style="text-align:right">Desconto</th></tr></thead>'
      +     '<tbody>'+(proventos.concat(descontos)).map(row).join('')+'</tbody></table>'
      +   '<div class="totais">'
      +     '<div><div class="lbl">PROVENTOS</div><div class="v" style="color:#16a34a">'+fmtBRL(h.total_proventos)+'</div></div>'
      +     '<div><div class="lbl">DESCONTOS</div><div class="v" style="color:#dc2626">'+fmtBRL(h.total_descontos)+'</div></div>'
      +     '<div style="text-align:right"><div class="lbl">LÍQUIDO A RECEBER</div><div class="v" style="color:#0891b2">'+fmtBRL(h.total_liquido)+'</div></div>'
      +   '</div>'
      +   (infos.length ? '<h2 style="margin-top:18px">Informativos</h2><table style="font-size:11px"><tbody>'+infos.map(i => '<tr><td style="padding:4px 8px;font-family:monospace;font-size:10px;color:#666">'+esc(i.codigo||'')+'</td><td style="padding:4px 8px">'+esc(i.descricao||'')+'</td><td style="padding:4px 8px;text-align:right;font-family:monospace">'+fmtBRL(i.valor)+'</td></tr>').join('')+'</tbody></table>' : '')
      +   (h.observacoes ? '<div style="margin-top:18px;font-size:11px;color:#444"><b>Observações:</b> '+esc(h.observacoes)+'</div>' : '')
      +   '<div class="assina">'
      +     '<div style="margin-bottom:30px">Declaro ter recebido a importância líquida especificada acima.</div>'
      +     '<div style="display:grid;grid-template-columns:1fr 1fr;gap:30px">'
      +       '<div style="border-top:1px solid #999;padding-top:5px;text-align:center">'+esc(h.funcionario_nome)+'</div>'
      +       '<div style="border-top:1px solid #999;padding-top:5px;text-align:center">'+esc(tenantNome)+'</div>'
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<script>setTimeout(()=>{try{window.print()}catch(e){}}, 300);<\/script>'
      + '</body></html>';
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { window.toastError?.('Pop-up bloqueado. Permita pop-ups pra este app.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };
})();
