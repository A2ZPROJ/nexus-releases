/* Nexus · campos de arquivo com "arraste e solte" em todo o app (13/09/2026).
 *
 * Cada botão de Selecionar/Procurar ganha uma área tracejada ao lado (ou o campo que já mostra o caminho vira
 * essa área). Soltar um arquivo/pasta ali aciona o PRÓPRIO botão da tela; o seletor do Windows é respondido
 * com o que foi solto, então cada tela reaproveita a validação e o carregamento que já tinha.
 * O ponto único é o ipcRenderer.invoke dos canais que abrem diálogo (preload e fallback usam o mesmo objeto).
 */
(function () {
  'use strict';
  let ipc, fs, path;
  try { ipc = require('electron').ipcRenderer; fs = require('fs'); path = require('path'); } catch (e) { return; }
  if (!ipc || ipc.__nxArquivos) return;
  ipc.__nxArquivos = true;

  // ── Canais que abrem diálogo de ABRIR (os de salvar ficam de fora) e o que cada um espera ──
  const extsDe = (filtros) => {
    const e = [];
    (Array.isArray(filtros) ? filtros : []).forEach((f) => (f.extensions || []).forEach((x) => { if (x && x !== '*') e.push(String(x).toLowerCase()); }));
    return e.length ? e : null;
  };
  const MEMORIAL_EXT = { ose: ['xlsx'], modelo: ['sqlite', 'stsw', 'db'], interferencias: ['shp'], soleiras: ['shp', 'zip'], template: ['docx'], dados_json: ['json'] };
  const ABRIR = {
    'select-file': (a) => ({ kind: 'file', ext: extsDe(a[0]) }),
    'select-files': (a) => ({ kind: 'file', ext: extsDe(a[0]), multi: true }),
    'select-folder': () => ({ kind: 'dir' }),
    'select-folders': () => ({ kind: 'dir', multi: true }),
    'orc-rce:select-oses': () => ({ kind: 'file', ext: ['xlsx'] }),
    'orc-elev:pick-a2': () => ({ kind: 'file', ext: ['xlsx'] }),
    'orc-elev:pick-pdf': () => ({ kind: 'file', ext: ['pdf'], multi: true }),
    'memorial:pick-file': (a) => ({ kind: 'file', ext: MEMORIAL_EXT[a[0]] || null, multi: a[0] === 'ose' }),
    'memorial:pick-dir': () => ({ kind: 'dir' }),
    'geoide:pick': (a) => (a[0] === 'pasta' ? { kind: 'dir', multi: true } : { kind: 'file', ext: ['txt'], multi: true }),
    'mapa:pick-excel': () => ({ kind: 'file', ext: ['xlsx'] }),
    'mapa:pick-dir': () => ({ kind: 'dir' }),
    'abas-pdf:select-xlsx': () => ({ kind: 'file', ext: ['xlsx', 'xlsm', 'xls'] }),
    'abas-pdf:pick-dir': () => ({ kind: 'dir' }),
    'ap3d:pick': (a) => { const t = (a[0] || {}).tipo; if (t === 'saida') return null; return t === 'pasta' ? { kind: 'dir' } : { kind: 'file', ext: t ? [t] : null, semExtensao: t === 'shp' }; },
    'dashboard:pick-file': () => ({ kind: 'file', ext: ['xlsx', 'xls'], viaArg: true }),
  };

  let pendente = null;      // { paths, ate }
  let botaoAtivo = null;    // último botão registrado clicado (pra mostrar o nome escolhido na área dele)

  const ehPasta = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
  const ehArquivo = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
  const extDe = (p) => path.extname(p).slice(1).toLowerCase();
  const nome = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || p;

  function filtra(paths, regra) {
    const ok = paths.filter((p) => regra.kind === 'dir' ? ehPasta(p) : (ehArquivo(p) && (!regra.ext || regra.ext.includes(extDe(p)))));
    return regra.multi ? ok : ok.slice(0, 1);
  }
  function vazio(ch, regra) {
    if (ch === 'dashboard:pick-file') return { ok: false, error: 'Cancelado' };
    if (ch === 'memorial:pick-file') return null;
    return regra.multi ? [] : null;
  }
  function avisa(regra) {
    const msg = regra.kind === 'dir' ? 'Esse campo espera uma pasta.'
      : regra.ext ? 'Esse campo espera arquivo ' + regra.ext.map((e) => '.' + e).join(', ') + '.' : 'Arquivo não encontrado.';
    (window.toastWarning || window.toast || console.warn)(msg, 'warning');
  }
  let cliqueEm = 0;
  function botaoDoClique() { const b = (Date.now() - cliqueEm < 1500) ? botaoAtivo : null; botaoAtivo = null; return b; }
  function mostraEscolha(botao, paths) {
    const z = botao && botao.__nxZona;
    if (!z || !z.classList.contains('nx-dz')) return;
    const tx = z.querySelector('.nx-dz-tx');
    if (!tx) return;
    tx.textContent = paths.length === 1 ? nome(paths[0]) : paths.length + ' itens: ' + paths.slice(0, 3).map(nome).join(', ') + (paths.length > 3 ? '…' : '');
    tx.title = paths.join('\n');
    z.classList.add('nx-dz-cheio');
  }

  document.addEventListener('click', (e) => {
    if (pendente && !(pendente.botao && pendente.botao.contains(e.target))) pendente = null;
  }, true);

  const invokeOriginal = ipc.invoke.bind(ipc);
  ipc.invoke = function (ch, ...args) {
    const regra = ABRIR[ch] ? ABRIR[ch](args) : null;
    if (regra && pendente && Date.now() < pendente.ate) {
      const p = pendente; pendente = null;
      const ok = filtra(p.paths, regra);
      if (!ok.length) { avisa(regra); return Promise.resolve(vazio(ch, regra)); }
      mostraEscolha(botaoDoClique(), ok);
      if (regra.viaArg) return invokeOriginal(ch, ok[0]);
      if (regra.semExtensao) return Promise.resolve(ok[0].replace(/\.shp$/i, ''));
      return Promise.resolve(regra.multi ? ok : ok[0]);
    }
    const pr = invokeOriginal(ch, ...args);
    if (regra) { const b = botaoDoClique(); if (b) pr.then((r) => { const arr = Array.isArray(r) ? r : (typeof r === 'string' ? [r] : []); if (arr.length) mostraEscolha(b, arr); }).catch(() => {}); }
    return pr;
  };

  // ── Onde aparece: botão da tela + área (existente ou criada ao lado) ──
  const REGISTRO = [
    // Admin
    { btn: '#importBtn', input: '#importFile', rotulo: 'o CSV do histórico' },
    // Gerar PDF de OSE
    { btn: '#abas-pick-xlsx', zona: '#abas-xlsx-path' },
    { btn: '#abas-pick-dir', zona: '#abas-dir-path' },
    // Orçamento / Elevatórias
    { btn: '#orc-tab-file-btn', zona: '#orc-tab-file-path' },
    { btn: '#oelev-pick-a2', zona: '#oelev-a2-path' },
    { btn: '#cot-pick', zona: '#cot-file' },
    // Conferência (alinhamento e meio-fio; mapa/perfil/planilha já têm soltar próprio)
    { btn: '[onclick="window.oseAlignPick(\'predial\')"]', zona: '#ose-align-predial-path' },
    { btn: '[onclick="window.oseAlignPick(\'meiofio\')"]', zona: '#ose-align-meiofio-path' },
    // Apresentação 3D
    ...['rede', 'topo', 'agua', 'drenagem', 'casas', 'nomesRuas', 'padrao'].map((c) => ({ btn: '[onclick^="ap3dPick(\'' + c + '\'"]', zona: '#ap3d-v-' + c })),
    // Correção geoidal: uma área pros dois botões (pasta ou TXT)
    { zona: '#geo-sel', porTipo: { dir: '[onclick="geoPick(\'pasta\')"]', file: '[onclick="geoPick(\'arquivo\')"]' } },
    // Renomear
    { btn: '#ren-folder-btn', zona: '#ren-folder' },
    // Relatórios técnicos
    { btn: '[onclick="window.relTopoPickXls()"]', rotulo: 'as planilhas XLS' },
    { btn: '[onclick="window.relTopoTxtPickPasta()"]', zona: '#rel-topo-txt-raiz' },
    { btn: '[onclick="window.relTopoTxtPickSaida()"]', zona: '#rel-topo-txt-saida' },
    { btn: '[onclick="window.relSondPickXlsx()"]', rotulo: 'a planilha XLSX' },
    { btn: '[onclick^="window.relTopoTxtPickFotos("]', soBotao: true, todos: true },
    { btn: '[onclick^="window.relTopoTxtPickArt("]', soBotao: true, todos: true },
    { btn: '[onclick^="window.relTopoTxtPickMapa("]', soBotao: true, todos: true },
    // Monografia de marco e mapas do memorial
    { btn: '[onclick="window.monoPickPpp()"]', zona: '#mono-pdf-path' },
    { btn: '[onclick="window.monoPickFotosPasta()"]', zona: '#mono-fotos-pasta-path' },
    { btn: '[onclick="window.monoPickFotos()"]', zona: '#mono-fotos-path' },
    { btn: '[onclick="window.mapaPickExcel()"]', zona: '#mapa-excel-path' },
    { btn: '[onclick="window.mapaPickShp()"]', zona: '#mapa-shp-path' },
    { btn: '[onclick="window.mapaPickSaida()"]', zona: '#mapa-saida-path' },
    // Memorial descritivo: o botão fica ao lado do campo
    ...['#mem-ose-path', '#mem-modelo-path', '#mem-estudo-path', '#mem-mc-path', '#mem-soldwg-path', '#mem-txt-path', '#mem-mapas-path', '#mem-marcos-path'].map((z) => ({ zona: z, btn: '@irmao' })),
    { zona: '#mem-sol-path', porTipo: { dir: '.mem-pickdir[data-target="mem-sol-path"]', file: '.mem-pick[data-target="mem-sol-path"]' } },
    { zona: '#mem-int-path', porTipo: { dir: '.mem-pickdir[data-target="mem-int-path"]', file: '.mem-pick[data-target="mem-int-path"]' } },
    // Painel da diretoria
    { btn: '#dd-errPick', rotulo: 'a planilha de acompanhamento' },
    { btn: '#dd-pickBtn', soBotao: true },
    // Planilhas GIS
    { btn: '[onclick="window.gisPick()"]', rotulo: 'a planilha .xls/.xlsx', todos: true },
    { btn: '[onclick="window.gisShapePick()"]', rotulo: 'os shapefiles .shp', todos: true },
    { btn: '[onclick="window.gisPickOutputFolder()"]', zona: '#gis-output-folder' },
    // Campos nativos visíveis
    { inputVisivel: '#impFile', rotulo: 'a planilha (.xlsx, .xls ou .csv)' },
    { inputVisivel: '#crAnexo', rotulo: 'o anexo' },
    { inputVisivel: '#tbHeaderFile', rotulo: 'a imagem do cabeçalho' },
    { inputVisivel: '#tbFooterFile', rotulo: 'a imagem do rodapé' },
  ];

  function caminhosDoDrop(e) {
    const out = [];
    const fl = (e.dataTransfer && e.dataTransfer.files) || [];
    let wu = null; try { wu = require('electron').webUtils; } catch (x) {}
    for (const f of fl) { let p = f.path || ''; if (!p && wu && wu.getPathForFile) { try { p = wu.getPathForFile(f); } catch (x) {} } if (p) out.push(p); }
    return out;
  }

  function soltarEm(botao, paths) {
    if (!paths.length) { (window.toastWarning || console.warn)('Não consegui ler o caminho do que foi solto.'); return; }
    pendente = { paths, botao, ate: Date.now() + 3000 };
    botaoAtivo = botao; cliqueEm = Date.now();
    botao.click();
    setTimeout(() => { if (pendente && Date.now() >= pendente.ate) pendente = null; }, 3200);
  }

  function ligaArraste(alvo, aoSoltar) {
    if (!alvo || alvo.__nxDropLigado) return;
    alvo.__nxDropLigado = true;
    let n = 0;
    alvo.addEventListener('dragenter', (e) => { if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); e.stopPropagation(); n++; alvo.classList.add('nx-drop-ativo'); });
    alvo.addEventListener('dragover', (e) => { if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); e.stopPropagation(); try { e.dataTransfer.dropEffect = 'copy'; } catch (x) {} });
    alvo.addEventListener('dragleave', (e) => { e.stopPropagation(); n = Math.max(0, n - 1); if (!n) alvo.classList.remove('nx-drop-ativo'); });
    alvo.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); n = 0; alvo.classList.remove('nx-drop-ativo'); aoSoltar(e); });
  }

  // filtra o que foi solto pelo accept/multiple do <input type=file>
  function arquivosAceitos(inp, lista) {
    const acc = (inp.getAttribute('accept') || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    const passa = (f) => !acc.length || acc.some((a) => a.startsWith('.') ? f.name.toLowerCase().endsWith(a)
      : a.endsWith('/*') ? (f.type || '').toLowerCase().startsWith(a.slice(0, -1)) : (f.type || '').toLowerCase() === a);
    let ok = [...lista].filter(passa);
    if (!inp.multiple) ok = ok.slice(0, 1);
    if (!ok.length) { (window.toastWarning || console.warn)('Esse campo espera ' + (acc.join(', ') || 'outro tipo de arquivo') + '.'); return null; }
    const dt = new DataTransfer(); ok.forEach((f) => dt.items.add(f)); return dt.files;
  }

  function criaZona(rotulo) {
    const z = document.createElement('div');
    z.className = 'nx-dz';
    z.setAttribute('role', 'button');
    z.tabIndex = 0;
    z.innerHTML = '<span class="nx-dz-ic" aria-hidden="true"></span><span class="nx-dz-tx"></span>';
    z.querySelector('.nx-dz-tx').textContent = 'Arraste e solte ' + (rotulo || 'o arquivo') + ' aqui';
    return z;
  }

  function rotuloDoBotao(b) {
    const t = (b.textContent || '').replace(/[+…📎🔄]/g, '').replace(/\s+/g, ' ').trim();
    const m = t.match(/(?:Selecionar|Adicionar|Escolher|Trocar|Anexar)\s+(.*)/i);
    return m ? 'o ' + m[1].replace(/^(o|a|os|as)\s+/i, '') : 'o arquivo';
  }

  function aplicaItem(it) {
    // campo nativo visível: vira área; clique abre o seletor do próprio input
    if (it.inputVisivel) {
      const inp = document.querySelector(it.inputVisivel);
      if (!inp || inp.__nxWired) return;
      inp.__nxWired = true;
      const z = criaZona(it.rotulo);
      inp.insertAdjacentElement('afterend', z);
      inp.classList.add('nx-input-oculto');
      z.addEventListener('click', () => inp.click());
      z.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
      const mostra = () => { const fs2 = [...(inp.files || [])]; if (!fs2.length) return; const tx = z.querySelector('.nx-dz-tx'); tx.textContent = fs2.map((f) => f.name).join(', '); z.classList.add('nx-dz-cheio'); };
      inp.addEventListener('change', mostra);
      ligaArraste(z, (e) => { const fl = arquivosAceitos(inp, e.dataTransfer.files); if (!fl) return; try { inp.files = fl; } catch (x) { return; } inp.dispatchEvent(new Event('change', { bubbles: true })); mostra(); });
      return;
    }
    // área com dois botões (pasta ou arquivo)
    if (it.porTipo) {
      const zona = document.querySelector(it.zona);
      if (!zona || zona.__nxWired) return;
      zona.__nxWired = true;
      zona.classList.add('nx-dz-alvo');
      zona.setAttribute('data-nx-dica', 'ou arraste e solte aqui');
      ligaArraste(zona, (e) => {
        const ps = caminhosDoDrop(e);
        const b = document.querySelector(ps.length && ehPasta(ps[0]) ? it.porTipo.dir : it.porTipo.file);
        if (b) soltarEm(b, ps);
      });
      return;
    }
    const lista = it.btn === '@irmao' ? [] : (it.todos ? [...document.querySelectorAll(it.btn)] : [document.querySelector(it.btn)].filter(Boolean));
    if (it.btn === '@irmao') {
      const z = document.querySelector(it.zona);
      const b = z && z.parentElement && z.parentElement.querySelector('button');
      if (b) lista.push(b);
    }
    lista.forEach((botao) => {
      if (botao.__nxWired) return;
      botao.__nxWired = true;
      botao.addEventListener('click', () => { botaoAtivo = botao; cliqueEm = Date.now(); }, true);
      // botão que abre um <input type=file> escondido: o arquivo solto entra direto no input
      const inpOculto = it.input ? document.querySelector(it.input) : null;
      const solta = inpOculto
        ? (e) => { const fl = arquivosAceitos(inpOculto, e.dataTransfer.files); if (!fl) return; try { inpOculto.files = fl; } catch (x) { return; } inpOculto.dispatchEvent(new Event('change', { bubbles: true })); }
        : (e) => soltarEm(botao, caminhosDoDrop(e));
      ligaArraste(botao, solta);
      if (it.soBotao) { botao.title = botao.title || 'Clique ou arraste o arquivo até aqui'; return; }
      let zona = it.zona && it.btn !== '@irmao' ? document.querySelector(it.zona) : (it.btn === '@irmao' ? document.querySelector(it.zona) : null);
      if (zona) {
        if (!zona.classList.contains('nx-dropzone') && !zona.classList.contains('ose-file-input')) zona.classList.add('nx-dz-alvo');
        if (zona.tagName === 'INPUT') {
          if (zona.placeholder && !/arraste/i.test(zona.placeholder)) zona.placeholder = zona.placeholder.replace(/\.\.\.$|…$/, '') + ' — ou arraste e solte aqui';
        } else {
          zona.setAttribute('data-nx-dica', 'ou arraste e solte aqui');
        }
      } else {
        zona = criaZona(it.rotulo || rotuloDoBotao(botao));
        botao.insertAdjacentElement('afterend', zona);
        zona.addEventListener('click', () => botao.click());
        zona.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); botao.click(); } });
      }
      botao.__nxZona = zona;
      ligaArraste(zona, solta);
    });
  }

  function aplica() { REGISTRO.forEach((it) => { try { aplicaItem(it); } catch (e) { console.warn('[nx-arquivos]', e); } }); }

  let agendado = null;
  function agenda() { if (agendado) return; agendado = setTimeout(() => { agendado = null; aplica(); }, 250); }
  function inicia() {
    aplica();
    try { new MutationObserver(agenda).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicia); else inicia();

  // pra testes automatizados
  window.nxArquivos = { soltarEm, aplica, REGISTRO };
})();
