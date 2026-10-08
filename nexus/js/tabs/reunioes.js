// ==========================================================================
// ABA REUNIOES
//
// Extraido do index.html em 22/08/2026 (linhas 43809-44317).
// So o JS saiu; o HTML continua no #tab-reunioes. A IIFE foi mantida de
// proposito (ver tests/smoke/README.md e a memoria do split).
//
// expoe  -> _reuArquivar, _reuBaixar, _reuConfirmar, _reuExcluir, _reuFiltrarSeg, _reuPickSource, _reuSalvarMeta, _reuSeekTo, _reuTranscrever, reuniaoCancelar, reuniaoIniciarFluxo, reuniaoOpenModal, reuniaoParar, reuniaoToggleVideo, reunioesInit, reunioesListRender
// consome-> window._currentUserData, window.deleteFromBucket, window.electronAPI, window.open, window.sb, window.toastError, window.toastInfo, window.toastSuccess, window.toastWarning, window.uploadToBucket
// ==========================================================================
(function(){
  const esc = (s) => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleString('pt-BR'); };
  const fmtDur = (sec) => { sec = Math.floor(Number(sec)||0); const h = Math.floor(sec/3600); const m = Math.floor((sec%3600)/60); const s = sec%60; return (h>0?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); };
  const fmtMB = (bytes) => bytes ? (bytes/1048576).toFixed(1) + ' MB' : '0 MB';

  // Estilo da animação de pulse (uma vez)
  if (!document.getElementById('reuniaoStyles')) {
    const st = document.createElement('style'); st.id = 'reuniaoStyles';
    st.textContent = '@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }';
    document.head.appendChild(st);
  }

  let _reunioesCache = [];
  let _gravacao = null; // { mediaRecorder, stream, audioStream, chunks, startedAt, timerId, sizeAprox, videoTrackEnabled }

  const STATUS = {
    gravando:    { l:'Gravando',    c:'#dc2626' },
    processando: { l:'Processando', c:'#f59e0b' },
    pronto:      { l:'Pronto',      c:'#16a34a' },
    arquivado:   { l:'Arquivado',   c:'#94a3b8' },
    erro:        { l:'Erro',        c:'#dc2626' },
  };

  // ────────────────────────────────────────────────────────────────────
  // Lista
  // ────────────────────────────────────────────────────────────────────
  window.reunioesInit = async () => {
    const list = document.getElementById('reunioesList');
    if (!list) return;
    list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;grid-column:1/-1">Carregando…</div>';
    try {
      const { data, error } = await window.sb.from('reunioes').select('*').order('datahora_inicio', { ascending: false });
      if (error) throw error;
      _reunioesCache = data || [];
      _renderReuniaoKpis();
      window.reunioesListRender();
    } catch (e) {
      list.innerHTML = '<div style="padding:30px;text-align:center;color:#dc2626;font-size:13px;grid-column:1/-1">Erro: '+esc(e.message)+'</div>';
    }
  };

  function _renderReuniaoKpis() {
    const k = document.getElementById('reuniaoKpis'); if (!k) return;
    const total = _reunioesCache.length;
    const prontas = _reunioesCache.filter(r => r.status==='pronto').length;
    const totalMin = Math.round(_reunioesCache.reduce((s,r) => s + (Number(r.duracao_segundos)||0), 0) / 60);
    const totalGB = (_reunioesCache.reduce((s,r) => s + (Number(r.tamanho_bytes)||0), 0) / 1073741824).toFixed(2);
    const transcrPend = _reunioesCache.filter(r => r.transcricao_status==='pendente' || r.transcricao_status==='processando').length;
    const tile = (l, v, c) => '<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px"><div style="font-size:10px;color:var(--text3);font-weight:600;letter-spacing:.5px">'+l+'</div><div style="font-size:18px;font-weight:700;color:'+c+';margin-top:2px">'+v+'</div></div>';
    k.innerHTML = tile('TOTAL', total, 'var(--text)') + tile('PRONTAS', prontas, '#16a34a') + tile('MINUTOS', totalMin, 'var(--accent)') + tile('ESPAÇO', totalGB+' GB', '#7c3aed') + tile('TRANSCREVENDO', transcrPend, '#f59e0b');
  }

  window.reunioesListRender = () => {
    const list = document.getElementById('reunioesList'); if (!list) return;
    const q = (document.getElementById('reuniaoFiltroBusca')?.value || '').toLowerCase().trim();
    const st = document.getElementById('reuniaoFiltroStatus')?.value || '';
    let arr = _reunioesCache.slice();
    if (q) arr = arr.filter(r => (r.titulo||'').toLowerCase().includes(q) || (r.descricao||'').toLowerCase().includes(q) || (r.codigo||'').toLowerCase().includes(q));
    if (st) arr = arr.filter(r => r.status === st);
    if (!arr.length) { list.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;background:var(--surface2);border-radius:8px;grid-column:1/-1">Nenhuma reunião gravada. Clique em "Gravar agora" pra começar.</div>'; return; }
    list.innerHTML = arr.map(r => {
      const s = STATUS[r.status] || STATUS.gravando;
      const ts = STATUS[r.transcricao_status==='pronto'?'pronto':r.transcricao_status==='processando'?'processando':r.transcricao_status==='erro'?'erro':'arquivado'];
      return '<div onclick="window.reuniaoOpenModal(\''+esc(r.id)+'\')" style="background:var(--surface);border-radius:10px;border:1px solid var(--border);padding:14px;cursor:pointer;transition:transform .15s,box-shadow .15s" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 8px 20px rgba(0,0,0,.08)\'" onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:6px">'
        +   '<span style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.5px">'+esc(r.codigo||'')+'</span>'
        +   '<span style="font-size:10px;font-weight:700;background:'+s.c+'22;color:'+s.c+';padding:3px 9px;border-radius:10px;letter-spacing:.4px;text-transform:uppercase">'+s.l+'</span>'
        + '</div>'
        + '<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:5px;line-height:1.3">'+esc(r.titulo||'(sem título)')+'</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-bottom:10px">'+fmtDate(r.datahora_inicio)+'</div>'
        + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);border-top:1px solid var(--border);padding-top:8px">'
        +   '<span>⏱ '+fmtDur(r.duracao_segundos)+'</span>'
        +   '<span>💾 '+fmtMB(r.tamanho_bytes)+'</span>'
        +   '<span title="Transcrição: '+(r.transcricao_status||'pendente')+'" style="color:'+(r.transcricao_status==='pronto'?'#16a34a':r.transcricao_status==='erro'?'#dc2626':'#f59e0b')+'">📝 '+(r.transcricao_status==='pronto'?'OK':r.transcricao_status==='processando'?'…':r.transcricao_status==='erro'?'erro':'pendente')+'</span>'
        + '</div>'
      + '</div>';
    }).join('');
  };

  // ────────────────────────────────────────────────────────────────────
  // Fluxo de gravação: modal LGPD → picker de tela → grava
  // ────────────────────────────────────────────────────────────────────
  window.reuniaoIniciarFluxo = async () => {
    if (_gravacao) { window.toastWarning?.('Já existe uma gravação em andamento'); return; }
    const sources = await window.electronAPI?.reunioes?.getScreenSources?.();
    if (!sources || !sources.length) { window.toastError?.('Não foi possível listar as telas. Reabra o Nexus.'); return; }
    const mid = 'mdReuPicker' + Date.now();
    const html = '<div id="'+mid+'" style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto" onclick="if(event.target.id===\''+mid+'\') document.getElementById(\''+mid+'\').remove()">'
      + '<div style="background:var(--surface);border-radius:12px;width:100%;max-width:760px;border:1px solid var(--border);max-height:88vh;overflow:auto">'
      +   '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'
      +     '<div style="font-size:16px;font-weight:700">Iniciar gravação</div>'
      +     '<button onclick="document.getElementById(\''+mid+'\').remove()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer">×</button>'
      +   '</div>'
      +   '<div style="padding:20px 22px">'
      +     '<div style="background:#dc262611;border:1px solid #dc2626;border-radius:8px;padding:12px 14px;margin-bottom:14px">'
      +       '<div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:4px">⚠ AVISO LGPD</div>'
      +       '<div style="font-size:12px;color:var(--text2);line-height:1.5">A gravação captura a tela e o áudio do sistema. <b>Avise os participantes</b> que a reunião está sendo gravada e transcrita. Você é responsável pelo cumprimento da LGPD.</div>'
      +       '<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:var(--text);cursor:pointer"><input id="'+mid+'_lgpd" type="checkbox"> Confirmo que avisei os participantes</label>'
      +     '</div>'
      +     '<div style="margin-bottom:14px"><label style="font-size:11px;color:var(--text3)">Título da reunião *</label><input id="'+mid+'_titulo" type="text" placeholder="Ex: Reunião semanal Acciona · 06/05" style="width:100%;padding:9px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px"></div>'
      +     '<div style="margin-bottom:14px"><label style="font-size:11px;color:var(--text3)">Plataforma</label><select id="'+mid+'_plat" style="width:100%;padding:9px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px"><option value="teams">Microsoft Teams</option><option value="meet">Google Meet</option><option value="zoom">Zoom</option><option value="desktop" selected>Desktop / outros</option></select></div>'
      +     '<div style="background:var(--surface2);border-radius:6px;padding:10px 14px;margin-bottom:14px">'
      +       '<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:8px">FONTES DE ÁUDIO</div>'
      +       '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);cursor:pointer;margin-bottom:6px"><input id="'+mid+'_audSys" type="checkbox" checked> Áudio do sistema <span style="opacity:.6;font-size:11px">(funciona em "Tela inteira"; pode falhar em janelas)</span></label>'
      +       '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);cursor:pointer"><input id="'+mid+'_audMic" type="checkbox" checked> Microfone <span style="opacity:.6;font-size:11px">(você falando)</span></label>'
      +     '</div>'
      +     '<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:8px">SELECIONE A FONTE DE GRAVAÇÃO</div>'
      +     '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;max-height:300px;overflow:auto;padding:4px">'
      +       sources.map((s,i) => '<div onclick="window._reuPickSource(\''+mid+'\',\''+esc(s.id)+'\',this)" data-source="'+esc(s.id)+'" style="background:var(--surface2);border:2px solid var(--border);border-radius:8px;padding:8px;cursor:pointer;transition:border-color .15s">'
              + (s.thumbnailDataURL ? '<img src="'+s.thumbnailDataURL+'" style="width:100%;height:120px;object-fit:cover;border-radius:5px;background:#000">' : '<div style="width:100%;height:120px;background:#000;border-radius:5px"></div>')
              + '<div style="font-size:11px;color:var(--text);font-weight:600;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(s.name)+'">'+(s.id.startsWith('screen')?'🖥 ':'🪟 ')+esc(s.name)+'</div>'
              + '</div>').join('')
      +     '</div>'
      +     '<div style="margin-top:16px;padding:10px 14px;background:var(--surface2);border-radius:6px;font-size:11px;color:var(--text2)"><b>Atalho:</b> Você pode reduzir a janela do Nexus pra que ele não apareça na gravação. A captura continua em background.</div>'
      +   '</div>'
      +   '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">'
      +     '<button onclick="document.getElementById(\''+mid+'\').remove()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px">Cancelar</button>'
      +     '<button id="'+mid+'_iniciar" onclick="window._reuConfirmar(\''+mid+'\')" disabled style="background:#dc2626;color:#fff;padding:9px 22px;border:none;border-radius:6px;font-weight:600;cursor:not-allowed;opacity:.5;font-size:13px">⏺ Iniciar gravação</button>'
      +   '</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    // Habilita o botão quando LGPD marcado E source selecionado
    const upd = () => {
      const ok = document.getElementById(mid+'_lgpd')?.checked && document.getElementById(mid)?.dataset?.sourceId;
      const btn = document.getElementById(mid+'_iniciar');
      if (btn) { btn.disabled = !ok; btn.style.opacity = ok?'1':'.5'; btn.style.cursor = ok?'pointer':'not-allowed'; }
    };
    document.getElementById(mid+'_lgpd').addEventListener('change', upd);
    document.getElementById(mid).dataset._upd = '1';
    document.getElementById(mid).addEventListener('click', upd);
  };

  window._reuPickSource = (mid, sourceId, el) => {
    document.getElementById(mid).dataset.sourceId = sourceId;
    document.querySelectorAll('#'+mid+' [data-source]').forEach(d => { d.style.borderColor = 'var(--border)'; });
    el.style.borderColor = 'var(--accent)';
    // Atualiza estado do botão
    const btn = document.getElementById(mid+'_iniciar');
    const ok = document.getElementById(mid+'_lgpd')?.checked && sourceId;
    if (btn) { btn.disabled = !ok; btn.style.opacity = ok?'1':'.5'; btn.style.cursor = ok?'pointer':'not-allowed'; }
  };

  window._reuConfirmar = async (mid) => {
    const titulo = (document.getElementById(mid+'_titulo')?.value || '').trim() || 'Reunião sem título';
    const plataforma = document.getElementById(mid+'_plat')?.value || 'desktop';
    const sourceId = document.getElementById(mid)?.dataset?.sourceId;
    const wantSysAudio = document.getElementById(mid+'_audSys')?.checked !== false;
    const wantMic = document.getElementById(mid+'_audMic')?.checked !== false;
    if (!sourceId) return;
    document.getElementById(mid)?.remove();
    await _iniciarGravacao(sourceId, titulo, plataforma, { wantSysAudio, wantMic });
  };

  async function _iniciarGravacao(sourceId, titulo, plataforma, opts = {}) {
    const { wantSysAudio = true, wantMic = true } = opts;
    try {
      await window.electronAPI?.reunioes?.setSourceId?.(sourceId);

      // 1) Vídeo + áudio do sistema via getDisplayMedia.
      // O main process só retorna áudio quando source é tela inteira (loopback
      // do Windows não funciona em janela individual). Se pedir audio:true e
      // source for janela, dá "Could not start audio source" — então tentamos
      // com áudio primeiro, e se falhar caímos pra só vídeo.
      // ATENÇÃO: NÃO usar getUserMedia com chromeMediaSource:'desktop' — Electron
      // 29 endureceu e gera "bad IPC message (reason 263)" que mata o renderer.
      let videoStream;
      try {
        videoStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 15 } },
          audio: wantSysAudio,
        });
      } catch (errAudio) {
        console.warn('[reuniao] getDisplayMedia com áudio falhou, tentando só vídeo:', errAudio.message||errAudio);
        videoStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 15 } },
          audio: false,
        });
      }

      const audioSources = [];
      // Áudio do sistema já vem dentro do videoStream (via loopback)
      if (wantSysAudio && videoStream.getAudioTracks().length > 0) {
        audioSources.push({ label: 'sistema', _inline: true });
        console.log('[reuniao] áudio sistema OK (via getDisplayMedia loopback)');
      } else if (wantSysAudio) {
        console.warn('[reuniao] áudio sistema não veio no stream — verificar fonte (janelas individuais não suportam loopback)');
      }

      // Microfone via getUserMedia normal (sem chromeMediaSource)
      let micStream = null;
      if (wantMic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          if (micStream.getAudioTracks().length) {
            audioSources.push({ label: 'microfone', stream: micStream });
            console.log('[reuniao] microfone OK:', micStream.getAudioTracks()[0]?.label);
          }
        } catch (eMic) {
          console.warn('[reuniao] microfone falhou:', eMic.message||eMic);
        }
      }

      // Se temos sistema (inline no videoStream) E microfone (separado),
      // mesclamos via AudioContext numa única track. Senão deixamos como tá.
      let finalStream = videoStream;
      let audioContext = null;
      if (micStream && audioSources.some(a => a._inline)) {
        // Mescla sistema + mic
        audioContext = new AudioContext();
        const dest = audioContext.createMediaStreamDestination();
        // Sistema (do videoStream)
        videoStream.getAudioTracks().forEach(t => {
          const tmpStream = new MediaStream([t]);
          const src = audioContext.createMediaStreamSource(tmpStream);
          src.connect(dest);
        });
        // Mic
        const micSrc = audioContext.createMediaStreamSource(micStream);
        micSrc.connect(dest);
        // Monta final stream com vídeo do videoStream + áudio mesclado
        finalStream = new MediaStream();
        videoStream.getVideoTracks().forEach(t => finalStream.addTrack(t));
        dest.stream.getAudioTracks().forEach(t => finalStream.addTrack(t));
      } else if (micStream && !audioSources.some(a => a._inline)) {
        // Só mic — adiciona ao videoStream
        finalStream = new MediaStream();
        videoStream.getVideoTracks().forEach(t => finalStream.addTrack(t));
        micStream.getAudioTracks().forEach(t => finalStream.addTrack(t));
      }
      // Se só sistema (sem mic), finalStream = videoStream original (sistema já tá lá)

      const labels = audioSources.map(a => a.label).join(' + ');
      console.log('[reuniao] final: video='+finalStream.getVideoTracks().length+' audio='+finalStream.getAudioTracks().length+' fontes=['+labels+']');
      if (audioSources.length === 0) {
        window.toastWarning?.('Sem áudio capturado — só vídeo');
      } else {
        window.toastInfo?.('Áudio: '+labels);
      }
      const stream = finalStream;
      // Refs pra dar stop() depois (incluindo o videoStream se mesclou)
      const _audioRefs = [];
      if (micStream) _audioRefs.push(micStream);
      if (videoStream !== finalStream) _audioRefs.push(videoStream);
      // Sem áudio do mic capturado por padrão (só sistema). Se quiser microfone separado, capturar e mesclar.
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 1500000 });
      const chunks = [];
      recorder.ondataavailable = (ev) => { if (ev.data?.size) { chunks.push(ev.data); _gravacao && (_gravacao.sizeAprox = (_gravacao.sizeAprox||0) + ev.data.size); _atualizarBanner(); } };
      recorder.start(2000); // chunk a cada 2s

      // Cria reunião no DB já como "gravando"
      const { data: row, error } = await window.sb.from('reunioes').insert({
        tenant_id: window._currentUserData?.tenant_id,
        titulo, plataforma, modo_gravacao: 'tela_audio',
        status: 'gravando', transcricao_status: 'pendente',
        criado_por: window._currentUserData?.id,
        criado_por_nome: window._currentUserData?.nome,
      }).select().single();
      if (error) {
        recorder.stop(); stream.getTracks().forEach(t=>t.stop());
        window.toastError?.('Erro ao criar reunião: '+error.message);
        return;
      }

      _gravacao = {
        recorder, stream, chunks, startedAt: Date.now(), sizeAprox: 0,
        reuniaoId: row.id, codigo: row.codigo, titulo, plataforma,
        videoTrackEnabled: true,
        audioRefs: _audioRefs, audioContext,
      };
      _showBanner();
      _gravacao.timerId = setInterval(_atualizarBanner, 1000);
      window.toastSuccess?.('Gravando '+row.codigo);
    } catch (e) {
      console.error('[reuniao] gravar', e);
      window.toastError?.('Erro ao iniciar gravação: '+(e.message||e));
    }
  }

  function _showBanner() {
    const b = document.getElementById('reuniaoEmGravacao');
    const t = document.getElementById('reuniaoTituloAtivo');
    if (b) b.style.display = 'block';
    if (t && _gravacao) t.textContent = 'Gravando · '+_gravacao.codigo+' · '+_gravacao.titulo;
  }

  function _atualizarBanner() {
    if (!_gravacao) return;
    const dur = Math.floor((Date.now() - _gravacao.startedAt) / 1000);
    const tEl = document.getElementById('reuniaoTimer'); if (tEl) tEl.textContent = fmtDur(dur);
    const sEl = document.getElementById('reuniaoSize'); if (sEl) sEl.textContent = fmtMB(_gravacao.sizeAprox);
  }

  window.reuniaoToggleVideo = () => {
    if (!_gravacao) return;
    const vTrack = _gravacao.stream.getVideoTracks()[0];
    if (!vTrack) return;
    _gravacao.videoTrackEnabled = !_gravacao.videoTrackEnabled;
    vTrack.enabled = _gravacao.videoTrackEnabled;
    const btn = document.getElementById('btnReuniaoToggleVideo');
    if (btn) btn.textContent = _gravacao.videoTrackEnabled ? '⏸ Pausar tela' : '▶ Retomar tela';
  };

  window.reuniaoCancelar = async () => {
    if (!_gravacao) return;
    if (!await nexusConfirm('Descartar a gravação? Os dados não serão salvos.')) return;
    const id = _gravacao.reuniaoId;
    try { _gravacao.recorder.stop(); } catch {}
    try { _gravacao.stream.getTracks().forEach(t => t.stop()); } catch {}
    try { _gravacao.audioRefs?.forEach(s => s.getTracks().forEach(t => t.stop())); } catch {}
    try { _gravacao.audioContext?.close(); } catch {}
    clearInterval(_gravacao.timerId);
    _gravacao = null;
    document.getElementById('reuniaoEmGravacao').style.display = 'none';
    await window.sb.from('reunioes').delete().eq('id', id);
    window.toastInfo?.('Gravação descartada');
    window.reunioesInit();
  };

  window.reuniaoParar = async () => {
    if (!_gravacao) return;
    const g = _gravacao;
    document.getElementById('reuniaoEmGravacao').style.display = 'none';
    clearInterval(g.timerId);
    // Espera última chunk e fecha
    await new Promise((resolve) => {
      g.recorder.onstop = () => resolve();
      try { g.recorder.stop(); } catch { resolve(); }
    });
    g.stream.getTracks().forEach(t => t.stop());
    try { g.audioRefs?.forEach(s => s.getTracks().forEach(t => t.stop())); } catch {}
    try { g.audioContext?.close(); } catch {}

    const blob = new Blob(g.chunks, { type: 'video/webm' });
    const dur = Math.round((Date.now() - g.startedAt) / 1000);
    _gravacao = null;

    // Marca como processando
    await window.sb.from('reunioes').update({
      status: 'processando', duracao_segundos: dur, datahora_fim: new Date().toISOString(),
      tamanho_bytes: blob.size, atualizado_em: new Date().toISOString(),
    }).eq('id', g.reuniaoId);

    window.toastInfo?.('Salvando '+fmtMB(blob.size)+'… aguarde');

    // Upload do .webm
    const path = 'reunioes/'+g.reuniaoId+'/'+Date.now()+'.webm';
    const file = new File([blob], 'reuniao.webm', { type: 'video/webm' });
    const up = await window.uploadToBucket('reunioes-rec', file, 'reunioes/'+g.reuniaoId);
    if (!up) {
      await window.sb.from('reunioes').update({ status: 'erro' }).eq('id', g.reuniaoId);
      window.toastError?.('Falha no upload da gravação');
      window.reunioesInit();
      return;
    }
    // Atualiza paths (uso video_path = áudio também, pois Whisper aceita webm direto)
    await window.sb.from('reunioes').update({
      video_path: up.path, audio_path: up.path, status: 'pronto', atualizado_em: new Date().toISOString(),
    }).eq('id', g.reuniaoId);
    window.toastSuccess?.('Gravação salva ('+fmtMB(blob.size)+'). Iniciando transcrição…');

    // Dispara transcrição via Edge Function (assíncrono — não bloqueia UI)
    _disparaTranscricao(g.reuniaoId);
    window.reunioesInit();
  };

  async function _disparaTranscricao(reuniaoId) {
    try {
      const { data, error } = await window.sb.functions.invoke('transcrever-reuniao', { body: { reuniao_id: reuniaoId } });
      if (error) throw error;
      if (data?.ok) {
        window.toastSuccess?.('Transcrição pronta ('+(data.segmentos_count||0)+' segmentos)');
        window.reunioesInit();
      } else {
        window.toastWarning?.('Transcrição falhou: '+(data?.error||'erro desconhecido'));
        window.reunioesInit();
      }
    } catch (e) {
      console.error('[transcrever]', e);
      window.toastWarning?.('Transcrição agendada — pode demorar (arquivo grande)');
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Modal de visualização
  // ────────────────────────────────────────────────────────────────────
  window.reuniaoOpenModal = async (id) => {
    const r = _reunioesCache.find(x => x.id === id); if (!r) return;
    let trans = null;
    if (r.transcricao_status === 'pronto') {
      const { data } = await window.sb.from('reunioes_transcricoes').select('*').eq('reuniao_id', id).maybeSingle();
      trans = data;
    }
    // Signed URL pra player (só se estiver pronto e tiver path)
    let signedUrl = null;
    if (r.video_path && (r.status === 'pronto' || r.status === 'arquivado')) {
      const { data: su } = await window.sb.storage.from('reunioes-rec').createSignedUrl(r.video_path, 600);
      signedUrl = su?.signedUrl;
    }
    const mid = 'mdReu' + Date.now();
    const html = '<div id="'+mid+'" style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99998;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto" onclick="if(event.target.id===\''+mid+'\') document.getElementById(\''+mid+'\').remove()">'
      + '<div style="background:var(--surface);border-radius:12px;width:100%;max-width:1100px;border:1px solid var(--border);margin:auto">'
      +   '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--surface);z-index:1;border-radius:12px 12px 0 0">'
      +     '<div><div style="font-size:16px;font-weight:700">'+esc(r.codigo)+' · '+esc(r.titulo||'(sem título)')+'</div><div style="font-size:11px;color:var(--text2);margin-top:2px">'+fmtDate(r.datahora_inicio)+' · '+fmtDur(r.duracao_segundos)+' · '+fmtMB(r.tamanho_bytes)+'</div></div>'
      +     '<button onclick="document.getElementById(\''+mid+'\').remove();window.reunioesInit()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer">×</button>'
      +   '</div>'
      +   '<div style="padding:20px 22px;display:grid;grid-template-columns:1.4fr 1fr;gap:18px">'
      +     '<div>'
      +       (signedUrl
        ? '<video controls preload="metadata" style="width:100%;border-radius:8px;background:#000;max-height:480px"><source src="'+esc(signedUrl)+'" type="video/webm"></video>'
        : '<div style="background:var(--surface2);border-radius:8px;padding:30px;text-align:center;color:var(--text3);font-size:13px">'+(r.status==='processando'?'Processando upload…':r.status==='gravando'?'Reunião em gravação':r.status==='erro'?'Erro no upload':'Sem mídia disponível')+'</div>')
      +       '<div style="margin-top:14px"><label style="font-size:11px;color:var(--text3)">Título</label><input id="'+mid+'_titulo" type="text" value="'+esc(r.titulo||'')+'" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text)"></div>'
      +       '<div style="margin-top:8px"><label style="font-size:11px;color:var(--text3)">Descrição/notas</label><textarea id="'+mid+'_desc" rows="3" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical;font-family:inherit">'+esc(r.descricao||'')+'</textarea></div>'
      +       '<div style="margin-top:8px"><label style="font-size:11px;color:var(--text3)">Participantes <span style="opacity:.6">(JSON: array de {nome, email?})</span></label><textarea id="'+mid+'_part" rows="2" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical;font-family:monospace;font-size:11px">'+esc(JSON.stringify(r.participantes||[],null,2))+'</textarea></div>'
      +       '<div style="margin-top:14px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +         '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      +           '<button onclick="window._reuTranscrever(\''+esc(r.id)+'\')" style="background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent);border-radius:6px;padding:7px 14px;font-size:11px;cursor:pointer;font-weight:600">📝 Re-transcrever</button>'
      +           (signedUrl ? '<button onclick="window._reuBaixar(\''+esc(r.video_path)+'\')" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:7px 14px;font-size:11px;cursor:pointer">⬇ Baixar</button>' : '')
      +           '<button onclick="window._reuArquivar(\''+esc(r.id)+'\',\''+(r.status==='arquivado'?'pronto':'arquivado')+'\',\''+mid+'\')" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:7px 14px;font-size:11px;cursor:pointer">'+(r.status==='arquivado'?'↩ Desarquivar':'📦 Arquivar')+'</button>'
      +         '</div>'
      +         '<button onclick="window._reuExcluir(\''+esc(r.id)+'\',\''+esc(r.video_path||'')+'\',\''+mid+'\')" style="background:var(--red-l);color:var(--red);border:1px solid var(--red);border-radius:6px;padding:7px 14px;font-size:11px;cursor:pointer">🗑 Excluir</button>'
      +       '</div>'
      +     '</div>'
      +     '<div>'
      +       '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      +         '<div style="font-size:13px;font-weight:700">Transcrição</div>'
      +         '<span style="font-size:10px;font-weight:700;background:'+(r.transcricao_status==='pronto'?'#16a34a':r.transcricao_status==='processando'?'#f59e0b':r.transcricao_status==='erro'?'#dc2626':'#94a3b8')+'22;color:'+(r.transcricao_status==='pronto'?'#16a34a':r.transcricao_status==='processando'?'#f59e0b':r.transcricao_status==='erro'?'#dc2626':'#94a3b8')+';padding:3px 9px;border-radius:10px;letter-spacing:.4px;text-transform:uppercase">'+esc(r.transcricao_status||'pendente')+'</span>'
      +       '</div>'
      +       (r.transcricao_status === 'erro' ? '<div style="background:#dc262611;border:1px solid #dc2626;border-radius:6px;padding:10px 14px;font-size:11px;color:#dc2626;margin-bottom:10px">'+esc(r.transcricao_erro||'erro desconhecido')+'</div>' : '')
      +       (trans
        ? '<input id="'+mid+'_busca" type="text" placeholder="🔍 Buscar na transcrição…" oninput="window._reuFiltrarSeg(\''+mid+'\',this.value)" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px;margin-bottom:10px">'
          + '<div id="'+mid+'_segs" style="max-height:520px;overflow:auto;background:var(--surface2);border-radius:8px;padding:10px 14px">'
          + (Array.isArray(trans.segmentos) && trans.segmentos.length
            ? trans.segmentos.map((s,i) => '<div data-seg-idx="'+i+'" data-seg-text="'+esc((s.text||'').toLowerCase())+'" style="padding:5px 0;border-bottom:1px solid var(--border)"><span style="font-size:10px;color:var(--text3);font-family:monospace;cursor:pointer" onclick="window._reuSeekTo(\''+mid+'\','+(s.start||0)+')">'+fmtDur(s.start)+'</span> <span style="font-size:12px;color:var(--text);line-height:1.5">'+esc(s.text||'')+'</span></div>').join('')
            : '<div style="font-size:12px;color:var(--text);line-height:1.6;white-space:pre-wrap">'+esc(trans.texto_completo||'')+'</div>')
          + '</div>'
        : '<div style="background:var(--surface2);border-radius:8px;padding:30px;text-align:center;color:var(--text3);font-size:13px">'+(r.transcricao_status==='processando'?'Transcrevendo… volte depois':r.transcricao_status==='erro'?'Falhou. Clique em Re-transcrever pra tentar de novo.':'Sem transcrição ainda')+'</div>')
      +     '</div>'
      +   '</div>'
      +   '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;position:sticky;bottom:0;background:var(--surface);border-radius:0 0 12px 12px">'
      +     '<button onclick="document.getElementById(\''+mid+'\').remove();window.reunioesInit()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px">Fechar</button>'
      +     '<button onclick="window._reuSalvarMeta(\''+esc(r.id)+'\',\''+mid+'\')" style="background:var(--accent);color:#fff;padding:9px 22px;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">Salvar</button>'
      +   '</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  };

  window._reuFiltrarSeg = (mid, q) => {
    q = (q||'').toLowerCase().trim();
    document.querySelectorAll('#'+mid+'_segs [data-seg-idx]').forEach(div => {
      const txt = div.dataset.segText || '';
      div.style.display = (!q || txt.includes(q)) ? '' : 'none';
    });
  };

  window._reuSeekTo = (mid, secs) => {
    const v = document.querySelector('#'+mid+' video');
    if (v) { v.currentTime = secs; v.play().catch(()=>{}); }
  };

  window._reuSalvarMeta = async (id, mid) => {
    const titulo = (document.getElementById(mid+'_titulo')?.value || '').trim() || 'Reunião sem título';
    const desc = (document.getElementById(mid+'_desc')?.value || '').trim() || null;
    let parts = [];
    try { parts = JSON.parse(document.getElementById(mid+'_part')?.value || '[]'); if (!Array.isArray(parts)) parts = []; } catch {}
    const { error } = await window.sb.from('reunioes').update({
      titulo, descricao: desc, participantes: parts, atualizado_em: new Date().toISOString(),
    }).eq('id', id);
    if (error) return nexusAlert('Erro: '+error.message);
    window.toastSuccess?.('Salvo');
    document.getElementById(mid)?.remove();
    window.reunioesInit();
  };

  window._reuTranscrever = async (id) => {
    if (!await nexusConfirm('Re-transcrever esta reunião? Pode demorar (custo Whisper ~R$ 0.03/min).')) return;
    await window.sb.from('reunioes').update({
      transcricao_status: 'processando', transcricao_erro: null,
    }).eq('id', id);
    window.toastInfo?.('Transcrevendo…');
    _disparaTranscricao(id);
  };

  window._reuBaixar = async (path) => {
    if (!path) return;
    const { data } = await window.sb.storage.from('reunioes-rec').createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  window._reuArquivar = async (id, novoStatus, mid) => {
    await window.sb.from('reunioes').update({ status: novoStatus, atualizado_em: new Date().toISOString() }).eq('id', id);
    window.toastSuccess?.(novoStatus==='arquivado'?'Arquivada':'Desarquivada');
    document.getElementById(mid)?.remove();
    window.reunioesInit();
  };

  window._reuExcluir = async (id, path, mid) => {
    if (!await nexusConfirm('Excluir esta reunião? O vídeo, áudio e a transcrição serão removidos permanentemente.')) return;
    if (path) await window.deleteFromBucket('reunioes-rec', path);
    await window.sb.from('reunioes').delete().eq('id', id);
    window.toastSuccess?.('Reunião excluída');
    document.getElementById(mid)?.remove();
    window.reunioesInit();
  };

})();
