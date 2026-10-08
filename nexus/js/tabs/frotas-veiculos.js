// ==========================================================================
// ABA FROTAS-VEICULOS
//
// Extraido do index.html em 22/08/2026 (linhas 41184-41542).
// So o JS saiu; o HTML continua no #tab-frotas-veiculos. A IIFE foi mantida de
// proposito (ver tests/smoke/README.md e a memoria do split).
//
// expoe  -> _frotasNovoUso, _frotasOnFileSelect, _frotasRemFoto, _frotasUsoSubmit, _frotasVeiculoDelete, _frotasVeiculoSave, _frotasVeiculosCache, frotasVeiculoOpenModal, frotasVeiculosInit, frotasVeiculosListRender
// consome-> window._currentUserData, window.deleteFromBucket, window.sb, window.toastSuccess, window.uploadToBucket
// ==========================================================================
(function(){
  function esc(s) { return String(s ?? '').replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c])); }
  let _veiculosCache = [];
  const _modalFotosState = new Map();

  window._frotasVeiculosCache = () => _veiculosCache;

  window.frotasVeiculosInit = async () => {
    const list = document.getElementById('frotasVeiculosList');
    if (!window.sb) {
      if (list) list.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text3);font-size:13px">Sem conexão Supabase. Recarregue o app.</div>';
      return;
    }
    if (list) list.innerHTML = '<div class="empty-msg" style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text3);font-size:13px">Carregando…</div>';
    try {
      const { data, error } = await window.sb
        .from('frotas_veiculos')
        .select('*, frotas_veiculo_fotos(id,url,storage_path,ordem)')
        .order('codigo', { ascending: false });
      if (error) {
        console.error('[frotas]', error);
        if (list) list.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:#dc2626;font-size:13px">Erro: '+esc(error.message)+'</div>';
        return;
      }
      _veiculosCache = data || [];
      window.frotasVeiculosListRender();
      populateVeiculosDropdown();
    } catch (e) {
      console.error('[frotas init exception]', e);
      if (list) list.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:#dc2626;font-size:13px">Falha: '+esc(e.message||String(e))+'</div>';
    }
  };

  function populateVeiculosDropdown() {
    const sel = document.getElementById('frotasAbastecFiltroVeic');
    if (!sel) return;
    const valor = sel.value;
    sel.innerHTML = '<option value="">Todos os veículos</option>' + _veiculosCache.map(v =>
      `<option value="${esc(v.id)}">${esc(v.codigo)} · ${esc(v.placa)} · ${esc(v.modelo)}</option>`
    ).join('');
    sel.value = valor;
  }

  window.frotasVeiculosListRender = () => {
    const list = document.getElementById('frotasVeiculosList'); if (!list) return;
    const busca = (document.getElementById('frotasVeiculosBusca')?.value || '').toLowerCase().trim();
    const tipo = document.getElementById('frotasVeiculosFiltroTipo')?.value || '';
    const status = document.getElementById('frotasVeiculosFiltroStatus')?.value;
    let arr = _veiculosCache;
    if (status !== '') arr = arr.filter(v => v.status === status);
    if (tipo) arr = arr.filter(v => v.tipo === tipo);
    if (busca) arr = arr.filter(v =>
      (v.placa||'').toLowerCase().includes(busca) ||
      (v.modelo||'').toLowerCase().includes(busca) ||
      (v.codigo||'').toLowerCase().includes(busca)
    );
    if (!arr.length) {
      list.innerHTML = '<div class="empty-msg" style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text3);font-size:13px">Nenhum veículo encontrado.</div>';
      return;
    }
    list.innerHTML = arr.map(v => {
      const foto = v.frotas_veiculo_fotos?.[0]?.url;
      const venc = [];
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      ['vencimento_licenciamento','vencimento_seguro','vencimento_ipva','vencimento_revisao'].forEach(k => {
        if (v[k]) {
          const d = new Date(v[k] + 'T00:00:00');
          const dias = Math.ceil((d - hoje)/86400000);
          if (dias <= 30) venc.push({k, dias});
        }
      });
      const vencHtml = venc.length
        ? '<div style="margin-top:6px;font-size:10px;color:#dc2626;font-weight:600">⚠ ' + venc.length + ' vencimento' + (venc.length>1?'s':'') + ' próximo' + (venc.length>1?'s':'') + '</div>'
        : '';
      const statusColor = { ativo:'#16a34a', manutencao:'#f59e0b', vendido:'#64748b', sinistrado:'#dc2626', inativo:'#94a3b8' }[v.status] || '#64748b';
      return '<div style="background:var(--surface);border-radius:10px;border:1px solid var(--border);overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 8px 20px rgba(0,0,0,.08)\'" onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'" onclick="window.frotasVeiculoOpenModal(\''+esc(v.id)+'\')">'
        + (foto
          ? '<div style="height:140px;background:#f1f5f9 url(\''+esc(foto)+'\') center/cover"></div>'
          : '<div style="height:140px;background:linear-gradient(135deg, '+statusColor+'22, '+statusColor+'05);display:flex;align-items:center;justify-content:center"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="'+statusColor+'" stroke-width="1.4"><path d="M14 16H5V6h14v6"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/></svg></div>')
        + '<div style="padding:14px">'
        +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
        +     '<span style="font-family:DM Mono,monospace;font-size:11px;color:var(--text3);font-weight:700">'+esc(v.codigo)+'</span>'
        +     '<span style="font-size:10px;font-weight:700;background:'+statusColor+'22;color:'+statusColor+';padding:2px 8px;border-radius:8px;text-transform:uppercase;letter-spacing:.5px">'+esc(v.status)+'</span>'
        +   '</div>'
        +   '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px">'+esc(v.modelo)+'</div>'
        +   '<div style="font-size:13px;color:var(--text2);font-family:DM Mono,monospace;letter-spacing:.5px">'+esc(v.placa)+(v.ano?' · '+v.ano:'')+(v.cor?' · '+esc(v.cor):'')+'</div>'
        +   '<div style="font-size:11px;color:var(--text3);margin-top:6px">KM: <strong style="color:var(--text)">'+(Number(v.km_atual)||0).toLocaleString('pt-BR')+'</strong>'+(v.responsavel_nome?' · '+esc(v.responsavel_nome):'')+'</div>'
        +   vencHtml
        + '</div></div>';
    }).join('');
  };

  window.frotasVeiculoOpenModal = (id) => {
    const v = id ? _veiculosCache.find(x => x.id === id) : null;
    const fotos = v?.frotas_veiculo_fotos || [];
    const mid = 'modalVeic' + Date.now();
    const html = '<div id="'+mid+'" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto" onclick="if(event.target.id===\''+mid+'\') document.getElementById(\''+mid+'\').remove()">'
      + '<div style="background:var(--surface);border-radius:12px;width:100%;max-width:880px;border:1px solid var(--border);margin:auto">'
      +   '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--surface);z-index:1;border-radius:12px 12px 0 0">'
      +     '<div style="font-size:16px;font-weight:700">'+(v?'Editar veículo · '+esc(v.codigo):'Novo veículo')+'</div>'
      +     '<button onclick="document.getElementById(\''+mid+'\').remove()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer;line-height:1">×</button>'
      +   '</div>'
      +   '<div style="padding:20px 22px">'
      +     '<div id="'+mid+'_alert" style="display:none;padding:10px 14px;background:var(--red-l);border:1px solid var(--red);border-radius:6px;font-size:12px;color:var(--red);margin-bottom:14px"></div>'
      +     '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Identificação</div>'
      +     '<div style="display:grid;grid-template-columns:140px 1fr 100px;gap:10px;margin-bottom:10px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Tipo *</label><select id="'+mid+'_tipo" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"><option value="carro">Carro</option><option value="moto">Moto</option><option value="caminhao">Caminhão</option><option value="utilitario">Utilitário</option><option value="van">Van</option><option value="outro">Outro</option></select></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Modelo *</label><input id="'+mid+'_modelo" type="text" placeholder="Ex: Strada Adventure 1.8" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Ano</label><input id="'+mid+'_ano" type="number" min="1950" max="2099" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '</div>'
      +     '<div style="display:grid;grid-template-columns:1fr 130px 130px;gap:10px;margin-bottom:10px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Fabricante</label><input id="'+mid+'_fabricante" type="text" placeholder="Ex: Fiat" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Cor</label><input id="'+mid+'_cor" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Placa *</label><input id="'+mid+'_placa" type="text" maxlength="8" placeholder="ABC1D23" oninput="this.value=this.value.toUpperCase()" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-family:DM Mono,monospace;font-weight:700;letter-spacing:1px"></div>'
      +     '</div>'
      +     '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Chassi</label><input id="'+mid+'_chassi" type="text" maxlength="17" oninput="this.value=this.value.toUpperCase()" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-family:DM Mono,monospace"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Renavam</label><input id="'+mid+'_renavam" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-family:DM Mono,monospace"></div>'
      +     '</div>'
      +     '<div style="display:grid;grid-template-columns:1fr 140px;gap:10px;margin-bottom:14px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Combustível padrão</label><select id="'+mid+'_combustivel" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"><option value="">—</option><option value="flex">Flex</option><option value="gasolina">Gasolina</option><option value="etanol">Etanol</option><option value="diesel">Diesel</option><option value="gnv">GNV</option><option value="eletrico">Elétrico</option><option value="hibrido">Híbrido</option></select></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Tanque (L)</label><input id="'+mid+'_tanque" type="number" step="0.5" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '</div>'
      +     '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Vencimentos (alerta nos 30 dias antes)</div>'
      +     '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Licenciamento</label><input id="'+mid+'_venc_lic" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Seguro</label><input id="'+mid+'_venc_seg" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">IPVA</label><input id="'+mid+'_venc_ipva" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Revisão</label><input id="'+mid+'_venc_rev" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '</div>'
      +     '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Status, KM e responsável</div>'
      +     '<div style="display:grid;grid-template-columns:140px 140px 1fr 150px;gap:10px;margin-bottom:14px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Status</label><select id="'+mid+'_status" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"><option value="ativo">Ativo</option><option value="manutencao">Em manutenção</option><option value="vendido">Vendido</option><option value="sinistrado">Sinistrado</option><option value="inativo">Inativo</option></select></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">KM atual</label><input id="'+mid+'_km" type="number" step="1" min="0" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-family:DM Mono,monospace"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Responsável (nome)</label><input id="'+mid+'_resp" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Data aquisição</label><input id="'+mid+'_aquisicao" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '</div>'
      +     '<div style="margin-bottom:14px"><label style="font-size:11px;color:var(--text3)">Observações</label><textarea id="'+mid+'_obs" rows="3" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical;font-family:inherit"></textarea></div>'
      +     '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Fotos (até 10)</div>'
      +     '<input type="file" id="'+mid+'_fotos_input" accept="image/*" multiple style="display:none" onchange="window._frotasOnFileSelect(\''+mid+'\', this.files)">'
      +     '<div id="'+mid+'_fotos_grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:8px;min-height:60px"></div>'
      +     '<button type="button" onclick="document.getElementById(\''+mid+'_fotos_input\').click()" style="background:var(--surface2);border:1px dashed var(--border2);color:var(--text2);padding:10px 16px;border-radius:6px;font-size:12px;cursor:pointer;width:100%;font-family:inherit">+ Adicionar fotos</button>'
      +     (v ? '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-top:18px;margin-bottom:8px">Histórico de uso</div><div id="'+mid+'_hist" style="font-size:12px;color:var(--text3)">Carregando…</div><button type="button" onclick="window._frotasNovoUso(\''+esc(v.id)+'\',\''+mid+'\')" style="margin-top:8px;background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent);border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer">+ Registrar saída/devolução</button>' : '')
      +   '</div>'
      +   '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;position:sticky;bottom:0;background:var(--surface);border-radius:0 0 12px 12px">'
      +     '<div>'+(v?'<button onclick="window._frotasVeiculoDelete(\''+esc(v.id)+'\',\''+mid+'\')" style="background:var(--red-l);color:var(--red);border:1px solid var(--red);padding:8px 14px;border-radius:6px;font-size:12px;cursor:pointer">Excluir</button>':'')+'</div>'
      +     '<div style="display:flex;gap:8px">'
      +       '<button onclick="document.getElementById(\''+mid+'\').remove()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px">Cancelar</button>'
      +       '<button onclick="window._frotasVeiculoSave(\''+(v?esc(v.id):'')+'\',\''+mid+'\')" style="background:var(--accent);color:#fff;padding:9px 22px;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">'+(v?'Salvar':'Cadastrar')+'</button>'
      +     '</div>'
      +   '</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    if (v) {
      const set = (k, val) => { const e = document.getElementById(mid+'_'+k); if (e && val!=null) e.value = val; };
      set('tipo', v.tipo); set('modelo', v.modelo); set('ano', v.ano); set('fabricante', v.fabricante);
      set('cor', v.cor); set('placa', v.placa); set('chassi', v.chassi); set('renavam', v.renavam);
      set('combustivel', v.combustivel_padrao); set('tanque', v.capacidade_tanque_l);
      set('venc_lic', v.vencimento_licenciamento); set('venc_seg', v.vencimento_seguro);
      set('venc_ipva', v.vencimento_ipva); set('venc_rev', v.vencimento_revisao);
      set('status', v.status); set('km', v.km_atual); set('resp', v.responsavel_nome); set('aquisicao', v.data_aquisicao);
      set('obs', v.observacoes);
      _renderFotosGrid(mid, fotos);
      _loadHistorico(mid, v.id);
    } else {
      _renderFotosGrid(mid, []);
    }
  };

  function _renderFotosGrid(mid, existentes) {
    const state = _modalFotosState.get(mid) || { existentes: [...existentes], novas: [], removidas: [] };
    if (!_modalFotosState.has(mid)) _modalFotosState.set(mid, state);
    const grid = document.getElementById(mid+'_fotos_grid');
    if (!grid) return;
    const all = [
      ...state.existentes.map(f => ({type:'existente', url:f.url, id:f.id})),
      ...state.novas.map((f,i) => ({type:'nova', url:URL.createObjectURL(f), idx:i})),
    ];
    grid.innerHTML = all.length
      ? all.map(f =>
          '<div style="position:relative;width:100%;aspect-ratio:1/1;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:#f1f5f9 url(\''+f.url+'\') center/cover">'
          + '<button type="button" onclick="window._frotasRemFoto(\''+mid+'\',\''+f.type+'\',\''+(f.id||f.idx)+'\')" style="position:absolute;top:4px;right:4px;background:rgba(220,38,38,.85);color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:14px;line-height:1">×</button>'
          + '</div>'
        ).join('')
      : '<div style="grid-column:1/-1;font-size:11px;color:var(--text3);text-align:center;padding:14px">Nenhuma foto. Adicione abaixo.</div>';
  }

  window._frotasOnFileSelect = (mid, files) => {
    const state = _modalFotosState.get(mid) || { existentes: [], novas: [], removidas: [] };
    const total = state.existentes.length + state.novas.length + files.length;
    if (total > 10) { nexusAlert('Máximo 10 fotos. Atual: ' + (state.existentes.length+state.novas.length)); return; }
    [...files].forEach(f => {
      if (f.size > 5*1024*1024) { nexusAlert('Foto muito grande: ' + f.name + ' (máx 5 MB)'); return; }
      state.novas.push(f);
    });
    _modalFotosState.set(mid, state);
    _renderFotosGrid(mid, state.existentes);
  };

  window._frotasRemFoto = (mid, type, idOrIdx) => {
    const state = _modalFotosState.get(mid); if (!state) return;
    if (type === 'existente') {
      const i = state.existentes.findIndex(f => f.id === idOrIdx);
      if (i >= 0) { state.removidas.push(state.existentes[i]); state.existentes.splice(i, 1); }
    } else {
      state.novas.splice(parseInt(idOrIdx,10), 1);
    }
    _renderFotosGrid(mid, state.existentes);
  };

  async function _loadHistorico(mid, veiculoId) {
    const { data } = await window.sb
      .from('frotas_uso_historico').select('*')
      .eq('veiculo_id', veiculoId).order('dt_saida', { ascending: false }).limit(20);
    const div = document.getElementById(mid+'_hist'); if (!div) return;
    if (!data?.length) { div.innerHTML = '<span style="color:var(--text3)">Nenhum uso registrado.</span>'; return; }
    div.innerHTML = data.map(u => '<div style="padding:8px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'
      + '<div><div style="font-size:12px;color:var(--text);font-weight:600">'+esc(u.motorista_nome)+'</div>'
      + '<div style="font-size:11px;color:var(--text3)">'+new Date(u.dt_saida).toLocaleString('pt-BR')+' '+(u.dt_volta?'→ '+new Date(u.dt_volta).toLocaleString('pt-BR'):'<span style="color:#f59e0b">EM USO</span>')+'</div></div>'
      + '<div style="font-size:12px;color:var(--text2);font-family:DM Mono,monospace">'+(Number(u.km_saida)||0).toLocaleString('pt-BR')+' → '+(u.km_volta?(Number(u.km_volta)||0).toLocaleString('pt-BR'):'?')+' km</div>'
      + '</div>').join('');
  }

  window._frotasNovoUso = (veiculoId, parentMid) => {
    const veic = _veiculosCache.find(v => v.id === veiculoId);
    const umid = 'modalUso' + Date.now();
    const agora = new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    const html = '<div id="'+umid+'" style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target.id===\''+umid+'\') document.getElementById(\''+umid+'\').remove()">'
      + '<div style="background:var(--surface);border-radius:12px;width:100%;max-width:520px;border:1px solid var(--border)">'
      +   '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'
      +     '<div style="font-size:15px;font-weight:700">Registrar saída/devolução · '+esc(veic?.placa||'')+'</div>'
      +     '<button onclick="document.getElementById(\''+umid+'\').remove()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer">×</button>'
      +   '</div>'
      +   '<div style="padding:18px 20px">'
      +     '<div id="'+umid+'_alert" style="display:none;padding:9px 12px;background:var(--red-l);border:1px solid var(--red);border-radius:6px;font-size:12px;color:var(--red);margin-bottom:12px"></div>'
      +     '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text3)">Motorista *</label><input id="'+umid+'_motorista" type="text" autofocus value="'+esc(veic?.responsavel_nome || '')+'" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Data/hora saída *</label><input id="'+umid+'_dt_saida" type="datetime-local" value="'+agora+'" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">KM saída *</label><input id="'+umid+'_km_saida" type="number" step="1" min="0" value="'+(Number(veic?.km_atual)||0)+'" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-family:DM Mono,monospace"></div>'
      +     '</div>'
      +     '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Data/hora volta <span style="opacity:.6">(vazio = em uso)</span></label><input id="'+umid+'_dt_volta" type="datetime-local" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">KM volta</label><input id="'+umid+'_km_volta" type="number" step="1" min="0" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-family:DM Mono,monospace"></div>'
      +     '</div>'
      +     '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text3)">Motivo / destino</label><input id="'+umid+'_motivo" type="text" placeholder="Ex: vistoria PA-04" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text3)">OSE (opcional)</label><input id="'+umid+'_ose" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '<div><label style="font-size:11px;color:var(--text3)">Observação</label><textarea id="'+umid+'_obs" rows="2" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical;font-family:inherit"></textarea></div>'
      +   '</div>'
      +   '<div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">'
      +     '<button onclick="document.getElementById(\''+umid+'\').remove()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px">Cancelar</button>'
      +     '<button onclick="window._frotasUsoSubmit(\''+esc(veiculoId)+'\',\''+umid+'\',\''+parentMid+'\')" style="background:var(--accent);color:#fff;padding:9px 22px;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">Salvar</button>'
      +   '</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    setTimeout(() => { document.getElementById(umid+'_motorista')?.focus(); }, 50);
  };

  window._frotasUsoSubmit = async (veiculoId, umid, parentMid) => {
    const get = (k) => document.getElementById(umid+'_'+k)?.value?.trim() || '';
    const getNum = (k) => { const v = parseFloat(document.getElementById(umid+'_'+k)?.value); return isNaN(v) ? null : v; };
    const alert_ = (msg) => { const a = document.getElementById(umid+'_alert'); if (a){a.textContent=msg;a.style.display='block'; setTimeout(()=>a.style.display='none', 5000);} };
    const motorista = get('motorista'); if (!motorista) return alert_('Informe o motorista.');
    const dtSaida = get('dt_saida'); if (!dtSaida) return alert_('Informe a data/hora de saída.');
    const kms = getNum('km_saida'); if (kms == null) return alert_('KM de saída inválido.');
    const dtVolta = get('dt_volta');
    const kmv = getNum('km_volta');
    if (dtVolta && kmv == null) return alert_('Informe o KM de volta.');
    if (kmv != null && !dtVolta) return alert_('Informe a data/hora de volta.');
    if (kmv != null && kmv < kms) return alert_('KM de volta menor que KM de saída.');
    const { error } = await window.sb.from('frotas_uso_historico').insert({
      veiculo_id: veiculoId, motorista_nome: motorista,
      km_saida: kms, dt_saida: new Date(dtSaida).toISOString(),
      km_volta: kmv, dt_volta: dtVolta ? new Date(dtVolta).toISOString() : null,
      motivo: get('motivo') || null,
      ose_numero: get('ose') || null,
      observacao: get('obs') || null,
      registrado_por: window._currentUserData?.id,
    });
    if (error) { alert_('Erro: '+error.message); return; }
    document.getElementById(umid)?.remove();
    window.toastSuccess?.('Uso registrado');
    _loadHistorico(parentMid, veiculoId);
    window.frotasVeiculosInit();
  };

  window._frotasVeiculoSave = async (id, mid) => {
    const get = (k) => document.getElementById(mid+'_'+k)?.value?.trim() || '';
    const getNum = (k) => { const v = parseFloat(document.getElementById(mid+'_'+k)?.value); return isNaN(v) ? null : v; };
    const getDt = (k) => document.getElementById(mid+'_'+k)?.value || null;
    const alert_ = (msg) => { const a = document.getElementById(mid+'_alert'); if (a){a.textContent=msg;a.style.display='block'; setTimeout(()=>a.style.display='none', 5000);} };
    const modelo = get('modelo'); if (!modelo) return alert_('Informe o modelo.');
    const placa = get('placa').toUpperCase(); if (!placa) return alert_('Informe a placa.');
    const payload = {
      tenant_id: window._currentUserData?.tenant_id,
      tipo: get('tipo') || 'carro',
      modelo, fabricante: get('fabricante') || null,
      ano: getNum('ano'), cor: get('cor') || null,
      placa, chassi: get('chassi') || null, renavam: get('renavam') || null,
      combustivel_padrao: get('combustivel') || null,
      capacidade_tanque_l: getNum('tanque'),
      vencimento_licenciamento: getDt('venc_lic'),
      vencimento_seguro: getDt('venc_seg'),
      vencimento_ipva: getDt('venc_ipva'),
      vencimento_revisao: getDt('venc_rev'),
      status: get('status') || 'ativo',
      km_atual: getNum('km') || 0,
      responsavel_nome: get('resp') || null,
      data_aquisicao: getDt('aquisicao'),
      observacoes: get('obs') || null,
    };
    let veicId = id;
    if (id) {
      const { error } = await window.sb.from('frotas_veiculos').update(payload).eq('id', id);
      if (error) return alert_('Erro: '+error.message);
    } else {
      payload.criado_por = window._currentUserData?.id;
      payload.criado_por_nome = window._currentUserData?.nome;
      const { data, error } = await window.sb.from('frotas_veiculos').insert(payload).select().single();
      if (error) return alert_('Erro: '+error.message);
      veicId = data.id;
    }
    const state = _modalFotosState.get(mid);
    if (state) {
      for (const r of state.removidas) {
        if (r.storage_path) await window.deleteFromBucket('frotas-fotos', r.storage_path);
        await window.sb.from('frotas_veiculo_fotos').delete().eq('id', r.id);
      }
      for (let i=0; i<state.novas.length; i++) {
        const f = state.novas[i];
        const up = await window.uploadToBucket('frotas-fotos', f, 'veiculos/'+veicId);
        if (up) {
          await window.sb.from('frotas_veiculo_fotos').insert({
            veiculo_id: veicId, url: up.url, storage_path: up.path,
            ordem: state.existentes.length + i,
          });
        }
      }
      _modalFotosState.delete(mid);
    }
    document.getElementById(mid)?.remove();
    window.toastSuccess?.(id?'Veículo atualizado':'Veículo cadastrado');
    window.frotasVeiculosInit();
  };

  window._frotasVeiculoDelete = async (id, mid) => {
    if (!await nexusConfirm('Excluir este veículo? Histórico de uso e abastecimentos ficarão órfãos.')) return;
    const v = _veiculosCache.find(x => x.id === id);
    if (v?.frotas_veiculo_fotos) {
      for (const f of v.frotas_veiculo_fotos) {
        if (f.storage_path) await window.deleteFromBucket('frotas-fotos', f.storage_path);
      }
    }
    const { error } = await window.sb.from('frotas_veiculos').delete().eq('id', id);
    if (error) { nexusAlert('Erro: '+error.message); return; }
    document.getElementById(mid)?.remove();
    window.toastSuccess?.('Veículo excluído');
    window.frotasVeiculosInit();
  };
})();
