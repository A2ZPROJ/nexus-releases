// ==========================================================================
// ABA COLETA-END
//
// Extraido do index.html em 22/08/2026 (linhas 38843-39190).
// So o JS saiu; o HTML continua no #tab-coleta-end. A IIFE foi mantida de
// proposito (ver tests/smoke/README.md e a memoria do split).
//
// expoe  -> coletaEndApplyToOriginal, coletaEndExport, coletaEndInit, coletaEndOnFile, coletaEndRun, coletaEndStop
// consome-> window.esc, window.toastError, window.toastSuccess
// ==========================================================================
(function(){
  const state = {
    rows: [],         // [{ ose, x, y, n, lat, lon, rua, bairro, cidade, uf, cep, fonte, displayName }]
    running: false,
    abortReq: false,
    filePath: '',     // caminho absoluto do XLSX original (Electron expõe via file.path)
    fileName: '',
  };

  // ── UTM → WGS84 (Snyder) ─────────────────────────────────────────
  function utmToLatLon(x, y, zone, south) {
    const a = 6378137.0;
    const f = 1 / 298.257223563;
    const e2 = 2*f - f*f;
    const eP2 = e2 / (1 - e2);
    const k0 = 0.9996;
    const lonOriginDeg = (zone - 1) * 6 - 180 + 3;
    const lonOrigin = lonOriginDeg * Math.PI / 180;

    const xc = x - 500000.0;
    const yc = y - (south ? 10000000.0 : 0.0);
    const M = yc / k0;
    const mu = M / (a * (1 - e2/4 - 3*e2*e2/64 - 5*Math.pow(e2,3)/256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi1 = mu
      + (3*e1/2 - 27*Math.pow(e1,3)/32) * Math.sin(2*mu)
      + (21*e1*e1/16 - 55*Math.pow(e1,4)/32) * Math.sin(4*mu)
      + (151*Math.pow(e1,3)/96) * Math.sin(6*mu);
    const sinp = Math.sin(phi1), cosp = Math.cos(phi1), tanp = Math.tan(phi1);
    const N1 = a / Math.sqrt(1 - e2*sinp*sinp);
    const T1 = tanp*tanp;
    const C1 = eP2*cosp*cosp;
    const R1 = a*(1 - e2) / Math.pow(1 - e2*sinp*sinp, 1.5);
    const D = xc / (N1 * k0);
    const lat = phi1 - (N1*tanp/R1) * (
      D*D/2
      - (5 + 3*T1 + 10*C1 - 4*C1*C1 - 9*eP2) * Math.pow(D,4)/24
      + (61 + 90*T1 + 298*C1 + 45*T1*T1 - 252*eP2 - 3*C1*C1) * Math.pow(D,6)/720
    );
    const lon = lonOrigin + (
      D
      - (1 + 2*T1 + C1) * Math.pow(D,3)/6
      + (5 - 2*C1 + 28*T1 - 3*C1*C1 + 8*eP2 + 24*T1*T1) * Math.pow(D,5)/120
    ) / cosp;
    return [lat * 180/Math.PI, lon * 180/Math.PI];
  }

  // ── Lê XLSX (aba DADOS) ──────────────────────────────────────────
  function parseXlsx(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const xlsx = require('xlsx');
          const wb = xlsx.read(new Uint8Array(reader.result), { type: 'array' });
          // Procura aba "DADOS" (case-insensitive)
          const sheetName = wb.SheetNames.find(n => n.toUpperCase() === 'DADOS') || wb.SheetNames[0];
          const sheet = wb.Sheets[sheetName];
          const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
          // Header: primeira linha não vazia. Deve conter OSE, X, Y.
          let header = null, headerIdx = -1;
          for (let i = 0; i < json.length; i++) {
            const row = json[i] || [];
            const upper = row.map(c => String(c||'').toUpperCase().trim());
            if (upper.includes('OSE') && upper.includes('X') && upper.includes('Y')) {
              header = upper; headerIdx = i; break;
            }
          }
          if (!header) { reject(new Error('Aba "DADOS" sem cabeçalho OSE/X/Y')); return; }
          const iOse = header.indexOf('OSE'), iX = header.indexOf('X'), iY = header.indexOf('Y');
          // Agrega centróides por OSE
          const grupos = {};
          for (let i = headerIdx + 1; i < json.length; i++) {
            const row = json[i] || [];
            const ose = String(row[iOse] || '').trim().toUpperCase();
            const x = Number(row[iX]), y = Number(row[iY]);
            if (!ose || !isFinite(x) || !isFinite(y)) continue;
            if (!grupos[ose]) grupos[ose] = { sx: 0, sy: 0, n: 0 };
            grupos[ose].sx += x; grupos[ose].sy += y; grupos[ose].n += 1;
          }
          const arr = Object.entries(grupos).map(([ose, g]) => ({
            ose, x: g.sx / g.n, y: g.sy / g.n, n: g.n,
            lat: null, lon: null, rua: '', bairro: '', cidade: '', uf: '', cep: '',
            fonte: '', displayName: '',
          })).sort((a,b) => a.ose.localeCompare(b.ose));
          resolve(arr);
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Nominatim reverse ────────────────────────────────────────────
  async function nominatimReverse(lat, lon) {
    const url = 'https://nominatim.openstreetmap.org/reverse?'
      + 'lat=' + encodeURIComponent(lat.toFixed(7))
      + '&lon=' + encodeURIComponent(lon.toFixed(7))
      + '&format=json&zoom=18&addressdetails=1&accept-language=pt-BR';
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Nexus-A2Z/1.0 (lucas.abdala@a2zprojetos.com.br)' }
    });
    if (!r.ok) throw new Error('Nominatim HTTP ' + r.status);
    const data = await r.json();
    const a = data.address || {};
    return {
      rua:    a.road || a.pedestrian || a.footway || '',
      bairro: a.suburb || a.neighbourhood || a.quarter || '',
      cidade: a.city || a.town || a.village || a.municipality || '',
      uf:     a.state || '',
      cep:    a.postcode || '',
      displayName: data.display_name || '',
    };
  }

  // ── Overpass: rua mais próxima num raio de 60m ──────────────────
  async function overpassNearestRoad(lat, lon, radiusM = 60) {
    const q = `[out:json][timeout:15];way(around:${radiusM},${lat},${lon})[highway][name];out tags center;`;
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(q),
    });
    if (!r.ok) throw new Error('Overpass HTTP ' + r.status);
    const data = await r.json();
    const els = data.elements || [];
    if (!els.length) return null;
    // Pega o mais próximo (haversine simplificado)
    const dist = (la, lo) => {
      const dLat = (la - lat) * 111320;
      const dLon = (lo - lon) * 111320 * Math.cos(lat * Math.PI/180);
      return Math.sqrt(dLat*dLat + dLon*dLon);
    };
    els.sort((a,b) => dist(a.center?.lat || a.lat, a.center?.lon || a.lon)
                    - dist(b.center?.lat || b.lat, b.center?.lon || b.lon));
    return { rua: els[0].tags?.name || '' };
  }

  // ── Render tabela ────────────────────────────────────────────────
  function renderTable() {
    const tb = document.getElementById('ceTableBody');
    if (!tb) return;
    if (!state.rows.length) {
      tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Carregue um XLSX pra começar</td></tr>';
      return;
    }
    const esc = window.esc || (s => String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])));
    tb.innerHTML = state.rows.map(r => `
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:7px 12px;font-family:DM Mono,monospace;font-weight:600">${esc(r.ose)}</td>
        <td style="padding:7px 12px;text-align:right;color:var(--text3)">${r.n}</td>
        <td style="padding:7px 12px;font-family:DM Mono,monospace;font-size:11px;color:var(--text3)">${r.lat != null ? r.lat.toFixed(5) : ''}</td>
        <td style="padding:7px 12px;font-family:DM Mono,monospace;font-size:11px;color:var(--text3)">${r.lon != null ? r.lon.toFixed(5) : ''}</td>
        <td style="padding:7px 12px;${r.rua ? '' : 'color:var(--text3);font-style:italic'}">${esc(r.rua || '(sem rua)')}</td>
        <td style="padding:7px 12px">${esc(r.bairro)}</td>
        <td style="padding:7px 12px">${esc(r.cidade)}</td>
        <td style="padding:7px 12px;font-size:11px;color:var(--text3)">${esc(r.fonte)}</td>
      </tr>
    `).join('');
  }

  function setBtnState() {
    const has = state.rows.length > 0;
    const run = state.running;
    const finished = !run && state.rows.some(r => r.lat != null);
    const hasPath = !!state.filePath;
    const dom = (id, enabled) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = !enabled;
      el.style.opacity = enabled ? '1' : '.5';
    };
    dom('ceBtnRun',    has && !run);
    dom('ceBtnStop',   run);
    dom('ceBtnExport', finished);
    dom('ceBtnApply',  finished && hasPath);
  }

  function setProgress(text) {
    const el = document.getElementById('ceProgress');
    if (el) el.textContent = text || '';
  }

  // ── Públicos ─────────────────────────────────────────────────────
  window.coletaEndInit = function() {
    const dz = document.getElementById('ceDropzone');
    if (!dz || dz._ceWired) return;
    dz._ceWired = true;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.background = 'var(--surface2)'; dz.style.borderColor = 'var(--accent)'; });
    dz.addEventListener('dragleave', () => { dz.style.background = ''; dz.style.borderColor = ''; });
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.style.background = ''; dz.style.borderColor = '';
      const f = e.dataTransfer.files[0];
      if (f) window.coletaEndOnFile(f);
    });
  };

  window.coletaEndOnFile = async function(file) {
    if (!file) return;
    state.filePath = file.path || '';   // Electron expõe path absoluto
    state.fileName = file.name || '';
    setProgress('Lendo XLSX...');
    try {
      state.rows = await parseXlsx(file);
      const info = document.getElementById('ceFileInfo');
      if (info) {
        info.style.display = '';
        const pathStr = state.filePath ? ` · path: ${state.filePath}` : ' · ⚠ path não disponível (use drag-and-drop ou seletor de arquivo)';
        info.textContent = `${file.name} · ${state.rows.length} OSEs detectadas · estimativa: ~${state.rows.length}s (Nominatim) ou ~${state.rows.length * 2}s (com fallback Overpass)${pathStr}`;
      }
      renderTable();
      setBtnState();
      setProgress('Pronto pra iniciar coleta');
    } catch (e) {
      window.toastError && window.toastError('Erro ao ler XLSX: ' + e.message);
      setProgress('Erro: ' + e.message);
    }
  };

  window.coletaEndRun = async function() {
    if (state.running || !state.rows.length) return;
    state.running = true;
    state.abortReq = false;
    setBtnState();

    const zona = parseInt(document.getElementById('ceZona').value, 10);
    const south = document.getElementById('ceHemis').value === 'S';
    const strat = document.getElementById('ceStrat').value;
    const useNominatim = strat === 'nominatim' || strat === 'nominatim+overpass';
    const useOverpass  = strat === 'overpass'  || strat === 'nominatim+overpass';

    // Converte UTM → lat/lon pra todas
    for (const r of state.rows) {
      const [la, lo] = utmToLatLon(r.x, r.y, zona, south);
      r.lat = la; r.lon = lo;
    }
    renderTable();

    let ok = 0, fail = 0;
    for (let i = 0; i < state.rows.length; i++) {
      if (state.abortReq) break;
      const r = state.rows[i];
      setProgress(`[${i+1}/${state.rows.length}] ${r.ose}...`);
      try {
        if (useNominatim) {
          if (i > 0) await new Promise(res => setTimeout(res, 1100)); // 1 req/s
          const info = await nominatimReverse(r.lat, r.lon);
          Object.assign(r, info);
          r.fonte = 'Nominatim';
        }
        // Fallback Overpass se rua ficou vazia
        if (useOverpass && !r.rua) {
          await new Promise(res => setTimeout(res, 800));
          const op = await overpassNearestRoad(r.lat, r.lon);
          if (op?.rua) { r.rua = op.rua; r.fonte = (r.fonte ? r.fonte + '+' : '') + 'Overpass'; }
        }
        if (r.rua) ok++; else fail++;
      } catch (e) {
        r.fonte = 'erro: ' + (e.message || 'desconhecido');
        fail++;
      }
      renderTable();
    }
    state.running = false;
    setBtnState();
    setProgress(`Concluído: ${ok} com rua, ${fail} sem`);
    window.toastSuccess && window.toastSuccess(`${ok}/${state.rows.length} endereços coletados`);
  };

  window.coletaEndStop = function() {
    state.abortReq = true;
    setProgress('Parando...');
  };

  window.coletaEndExport = function() {
    if (!state.rows.length) return;
    try {
      const xlsx = require('xlsx');
      const data = [
        ['OSE', 'X (UTM)', 'Y (UTM)', 'N estruturas', 'Latitude', 'Longitude',
         'Rua', 'Bairro', 'Cidade', 'UF', 'CEP', 'Fonte', 'Endereço completo']
      ];
      for (const r of state.rows) {
        data.push([r.ose, r.x, r.y, r.n, r.lat, r.lon,
                   r.rua, r.bairro, r.cidade, r.uf, r.cep, r.fonte, r.displayName]);
      }
      const ws = xlsx.utils.aoa_to_sheet(data);
      ws['!cols'] = [
        { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
        { wch: 12 }, { wch: 12 }, { wch: 32 }, { wch: 22 },
        { wch: 18 }, { wch: 6 }, { wch: 11 }, { wch: 16 }, { wch: 60 },
      ];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Endereços');
      const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,15);
      xlsx.writeFile(wb, `enderecos-${ts}.xlsx`);
      window.toastSuccess && window.toastSuccess('XLSX exportado');
    } catch (e) {
      window.toastError && window.toastError('Erro ao exportar: ' + e.message);
    }
  };

  // Grava bairro em B4 e rua em B7 (UPPERCASE) nas abas OSE-NNN do XLSX original.
  // ATENÇÃO: usa exceljs (em vez de xlsx) pra preservar formatação/estilos das células.
  window.coletaEndApplyToOriginal = async function() {
    if (!state.rows.length) return;
    if (!state.filePath) {
      window.toastError && window.toastError('Não foi possível identificar o caminho do arquivo. Use arrastar-e-soltar ou o seletor.');
      return;
    }
    if (!await nexusConfirm(
      `Vai gravar bairro em B4 e rua em B7 (UPPERCASE) em todas as abas OSE-NNN do arquivo:\n\n${state.filePath}\n\nO XLSX será sobrescrito (formatação preservada). Continuar?`
    )) return;

    setProgress('Aplicando B4/B7 no XLSX original...');
    try {
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(state.filePath);

      // Index das linhas da coleta por OSE (uppercase)
      const byOse = {};
      for (const r of state.rows) byOse[r.ose.toUpperCase()] = r;

      let updated = 0, skipped = 0;
      wb.eachSheet(ws => {
        const name = String(ws.name || '').toUpperCase();
        if (!/^OSE[-\s_]/i.test(name)) return;
        const row = byOse[name];
        if (!row) { skipped++; return; }
        const bairro = (row.bairro || '').trim().toUpperCase();
        const rua    = (row.rua    || '').trim().toUpperCase();
        if (bairro) ws.getCell('B4').value = bairro;
        if (rua)    ws.getCell('B7').value = rua;
        updated++;
      });

      await wb.xlsx.writeFile(state.filePath);
      setProgress(`✓ ${updated} abas atualizadas em ${state.fileName}` + (skipped ? ` (${skipped} sem dado)` : ''));
      window.toastSuccess && window.toastSuccess(`B4/B7 atualizados em ${updated} abas`);
    } catch (e) {
      console.error(e);
      window.toastError && window.toastError('Erro ao gravar: ' + e.message);
      setProgress('Erro: ' + e.message);
    }
  };
})();
