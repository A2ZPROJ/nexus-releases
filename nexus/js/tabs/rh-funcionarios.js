// ==========================================================================
// ABA RH-FUNCIONARIOS
//
// Extraido do index.html em 22/08/2026 (linhas 42860-43371).
// So o JS saiu; o HTML continua no #tab-rh-funcionarios. A IIFE foi mantida de
// proposito (ver tests/smoke/README.md e a memoria do split).
//
// expoe  -> _rhDocDelete, _rhDocOpen, _rhDocUpload, _rhEventoDelete, _rhEventoOpen, _rhEventoSave, _rhFuncionarioDelete, _rhFuncionarioSave, _rhTab, rhFuncionarioOpenModal, rhFuncionariosInit, rhFuncionariosListRender
// consome-> window._currentUserData, window.deleteFromBucket, window.open, window.sb, window.toastError, window.toastSuccess, window.uploadToBucket
// ==========================================================================
(function(){
  const esc = (s) => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtBRL = (n) => 'R$ ' + (Number(n)||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s+'T00:00:00'); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR'); };
  const todayISO = () => new Date().toISOString().slice(0,10);
  const daysBetween = (iso) => { if (!iso) return null; const d = new Date(iso+'T00:00:00'); const t = new Date(todayISO()+'T00:00:00'); return Math.floor((d - t) / 86400000); };

  let _funcsCache = [];

  const STATUS = {
    ativo:     { l:'Ativo',     c:'#16a34a' },
    ferias:    { l:'Em férias', c:'#0891b2' },
    afastado:  { l:'Afastado',  c:'#f59e0b' },
    licenca:   { l:'Licença',   c:'#a16207' },
    desligado: { l:'Desligado', c:'#94a3b8' },
  };
  const MODALIDADE = { clt:'CLT', pj:'PJ', estagio:'Estágio', terceirizado:'Terceirizado', autonomo:'Autônomo' };
  const TIPO_DOC = {
    ctps: 'CTPS', rg: 'RG', cpf: 'CPF', residencia: 'Comprovante de residência',
    aso: 'ASO', contrato: 'Contrato', titulo_eleitor: 'Título eleitor', cnh: 'CNH',
    diploma: 'Diploma/Certificado', outros: 'Outros',
  };
  const TIPO_EVENTO = {
    admissao:'Admissão', promocao:'Promoção', mudanca_salarial:'Mudança salarial',
    mudanca_cargo:'Mudança de cargo', mudanca_dept:'Mudança de departamento',
    advertencia:'Advertência', suspensao:'Suspensão', atestado:'Atestado',
    ferias:'Férias', licenca:'Licença', retorno:'Retorno',
    demissao:'Demissão', elogio:'Elogio', treinamento:'Treinamento',
    aniversario:'Aniversário', outros:'Outros',
  };

  window.rhFuncionariosInit = async () => {
    const list = document.getElementById('rhFuncionariosList');
    if (!list) return;
    list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;grid-column:1/-1">Carregando…</div>';
    try {
      const { data, error } = await window.sb.from('rh_funcionarios').select('*').order('nome', { ascending: true });
      if (error) throw error;
      _funcsCache = data || [];
      _renderRhKpis();
      _renderRhAlertas();
      _refreshDeptDropdown();
      window.rhFuncionariosListRender();
    } catch (e) {
      list.innerHTML = '<div style="padding:30px;text-align:center;color:#dc2626;font-size:13px;grid-column:1/-1">Erro: '+esc(e.message)+'</div>';
    }
  };

  function _renderRhKpis() {
    const k = document.getElementById('rhKpis'); if (!k) return;
    const total = _funcsCache.length;
    const ativos = _funcsCache.filter(f => f.status==='ativo').length;
    const ferias = _funcsCache.filter(f => f.status==='ferias').length;
    const afast = _funcsCache.filter(f => f.status==='afastado' || f.status==='licenca').length;
    const desl = _funcsCache.filter(f => f.status==='desligado').length;
    const tile = (l, v, c) => '<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px"><div style="font-size:10px;color:var(--text3);font-weight:600;letter-spacing:.5px">'+l+'</div><div style="font-size:22px;font-weight:700;color:'+c+';margin-top:2px">'+v+'</div></div>';
    k.innerHTML = tile('TOTAL', total, 'var(--text)') + tile('ATIVOS', ativos, '#16a34a') + tile('EM FÉRIAS', ferias, '#0891b2') + tile('AFAST./LIC.', afast, '#f59e0b') + tile('DESLIGADOS', desl, '#94a3b8');
  }

  function _renderRhAlertas() {
    const div = document.getElementById('rhAlertas'); if (!div) return;
    const aso = []; const ferias = []; const exp = [];
    _funcsCache.filter(f => f.status==='ativo').forEach(f => {
      const dAso = daysBetween(f.aso_admissional);
      if (dAso !== null && dAso <= 30) aso.push({ f, d: dAso });
      const dFer = daysBetween(f.ferias_proximas);
      if (dFer !== null && dFer <= 30) ferias.push({ f, d: dFer });
      const dExp = daysBetween(f.contrato_experiencia);
      if (dExp !== null && dExp <= 30 && dExp >= -3) exp.push({ f, d: dExp });
    });
    if (!aso.length && !ferias.length && !exp.length) { div.innerHTML = ''; return; }
    const card = (titulo, cor, items, label) => {
      if (!items.length) return '';
      const linhas = items.slice(0,5).map(({f,d}) => '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span onclick="window.rhFuncionarioOpenModal(\''+esc(f.id)+'\')" style="cursor:pointer;color:var(--text);font-weight:600">'+esc(f.nome)+'</span><span style="color:'+cor+';font-weight:600">'+(d<0?'venceu há '+(-d)+'d':d===0?'hoje':d+'d')+'</span></div>').join('');
      const more = items.length>5 ? '<div style="font-size:11px;color:var(--text3);margin-top:4px">+ '+(items.length-5)+' '+label+'</div>' : '';
      return '<div style="background:var(--surface);border:1px solid '+cor+'33;border-left:3px solid '+cor+';border-radius:8px;padding:12px 14px;flex:1;min-width:240px"><div style="font-size:11px;font-weight:700;color:'+cor+';letter-spacing:.5px;margin-bottom:6px">'+titulo+'</div>'+linhas+more+'</div>';
    };
    div.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px">' + card('ASO VENCENDO (≤30d)', '#dc2626', aso, 'ASOs') + card('FÉRIAS PRÓXIMAS (≤30d)', '#0891b2', ferias, 'férias') + card('CONTRATO EXPERIÊNCIA (≤30d)', '#f59e0b', exp, 'contratos') + '</div>';
  }

  function _refreshDeptDropdown() {
    const sel = document.getElementById('rhFiltroDept'); if (!sel) return;
    const cur = sel.value;
    const depts = Array.from(new Set(_funcsCache.map(f => f.departamento).filter(Boolean))).sort();
    sel.innerHTML = '<option value="">Todos os departamentos</option>' + depts.map(d => '<option value="'+esc(d)+'"'+(d===cur?' selected':'')+'>'+esc(d)+'</option>').join('');
  }

  window.rhFuncionariosListRender = () => {
    const list = document.getElementById('rhFuncionariosList'); if (!list) return;
    const q = (document.getElementById('rhFiltroBusca')?.value || '').toLowerCase().trim();
    const st = document.getElementById('rhFiltroStatus')?.value || '';
    const dp = document.getElementById('rhFiltroDept')?.value || '';
    const md = document.getElementById('rhFiltroModalidade')?.value || '';
    let arr = _funcsCache.slice();
    if (q) arr = arr.filter(f => (f.nome||'').toLowerCase().includes(q) || (f.cpf||'').includes(q) || (f.codigo||'').toLowerCase().includes(q) || (f.cargo||'').toLowerCase().includes(q));
    if (st) arr = arr.filter(f => f.status === st);
    if (dp) arr = arr.filter(f => f.departamento === dp);
    if (md) arr = arr.filter(f => f.modalidade === md);
    if (!arr.length) { list.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;background:var(--surface2);border-radius:8px;grid-column:1/-1">Nenhum funcionário cadastrado.</div>'; return; }
    list.innerHTML = arr.map(f => {
      const s = STATUS[f.status] || STATUS.ativo;
      const initials = (f.nome||'?').split(/\s+/).slice(0,2).map(w => w[0]||'').join('').toUpperCase();
      const dAso = daysBetween(f.aso_admissional);
      const asoTag = (dAso !== null && dAso <= 30) ? '<span style="font-size:10px;background:#dc262622;color:#dc2626;padding:2px 7px;border-radius:8px;font-weight:700">ASO '+(dAso<0?'vencido':dAso+'d')+'</span>' : '';
      const avatar = f.foto_url ? '<div style="width:48px;height:48px;border-radius:50%;background:#f1f5f9 url(\''+esc(f.foto_url)+'\') center/cover;flex-shrink:0"></div>' : '<div style="width:48px;height:48px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0">'+esc(initials)+'</div>';
      return '<div onclick="window.rhFuncionarioOpenModal(\''+esc(f.id)+'\')" style="background:var(--surface);border-radius:10px;border:1px solid var(--border);padding:14px;cursor:pointer;display:flex;gap:12px;align-items:flex-start;transition:transform .15s,box-shadow .15s" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 8px 20px rgba(0,0,0,.08)\'" onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'">'
        + avatar
        + '<div style="flex:1;min-width:0">'
        +   '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:3px">'
        +     '<span style="font-size:14px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(f.nome||'(sem nome)')+'</span>'
        +     '<span style="font-size:10px;font-weight:700;background:'+s.c+'22;color:'+s.c+';padding:2px 7px;border-radius:8px;letter-spacing:.4px;text-transform:uppercase;flex-shrink:0">'+s.l+'</span>'
        +   '</div>'
        +   '<div style="font-size:12px;color:var(--text2);margin-bottom:4px">'+esc(f.cargo||'')+(f.departamento?' · '+esc(f.departamento):'')+'</div>'
        +   '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);align-items:center;gap:6px">'
        +     '<span>'+esc(f.codigo||'')+' · '+esc(MODALIDADE[f.modalidade]||f.modalidade||'')+'</span>'
        +     asoTag
        +   '</div>'
        + '</div>'
      + '</div>';
    }).join('');
  };

  window.rhFuncionarioOpenModal = async (id) => {
    let f = id ? _funcsCache.find(x => x.id === id) : null;
    let docs = []; let eventos = [];
    if (id) {
      const [dRes, eRes] = await Promise.all([
        window.sb.from('rh_documentos').select('*').eq('funcionario_id', id).order('criado_em', { ascending: false }),
        window.sb.from('rh_eventos').select('*').eq('funcionario_id', id).order('data', { ascending: false }),
      ]);
      docs = dRes.data || [];
      eventos = eRes.data || [];
    }
    const mid = 'modalRh' + Date.now();
    const tabBtn = (id_, label, active) => '<button id="'+id_+'" onclick="window._rhTab(\''+mid+'\',\''+id_.split('_').pop()+'\')" style="background:'+(active?'var(--accent)':'transparent')+';color:'+(active?'#fff':'var(--text2)')+';border:none;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid '+(active?'var(--accent)':'transparent')+'">'+label+'</button>';
    const html = '<div id="'+mid+'" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto" onclick="if(event.target.id===\''+mid+'\') document.getElementById(\''+mid+'\').remove()">'
      + '<div style="background:var(--surface);border-radius:12px;width:100%;max-width:980px;border:1px solid var(--border);margin:auto">'
      +   '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--surface);z-index:1;border-radius:12px 12px 0 0">'
      +     '<div style="font-size:16px;font-weight:700">'+(f?'Funcionário · '+esc(f.codigo)+' · '+esc(f.nome):'Novo funcionário')+'</div>'
      +     '<button onclick="document.getElementById(\''+mid+'\').remove();window.rhFuncionariosInit()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer">×</button>'
      +   '</div>'
      +   (f ? '<div style="border-bottom:1px solid var(--border);padding:0 22px;display:flex;gap:4px">'
        + tabBtn(mid+'_tabbtn_pessoais','Dados pessoais',true)
        + tabBtn(mid+'_tabbtn_profissionais','Profissionais',false)
        + tabBtn(mid+'_tabbtn_documentos','Documentos ('+docs.length+')',false)
        + tabBtn(mid+'_tabbtn_timeline','Timeline ('+eventos.length+')',false)
        + '</div>' : '')
      +   '<div style="padding:20px 22px">'
      +     '<div id="'+mid+'_alert" style="display:none;padding:10px 14px;background:var(--red-l);border:1px solid var(--red);border-radius:6px;font-size:12px;color:var(--red);margin-bottom:14px"></div>'
      // ABA: PESSOAIS
      +     '<div id="'+mid+'_tab_pessoais">'
      +       '<div style="display:grid;grid-template-columns:1fr 200px;gap:10px;margin-bottom:10px">'
      +         '<div><label style="font-size:11px;color:var(--text3)">Nome completo *</label><input id="'+mid+'_nome" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Status</label><select id="'+mid+'_status" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)">'+Object.entries(STATUS).map(([k,v])=>'<option value="'+k+'">'+v.l+'</option>').join('')+'</select></div>'
      +       '</div>'
      +       '<div style="display:grid;grid-template-columns:1fr 1fr 160px;gap:10px;margin-bottom:10px">'
      +         '<div><label style="font-size:11px;color:var(--text3)">Nome social</label><input id="'+mid+'_nome_social" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">CPF</label><input id="'+mid+'_cpf" type="text" placeholder="000.000.000-00" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Data nasc.</label><input id="'+mid+'_data_nasc" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '</div>'
      +       '<div style="display:grid;grid-template-columns:1fr 1fr 100px;gap:10px;margin-bottom:10px">'
      +         '<div><label style="font-size:11px;color:var(--text3)">RG</label><input id="'+mid+'_rg" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Órgão emissor</label><input id="'+mid+'_rg_emissor" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Sexo</label><select id="'+mid+'_sexo" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"><option value="">—</option><option value="M">M</option><option value="F">F</option><option value="outro">Outro</option></select></div>'
      +       '</div>'
      +       '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
      +         '<div><label style="font-size:11px;color:var(--text3)">Estado civil</label><input id="'+mid+'_estado_civil" type="text" placeholder="Solteiro / Casado / União estável…" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Nacionalidade</label><input id="'+mid+'_nacionalidade" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '</div>'
      +       '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
      +         '<div><label style="font-size:11px;color:var(--text3)">E-mail</label><input id="'+mid+'_email" type="email" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Telefone</label><input id="'+mid+'_telefone" type="text" placeholder="(44) 99999-9999" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '</div>'
      +       '<div style="display:grid;grid-template-columns:140px 1fr 100px 1fr;gap:10px;margin-bottom:10px">'
      +         '<div><label style="font-size:11px;color:var(--text3)">CEP</label><input id="'+mid+'_cep" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Rua</label><input id="'+mid+'_rua" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Número</label><input id="'+mid+'_numero" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Complemento</label><input id="'+mid+'_complemento" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '</div>'
      +       '<div style="display:grid;grid-template-columns:1fr 1fr 100px;gap:10px;margin-bottom:10px">'
      +         '<div><label style="font-size:11px;color:var(--text3)">Bairro</label><input id="'+mid+'_bairro" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Cidade</label><input id="'+mid+'_cidade" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">UF</label><input id="'+mid+'_uf" type="text" maxlength="2" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);text-transform:uppercase"></div>'
      +       '</div>'
      +     '</div>'
      // ABA: PROFISSIONAIS
      +     '<div id="'+mid+'_tab_profissionais" style="display:none">'
      +       '<div style="display:grid;grid-template-columns:1fr 1fr 160px;gap:10px;margin-bottom:10px">'
      +         '<div><label style="font-size:11px;color:var(--text3)">Cargo</label><input id="'+mid+'_cargo" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Departamento</label><input id="'+mid+'_dept" type="text" placeholder="Engenharia / Operações / Financeiro…" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Modalidade</label><select id="'+mid+'_modalidade" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)">'+Object.entries(MODALIDADE).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></div>'
      +       '</div>'
      +       '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px">'
      +         '<div><label style="font-size:11px;color:var(--text3)">Admissão</label><input id="'+mid+'_admissao" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Demissão</label><input id="'+mid+'_demissao" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Salário (R$)</label><input id="'+mid+'_salario" type="number" step="0.01" min="0" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Matrícula</label><input id="'+mid+'_matricula" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '</div>'
      +       '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">'
      +         '<div><label style="font-size:11px;color:var(--text3)">Fim contrato experiência</label><input id="'+mid+'_contrato_exp" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Vencimento ASO</label><input id="'+mid+'_aso" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">Próximas férias</label><input id="'+mid+'_ferias" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '</div>'
      +       '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">'
      +         '<div><label style="font-size:11px;color:var(--text3)">PIS</label><input id="'+mid+'_pis" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">CTPS nº</label><input id="'+mid+'_ctps" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +         '<div><label style="font-size:11px;color:var(--text3)">CTPS série</label><input id="'+mid+'_ctps_serie" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '</div>'
      +       '<div style="background:var(--surface2);border-radius:6px;padding:12px;margin-bottom:10px">'
      +         '<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:8px">DADOS BANCÁRIOS</div>'
      +         '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 100px;gap:10px">'
      +           '<div><label style="font-size:11px;color:var(--text3)">Banco</label><input id="'+mid+'_banco_nome" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +           '<div><label style="font-size:11px;color:var(--text3)">Agência</label><input id="'+mid+'_banco_ag" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +           '<div><label style="font-size:11px;color:var(--text3)">Conta</label><input id="'+mid+'_banco_conta" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +           '<div><label style="font-size:11px;color:var(--text3)">Tipo</label><select id="'+mid+'_banco_tipo" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"><option value="">—</option><option value="corrente">CC</option><option value="poupanca">CP</option><option value="salario">Sal.</option></select></div>'
      +         '</div>'
      +       '</div>'
      +       '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text3)">Observações</label><textarea id="'+mid+'_obs" rows="2" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical;font-family:inherit"></textarea></div>'
      +     '</div>'
      // ABA: DOCUMENTOS
      +     '<div id="'+mid+'_tab_documentos" style="display:none">'
      +       (f
        ? '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">'
          + '<div style="font-size:12px;color:var(--text2);max-width:540px">Documentos são privados — só geramos link temporário (60s) sob demanda. CTPS, RG, CPF, ASO, Contrato, Comprovante de residência etc.</div>'
          + '<div style="display:flex;gap:8px;align-items:center">'
          +   '<select id="'+mid+'_doctipo" style="padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px">'+Object.entries(TIPO_DOC).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select>'
          +   '<input id="'+mid+'_docfile" type="file" style="display:none" onchange="window._rhDocUpload(\''+esc(f.id)+'\',this.files,\''+mid+'\')">'
          +   '<button onclick="document.getElementById(\''+mid+'_docfile\').click()" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;font-weight:600">+ Adicionar</button>'
          + '</div></div>'
          + '<div id="'+mid+'_doclist">'+_renderDocs(docs, mid)+'</div>'
        : '<div style="background:var(--accent-soft);border:1px solid var(--accent);border-radius:8px;padding:14px;font-size:12px;color:var(--text2)">Salve o cadastro pra liberar upload de documentos.</div>')
      +     '</div>'
      // ABA: TIMELINE
      +     '<div id="'+mid+'_tab_timeline" style="display:none">'
      +       (f
        ? '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">'
          + '<div style="font-size:12px;color:var(--text2)">Histórico de eventos: admissão, promoções, mudanças, advertências, atestados, férias…</div>'
          + '<button onclick="window._rhEventoOpen(\''+esc(f.id)+'\',\''+mid+'\')" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;font-weight:600">+ Novo evento</button>'
          + '</div>'
          + '<div id="'+mid+'_evtlist">'+_renderEventos(eventos, mid)+'</div>'
        : '<div style="background:var(--accent-soft);border:1px solid var(--accent);border-radius:8px;padding:14px;font-size:12px;color:var(--text2)">Salve o cadastro pra registrar eventos.</div>')
      +     '</div>'
      +   '</div>'
      +   '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;position:sticky;bottom:0;background:var(--surface);border-radius:0 0 12px 12px">'
      +     '<div>'+(f?'<button onclick="window._rhFuncionarioDelete(\''+esc(f.id)+'\',\''+mid+'\')" style="background:var(--red-l);color:var(--red);border:1px solid var(--red);padding:8px 14px;border-radius:6px;font-size:12px;cursor:pointer">Excluir funcionário</button>':'')+'</div>'
      +     '<div style="display:flex;gap:8px">'
      +       '<button onclick="document.getElementById(\''+mid+'\').remove();window.rhFuncionariosInit()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px">Fechar</button>'
      +       '<button onclick="window._rhFuncionarioSave(\''+(f?esc(f.id):'')+'\',\''+mid+'\')" style="background:var(--accent);color:#fff;padding:9px 22px;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">'+(f?'Salvar':'Criar')+'</button>'
      +     '</div>'
      +   '</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    if (f) {
      const set = (k,v)=>{ const e=document.getElementById(mid+'_'+k); if(e&&v!=null) e.value=v; };
      set('nome', f.nome); set('nome_social', f.nome_social); set('cpf', f.cpf);
      set('data_nasc', f.data_nascimento); set('rg', f.rg); set('rg_emissor', f.rg_emissor);
      set('sexo', f.sexo||''); set('estado_civil', f.estado_civil); set('nacionalidade', f.nacionalidade);
      set('email', f.email); set('telefone', f.telefone);
      set('cep', f.cep); set('rua', f.endereco_rua); set('numero', f.endereco_numero);
      set('complemento', f.endereco_complemento); set('bairro', f.endereco_bairro);
      set('cidade', f.endereco_cidade); set('uf', f.endereco_uf);
      set('cargo', f.cargo); set('dept', f.departamento);
      set('modalidade', f.modalidade||'clt'); set('status', f.status||'ativo');
      set('admissao', f.data_admissao); set('demissao', f.data_demissao);
      set('salario', f.salario); set('matricula', f.matricula);
      set('contrato_exp', f.contrato_experiencia); set('aso', f.aso_admissional); set('ferias', f.ferias_proximas);
      set('pis', f.pis); set('ctps', f.ctps_numero); set('ctps_serie', f.ctps_serie);
      set('banco_nome', f.banco_nome); set('banco_ag', f.banco_agencia);
      set('banco_conta', f.banco_conta); set('banco_tipo', f.banco_tipo||'');
      set('obs', f.observacoes);
    } else {
      document.getElementById(mid+'_admissao').value = todayISO();
      document.getElementById(mid+'_nacionalidade').value = 'Brasileira';
    }
  };

  window._rhTab = (mid, tab) => {
    ['pessoais','profissionais','documentos','timeline'].forEach(t => {
      const div = document.getElementById(mid+'_tab_'+t);
      if (div) div.style.display = (t===tab)?'block':'none';
      const btn = document.getElementById(mid+'_tabbtn_'+t);
      if (btn) {
        btn.style.background = (t===tab)?'var(--accent)':'transparent';
        btn.style.color = (t===tab)?'#fff':'var(--text2)';
        btn.style.borderBottomColor = (t===tab)?'var(--accent)':'transparent';
      }
    });
  };

  function _renderDocs(docs, mid) {
    if (!docs.length) return '<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;background:var(--surface2);border-radius:8px">Nenhum documento.</div>';
    return docs.map(d => {
      const dVal = daysBetween(d.validade);
      const venc = (dVal !== null && dVal <= 30) ? '<span style="font-size:10px;background:'+(dVal<0?'#dc262622':'#f59e0b22')+';color:'+(dVal<0?'#dc2626':'#f59e0b')+';padding:2px 7px;border-radius:8px;font-weight:700;margin-left:6px">'+(dVal<0?'venceu há '+(-dVal)+'d':dVal+'d')+'</span>' : '';
      return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:6px;display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center">'
        + '<div>'
        +   '<div style="font-size:13px;font-weight:600;color:var(--text)">'+esc(TIPO_DOC[d.tipo]||d.tipo)+(d.titulo?' · '+esc(d.titulo):'')+venc+'</div>'
        +   '<div style="font-size:11px;color:var(--text3);margin-top:2px">'+esc(d.storage_path||'')+(d.tamanho_bytes?' · '+(d.tamanho_bytes/1024).toFixed(0)+' KB':'')+(d.validade?' · validade '+fmtDate(d.validade):'')+'</div>'
        + '</div>'
        + '<button onclick="window._rhDocOpen(\''+esc(d.id)+'\',\''+esc(d.storage_path)+'\')" style="background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent);border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;font-weight:600">Abrir</button>'
        + '<button onclick="window._rhDocDelete(\''+esc(d.id)+'\',\''+esc(d.storage_path)+'\',\''+mid+'\')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px" title="Remover">🗑</button>'
      + '</div>';
    }).join('');
  }

  function _renderEventos(eventos, mid) {
    if (!eventos.length) return '<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;background:var(--surface2);border-radius:8px">Nenhum evento registrado.</div>';
    const COR = {
      admissao:'#16a34a', promocao:'#0891b2', mudanca_salarial:'#0891b2',
      mudanca_cargo:'#0891b2', mudanca_dept:'#0891b2',
      advertencia:'#dc2626', suspensao:'#dc2626',
      atestado:'#f59e0b', ferias:'#0891b2', licenca:'#a16207', retorno:'#16a34a',
      demissao:'#94a3b8', elogio:'#16a34a', treinamento:'#7c3aed',
      aniversario:'#ec4899', outros:'#64748b',
    };
    return '<div style="position:relative;padding-left:20px;border-left:2px solid var(--border)">' + eventos.map(e => {
      const c = COR[e.tipo] || '#64748b';
      return '<div style="position:relative;margin-bottom:14px">'
        + '<div style="position:absolute;left:-26px;top:6px;width:10px;height:10px;border-radius:50%;background:'+c+';border:2px solid var(--surface)"></div>'
        + '<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid '+c+';border-radius:6px;padding:10px 14px">'
        +   '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">'
        +     '<span style="font-size:13px;font-weight:700;color:var(--text)">'+esc(e.titulo)+'</span>'
        +     '<span style="font-size:11px;color:var(--text3);white-space:nowrap">'+fmtDate(e.data)+'</span>'
        +   '</div>'
        +   '<div style="font-size:11px;color:'+c+';font-weight:700;letter-spacing:.4px;text-transform:uppercase;margin-bottom:5px">'+esc(TIPO_EVENTO[e.tipo]||e.tipo)+'</div>'
        +   (e.descricao?'<div style="font-size:12px;color:var(--text2);line-height:1.5">'+esc(e.descricao)+'</div>':'')
        +   (e.anexo_path?'<div style="margin-top:6px"><button onclick="window._rhDocOpen(null,\''+esc(e.anexo_path)+'\')" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:3px 9px;border-radius:5px;cursor:pointer">📎 '+esc(e.anexo_titulo||'anexo')+'</button></div>':'')
        +   '<div style="margin-top:6px;text-align:right"><button onclick="window._rhEventoDelete(\''+esc(e.id)+'\',\''+esc(e.funcionario_id)+'\',\''+mid+'\')" style="background:none;border:none;color:var(--text3);font-size:11px;cursor:pointer">remover</button></div>'
        + '</div>'
      + '</div>';
    }).join('') + '</div>';
  }

  window._rhFuncionarioSave = async (id, mid) => {
    const get = (k) => document.getElementById(mid+'_'+k)?.value || '';
    const alert_ = (msg) => { const a = document.getElementById(mid+'_alert'); if (a){a.textContent=msg;a.style.display='block';setTimeout(()=>a.style.display='none',5000);} };
    const nome = get('nome').trim(); if (!nome) return alert_('Informe o nome.');
    const num = (k) => { const v = parseFloat(get(k)); return isNaN(v) ? null : v; };
    const dt = (k) => { const v = get(k).trim(); return v || null; };
    const tx = (k) => { const v = get(k).trim(); return v || null; };
    const sx = get('sexo'); const sexoVal = (sx==='M'||sx==='F'||sx==='outro') ? sx : null;
    const payload = {
      tenant_id: window._currentUserData?.tenant_id,
      nome, nome_social: tx('nome_social'),
      cpf: tx('cpf'), rg: tx('rg'), rg_emissor: tx('rg_emissor'),
      data_nascimento: dt('data_nasc'), sexo: sexoVal,
      estado_civil: tx('estado_civil'), nacionalidade: tx('nacionalidade'),
      email: tx('email'), telefone: tx('telefone'),
      cep: tx('cep'), endereco_rua: tx('rua'), endereco_numero: tx('numero'),
      endereco_complemento: tx('complemento'), endereco_bairro: tx('bairro'),
      endereco_cidade: tx('cidade'), endereco_uf: tx('uf'),
      cargo: tx('cargo'), departamento: tx('dept'),
      modalidade: get('modalidade')||'clt', status: get('status')||'ativo',
      data_admissao: dt('admissao'), data_demissao: dt('demissao'),
      salario: num('salario'), matricula: tx('matricula'),
      contrato_experiencia: dt('contrato_exp'), aso_admissional: dt('aso'), ferias_proximas: dt('ferias'),
      pis: tx('pis'), ctps_numero: tx('ctps'), ctps_serie: tx('ctps_serie'),
      banco_nome: tx('banco_nome'), banco_agencia: tx('banco_ag'),
      banco_conta: tx('banco_conta'), banco_tipo: tx('banco_tipo'),
      observacoes: tx('obs'),
      atualizado_em: new Date().toISOString(),
    };
    if (id) {
      const { error } = await window.sb.from('rh_funcionarios').update(payload).eq('id', id);
      if (error) return alert_('Erro: '+error.message);
      window.toastSuccess?.('Funcionário salvo');
      document.getElementById(mid)?.remove();
      window.rhFuncionariosInit();
    } else {
      payload.criado_por = window._currentUserData?.id;
      payload.criado_por_nome = window._currentUserData?.nome;
      const { data, error } = await window.sb.from('rh_funcionarios').insert(payload).select().single();
      if (error) return alert_('Erro: '+error.message);
      // Cria evento de admissão automaticamente se data preenchida
      if (data.data_admissao) {
        await window.sb.from('rh_eventos').insert({
          funcionario_id: data.id, tipo: 'admissao', data: data.data_admissao,
          titulo: 'Admissão · '+(data.cargo||'')+(data.departamento?' · '+data.departamento:''),
          descricao: data.modalidade==='clt'?'Modalidade CLT':MODALIDADE[data.modalidade]||'',
          criado_por: window._currentUserData?.id,
          criado_por_nome: window._currentUserData?.nome,
        });
      }
      window.toastSuccess?.('Funcionário criado');
      document.getElementById(mid)?.remove();
      await window.rhFuncionariosInit();
      window.rhFuncionarioOpenModal(data.id);
    }
  };

  window._rhFuncionarioDelete = async (id, mid) => {
    if (!await nexusConfirm('Excluir este funcionário, todos os documentos e eventos? Esta ação não pode ser desfeita.')) return;
    // Apaga arquivos do bucket privado
    const { data: ds } = await window.sb.from('rh_documentos').select('storage_path').eq('funcionario_id', id);
    for (const d of ds||[]) if (d.storage_path) await window.deleteFromBucket('rh-docs', d.storage_path);
    const { data: es } = await window.sb.from('rh_eventos').select('anexo_path').eq('funcionario_id', id);
    for (const e of es||[]) if (e.anexo_path) await window.deleteFromBucket('rh-docs', e.anexo_path);
    const { error } = await window.sb.from('rh_funcionarios').delete().eq('id', id);
    if (error) return nexusAlert('Erro: '+error.message);
    window.toastSuccess?.('Funcionário excluído');
    document.getElementById(mid)?.remove();
    window.rhFuncionariosInit();
  };

  // Documentos: upload
  window._rhDocUpload = async (funcionarioId, files, mid) => {
    if (!files || !files.length) return;
    const tipo = document.getElementById(mid+'_doctipo')?.value || 'outros';
    for (let i=0; i<files.length; i++) {
      const f = files[i];
      const up = await window.uploadToBucket('rh-docs', f, 'funcs/'+funcionarioId+'/'+tipo);
      if (up) {
        await window.sb.from('rh_documentos').insert({
          funcionario_id: funcionarioId, tipo,
          titulo: f.name,
          storage_path: up.path,
          mime_type: f.type || null,
          tamanho_bytes: f.size || null,
          criado_por: window._currentUserData?.id,
          criado_por_nome: window._currentUserData?.nome,
        });
      }
    }
    window.toastSuccess?.((files.length||0)+' documento(s) enviado(s)');
    document.getElementById(mid)?.remove();
    window.rhFuncionarioOpenModal(funcionarioId);
    setTimeout(() => window._rhTab(mid, 'documentos'), 50);
  };

  // Documentos: abrir via signed URL
  window._rhDocOpen = async (id, path) => {
    if (!path) { window.toastError?.('Documento sem caminho'); return; }
    const { data, error } = await window.sb.storage.from('rh-docs').createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { window.toastError?.('Erro ao abrir: '+(error?.message||'sem URL')); return; }
    window.open(data.signedUrl, '_blank');
  };

  window._rhDocDelete = async (id, path, mid) => {
    if (!await nexusConfirm('Remover este documento?')) return;
    if (path) await window.deleteFromBucket('rh-docs', path);
    const { data: doc } = await window.sb.from('rh_documentos').select('funcionario_id').eq('id', id).single();
    await window.sb.from('rh_documentos').delete().eq('id', id);
    window.toastSuccess?.('Documento removido');
    if (doc?.funcionario_id) {
      document.getElementById(mid)?.remove();
      window.rhFuncionarioOpenModal(doc.funcionario_id);
      setTimeout(() => window._rhTab(mid, 'documentos'), 50);
    }
  };

  // Eventos: novo (modal interno)
  window._rhEventoOpen = (funcionarioId, parentMid) => {
    const eid = 'modalEvt' + Date.now();
    const html = '<div id="'+eid+'" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target.id===\''+eid+'\') document.getElementById(\''+eid+'\').remove()">'
      + '<div style="background:var(--surface);border-radius:12px;width:100%;max-width:520px;border:1px solid var(--border);padding:22px">'
      +   '<div style="font-size:15px;font-weight:700;margin-bottom:14px">Novo evento</div>'
      +   '<div style="display:grid;grid-template-columns:1fr 160px;gap:10px;margin-bottom:10px">'
      +     '<div><label style="font-size:11px;color:var(--text3)">Tipo</label><select id="'+eid+'_tipo" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)">'+Object.entries(TIPO_EVENTO).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></div>'
      +     '<div><label style="font-size:11px;color:var(--text3)">Data</label><input id="'+eid+'_data" type="date" value="'+todayISO()+'" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +   '</div>'
      +   '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text3)">Título *</label><input id="'+eid+'_titulo" type="text" placeholder="Ex: Promoção a Encarregado" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +   '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text3)">Descrição</label><textarea id="'+eid+'_desc" rows="3" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical;font-family:inherit"></textarea></div>'
      +   '<div style="margin-bottom:14px"><label style="font-size:11px;color:var(--text3)">Anexo (opcional — fica no rh-docs)</label><input id="'+eid+'_anexo" type="file" style="width:100%;padding:6px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px"></div>'
      +   '<div style="display:flex;justify-content:flex-end;gap:8px">'
      +     '<button onclick="document.getElementById(\''+eid+'\').remove()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:8px 16px;border-radius:6px;cursor:pointer;font-size:12px">Cancelar</button>'
      +     '<button onclick="window._rhEventoSave(\''+esc(funcionarioId)+'\',\''+eid+'\',\''+parentMid+'\')" style="background:var(--accent);color:#fff;padding:8px 18px;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px">Salvar</button>'
      +   '</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  };

  window._rhEventoSave = async (funcionarioId, eid, parentMid) => {
    const tipo = document.getElementById(eid+'_tipo')?.value || 'outros';
    const data = document.getElementById(eid+'_data')?.value || todayISO();
    const titulo = (document.getElementById(eid+'_titulo')?.value || '').trim();
    const desc = (document.getElementById(eid+'_desc')?.value || '').trim() || null;
    if (!titulo) { nexusAlert('Informe o título.'); return; }
    const file = document.getElementById(eid+'_anexo')?.files?.[0];
    let anexo_path = null; let anexo_titulo = null;
    if (file) {
      const up = await window.uploadToBucket('rh-docs', file, 'funcs/'+funcionarioId+'/eventos');
      if (up) { anexo_path = up.path; anexo_titulo = file.name; }
    }
    const { error } = await window.sb.from('rh_eventos').insert({
      funcionario_id: funcionarioId, tipo, data, titulo, descricao: desc,
      anexo_path, anexo_titulo,
      criado_por: window._currentUserData?.id,
      criado_por_nome: window._currentUserData?.nome,
    });
    if (error) { nexusAlert('Erro: '+error.message); return; }
    window.toastSuccess?.('Evento registrado');
    document.getElementById(eid)?.remove();
    if (parentMid) {
      document.getElementById(parentMid)?.remove();
      window.rhFuncionarioOpenModal(funcionarioId);
      setTimeout(() => window._rhTab(parentMid, 'timeline'), 50);
    }
  };

  window._rhEventoDelete = async (id, funcionarioId, mid) => {
    if (!await nexusConfirm('Remover este evento?')) return;
    const { data: ev } = await window.sb.from('rh_eventos').select('anexo_path').eq('id', id).single();
    if (ev?.anexo_path) await window.deleteFromBucket('rh-docs', ev.anexo_path);
    await window.sb.from('rh_eventos').delete().eq('id', id);
    window.toastSuccess?.('Evento removido');
    if (funcionarioId) {
      document.getElementById(mid)?.remove();
      window.rhFuncionarioOpenModal(funcionarioId);
      setTimeout(() => window._rhTab(mid, 'timeline'), 50);
    }
  };
})();
