// ==========================================================================
// ABA FROTAS-ABASTEC
//
// Extraido do index.html em 22/08/2026 (linhas 41545-41800).
// So o JS saiu; o HTML continua no #tab-frotas-abastec. A IIFE foi mantida de
// proposito (ver tests/smoke/README.md e a memoria do split).
//
// expoe  -> _frotasAbastecCalc, _frotasAbastecDelete, _frotasAbastecPreviewFoto, _frotasAbastecSave, frotasAbastecInit, frotasAbastecListRender, frotasAbastecOpenModal
// consome-> window._currentUserData, window._frotasVeiculosCache, window.deleteFromBucket, window.frotasVeiculosInit, window.sb, window.toastSuccess, window.uploadToBucket
// ==========================================================================
(function(){
  function esc(s) { return String(s ?? '').replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c])); }
  let _abastecCache = [];

  window.frotasAbastecInit = async () => {
    const list = document.getElementById('frotasAbastecList');
    if (!window.sb) {
      if (list) list.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">Sem conexão Supabase.</div>';
      return;
    }
    if (list) list.innerHTML = '<div class="empty-msg" style="padding:40px;text-align:center;color:var(--text3);font-size:13px">Carregando…</div>';
    try {
      if (!window._frotasVeiculosCache?.()?.length) await window.frotasVeiculosInit?.();
      const { data, error } = await window.sb
        .from('frotas_abastecimentos')
        .select('*, veiculo:veiculo_id(codigo,placa,modelo)')
        .order('dt_abastecimento', { ascending: false }).limit(500);
      if (error) {
        console.error('[frotas-abastec]', error);
        if (list) list.innerHTML = '<div style="padding:40px;text-align:center;color:#dc2626;font-size:13px">Erro: '+esc(error.message)+'</div>';
        return;
      }
      _abastecCache = data || [];
      window.frotasAbastecListRender();
      _renderKpis();
    } catch (e) {
      console.error('[frotas-abastec exception]', e);
      if (list) list.innerHTML = '<div style="padding:40px;text-align:center;color:#dc2626;font-size:13px">Falha: '+esc(e.message||String(e))+'</div>';
    }
  };

  function _renderKpis() {
    const div = document.getElementById('frotasAbastecKpis'); if (!div) return;
    const arr = _abastecCache;
    const totalLitros = arr.reduce((a,x) => a + Number(x.litros||0), 0);
    const totalReais = arr.reduce((a,x) => a + Number(x.valor_total||0), 0);
    const consumosVal = arr.filter(x => Number(x.consumo_kml) > 0).map(x => Number(x.consumo_kml));
    const consumoMedio = consumosVal.length ? (consumosVal.reduce((a,b)=>a+b,0)/consumosVal.length) : 0;
    const cards = [
      { label:'Abastecimentos', val: arr.length },
      { label:'Litros', val: totalLitros.toFixed(1).replace('.',',')+' L' },
      { label:'Total gasto', val: 'R$ '+totalReais.toFixed(2).replace('.',',') },
      { label:'Consumo médio', val: consumoMedio? consumoMedio.toFixed(2).replace('.',',')+' km/L' : '—' },
    ];
    div.innerHTML = cards.map(c => '<div style="background:var(--surface);border-radius:10px;border:1px solid var(--border);padding:14px 18px"><div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">'+c.label+'</div><div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px">'+c.val+'</div></div>').join('');
  }

  window.frotasAbastecListRender = () => {
    const list = document.getElementById('frotasAbastecList'); if (!list) return;
    const veicId = document.getElementById('frotasAbastecFiltroVeic')?.value || '';
    const de = document.getElementById('frotasAbastecFiltroDe')?.value || '';
    const ate = document.getElementById('frotasAbastecFiltroAte')?.value || '';
    let arr = _abastecCache;
    if (veicId) arr = arr.filter(x => x.veiculo_id === veicId);
    if (de) arr = arr.filter(x => x.dt_abastecimento >= de);
    if (ate) arr = arr.filter(x => x.dt_abastecimento <= ate+'T23:59:59');
    if (!arr.length) {
      list.innerHTML = '<div class="empty-msg" style="padding:40px;text-align:center;color:var(--text3);font-size:13px">Nenhum abastecimento.</div>';
      return;
    }
    list.innerHTML = '<div style="background:var(--surface);border-radius:10px;border:1px solid var(--border);overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:900px">'
      + '<thead style="background:var(--surface2)"><tr>'
      + '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Data</th>'
      + '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Veículo</th>'
      + '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Combustível</th>'
      + '<th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Litros</th>'
      + '<th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Valor</th>'
      + '<th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">KM</th>'
      + '<th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">km/L</th>'
      + '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Fotos</th>'
      + '</tr></thead><tbody>'
      + arr.map(x => {
        const fotos = [x.foto_comprovante_url, x.foto_km_url, x.foto_bomba_url].filter(Boolean);
        const consumoBaixo = x.consumo_kml > 0 && x.consumo_kml < 6;
        return '<tr style="border-top:1px solid var(--border);cursor:pointer" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'" onclick="window.frotasAbastecOpenModal(\''+esc(x.id)+'\')">'
          + '<td style="padding:10px 12px;color:var(--text)">'+new Date(x.dt_abastecimento).toLocaleString('pt-BR')+'</td>'
          + '<td style="padding:10px 12px;color:var(--text)">'+esc(x.veiculo?.placa||'?')+' <span style="color:var(--text3);font-size:11px">'+esc(x.veiculo?.modelo||'')+'</span></td>'
          + '<td style="padding:10px 12px;color:var(--text2)">'+esc(x.combustivel)+'</td>'
          + '<td style="padding:10px 12px;color:var(--text);text-align:right;font-family:DM Mono,monospace">'+Number(x.litros).toFixed(2).replace('.',',')+'</td>'
          + '<td style="padding:10px 12px;color:var(--text);text-align:right;font-family:DM Mono,monospace">R$ '+Number(x.valor_total).toFixed(2).replace('.',',')+'</td>'
          + '<td style="padding:10px 12px;color:var(--text);text-align:right;font-family:DM Mono,monospace">'+Number(x.km_atual).toLocaleString('pt-BR')+'</td>'
          + '<td style="padding:10px 12px;color:'+(consumoBaixo?'#dc2626':'var(--text2)')+';text-align:right;font-family:DM Mono,monospace;font-weight:'+(consumoBaixo?'700':'400')+'">'+(x.consumo_kml? Number(x.consumo_kml).toFixed(2).replace('.',',') : '—')+'</td>'
          + '<td style="padding:10px 12px">'+fotos.map(u => '<img src="'+esc(u)+'" style="width:28px;height:28px;border-radius:4px;object-fit:cover;display:inline-block;margin-right:2px">').join('')+'</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table></div>';
  };

  window.frotasAbastecOpenModal = (editId) => {
    const veiculos = window._frotasVeiculosCache?.() || [];
    if (!veiculos.length) { nexusAlert('Cadastre pelo menos 1 veículo antes.'); return; }
    const item = editId ? _abastecCache.find(x => x.id === editId) : null;
    const mid = 'modalAbastec' + Date.now();
    const html = '<div id="'+mid+'" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto" onclick="if(event.target.id===\''+mid+'\') document.getElementById(\''+mid+'\').remove()">'
      + '<div style="background:var(--surface);border-radius:12px;width:100%;max-width:760px;border:1px solid var(--border);margin:auto">'
      +   '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--surface);z-index:1;border-radius:12px 12px 0 0">'
      +     '<div style="font-size:16px;font-weight:700">'+(item?'Editar abastecimento':'Novo abastecimento')+'</div>'
      +     '<button onclick="document.getElementById(\''+mid+'\').remove()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer">×</button>'
      +   '</div>'
      +   '<div style="padding:20px 22px">'
      +     '<div id="'+mid+'_alert" style="display:none;padding:10px 14px;background:var(--red-l);border:1px solid var(--red);border-radius:6px;font-size:12px;color:var(--red);margin-bottom:14px"></div>'
      +     '<div style="display:grid;grid-template-columns:1fr 200px;gap:10px;margin-bottom:10px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Veículo *</label><select id="'+mid+'_veic" onchange="window._frotasAbastecCalc(\''+mid+'\')" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)">'
      +         veiculos.map(v => '<option value="'+esc(v.id)+'">'+esc(v.codigo)+' · '+esc(v.placa)+' · '+esc(v.modelo)+' ('+(Number(v.km_atual)||0).toLocaleString('pt-BR')+' km)</option>').join('')
      +       '</select></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Data/hora *</label><input id="'+mid+'_dt" type="datetime-local" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '</div>'
      +     '<div style="display:grid;grid-template-columns:160px 1fr 1fr;gap:10px;margin-bottom:10px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">Combustível *</label><select id="'+mid+'_comb" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"><option value="gasolina">Gasolina</option><option value="etanol">Etanol</option><option value="diesel">Diesel</option><option value="flex">Flex</option><option value="gnv">GNV</option><option value="arla">Arla 32</option></select></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Litros *</label><input id="'+mid+'_litros" type="number" step="0.001" oninput="window._frotasAbastecCalc(\''+mid+'\')" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Valor total (R$) *</label><input id="'+mid+'_valor" type="number" step="0.01" oninput="window._frotasAbastecCalc(\''+mid+'\')" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '</div>'
      +     '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">'
      +       '<div><label style="font-size:11px;color:var(--text3)">KM atual *</label><input id="'+mid+'_km" type="number" oninput="window._frotasAbastecCalc(\''+mid+'\')" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">Posto / local</label><input id="'+mid+'_posto" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div><label style="font-size:11px;color:var(--text3)">OSE (opcional)</label><input id="'+mid+'_ose" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +     '</div>'
      +     '<div id="'+mid+'_calc" style="background:var(--surface2);border-radius:6px;padding:10px 14px;font-size:12px;color:var(--text2);margin-bottom:14px;font-family:DM Mono,monospace">Preencha litros, valor e KM pra ver o cálculo</div>'
      +     '<div style="margin-bottom:14px"><label style="font-size:11px;color:var(--text3)">Motorista</label><input id="'+mid+'_motorista" type="text" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)" placeholder="Nome de quem abasteceu"></div>'
      +     '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Fotos (3 obrigatórias)</div>'
      +     '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">'
      +       ['comprovante','km','bomba'].map(slot => {
                const lbl = slot==='comprovante'?'Comprovante':(slot==='km'?'KM no painel':'Bomba');
                return '<div><label style="font-size:11px;color:var(--text3);margin-bottom:4px;display:block">'+lbl+' *</label>'
                  + '<input type="file" id="'+mid+'_foto_'+slot+'" accept="image/*" style="display:none" onchange="window._frotasAbastecPreviewFoto(\''+mid+'\',\''+slot+'\',this.files[0])">'
                  + '<div id="'+mid+'_foto_'+slot+'_prev" onclick="document.getElementById(\''+mid+'_foto_'+slot+'\').click()" style="width:100%;aspect-ratio:1/1;border:2px dashed var(--border2);border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:var(--surface2);font-size:11px;color:var(--text3);text-align:center;padding:8px">Clique pra adicionar</div>'
                  + '</div>';
              }).join('')
      +     '</div>'
      +     '<div><label style="font-size:11px;color:var(--text3)">Observação</label><textarea id="'+mid+'_obs" rows="2" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical;font-family:inherit"></textarea></div>'
      +   '</div>'
      +   '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;position:sticky;bottom:0;background:var(--surface);border-radius:0 0 12px 12px">'
      +     '<div>'+(item?'<button onclick="window._frotasAbastecDelete(\''+esc(item.id)+'\',\''+mid+'\')" style="background:var(--red-l);color:var(--red);border:1px solid var(--red);padding:8px 14px;border-radius:6px;font-size:12px;cursor:pointer">Excluir</button>':'')+'</div>'
      +     '<div style="display:flex;gap:8px">'
      +       '<button onclick="document.getElementById(\''+mid+'\').remove()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px">Cancelar</button>'
      +       '<button onclick="window._frotasAbastecSave(\''+(item?esc(item.id):'')+'\',\''+mid+'\')" style="background:var(--accent);color:#fff;padding:9px 22px;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">'+(item?'Salvar':'Registrar')+'</button>'
      +     '</div>'
      +   '</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById(mid+'_dt').value = new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    if (item) {
      document.getElementById(mid+'_veic').value = item.veiculo_id;
      document.getElementById(mid+'_dt').value = item.dt_abastecimento.slice(0,16);
      document.getElementById(mid+'_comb').value = item.combustivel;
      document.getElementById(mid+'_litros').value = item.litros;
      document.getElementById(mid+'_valor').value = item.valor_total;
      document.getElementById(mid+'_km').value = item.km_atual;
      document.getElementById(mid+'_posto').value = item.posto_local || '';
      document.getElementById(mid+'_ose').value = item.ose_numero || '';
      document.getElementById(mid+'_motorista').value = item.motorista_nome || '';
      document.getElementById(mid+'_obs').value = item.observacao || '';
      ['comprovante','km','bomba'].forEach(slot => {
        const url = item['foto_'+slot+'_url'];
        if (url) {
          const prev = document.getElementById(mid+'_foto_'+slot+'_prev');
          prev.innerHTML = '<img src="'+esc(url)+'" style="width:100%;height:100%;object-fit:cover;border-radius:6px">';
        }
      });
      window._frotasAbastecCalc(mid);
    }
  };

  window._frotasAbastecPreviewFoto = (mid, slot, file) => {
    if (!file) return;
    if (file.size > 5*1024*1024) { nexusAlert('Foto muito grande (máx 5 MB)'); return; }
    const prev = document.getElementById(mid+'_foto_'+slot+'_prev');
    prev.innerHTML = '<img src="'+URL.createObjectURL(file)+'" style="width:100%;height:100%;object-fit:cover;border-radius:6px">';
  };

  window._frotasAbastecCalc = (mid) => {
    const litros = parseFloat(document.getElementById(mid+'_litros')?.value);
    const valor = parseFloat(document.getElementById(mid+'_valor')?.value);
    const kmAtual = parseFloat(document.getElementById(mid+'_km')?.value);
    const veicId = document.getElementById(mid+'_veic')?.value;
    const veic = (window._frotasVeiculosCache?.()||[]).find(v => v.id === veicId);
    const div = document.getElementById(mid+'_calc'); if (!div) return;
    const lines = [];
    if (litros > 0 && valor > 0) lines.push('Valor por litro: <strong>R$ ' + (valor/litros).toFixed(3).replace('.',',') + '</strong>');
    if (veic && kmAtual > 0) {
      const dif = kmAtual - (Number(veic.km_atual)||0);
      if (dif > 0 && litros > 0) {
        lines.push('KM rodado desde último: <strong>' + dif.toLocaleString('pt-BR') + ' km</strong>');
        lines.push('Consumo: <strong>' + (dif/litros).toFixed(2).replace('.',',') + ' km/L</strong>');
      }
      if (dif < 0) lines.push('<span style="color:#dc2626">⚠ KM informado é MENOR que o KM atual do veículo (' + (Number(veic.km_atual)||0).toLocaleString('pt-BR') + ').</span>');
    }
    div.innerHTML = lines.length ? lines.join('<br>') : 'Preencha litros, valor e KM pra ver o cálculo';
  };

  window._frotasAbastecSave = async (id, mid) => {
    const get = (k) => document.getElementById(mid+'_'+k)?.value?.trim() || '';
    const getNum = (k) => { const v = parseFloat(document.getElementById(mid+'_'+k)?.value); return isNaN(v) ? null : v; };
    const alert_ = (msg) => { const a = document.getElementById(mid+'_alert'); if (a){a.textContent=msg;a.style.display='block'; setTimeout(()=>a.style.display='none', 5000);} };
    const veicId = get('veic'); if (!veicId) return alert_('Selecione um veículo.');
    const litros = getNum('litros'); if (!litros || litros <= 0) return alert_('Litros inválido.');
    const valor = getNum('valor'); if (!valor || valor <= 0) return alert_('Valor inválido.');
    const km = getNum('km'); if (km == null || km < 0) return alert_('KM inválido.');
    const dt = get('dt'); if (!dt) return alert_('Informe data/hora.');
    const veic = (window._frotasVeiculosCache?.()||[]).find(v => v.id === veicId);
    const kmDesdeUltimo = veic ? Math.max(0, km - (Number(veic.km_atual)||0)) : null;
    const consumo = (kmDesdeUltimo > 0 && litros > 0) ? (kmDesdeUltimo / litros) : null;
    const payload = {
      veiculo_id: veicId,
      dt_abastecimento: new Date(dt).toISOString(),
      combustivel: get('comb'),
      litros, valor_total: valor, km_atual: km,
      km_desde_ultimo: kmDesdeUltimo, consumo_kml: consumo,
      posto_local: get('posto') || null,
      ose_numero: get('ose') || null,
      motorista_nome: get('motorista') || null,
      observacao: get('obs') || null,
    };
    let abastecId = id;
    if (id) {
      const { error } = await window.sb.from('frotas_abastecimentos').update(payload).eq('id', id);
      if (error) return alert_('Erro: '+error.message);
    } else {
      payload.registrado_por = window._currentUserData?.id;
      const { data, error } = await window.sb.from('frotas_abastecimentos').insert(payload).select().single();
      if (error) return alert_('Erro: '+error.message);
      abastecId = data.id;
    }
    const fotoUpdates = {};
    for (const slot of ['comprovante','km','bomba']) {
      const inp = document.getElementById(mid+'_foto_'+slot);
      if (inp?.files?.[0]) {
        const up = await window.uploadToBucket('frotas-fotos', inp.files[0], 'abastec/'+abastecId);
        if (up) {
          fotoUpdates['foto_'+slot+'_url'] = up.url;
          fotoUpdates['foto_'+slot+'_path'] = up.path;
        }
      }
    }
    if (Object.keys(fotoUpdates).length) {
      await window.sb.from('frotas_abastecimentos').update(fotoUpdates).eq('id', abastecId);
    }
    document.getElementById(mid)?.remove();
    window.toastSuccess?.(id?'Abastecimento atualizado':'Abastecimento registrado');
    window.frotasAbastecInit();
  };

  window._frotasAbastecDelete = async (id, mid) => {
    if (!await nexusConfirm('Excluir este abastecimento?')) return;
    const item = _abastecCache.find(x => x.id === id);
    for (const slot of ['comprovante','km','bomba']) {
      const path = item?.['foto_'+slot+'_path'];
      if (path) await window.deleteFromBucket('frotas-fotos', path);
    }
    const { error } = await window.sb.from('frotas_abastecimentos').delete().eq('id', id);
    if (error) { nexusAlert('Erro: '+error.message); return; }
    document.getElementById(mid)?.remove();
    window.toastSuccess?.('Abastecimento excluído');
    window.frotasAbastecInit();
  };
})();
