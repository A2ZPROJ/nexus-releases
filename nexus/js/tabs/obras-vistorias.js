// ==========================================================================
// ABA OBRAS-VISTORIAS
//
// Extraido do index.html em 22/08/2026 (linhas 41807-42231).
// So o JS saiu; o HTML continua no #tab-obras-vistorias. A IIFE foi mantida de
// proposito (ver tests/smoke/README.md e a memoria do split).
//
// expoe  -> _obrasComodoAdd, _obrasComodoDelete, _obrasComodoPerfilPreview, _obrasComodoRename, _obrasComodoSubmit, _obrasFotoDelete, _obrasItemAdd, _obrasItemDelete, _obrasItemFotosUpload, _obrasItemObs, _obrasItemRename, _obrasItemSetStatus, _obrasVistDelete, _obrasVistSave, obrasVistoriaOpenModal, obrasVistoriasInit, obrasVistoriasListRender
// consome-> window._currentUserData, window.deleteFromBucket, window.sb, window.toastError, window.toastSuccess, window.uploadToBucket
// ==========================================================================
(function(){
  function esc(s) { return String(s ?? '').replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c])); }

  const COMODOS_PADRAO = [
    { nome: 'Sala', perfil: 'comum' },
    { nome: 'Cozinha', perfil: 'cozinha' },
    { nome: 'Quarto 1', perfil: 'comum' },
    { nome: 'Quarto 2', perfil: 'comum' },
    { nome: 'Banheiro Social', perfil: 'banheiro' },
    { nome: 'Banheiro Suíte', perfil: 'banheiro' },
    { nome: 'Área de Serviço', perfil: 'servico' },
    { nome: 'Varanda', perfil: 'comum' },
  ];
  const ITENS_POR_PERFIL = {
    comum:     ['Paredes','Piso','Teto','Portas','Janelas','Tomadas e interruptores','Iluminação'],
    cozinha:   ['Paredes','Piso','Teto','Portas','Janelas','Tomadas e interruptores','Iluminação','Pia','Torneiras','Esgoto','Gás','Bancada','Armários planejados'],
    banheiro:  ['Paredes','Piso','Teto','Porta','Janela','Tomadas e interruptores','Iluminação','Vaso sanitário','Lavatório','Torneiras','Chuveiro','Caixa de descarga','Esgoto','Box'],
    servico:   ['Paredes','Piso','Teto','Porta','Janela','Tomadas e interruptores','Iluminação','Tanque','Torneiras','Esgoto','Saída de máquina'],
    gourmet:   ['Paredes','Piso','Teto','Portas','Janelas','Tomadas e interruptores','Iluminação','Pia','Torneiras','Esgoto','Gás','Bancada','Churrasqueira','Coifa/exaustor','Forno embutido','Bebedouro/cuba'],
    quintal:   ['Piso','Muros e gradis','Iluminação externa','Tomadas externas','Torneira externa','Esgoto','Portão'],
    garagem:   ['Piso','Paredes','Teto','Portão','Iluminação','Tomadas','Pintura demarcação'],
    custom:    [],
  };
  const PERFIS_LABELS = {
    comum: 'Comum (sala, quarto, varanda)',
    cozinha: 'Cozinha',
    banheiro: 'Banheiro / lavabo',
    servico: 'Área de serviço',
    gourmet: 'Espaço gourmet',
    quintal: 'Quintal / área externa',
    garagem: 'Garagem',
    custom: 'Sem itens (vazio)',
  };

  let _vistoriasCache = [];

  window.obrasVistoriasInit = async () => {
    const list = document.getElementById('obrasVistoriasList');
    if (!window.sb) { if (list) list.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text3)">Sem conexão.</div>'; return; }
    if (list) list.innerHTML = '<div class="empty-msg" style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text3);font-size:13px">Carregando…</div>';
    try {
      const { data, error } = await window.sb.from('obras_vistorias').select('*').order('criado_em', { ascending: false });
      if (error) {
        if (list) list.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:#dc2626">Erro: '+esc(error.message)+'</div>';
        return;
      }
      _vistoriasCache = data || [];
      window.obrasVistoriasListRender();
    } catch (e) {
      if (list) list.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:#dc2626">Falha: '+esc(e.message||String(e))+'</div>';
    }
  };

  window.obrasVistoriasListRender = () => {
    const list = document.getElementById('obrasVistoriasList'); if (!list) return;
    const busca = (document.getElementById('obrasVistFiltroBusca')?.value || '').toLowerCase().trim();
    const stat = document.getElementById('obrasVistFiltroStatus')?.value || '';
    let arr = _vistoriasCache;
    if (stat) arr = arr.filter(v => v.status === stat);
    if (busca) arr = arr.filter(v =>
      (v.titulo||'').toLowerCase().includes(busca) ||
      (v.construtora||'').toLowerCase().includes(busca) ||
      (v.cliente_nome||'').toLowerCase().includes(busca) ||
      (v.codigo||'').toLowerCase().includes(busca)
    );
    if (!arr.length) { list.innerHTML = '<div class="empty-msg" style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text3)">Nenhuma vistoria.</div>'; return; }
    const STATUS_COLOR = { rascunho:'#64748b', em_andamento:'#2563eb', finalizada:'#16a34a', aprovada:'#16a34a', com_pendencias:'#f59e0b' };
    list.innerHTML = arr.map(v => {
      const sc = STATUS_COLOR[v.status]||'#64748b';
      const total = (v.total_ok||0)+(v.total_pendencia||0)+(v.total_critico||0)+(v.total_na||0);
      return '<div onclick="window.obrasVistoriaOpenModal(\''+esc(v.id)+'\')" style="background:var(--surface);border-radius:10px;border:1px solid var(--border);padding:16px;cursor:pointer;transition:transform .15s,box-shadow .15s" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 8px 20px rgba(0,0,0,.08)\'" onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        +   '<span style="font-family:DM Mono,monospace;font-size:11px;color:var(--text3);font-weight:700">'+esc(v.codigo)+'</span>'
        +   '<span style="font-size:10px;font-weight:700;background:'+sc+'22;color:'+sc+';padding:3px 9px;border-radius:8px;text-transform:uppercase;letter-spacing:.5px">'+esc(v.status.replace('_',' '))+'</span>'
        + '</div>'
        + '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px">'+esc(v.titulo)+'</div>'
        + '<div style="font-size:12px;color:var(--text2);margin-bottom:8px">'+(v.construtora?esc(v.construtora)+' · ':'')+(v.data_vistoria?new Date(v.data_vistoria+'T00:00:00').toLocaleDateString('pt-BR'):'sem data')+'</div>'
        + (total>0 ? '<div style="display:flex;gap:6px;font-size:11px;font-family:DM Mono,monospace">'
            + (v.total_ok?'<span style="background:#16a34a22;color:#16a34a;padding:2px 8px;border-radius:6px;font-weight:600">✓ '+v.total_ok+'</span>':'')
            + (v.total_pendencia?'<span style="background:#f59e0b22;color:#b45309;padding:2px 8px;border-radius:6px;font-weight:600">⚠ '+v.total_pendencia+'</span>':'')
            + (v.total_critico?'<span style="background:#dc262622;color:#dc2626;padding:2px 8px;border-radius:6px;font-weight:600">🔴 '+v.total_critico+'</span>':'')
            + (v.total_na?'<span style="background:var(--surface2);color:var(--text3);padding:2px 8px;border-radius:6px">— '+v.total_na+'</span>':'')
          + '</div>' : '<div style="font-size:11px;color:var(--text3)">Sem itens vistoriados ainda</div>')
        + '</div>';
    }).join('');
  };

  // Modal completo: cabeçalho + cômodos + itens + fotos
  window.obrasVistoriaOpenModal = async (id) => {
    let v = id ? _vistoriasCache.find(x => x.id === id) : null;
    let comodos = [];
    if (id) {
      const { data: cs } = await window.sb.from('obras_vistoria_comodos').select('*').eq('vistoria_id', id).order('ordem');
      comodos = cs || [];
      const { data: items } = await window.sb.from('obras_vistoria_itens').select('*, obras_vistoria_fotos(id,url,storage_path,ordem,legenda)').eq('vistoria_id', id).order('ordem');
      const itensPorComodo = {};
      (items||[]).forEach(it => { (itensPorComodo[it.comodo_id] = itensPorComodo[it.comodo_id] || []).push(it); });
      comodos.forEach(c => c._itens = itensPorComodo[c.id] || []);
    }
    const mid = 'modalVist' + Date.now();
    const html = '<div id="'+mid+'" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto" onclick="if(event.target.id===\''+mid+'\') document.getElementById(\''+mid+'\').remove()">'
      + '<div style="background:var(--surface);border-radius:12px;width:100%;max-width:1100px;border:1px solid var(--border);margin:auto">'
      +   '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--surface);z-index:1;border-radius:12px 12px 0 0">'
      +     '<div style="font-size:16px;font-weight:700">'+(v?'Vistoria · '+esc(v.codigo):'Nova vistoria')+'</div>'
      +     '<button onclick="document.getElementById(\''+mid+'\').remove();window.obrasVistoriasInit()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer">×</button>'
      +   '</div>'
      +   '<div style="padding:20px 22px">'
      +     '<div id="'+mid+'_alert" style="display:none;padding:10px 14px;background:var(--red-l);border:1px solid var(--red);border-radius:6px;font-size:12px;color:var(--red);margin-bottom:14px"></div>'
      +     '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Identificação da vistoria</div>'
      +     '<div style="display:grid;grid-template-columns:140px 1fr 1fr;gap:10px;margin-bottom:10px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Tipo</label><select id="'+mid+'_tipo" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"><option value="apartamento">Apartamento</option><option value="casa">Casa</option><option value="comercial">Comercial</option><option value="outro">Outro</option></select></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Título * <span style="opacity:.6">(ex: Apto 304 · Bloco B)</span></label><input id="'+mid+'_titulo" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Data</label><input id="'+mid+'_data" type="date" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '</div>'
      +     '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Construtora</label><input id="'+mid+'_construtora" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Endereço</label><input id="'+mid+'_endereco" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '</div>'
      +     '<div style="display:grid;grid-template-columns:1fr 1fr 200px;gap:10px;margin-bottom:10px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Cliente (proprietário)</label><input id="'+mid+'_cliente" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Vistoriador</label><input id="'+mid+'_vistoriador" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Status</label><select id="'+mid+'_status" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"><option value="rascunho">Rascunho</option><option value="em_andamento">Em andamento</option><option value="finalizada">Finalizada</option><option value="aprovada">Aprovada</option><option value="com_pendencias">Com pendências</option></select></div>'
      +     '</div>'
      +     '<div style="margin-bottom:14px"><label style="font-size:11px;color:var(--text3)">Observações gerais</label><textarea id="'+mid+'_obs" rows="2" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical;font-family:inherit"></textarea></div>'
      +     '<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:18px">'
      +       '<button onclick="window._obrasVistSave(\''+(v?esc(v.id):'')+'\',\''+mid+'\')" style="background:var(--accent);color:#fff;padding:9px 20px;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">'+(v?'Salvar cabeçalho':'Criar vistoria')+'</button>'
      +     '</div>'
      +     (v
        ? '<div style="border-top:1px solid var(--border);padding-top:18px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
          +   '<div style="font-size:13px;font-weight:700">Cômodos & itens</div>'
          +   '<button onclick="window._obrasComodoAdd(\''+esc(v.id)+'\',\''+mid+'\')" style="background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent);border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600">+ Adicionar cômodo</button>'
          + '</div>'
          + '<div id="'+mid+'_comodos">'+_renderComodos(v.id, comodos, mid)+'</div>'
        + '</div>'
        : '<div style="background:var(--accent-soft);border:1px solid var(--accent);border-radius:8px;padding:14px;font-size:12px;color:var(--text2)">Salve o cabeçalho pra começar a adicionar cômodos e itens. A vistoria já vai ser pré-populada com cômodos padrão (Sala, Quartos, Banheiros, Cozinha, Área de serviço, Varanda).</div>')
      +   '</div>'
      +   '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;position:sticky;bottom:0;background:var(--surface);border-radius:0 0 12px 12px">'
      +     '<div>'+(v?'<button onclick="window._obrasVistDelete(\''+esc(v.id)+'\',\''+mid+'\')" style="background:var(--red-l);color:var(--red);border:1px solid var(--red);padding:8px 14px;border-radius:6px;font-size:12px;cursor:pointer">Excluir vistoria</button>':'')+'</div>'
      +     '<div style="display:flex;gap:8px">'
      +       '<button onclick="document.getElementById(\''+mid+'\').remove();window.obrasVistoriasInit()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px">Fechar</button>'
      +     '</div>'
      +   '</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    if (v) {
      const set = (k, val) => { const e = document.getElementById(mid+'_'+k); if (e && val!=null) e.value = val; };
      set('tipo', v.tipo); set('titulo', v.titulo); set('data', v.data_vistoria);
      set('construtora', v.construtora); set('endereco', v.endereco);
      set('cliente', v.cliente_nome); set('vistoriador', v.vistoriador_nome);
      set('status', v.status); set('obs', v.observacoes_gerais);
    } else {
      document.getElementById(mid+'_data').value = new Date().toISOString().slice(0,10);
      document.getElementById(mid+'_vistoriador').value = window._currentUserData?.nome || '';
    }
  };

  function _renderComodos(vistoriaId, comodos, mid) {
    if (!comodos.length) return '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;background:var(--surface2);border-radius:8px">Nenhum cômodo. Clique em "+ Adicionar cômodo" pra começar.</div>';
    return comodos.map(c => '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;margin-bottom:10px;overflow:hidden" data-comodo-id="'+esc(c.id)+'">'
      + '<div style="padding:10px 14px;background:var(--surface);display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">'
      +   '<input type="text" value="'+esc(c.nome)+'" onclick="event.stopPropagation()" onblur="window._obrasComodoRename(\''+esc(c.id)+'\',this.value)" style="border:none;background:transparent;font-size:14px;font-weight:700;color:var(--text);outline:none;flex:1">'
      +   '<div style="display:flex;gap:6px;align-items:center">'
      +     '<span style="font-size:11px;color:var(--text3)">'+(c._itens?.length||0)+' iten(s)</span>'
      +     '<button onclick="event.stopPropagation();window._obrasComodoDelete(\''+esc(c.id)+'\',\''+esc(vistoriaId)+'\',\''+mid+'\')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px" title="Excluir cômodo">🗑</button>'
      +   '</div>'
      + '</div>'
      + '<div style="padding:10px 14px">'
      +   (c._itens||[]).map(it => _renderItem(it, vistoriaId, mid)).join('')
      +   '<button onclick="window._obrasItemAdd(\''+esc(c.id)+'\',\''+esc(vistoriaId)+'\',\''+mid+'\')" style="background:transparent;color:var(--accent);border:1px dashed var(--accent);border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;margin-top:6px;width:100%">+ Adicionar item</button>'
      + '</div>'
      + '</div>').join('');
  }

  function _renderItem(it, vistoriaId, mid) {
    const fotos = it.obras_vistoria_fotos || [];
    const STATUS = [
      { v:'ok', label:'OK', color:'#16a34a' },
      { v:'pendencia', label:'PEND', color:'#f59e0b' },
      { v:'critico', label:'CRÍT', color:'#dc2626' },
      { v:'na', label:'N/A', color:'#94a3b8' },
    ];
    return '<div data-item-id="'+esc(it.id)+'" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:8px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      +   '<input type="text" value="'+esc(it.nome)+'" onblur="window._obrasItemRename(\''+esc(it.id)+'\',this.value)" style="border:none;background:transparent;font-size:13px;font-weight:600;color:var(--text);outline:none;flex:1">'
      +   '<div style="display:flex;gap:3px">'
      +     STATUS.map(s => '<button onclick="window._obrasItemSetStatus(\''+esc(it.id)+'\',\''+s.v+'\',this)" style="background:'+(it.status===s.v?s.color:'transparent')+';color:'+(it.status===s.v?'#fff':s.color)+';border:1.5px solid '+s.color+';border-radius:5px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:.5px">'+s.label+'</button>').join('')
      +   '</div>'
      +   '<button onclick="window._obrasItemDelete(\''+esc(it.id)+'\',\''+esc(vistoriaId)+'\',\''+mid+'\')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:12px" title="Excluir item">×</button>'
      + '</div>'
      + '<textarea placeholder="Observação…" onblur="window._obrasItemObs(\''+esc(it.id)+'\',this.value)" rows="1" style="width:100%;padding:6px 8px;border:1px solid var(--border2);border-radius:5px;background:var(--surface2);color:var(--text);font-size:12px;font-family:inherit;resize:vertical;margin-bottom:6px">'+esc(it.observacao||'')+'</textarea>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
      +   fotos.map(f => '<div style="position:relative;width:60px;height:60px;border-radius:5px;overflow:hidden;border:1px solid var(--border);background:#f1f5f9 url(\''+esc(f.url)+'\') center/cover">'
      +     '<button onclick="window._obrasFotoDelete(\''+esc(f.id)+'\',\''+esc(f.storage_path||'')+'\',\''+esc(vistoriaId)+'\',\''+mid+'\')" style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,.85);color:#fff;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:11px;line-height:1">×</button></div>').join('')
      +   '<input type="file" id="foto_'+it.id+'" accept="image/*" multiple style="display:none" onchange="window._obrasItemFotosUpload(\''+esc(it.id)+'\',\''+esc(vistoriaId)+'\',this.files,\''+mid+'\')">'
      +   '<button onclick="document.getElementById(\'foto_'+it.id+'\').click()" style="background:var(--surface2);border:1px dashed var(--border2);color:var(--text2);border-radius:5px;width:60px;height:60px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">📷</button>'
      + '</div>'
      + '</div>';
  }

  // ---- Save header (cria/atualiza) ----
  window._obrasVistSave = async (id, mid) => {
    const get = (k) => document.getElementById(mid+'_'+k)?.value?.trim() || '';
    const alert_ = (msg) => { const a = document.getElementById(mid+'_alert'); if (a){a.textContent=msg;a.style.display='block'; setTimeout(()=>a.style.display='none', 5000);} };
    const titulo = get('titulo'); if (!titulo) return alert_('Informe o título.');
    const payload = {
      tenant_id: window._currentUserData?.tenant_id,
      tipo: get('tipo') || 'apartamento',
      titulo,
      construtora: get('construtora') || null,
      endereco: get('endereco') || null,
      cliente_nome: get('cliente') || null,
      vistoriador_nome: get('vistoriador') || null,
      data_vistoria: get('data') || null,
      status: get('status') || 'rascunho',
      observacoes_gerais: get('obs') || null,
    };
    if (id) {
      const { error } = await window.sb.from('obras_vistorias').update(payload).eq('id', id);
      if (error) return alert_('Erro: '+error.message);
      window.toastSuccess?.('Cabeçalho salvo');
      // Re-carrega modal
      document.getElementById(mid)?.remove();
      await window.obrasVistoriasInit();
      window.obrasVistoriaOpenModal(id);
    } else {
      payload.criado_por = window._currentUserData?.id;
      payload.criado_por_nome = window._currentUserData?.nome;
      const { data, error } = await window.sb.from('obras_vistorias').insert(payload).select().single();
      if (error) return alert_('Erro: '+error.message);
      // Popula cômodos+itens padrão
      for (let i=0; i<COMODOS_PADRAO.length; i++) {
        const cp = COMODOS_PADRAO[i];
        const { data: comodo, error: ec } = await window.sb.from('obras_vistoria_comodos').insert({
          vistoria_id: data.id, nome: cp.nome, ordem: i,
        }).select().single();
        if (ec) continue;
        const itens = ITENS_POR_PERFIL[cp.perfil] || [];
        const itensRows = itens.map((nome, idx) => ({
          comodo_id: comodo.id, vistoria_id: data.id, nome, status: 'na', ordem: idx,
        }));
        if (itensRows.length) await window.sb.from('obras_vistoria_itens').insert(itensRows);
      }
      window.toastSuccess?.('Vistoria criada com cômodos padrão');
      document.getElementById(mid)?.remove();
      await window.obrasVistoriasInit();
      window.obrasVistoriaOpenModal(data.id);
    }
  };

  window._obrasVistDelete = async (id, mid) => {
    if (!await nexusConfirm('Excluir vistoria? Cômodos, itens e fotos serão apagados.')) return;
    // Deleta fotos do storage
    const { data: fotos } = await window.sb.from('obras_vistoria_fotos').select('storage_path').eq('vistoria_id', id);
    for (const f of (fotos||[])) {
      if (f.storage_path) await window.deleteFromBucket('obras-vistorias', f.storage_path);
    }
    const { error } = await window.sb.from('obras_vistorias').delete().eq('id', id);
    if (error) { nexusAlert('Erro: '+error.message); return; }
    document.getElementById(mid)?.remove();
    window.toastSuccess?.('Vistoria excluída');
    window.obrasVistoriasInit();
  };

  // ---- Cômodos ----
  window._obrasComodoAdd = (vistoriaId, mid) => {
    const cmid = 'modalAddComodo' + Date.now();
    const sugestoes = ['Sala','Sala de jantar','Quarto','Suíte','Cozinha','Espaço gourmet','Banheiro','Lavabo','Área de serviço','Varanda','Quintal','Garagem','Despensa','Closet','Hall','Escritório'];
    const html = '<div id="'+cmid+'" style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target.id===\''+cmid+'\') document.getElementById(\''+cmid+'\').remove()">'
      + '<div style="background:var(--surface);border-radius:12px;width:100%;max-width:480px;border:1px solid var(--border)">'
      +   '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'
      +     '<div style="font-size:15px;font-weight:700">Adicionar cômodo</div>'
      +     '<button onclick="document.getElementById(\''+cmid+'\').remove()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer">×</button>'
      +   '</div>'
      +   '<div style="padding:18px 20px">'
      +     '<div id="'+cmid+'_alert" style="display:none;padding:9px 12px;background:var(--red-l);border:1px solid var(--red);border-radius:6px;font-size:12px;color:var(--red);margin-bottom:12px"></div>'
      +     '<div style="margin-bottom:12px"><label style="font-size:11px;color:var(--text3)">Nome do cômodo *</label>'
      +       '<input id="'+cmid+'_nome" type="text" autofocus list="'+cmid+'_sug" placeholder="Ex: Quarto 3, Espaço gourmet, Lavabo…" style="width:100%;padding:9px 12px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:14px">'
      +       '<datalist id="'+cmid+'_sug">'+sugestoes.map(s => '<option value="'+esc(s)+'">').join('')+'</datalist></div>'
      +     '<div style="margin-bottom:12px"><label style="font-size:11px;color:var(--text3)">Perfil (define itens automáticos)</label>'
      +       '<select id="'+cmid+'_perfil" onchange="window._obrasComodoPerfilPreview(\''+cmid+'\')" style="width:100%;padding:9px 12px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:14px">'
      +         Object.entries(PERFIS_LABELS).map(([k,l]) => '<option value="'+k+'">'+esc(l)+'</option>').join('')
      +       '</select></div>'
      +     '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--text2);max-height:160px;overflow-y:auto">'
      +       '<div style="font-weight:700;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;font-size:10px">Itens que serão criados</div>'
      +       '<div id="'+cmid+'_preview"></div>'
      +     '</div>'
      +     '<div style="font-size:11px;color:var(--text3);margin-top:8px">💡 Você pode adicionar/remover itens depois pelo botão "+ Adicionar item" dentro do cômodo (ex: "Piscina" no gourmet ou "Banheira" na suíte).</div>'
      +   '</div>'
      +   '<div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">'
      +     '<button onclick="document.getElementById(\''+cmid+'\').remove()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px">Cancelar</button>'
      +     '<button onclick="window._obrasComodoSubmit(\''+esc(vistoriaId)+'\',\''+cmid+'\',\''+mid+'\')" style="background:var(--accent);color:#fff;padding:9px 20px;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">Adicionar</button>'
      +   '</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    setTimeout(() => { document.getElementById(cmid+'_nome')?.focus(); }, 50);
    window._obrasComodoPerfilPreview(cmid);
  };

  window._obrasComodoPerfilPreview = (cmid) => {
    const perfil = document.getElementById(cmid+'_perfil')?.value || 'comum';
    const itens = ITENS_POR_PERFIL[perfil] || [];
    const div = document.getElementById(cmid+'_preview'); if (!div) return;
    div.innerHTML = itens.length
      ? itens.map(i => '<span style="display:inline-block;background:var(--surface);border:1px solid var(--border);padding:2px 8px;border-radius:10px;margin:2px;font-size:11px">'+esc(i)+'</span>').join('')
      : '<span style="color:var(--text3);font-style:italic">Nenhum item — você adiciona manualmente depois.</span>';
  };

  window._obrasComodoSubmit = async (vistoriaId, cmid, mid) => {
    const nome = document.getElementById(cmid+'_nome')?.value?.trim();
    const perfil = document.getElementById(cmid+'_perfil')?.value || 'comum';
    const alert_ = (msg) => { const a = document.getElementById(cmid+'_alert'); if (a){a.textContent=msg;a.style.display='block'; setTimeout(()=>a.style.display='none', 5000);} };
    if (!nome) return alert_('Informe o nome do cômodo.');
    const { data: cs } = await window.sb.from('obras_vistoria_comodos').select('ordem').eq('vistoria_id', vistoriaId).order('ordem',{ascending:false}).limit(1);
    const ordem = (cs?.[0]?.ordem || 0) + 1;
    const { data, error } = await window.sb.from('obras_vistoria_comodos').insert({
      vistoria_id: vistoriaId, nome, ordem,
    }).select().single();
    if (error) return alert_('Erro: '+error.message);
    const itens = ITENS_POR_PERFIL[perfil] || [];
    if (itens.length) {
      const rows = itens.map((n,i) => ({ comodo_id: data.id, vistoria_id: vistoriaId, nome: n, status: 'na', ordem: i }));
      await window.sb.from('obras_vistoria_itens').insert(rows);
    }
    document.getElementById(cmid)?.remove();
    window.toastSuccess?.('Cômodo "' + nome + '" adicionado com ' + itens.length + ' item(ns)');
    _refreshModalComodos(vistoriaId, mid);
  };

  window._obrasComodoRename = async (id, novoNome) => {
    const n = (novoNome||'').trim(); if (!n) return;
    await window.sb.from('obras_vistoria_comodos').update({ nome: n }).eq('id', id);
  };

  window._obrasComodoDelete = async (id, vistoriaId, mid) => {
    if (!await nexusConfirm('Excluir este cômodo e todos seus itens?')) return;
    const { data: fotos } = await window.sb.from('obras_vistoria_fotos').select('storage_path,obras_vistoria_itens!inner(comodo_id)').eq('obras_vistoria_itens.comodo_id', id);
    for (const f of (fotos||[])) {
      if (f.storage_path) await window.deleteFromBucket('obras-vistorias', f.storage_path);
    }
    await window.sb.from('obras_vistoria_comodos').delete().eq('id', id);
    _refreshModalComodos(vistoriaId, mid);
  };

  // ---- Itens ----
  window._obrasItemAdd = async (comodoId, vistoriaId, mid) => {
    const nome = await nexusPrompt('Nome do item:');
    if (!nome?.trim()) return;
    const { data: items } = await window.sb.from('obras_vistoria_itens').select('ordem').eq('comodo_id', comodoId).order('ordem',{ascending:false}).limit(1);
    const ordem = (items?.[0]?.ordem || 0) + 1;
    await window.sb.from('obras_vistoria_itens').insert({
      comodo_id: comodoId, vistoria_id: vistoriaId, nome: nome.trim(), status: 'na', ordem,
    });
    _refreshModalComodos(vistoriaId, mid);
  };

  window._obrasItemRename = async (id, novoNome) => {
    const n = (novoNome||'').trim(); if (!n) return;
    await window.sb.from('obras_vistoria_itens').update({ nome: n }).eq('id', id);
  };

  window._obrasItemSetStatus = async (id, status, btn) => {
    await window.sb.from('obras_vistoria_itens').update({ status }).eq('id', id);
    // Atualiza visual local sem re-render completo
    const row = btn.parentElement;
    const COLORS = { ok:'#16a34a', pendencia:'#f59e0b', critico:'#dc2626', na:'#94a3b8' };
    [...row.children].forEach(b => {
      const isActive = b === btn;
      const c = b.style.borderColor || '';
      const cm = c.match(/rgb\((\d+), (\d+), (\d+)\)/);
      // Re-deduz a cor: pelo texto da label
      const lbl = b.textContent.trim();
      const map = { 'OK':'#16a34a', 'PEND':'#f59e0b', 'CRÍT':'#dc2626', 'N/A':'#94a3b8' };
      const cor = map[lbl] || '#94a3b8';
      b.style.background = isActive ? cor : 'transparent';
      b.style.color = isActive ? '#fff' : cor;
    });
  };

  window._obrasItemObs = async (id, obs) => {
    await window.sb.from('obras_vistoria_itens').update({ observacao: obs?.trim() || null }).eq('id', id);
  };

  window._obrasItemDelete = async (id, vistoriaId, mid) => {
    if (!await nexusConfirm('Excluir este item e suas fotos?')) return;
    const { data: fotos } = await window.sb.from('obras_vistoria_fotos').select('storage_path').eq('item_id', id);
    for (const f of (fotos||[])) {
      if (f.storage_path) await window.deleteFromBucket('obras-vistorias', f.storage_path);
    }
    await window.sb.from('obras_vistoria_itens').delete().eq('id', id);
    _refreshModalComodos(vistoriaId, mid);
  };

  // ---- Fotos ----
  window._obrasItemFotosUpload = async (itemId, vistoriaId, files, mid) => {
    if (!files?.length) return;
    for (const f of files) {
      if (f.size > 5*1024*1024) { window.toastError?.('Foto muito grande: '+f.name); continue; }
      const up = await window.uploadToBucket('obras-vistorias', f, 'vistorias/'+vistoriaId+'/'+itemId);
      if (up) {
        await window.sb.from('obras_vistoria_fotos').insert({
          item_id: itemId, vistoria_id: vistoriaId, url: up.url, storage_path: up.path,
        });
      }
    }
    _refreshModalComodos(vistoriaId, mid);
  };

  window._obrasFotoDelete = async (id, path, vistoriaId, mid) => {
    if (path) await window.deleteFromBucket('obras-vistorias', path);
    await window.sb.from('obras_vistoria_fotos').delete().eq('id', id);
    _refreshModalComodos(vistoriaId, mid);
  };

  // Re-renderiza só a área de cômodos (não o modal inteiro)
  async function _refreshModalComodos(vistoriaId, mid) {
    const { data: cs } = await window.sb.from('obras_vistoria_comodos').select('*').eq('vistoria_id', vistoriaId).order('ordem');
    const { data: items } = await window.sb.from('obras_vistoria_itens').select('*, obras_vistoria_fotos(id,url,storage_path,ordem,legenda)').eq('vistoria_id', vistoriaId).order('ordem');
    const itensPorComodo = {};
    (items||[]).forEach(it => { (itensPorComodo[it.comodo_id] = itensPorComodo[it.comodo_id] || []).push(it); });
    (cs||[]).forEach(c => c._itens = itensPorComodo[c.id] || []);
    const div = document.getElementById(mid+'_comodos');
    if (div) div.innerHTML = _renderComodos(vistoriaId, cs||[], mid);
  }
})();
