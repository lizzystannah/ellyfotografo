/* ============================================================
   ELLY FOTÓGRAFO — editor.js
   Editor Visual WYSIWYG Profissional Completo
   (Edição PC e Celular, Textos, Fotos, Cards e Reordenação de Secções)
   ============================================================ */

(function () {
  'use strict';

  var CHAVE_LOCAL = 'elly_pagina_editada_v1';
  var isEditor = /[?&]editor=1/.test(location.search);

  // Lista padrão das secções ordenáveis
  var SECCOES_LISTA = [
    { id: 'topo', nome: 'Capa / Hero' },
    { id: 'sobre', nome: 'Sobre Nós' },
    { id: 'eventos', nome: 'Eventos (Cards)' },
    { id: 'portfolio', nome: 'Portfólio' },
    { id: 'como', nome: 'Como Funciona (Passos)' },
    { id: 'reservar', nome: 'Reserva & Orçamento' },
    { id: 'experiencia', nome: 'Experiência' },
    { id: 'contacto', nome: 'Contacto Final (CTA)' }
  ];

  // Estado geral guardado (Desktop e Celular)
  var estado = {
    textos: {},
    fotos: {},
    seccoes: {},
    cards: {},
    ordemSeccoes: [],
    seccoesDuplicadas: [],
    mobile: {
      textos: {},
      seccoes: {},
      cards: {}
    }
  };

  // Modo de dispositivo ativo: 'pc', 'mobile' ou null (auto-detetado via largura da janela)
  var modoDispositivoManual = null;

  function estaNoModoMobile() {
    if (modoDispositivoManual === 'mobile') return true;
    if (modoDispositivoManual === 'pc') return false;
    return window.innerWidth <= 768;
  }

  /* ============================================================
     1. GESTÃO DE ESTADO & SINCRONIZAÇÃO
     ============================================================ */

  var seletoresTextoGlobais = [
    '.eyebrow',
    '.section-label',
    '.hero h1',
    '.hero p',
    '.hero-buttons a',
    '.header-btn',
    '.hero-bottom span',
    '.intro-texto h2',
    '.intro-texto p',
    '.intro h2',
    '.intro p',
    '.events-header h2',
    '.events-header p',
    '.event-info h3',
    '.event-info p',
    '.portfolio-top h2',
    '.portfolio-top p',
    '.como h2',
    '.como-header h2',
    '.como-header p',
    '.passos h3',
    '.passos p',
    '.passo h3',
    '.passo p',
    '.experience-content h2',
    '.experience-content > p',
    '.feature h3',
    '.feature p',
    '.feature-number',
    '.form-box h2',
    '.form-box p',
    '.sub',
    '.cta h2',
    '.cta p',
    '.cta a'
  ];

  // Garante identificação estável e idêntica de cada texto em modo editor e no site público
  function identificarElementosTexto() {
    var elementos = document.querySelectorAll(seletoresTextoGlobais.join(', '));
    elementos.forEach(function (el, index) {
      if (!el.getAttribute('data-ed-txt')) {
        el.setAttribute('data-ed-txt', 't' + index);
      }
    });
  }

  // Canal de sincronização em tempo real entre separadores (editor, painel e site público)
  var canalSync = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      canalSync = new BroadcastChannel('elly_landing_sync');
      canalSync.addEventListener('message', function (ev) {
        if (ev.data && ev.data.tipo === 'landing_atualizada' && ev.data.estado) {
          window.__ESTADO_LANDING = ev.data.estado;
          carregarEstado();
          aplicarEstado();
        }
      });
    }
  } catch (e) {}

  window.addEventListener('storage', function (e) {
    if (e.key === CHAVE_LOCAL && e.newValue) {
      try {
        var n = JSON.parse(e.newValue);
        if (n && typeof n === 'object') {
          window.__ESTADO_LANDING = n;
          carregarEstado();
          aplicarEstado();
        }
      } catch (err) {}
    }
  });

  function carregarEstado() {
    try {
      var dadosCarregados = null;
      if (window.__ESTADO_LANDING && typeof window.__ESTADO_LANDING === 'object' && Object.keys(window.__ESTADO_LANDING).length > 0) {
        dadosCarregados = window.__ESTADO_LANDING;
      }
      if (!dadosCarregados) {
        var salvo = localStorage.getItem(CHAVE_LOCAL);
        if (salvo) {
          var parsed = JSON.parse(salvo);
          if (parsed && typeof parsed === 'object') dadosCarregados = parsed;
        }
      }
      if (dadosCarregados) {
        if (dadosCarregados.textos) estado.textos = Object.assign({}, dadosCarregados.textos);
        if (dadosCarregados.fotos) estado.fotos = Object.assign({}, dadosCarregados.fotos);
        if (dadosCarregados.seccoes) estado.seccoes = Object.assign({}, dadosCarregados.seccoes);
        if (dadosCarregados.cards) estado.cards = Object.assign({}, dadosCarregados.cards);
        if (Array.isArray(dadosCarregados.ordemSeccoes)) estado.ordemSeccoes = dadosCarregados.ordemSeccoes.slice();
        if (Array.isArray(dadosCarregados.seccoesDuplicadas)) estado.seccoesDuplicadas = dadosCarregados.seccoesDuplicadas.slice();
        if (dadosCarregados.mobile && typeof dadosCarregados.mobile === 'object') {
          estado.mobile = {
            textos: Object.assign({}, dadosCarregados.mobile.textos || {}),
            seccoes: Object.assign({}, dadosCarregados.mobile.seccoes || {}),
            cards: Object.assign({}, dadosCarregados.mobile.cards || {})
          };
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar estado do editor:', e);
    }
  }

  function guardarEstado(notificarPai) {
    try {
      if (typeof atualizarHtmlSeccoesDuplicadasNoEstado === 'function') {
        atualizarHtmlSeccoesDuplicadasNoEstado();
      }
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify(estado));
      if (canalSync) {
        try { canalSync.postMessage({ tipo: 'landing_atualizada', estado: estado }); } catch (e) {}
      }
      if (isEditor && window.parent && window.parent !== window && notificarPai !== false) {
        window.parent.postMessage({ tipo: 'landing_alterada', estado: estado }, '*');
      }
    } catch (e) {
      console.warn('Aviso ao gravar no localStorage:', e);
    }
  }

  /* Gera regras de estilo dinâmicas no documento (<style id="elly-estilos-dinamicos">) */
  function aplicarEstilosDinamicos() {
    var styleEl = document.getElementById('elly-estilos-dinamicos');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'elly-estilos-dinamicos';
      document.head.appendChild(styleEl);
    }

    var regrasDesktop = [];
    var regrasMobile = [];

    // 1. Textos Desktop
    if (estado.textos) {
      for (var sel in estado.textos) {
        var t = estado.textos[sel];
        if (!t) continue;
        var r = [];
        if (t.fontSize) r.push('font-size: ' + t.fontSize + ' !important;');
        if (t.marginTop !== undefined && t.marginTop !== '') r.push('margin-top: ' + t.marginTop + ' !important;');
        if (t.color) r.push('color: ' + t.color + ' !important;');
        if (t.textAlign) r.push('text-align: ' + t.textAlign + ' !important;');
        if (t.fontFamily) r.push('font-family: ' + t.fontFamily + ' !important;');
        if (t.lineHeight) r.push('line-height: ' + t.lineHeight + ' !important;');
        if (t.eliminado) r.push('display: none !important;');
        if (r.length) regrasDesktop.push(sel + ' { ' + r.join(' ') + ' }');
      }
    }

    // 2. Textos Mobile
    if (estado.mobile && estado.mobile.textos) {
      for (var selM in estado.mobile.textos) {
        var tM = estado.mobile.textos[selM];
        if (!tM) continue;
        var rM = [];
        if (tM.fontSize) rM.push('font-size: ' + tM.fontSize + ' !important;');
        if (tM.marginTop !== undefined && tM.marginTop !== '') rM.push('margin-top: ' + tM.marginTop + ' !important;');
        if (tM.textAlign) rM.push('text-align: ' + tM.textAlign + ' !important;');
        if (tM.eliminado) rM.push('display: none !important;');
        if (rM.length) regrasMobile.push(selM + ' { ' + rM.join(' ') + ' }');
      }
    }

    // 3. Secções Desktop
    if (estado.seccoes) {
      for (var sId in estado.seccoes) {
        var sc = estado.seccoes[sId];
        if (!sc) continue;
        var rS = [];
        if (sc.paddingTop !== undefined) rS.push('padding-top: ' + sc.paddingTop + 'px !important;');
        else if (sc.paddingY !== undefined) rS.push('padding-top: ' + sc.paddingY + 'px !important;');
        if (sc.paddingBottom !== undefined) rS.push('padding-bottom: ' + sc.paddingBottom + 'px !important;');
        else if (sc.paddingY !== undefined) rS.push('padding-bottom: ' + sc.paddingY + 'px !important;');
        if (sc.minHeight) rS.push('min-height: ' + sc.minHeight + ' !important;');
        if (sc.visivel === false && !isEditor) rS.push('display: none !important;');
        if (rS.length) regrasDesktop.push('#' + sId + ' { ' + rS.join(' ') + ' }');
      }
    }

    // 4. Secções Mobile
    if (estado.mobile && estado.mobile.seccoes) {
      for (var sIdM in estado.mobile.seccoes) {
        var scM = estado.mobile.seccoes[sIdM];
        if (!scM) continue;
        var rSM = [];
        if (scM.paddingTop !== undefined) rSM.push('padding-top: ' + scM.paddingTop + 'px !important;');
        else if (scM.paddingY !== undefined) rSM.push('padding-top: ' + scM.paddingY + 'px !important;');
        if (scM.paddingBottom !== undefined) rSM.push('padding-bottom: ' + scM.paddingBottom + 'px !important;');
        else if (scM.paddingY !== undefined) rSM.push('padding-bottom: ' + scM.paddingY + 'px !important;');
        if (scM.minHeight) rSM.push('min-height: ' + scM.minHeight + ' !important;');
        if (scM.visivel === false && !isEditor) rSM.push('display: none !important;');
        if (rSM.length) regrasMobile.push('#' + sIdM + ' { ' + rSM.join(' ') + ' }');
      }
    }

    // 5. Cards Desktop & Mobile
    if (estado.cards) {
      for (var cK in estado.cards) {
        var cc = estado.cards[cK];
        if (cc && cc.aspectRatio) {
          var cardSel = cK === 'eventos' ? '.event-card' : (cK === 'portfolio' ? '.gallery-item' : '.event-card');
          regrasDesktop.push(cardSel + ' { aspect-ratio: ' + cc.aspectRatio + ' !important; height: auto !important; }');
        }
      }
    }
    if (estado.mobile && estado.mobile.cards) {
      for (var cKM in estado.mobile.cards) {
        var ccM = estado.mobile.cards[cKM];
        if (ccM && ccM.aspectRatio) {
          var cardSelM = cKM === 'eventos' ? '.event-card' : (cKM === 'portfolio' ? '.gallery-item' : '.event-card');
          regrasMobile.push(cardSelM + ' { aspect-ratio: ' + ccM.aspectRatio + ' !important; height: auto !important; }');
        }
      }
    }

    var cssFinal = '/* Estilos Desktop */\n' + regrasDesktop.join('\n');
    if (regrasMobile.length) {
      cssFinal += '\n\n/* Estilos Celular (Mobile <= 768px ou Modo Forçado) */\n@media (max-width: 768px) {\n' + regrasMobile.join('\n') + '\n}\n';
      cssFinal += '\nbody.ed-visao-mobile {\n' + regrasMobile.map(function (r) { return '  ' + r; }).join('\n') + '\n}\n';
    }

    styleEl.textContent = cssFinal;
  }

  /* Aplica o estado ao DOM da página */
  function aplicarEstado() {
    identificarElementosTexto();
    carregarEstado();

    // 0. Recria secções duplicadas e caixas de texto criadas guardadas no estado
    if (typeof recriarSeccoesDuplicadasNoDOM === 'function') {
      recriarSeccoesDuplicadasNoDOM();
    }
    if (typeof recriarCaixasTextoCriadasNoDOM === 'function') {
      recriarCaixasTextoCriadasNoDOM();
    }

    // 1. Ordem das secções
    if (estado.ordemSeccoes && Array.isArray(estado.ordemSeccoes) && estado.ordemSeccoes.length) {
      aplicarOrdemSeccoesDOM(estado.ordemSeccoes);
    }

    // 2. Textos (conteúdo innerHTML)
    if (estado.textos) {
      for (var seletor in estado.textos) {
        var item = estado.textos[seletor];
        var el = document.querySelector(seletor);
        if (el && item) {
          if (typeof item === 'string') {
            el.innerHTML = item;
          } else if (item.html !== undefined) {
            el.innerHTML = item.html;
          }
        }
      }
    }

    // 3. Fotografias, zoom e foco
    if (estado.fotos) {
      for (var chave in estado.fotos) {
        var dados = estado.fotos[chave];
        var imgEl = buscarElementoFoto(chave);
        if (imgEl && dados) {
          if (dados.src) {
            if (chave === 'hero') {
              imgEl.style.backgroundImage = 'linear-gradient(90deg, rgba(0,0,0,.85), rgba(0,0,0,.3)), url("' + dados.src + '")';
              if (dados.fx || dados.fy) {
                imgEl.style.backgroundPosition = (dados.fx || '50%') + ' ' + (dados.fy || '25%');
              }
            } else if (chave === 'cta') {
              imgEl.style.backgroundImage = 'url("' + dados.src + '")';
              if (dados.fx || dados.fy) {
                imgEl.style.backgroundPosition = (dados.fx || '50%') + ' ' + (dados.fy || '50%');
              }
            } else if (imgEl.tagName === 'IMG') {
              imgEl.src = dados.src;
            } else {
              imgEl.style.backgroundImage = 'url("' + dados.src + '")';
            }
          }
          if (dados.fz !== undefined) imgEl.style.setProperty('--fz', String(dados.fz));
          if (dados.fx) imgEl.style.setProperty('--fx', dados.fx);
          if (dados.fy) imgEl.style.setProperty('--fy', dados.fy);
        }
      }
    }

    // 4. Aplica secções eliminadas/ocultas
    if (estado.seccoes) {
      for (var secId in estado.seccoes) {
        var secEl = document.getElementById(secId);
        if (secEl) {
          var config = estado.seccoes[secId];
          var visivel = !config || (config.visivel !== false && !config.eliminada);
          if (!visivel) {
            secEl.classList.add('ed-seccao-oculta');
            secEl.style.setProperty('display', 'none', 'important');
          } else {
            secEl.classList.remove('ed-seccao-oculta');
            if (secEl.style.display === 'none') {
              secEl.style.removeProperty('display');
            }
          }
          var btnOcultar = secEl.querySelector('.ed-btn-ocultar-sec');
          if (btnOcultar) btnOcultar.textContent = visivel ? '👁️ Ocultar' : '👁️ Mostrar';
        }
      }
    }

    // 5. Aplica os estilos dinâmicos gerados (Desktop & Mobile)
    aplicarEstilosDinamicos();

    // 6. Oculta containers pai (.feature, .passos li) cujos textos foram todos eliminados
    document.querySelectorAll('.feature, .passos li').forEach(function (box) {
      var editaveis = box.querySelectorAll('[data-ed-txt]');
      if (editaveis.length > 0) {
        var todosEliminados = true;
        editaveis.forEach(function (edEl) {
          var s = edEl.getAttribute('data-ed-txt');
          var sel = s ? '[data-ed-txt="' + s + '"]' : '';
          var cfg = sel && estado.textos ? estado.textos[sel] : null;
          var cfgM = sel && estado.mobile && estado.mobile.textos ? estado.mobile.textos[sel] : null;
          var isMob = estaNoModoMobile();
          var elim = (isMob && cfgM && cfgM.eliminado) || (!isMob && cfg && cfg.eliminado);
          if (!elim) todosEliminados = false;
        });
        box.classList.toggle('ed-container-eliminado', todosEliminados);
      }
    });

    // 7. Restaura inversão de layout dos cards/blocos
    if (estado.cards) {
      for (var cId in estado.cards) {
        var cData = estado.cards[cId];
        if (!cData) continue;
        var cEls = document.querySelectorAll('[data-ed-card="' + cId + '"]');
        if (cEls.length === 0) {
          if (cId === 'intro-card') cEls = document.querySelectorAll('.intro-card');
          else if (cId === 'experience-layout') cEls = document.querySelectorAll('.experience-layout');
          else {
            var elByHash = document.getElementById(cId);
            if (elByHash) cEls = [elByHash];
          }
        }

        cEls.forEach(function (cEl) {
          if (cEl) {
            cEl.classList.toggle('ed-layout-invertido', !!cData.invertido);
          }
        });
      }
    }
    if (typeof configurarAcoesCardsEBlocos === 'function' && isEditor) {
      configurarAcoesCardsEBlocos();
    }
  }

  function aplicarOrdemSeccoesDOM(ordem) {
    if (!Array.isArray(ordem) || !ordem.length) return;
    var footer = document.querySelector('footer');
    var parent = (footer && footer.parentNode) || document.body;
    ordem.forEach(function (secId) {
      var elSec = document.getElementById(secId);
      if (elSec && elSec.parentNode === parent) {
        if (footer) {
          parent.insertBefore(elSec, footer);
        } else {
          parent.appendChild(elSec);
        }
      }
    });
  }

  function obterOrdemAtualSeccoes() {
    if (estado.ordemSeccoes && estado.ordemSeccoes.length) {
      // Retorna ordem atual preservando apenas as secções válidas existentes no DOM
      var filtrada = estado.ordemSeccoes.filter(function (id) {
        return (typeof ehSeccaoValida === 'function' ? ehSeccaoValida(id) : true) && document.getElementById(id);
      });
      if (filtrada.length) return filtrada;
    }
    // Determina a ordem inicial a partir do DOM
    var ids = [];
    var todas = document.querySelectorAll('section[id]');
    todas.forEach(function (sec) {
      var valida = typeof ehSeccaoValida === 'function'
        ? ehSeccaoValida(sec.id)
        : SECCOES_LISTA.some(function (item) { return item.id === sec.id; });
      if (valida && ids.indexOf(sec.id) === -1) {
        ids.push(sec.id);
      }
    });
    // Adiciona quaisquer faltantes de SECCOES_LISTA
    SECCOES_LISTA.forEach(function (item) {
      if (ids.indexOf(item.id) === -1 && document.getElementById(item.id)) {
        ids.push(item.id);
      }
    });
    // Adiciona quaisquer faltantes de seccoesDuplicadas
    if (estado.seccoesDuplicadas && Array.isArray(estado.seccoesDuplicadas)) {
      estado.seccoesDuplicadas.forEach(function (dup) {
        if (ids.indexOf(dup.id) === -1 && document.getElementById(dup.id)) {
          ids.push(dup.id);
        }
      });
    }
    return ids;
  }

  function moverSeccao(secId, direcao) {
    var ordem = obterOrdemAtualSeccoes();
    var idx = ordem.indexOf(secId);
    if (idx === -1) return;

    var novoIdx = direcao === 'cima' ? idx - 1 : idx + 1;
    if (novoIdx < 0 || novoIdx >= ordem.length) return;

    // Troca na array
    var temp = ordem[idx];
    ordem[idx] = ordem[novoIdx];
    ordem[novoIdx] = temp;

    estado.ordemSeccoes = ordem;
    aplicarOrdemSeccoesDOM(ordem);
    guardarEstado(true);

    atualizarModalOrdemSecLista();
    atualizarBotoesPillSeccoes();

    var secEl = document.getElementById(secId);
    if (secEl) {
      secEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    mostrarToast('✓ Secção movida para ' + (direcao === 'cima' ? 'cima' : 'baixo') + ' com sucesso!');
  }

  function buscarElementoFoto(chave) {
    if (chave === 'hero') return document.querySelector('.hero');
    if (chave === 'sobre') return document.querySelector('.intro-foto img');
    if (chave === 'evento-aniversario') return document.querySelector('.event-card[data-tipo="Aniversário"] img');
    if (chave === 'evento-noivado') return document.querySelector('.event-card[data-tipo="Noivado"] img');
    if (chave === 'evento-casamento') return document.querySelector('.event-card[data-tipo="Casamento"] img');
    if (chave === 'evento-outro') return document.querySelector('.event-card[data-tipo="Outro"] img');
    if (chave === 'port-1') return document.querySelector('.gallery-item.large img');
    if (chave === 'port-2') return document.querySelectorAll('.gallery-item img')[1];
    if (chave === 'port-3') return document.querySelectorAll('.gallery-item img')[2];
    if (chave === 'port-4') return document.querySelectorAll('.gallery-item img')[3];
    if (chave === 'port-5') return document.querySelectorAll('.gallery-item img')[4];
    if (chave === 'experiencia') return document.querySelector('.experience-image img');
    if (chave === 'cta') return document.querySelector('.cta');
    return document.querySelector(chave);
  }

  function buscarElementosCards(chave) {
    if (chave.indexOf('evento-') === 0 || chave === 'eventos-todos') {
      if (chave === 'eventos-todos') return Array.from(document.querySelectorAll('.event-card'));
      var tipo = chave.replace('evento-', '');
      var elCard = document.querySelector('.event-card[data-tipo*="' + tipo + '" i]');
      return elCard ? [elCard] : Array.from(document.querySelectorAll('.event-card'));
    }
    if (chave.indexOf('port-') === 0 || chave === 'galeria-todas') {
      if (chave === 'galeria-todas') return Array.from(document.querySelectorAll('.gallery-item'));
      if (chave === 'port-1') return [document.querySelector('.gallery-item.large')].filter(Boolean);
      var idx = parseInt(chave.replace('port-', ''), 10) - 1;
      var itens = document.querySelectorAll('.gallery-item');
      return itens[idx] ? [itens[idx]] : [];
    }
    if (chave === 'experiencia') {
      var exp = document.querySelector('.experience-image');
      return exp ? [exp] : [];
    }
    return [];
  }

  /* ============================================================
     2. MODO ESPELHO WYSIWYG
     ============================================================ */

  var textoAtivoEl = null;
  var textoAtivoSeletor = null;
  var fotoAtivaItem = null;
  var fotoAtivaEl = null;

  function inicializarModoEditor() {
    document.body.classList.add('modo-edicao');

    criarBarraSuperior();
    criarBalaoFormatacaoTexto();
    criarModalProfissionalFoto();
    criarModalOrdemSeccoes();
    criarModalTamanhoSeccoes();
    criarModalTemplates();
    criarModalAddTexto();
    injetarSecoesControles();
    configurarEdicaoTextosDireta();
    configurarEdicaoFotosDireta();
    configurarAcoesCardsEBlocos();
    configurarAtalhosTeclado();
    configurarComunicacao();
  }

  /* ---------------- BARRA SUPERIOR ---------------- */
  var modoInspecaoOcultos = false;

  function criarBarraSuperior() {
    var barra = document.createElement('div');
    barra.id = 'barraEditor';
    barra.innerHTML = [
      '<div class="ed-marca">',
      '  <span class="ed-logo-txt">Elly <span>Editor</span></span>',
      '  <span class="ed-badge-status" id="edBadgeStatusDisp">' + (estaNoModoMobile() ? '📱 Celular' : '🖥️ PC') + '</span>',
      '</div>',
      '<div class="ed-grupo-dispositivo" title="Alternar modo de edição">' +
      '  <button type="button" class="ed-btn-disp-editor ' + (!estaNoModoMobile() ? 'ativo' : '') + '" id="edBtnDispPC" title="Editar para Computador">🖥️ PC</button>' +
      '  <button type="button" class="ed-btn-disp-editor ' + (estaNoModoMobile() ? 'ativo' : '') + '" id="edBtnDispMobile" title="Editar para Celular">📱 Celular</button>' +
      '  <button type="button" class="ed-btn-disp-editor" id="edBtnDispAuto" title="Detetar automaticamente pelo ecrã">Auto</button>' +
      '</div>',
      '<div class="ed-acoes-topo">',
      '  <button type="button" class="ed-btn-topo" id="edBtnAddTextoTop" title="Criar e adicionar uma nova caixa de texto">➕ Adicionar Texto</button>',
      '  <button type="button" class="ed-btn-topo" id="edBtnTemplates" title="Gerir até 4 templates salvos da Landing Page">🎨 Templates (4)</button>',
      '  <button type="button" class="ed-btn-topo" id="edBtnRestaurarTextos" title="Ver e restaurar textos ou secções eliminadas">↩ Textos Ocultos</button>',
      '  <button type="button" class="ed-btn-topo" id="edBtnMoverSec" title="Mover e organizar a ordem das secções">📑 Secções</button>',
      '  <button type="button" class="ed-btn-topo" id="edBtnCliente" title="Alternar visão limpa sem contornos">👁️ Modo Cliente</button>',
      '  <button type="button" class="ed-btn-topo" id="edBtnReporTudo" title="Restaurar padrão original de fábrica">↺ Repor Fábrica</button>',
      '  <button type="button" class="ed-btn-topo salvar" id="edBtnGuardarTudo" title="Gravar e publicar alterações">💾 Guardar Alterações</button>',
      '</div>'
    ].join('');
    document.body.appendChild(barra);

    document.getElementById('edBtnAddTextoTop').addEventListener('click', function () {
      abrirModalAddTexto();
    });

    document.getElementById('edBtnTemplates').addEventListener('click', function () {
      abrirModalTemplates();
    });

    // Alternador de dispositivo PC / Celular / Auto
    document.getElementById('edBtnDispPC').addEventListener('click', function () {
      modoDispositivoManual = 'pc';
      atualizarEstadoDispositivoUI();
      mostrarToast('🖥️ Modo Computador ativo. Edições afetam ecrãs normais.');
    });
    document.getElementById('edBtnDispMobile').addEventListener('click', function () {
      modoDispositivoManual = 'mobile';
      atualizarEstadoDispositivoUI();
      mostrarToast('📱 Modo Celular ativo. Edições afetam apenas telemóveis.');
    });
    document.getElementById('edBtnDispAuto').addEventListener('click', function () {
      modoDispositivoManual = null;
      atualizarEstadoDispositivoUI();
      mostrarToast('Ecrã detetado: ' + window.innerWidth + 'px (' + (estaNoModoMobile() ? '📱 Celular' : '🖥️ PC') + ').');
    });

    window.addEventListener('resize', function () {
      if (modoDispositivoManual === null) {
        atualizarEstadoDispositivoUI();
      }
    });

    document.getElementById('edBtnRestaurarTextos').addEventListener('click', function () {
      alternarModoInspecaoOcultos();
    });

    document.getElementById('edBtnMoverSec').addEventListener('click', function () {
      abrirModalOrdemSec();
    });

    document.getElementById('edBtnCliente').addEventListener('click', function () {
      var ativo = document.body.classList.toggle('ed-preview-mode');
      this.classList.toggle('ativo', ativo);
      this.textContent = ativo ? '✏️ Modo Edição' : '👁️ Modo Cliente';
      fecharBalaoTexto();
      fecharModalFoto();
      fecharModalTamanhoSec();
      mostrarToast(ativo ? 'Modo de visualização limpo ativado.' : 'Modo de edição ativado.');
    });

    document.getElementById('edBtnReporTudo').addEventListener('click', function () {
      if (!confirm('Deseja repor todos os textos, fontes, fotos, tamanhos e ordem das secções para o padrão original de fábrica?')) return;
      localStorage.removeItem(CHAVE_LOCAL);
      estado = { textos: {}, fotos: {}, seccoes: {}, cards: {}, ordemSeccoes: [], seccoesDuplicadas: [], mobile: { textos: {}, seccoes: {}, cards: {} } };
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ tipo: 'landing_reset' }, '*');
      }
      location.reload();
    });

    document.getElementById('edBtnGuardarTudo').addEventListener('click', function () {
      salvarNoServidor();
    });
  }

  function atualizarEstadoDispositivoUI() {
    var isMob = estaNoModoMobile();
    var btnPC = document.getElementById('edBtnDispPC');
    var btnMob = document.getElementById('edBtnDispMobile');
    var btnAuto = document.getElementById('edBtnDispAuto');
    var badge = document.getElementById('edBadgeStatusDisp');

    if (btnPC) btnPC.classList.toggle('ativo', modoDispositivoManual === 'pc');
    if (btnMob) btnMob.classList.toggle('ativo', modoDispositivoManual === 'mobile');
    if (btnAuto) btnAuto.classList.toggle('ativo', modoDispositivoManual === null);
    if (badge) badge.textContent = isMob ? '📱 Celular' : '🖥️ PC';

    document.body.classList.toggle('ed-visao-mobile', isMob);

    var badgeBalao = document.getElementById('edBadgeModoBalao');
    if (badgeBalao) badgeBalao.textContent = isMob ? '📱 Celular' : '🖥️ PC';

    // Avisa o painel pai se estiver num iframe
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ tipo: 'trocar_dispositivo', modo: isMob ? 'mobile' : 'pc' }, '*');
    }

    aplicarEstilosDinamicos();
    if (textoAtivoEl) posicionarBalao(textoAtivoEl);
  }

  function ativarVisaoDispositivo(disp) {
    modoDispositivoManual = disp === 'mobile' ? 'mobile' : 'pc';
    atualizarEstadoDispositivoUI();
    fecharBalaoTexto();
    fecharModalFoto();
    fecharModalTamanhoSec();
  }

  function alternarModoInspecaoOcultos() {
    modoInspecaoOcultos = !modoInspecaoOcultos;
    var btn = document.getElementById('edBtnRestaurarTextos');
    if (btn) btn.classList.toggle('ativo', modoInspecaoOcultos);

    document.querySelectorAll('.ed-btn-restaurar-inline').forEach(function (b) { b.remove(); });
    document.querySelectorAll('.ed-elemento-eliminado-visivel').forEach(function (el) {
      el.classList.remove('ed-elemento-eliminado-visivel');
    });

    if (!modoInspecaoOcultos) {
      aplicarEstilosDinamicos();
      mostrarToast('Modo de inspeção fechado.');
      return;
    }

    var achados = 0;
    // Percorre textos eliminados no desktop ou celular
    var mapaEliminados = {};
    if (estado.textos) {
      for (var s in estado.textos) {
        if (estado.textos[s] && estado.textos[s].eliminado) mapaEliminados[s] = 'desktop';
      }
    }
    if (estado.mobile && estado.mobile.textos) {
      for (var sM in estado.mobile.textos) {
        if (estado.mobile.textos[sM] && estado.mobile.textos[sM].eliminado) {
          mapaEliminados[sM] = mapaEliminados[sM] ? 'ambos' : 'mobile';
        }
      }
    }

    for (var sel in mapaEliminados) {
      var elem = document.querySelector(sel);
      if (elem) {
        achados++;
        elem.classList.add('ed-elemento-eliminado-visivel');
        var btnRest = document.createElement('button');
        btnRest.type = 'button';
        btnRest.className = 'ed-btn-restaurar-inline';
        btnRest.textContent = '↩ Restaurar (' + mapaEliminados[sel] + ')';
        (function (targetEl, targetSel) {
          btnRest.addEventListener('click', function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            if (estado.textos && estado.textos[targetSel]) delete estado.textos[targetSel].eliminado;
            if (estado.mobile && estado.mobile.textos && estado.mobile.textos[targetSel]) delete estado.mobile.textos[targetSel].eliminado;
            targetEl.classList.remove('ed-elemento-eliminado-visivel');
            btnRest.remove();
            aplicarEstilosDinamicos();
            guardarEstado();
            mostrarToast('✓ Texto restaurado com sucesso!');
          });
        })(elem, sel);
        elem.appendChild(btnRest);
      }
    }

    if (achados === 0) {
      mostrarToast('Nenhum texto eliminado encontrado.');
      modoInspecaoOcultos = false;
      if (btn) btn.classList.remove('ativo');
    } else {
      mostrarToast('Mostrando ' + achados + ' elemento(s) oculto(s). Clique em "↩ Restaurar" para reativar.');
    }
  }

  function salvarNoServidor() {
    var agora = new Date();
    var dataHora = agora.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    var sugestao = 'Versão ' + dataHora;

    var nomeTemplate = prompt('Dê um nome para este template / versão ao guardar:', sugestao);
    if (nomeTemplate === null) {
      mostrarToast('Gravação cancelada.');
      return Promise.resolve();
    }
    nomeTemplate = nomeTemplate.trim() || sugestao;

    guardarEstado(true);
    var btn = document.getElementById('edBtnGuardarTudo');
    if (btn) {
      btn.textContent = 'A guardar…';
      btn.disabled = true;
    }

    var token = null;
    try {
      var s = JSON.parse(localStorage.getItem('elly_sessao') || '{}');
      token = s.token;
    } catch (e) {}

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    return fetch('/api/landing', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ estado: estado })
    })
      .then(function (r) {
        if (!r.ok) {
          return fetch('/api/landing-salvar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: estado })
          });
        }
        return r;
      })
      .then(function () {
        var params = new URLSearchParams(window.location.search);
        var tplId = params.get('templateId');
        if (tplId) {
          // Atualiza o template em edição
          return fetch('/api/pub/templates-landing/' + encodeURIComponent(tplId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nome: nomeTemplate,
              estado: estado
            })
          }).catch(function (e) {
            console.warn('Erro ao atualizar template existente:', e);
          });
        }
        // Cria ou atualiza template no servidor
        return fetch('/api/pub/templates-landing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: nomeTemplate,
            estado: estado,
            ativarImediatamente: true
          })
        }).catch(function (e) {
          console.warn('Erro ao guardar template:', e);
        });
      })
      .then(function () {
        mostrarToast('✨ Template “' + nomeTemplate + '” criado e alterações guardadas!');
        if (canalSync) {
          try { canalSync.postMessage({ tipo: 'landing_atualizada', estado: estado }); } catch (e) {}
        }
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ tipo: 'guardado_sucesso', estado: estado, data: dataHora }, '*');
        }
        if (typeof carregarTemplatesNoEditor === 'function') {
          carregarTemplatesNoEditor();
        }
      })
      .catch(function (e) {
        mostrarToast('Alterações guardadas no navegador como “' + nomeTemplate + '”.');
        console.warn('Erro ao guardar no servidor:', e);
      })
      .then(function () {
        if (btn) {
          btn.textContent = '💾 Guardar Alterações';
          btn.disabled = false;
        }
      });
  }

  window.__salvarLandingDireto = salvarNoServidor;
  window.__obterEstadoLanding = function () {
    if (typeof atualizarHtmlSeccoesDuplicadasNoEstado === 'function') {
      atualizarHtmlSeccoesDuplicadasNoEstado();
    }
    return estado;
  };

  /* ---------------- BALÃO DE FORMATAÇÃO DE TEXTO ---------------- */
  function criarBalaoFormatacaoTexto() {
    var balao = document.createElement('div');
    balao.id = 'edBalaoTexto';
    balao.hidden = true;
    balao.innerHTML = [
      '<div class="ed-balao-grupo">',
      '  <span class="ed-badge-modo-balao" id="edBadgeModoBalao">📱 Celular</span>',
      '</div>',
      '<div class="ed-balao-grupo">',
      '  <button type="button" class="ed-btn-eliminar-txt" id="edBtnEliminarTxt" title="Eliminar / Ocultar este texto">🗑️ Eliminar</button>',
      '</div>',
      '<div class="ed-balao-grupo">',
      '  <button type="button" class="ed-btn-tamanho-step" id="edBtnFonteMenor" title="Reduzir tamanho do texto (A-)">A-</button>',
      '  <button type="button" class="ed-btn-tamanho-step" id="edBtnFonteMaior" title="Aumentar tamanho do texto (A+)">A+</button>',
      '  <div class="ed-slider-txt-wrap">',
      '    <input type="range" id="edRangeTamTexto" min="10" max="90" step="1" value="16" title="Ajustar tamanho da fonte">',
      '    <span class="ed-badge-txt-tam" id="edBadgeTamTxt">16px</span>',
      '  </div>',
      '</div>',
      '<div class="ed-balao-grupo">',
      '  <button type="button" class="ed-btn-pos-txt" id="edBtnSubirTxt" title="Levar texto para cima (diminuir margem superior)">⬆️ Subir</button>',
      '  <button type="button" class="ed-btn-pos-txt" id="edBtnDescerTxt" title="Trazer texto para baixo (aumentar margem superior)">⬇️ Descer</button>',
      '  <div class="ed-slider-pos-wrap">',
      '    <input type="range" id="edRangePosTexto" min="-30" max="60" step="2" value="0" title="Ajustar posição vertical / afastamento">',
      '    <span class="ed-badge-pos-txt" id="edBadgePosTxt">0px</span>',
      '  </div>',
      '</div>',
      '<div class="ed-balao-grupo">',
      '  <select class="ed-select-fonte" id="edFonteSelect" title="Tipo de letra">',
      '    <option value="">Fonte Padrão</option>',
      '    <option value="\'Playfair Display\', serif">Playfair Display (Elegante)</option>',
      '    <option value="\'DM Sans\', sans-serif">DM Sans (Moderna)</option>',
      '    <option value="\'Lora\', serif">Lora (Editorial)</option>',
      '    <option value="\'Cormorant Garamond\', serif">Cormorant (Clássica)</option>',
      '    <option value="\'Montserrat\', sans-serif">Montserrat (Geométrica)</option>',
      '    <option value="\'Cinzel\', serif">Cinzel (Luxo)</option>',
      '  </select>',
      '</div>',
      '<div class="ed-balao-grupo">',
      '  <button type="button" class="ed-bal-btn" id="edBtnBold" title="Negrito"><b>B</b></button>',
      '  <button type="button" class="ed-bal-btn" id="edBtnItalic" title="Itálico"><i>I</i></button>',
      '  <button type="button" class="ed-bal-btn" id="edBtnUnderline" title="Sublinhado"><u>U</u></button>',
      '</div>',
      '<div class="ed-balao-grupo">',
      '  <div class="ed-cor-amostra" data-cor="#c8a45d" style="background:#c8a45d" title="Dourado"></div>',
      '  <div class="ed-cor-amostra" data-cor="#ffffff" style="background:#ffffff" title="Branco"></div>',
      '  <div class="ed-cor-amostra" data-cor="#111111" style="background:#111111" title="Preto"></div>',
      '  <div class="ed-cor-amostra" data-cor="#e1c88c" style="background:#e1c88c" title="Dourado Claro"></div>',
      '  <div class="ed-cor-amostra" data-cor="#888888" style="background:#888888" title="Cinza"></div>',
      '</div>',
      '<div class="ed-balao-grupo">',
      '  <button type="button" class="ed-bal-btn" data-align="left" title="Esquerda">⇠</button>',
      '  <button type="button" class="ed-bal-btn" data-align="center" title="Centro">≡</button>',
      '  <button type="button" class="ed-bal-btn" data-align="right" title="Direita">⇢</button>',
      '</div>',
      '<button type="button" class="ed-btn-tamanho-step" id="edBtnResetTxtPadrao" title="Restaurar tamanho e posição padrão deste texto">↺ Padrão</button>',
      '<button type="button" class="ed-bal-btn" id="edBtnFecharBalao" title="Fechar formatação">✕</button>'
    ].join('');
    document.body.appendChild(balao);

    document.getElementById('edBtnEliminarTxt').addEventListener('click', function () {
      eliminarTextoAtivo();
    });

    document.getElementById('edFonteSelect').addEventListener('change', function () {
      if (!textoAtivoEl) return;
      textoAtivoEl.style.fontFamily = this.value;
      guardarTextoAtivo();
    });

    var rangeTam = document.getElementById('edRangeTamTexto');
    var badgeTam = document.getElementById('edBadgeTamTxt');

    rangeTam.addEventListener('input', function () {
      if (!textoAtivoEl) return;
      var px = parseInt(this.value, 10);
      badgeTam.textContent = px + 'px';
      textoAtivoEl.style.fontSize = px + 'px';
      guardarTextoAtivo();
    });

    document.getElementById('edBtnFonteMenor').addEventListener('click', function () {
      ajustarTamanhoTexto(-2);
    });

    document.getElementById('edBtnFonteMaior').addEventListener('click', function () {
      ajustarTamanhoTexto(2);
    });

    var rangePos = document.getElementById('edRangePosTexto');
    var badgePos = document.getElementById('edBadgePosTxt');

    rangePos.addEventListener('input', function () {
      if (!textoAtivoEl) return;
      var val = parseInt(this.value, 10);
      badgePos.textContent = (val > 0 ? '+' : '') + val + 'px';
      textoAtivoEl.style.marginTop = val + 'px';
      guardarTextoAtivo();
    });

    document.getElementById('edBtnSubirTxt').addEventListener('click', function () {
      ajustarPosicaoVerticalTexto(-4);
    });

    document.getElementById('edBtnDescerTxt').addEventListener('click', function () {
      ajustarPosicaoVerticalTexto(4);
    });

    document.getElementById('edBtnResetTxtPadrao').addEventListener('click', function () {
      if (!textoAtivoEl || !textoAtivoSeletor) return;
      var isMob = estaNoModoMobile();
      if (isMob) {
        if (estado.mobile && estado.mobile.textos && estado.mobile.textos[textoAtivoSeletor]) {
          delete estado.mobile.textos[textoAtivoSeletor].fontSize;
          delete estado.mobile.textos[textoAtivoSeletor].marginTop;
          delete estado.mobile.textos[textoAtivoSeletor].textAlign;
        }
      } else {
        if (estado.textos && estado.textos[textoAtivoSeletor]) {
          delete estado.textos[textoAtivoSeletor].fontSize;
          delete estado.textos[textoAtivoSeletor].marginTop;
          delete estado.textos[textoAtivoSeletor].fontFamily;
          delete estado.textos[textoAtivoSeletor].color;
          delete estado.textos[textoAtivoSeletor].textAlign;
        }
      }
      textoAtivoEl.style.removeProperty('font-size');
      textoAtivoEl.style.removeProperty('margin-top');
      textoAtivoEl.style.removeProperty('font-family');
      textoAtivoEl.style.removeProperty('color');
      textoAtivoEl.style.removeProperty('text-align');
      posicionarBalao(textoAtivoEl);
      aplicarEstilosDinamicos();
      guardarEstado();
      mostrarToast('Tamanho e posição restaurados para o padrão.');
    });

    document.getElementById('edBtnBold').addEventListener('click', function () {
      document.execCommand('bold', false, null);
      guardarTextoAtivo();
    });

    document.getElementById('edBtnItalic').addEventListener('click', function () {
      document.execCommand('italic', false, null);
      guardarTextoAtivo();
    });

    document.getElementById('edBtnUnderline').addEventListener('click', function () {
      document.execCommand('underline', false, null);
      guardarTextoAtivo();
    });

    balao.querySelectorAll('.ed-cor-amostra').forEach(function (c) {
      c.addEventListener('click', function () {
        if (!textoAtivoEl) return;
        textoAtivoEl.style.color = this.dataset.cor;
        guardarTextoAtivo();
      });
    });

    balao.querySelectorAll('[data-align]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!textoAtivoEl) return;
        textoAtivoEl.style.textAlign = this.dataset.align;
        guardarTextoAtivo();
      });
    });

    document.getElementById('edBtnFecharBalao').addEventListener('click', fecharBalaoTexto);
  }

  function posicionarBalao(el) {
    var balao = document.getElementById('edBalaoTexto');
    if (!balao || !el) return;

    var rect = el.getBoundingClientRect();
    var topo = rect.top - 64;
    var esq = rect.left + (rect.width / 2) - 240;

    if (topo < 54) topo = rect.bottom + 12;
    if (esq < 12) esq = 12;
    if (esq + 540 > window.innerWidth) esq = Math.max(10, window.innerWidth - 550);

    balao.style.top = topo + 'px';
    balao.style.left = esq + 'px';
    balao.hidden = false;

    var isMob = estaNoModoMobile();
    var badgeModo = document.getElementById('edBadgeModoBalao');
    if (badgeModo) badgeModo.textContent = isMob ? '📱 Celular' : '🖥️ PC';

    var cs = window.getComputedStyle(el);
    var savedMob = (estado.mobile && estado.mobile.textos && estado.mobile.textos[textoAtivoSeletor]) || {};
    var savedDesk = (estado.textos && estado.textos[textoAtivoSeletor]) || {};

    var activeFontSize = isMob ? (savedMob.fontSize || savedDesk.fontSize || cs.fontSize) : (savedDesk.fontSize || cs.fontSize);
    var tamPx = parseInt(activeFontSize, 10) || 16;
    var rangeTam = document.getElementById('edRangeTamTexto');
    var badgeTam = document.getElementById('edBadgeTamTxt');
    if (rangeTam) rangeTam.value = tamPx;
    if (badgeTam) badgeTam.textContent = tamPx + 'px';

    var activeMarginTop = isMob ? (savedMob.marginTop !== undefined ? savedMob.marginTop : savedDesk.marginTop) : savedDesk.marginTop;
    var posPx = activeMarginTop !== undefined ? parseInt(activeMarginTop, 10) || 0 : (parseInt(cs.marginTop, 10) || 0);
    var rangePos = document.getElementById('edRangePosTexto');
    var badgePos = document.getElementById('edBadgePosTxt');
    if (rangePos) rangePos.value = posPx;
    if (badgePos) badgePos.textContent = (posPx > 0 ? '+' : '') + posPx + 'px';

    var selFonte = document.getElementById('edFonteSelect');
    if (selFonte) selFonte.value = el.style.fontFamily || (savedDesk.fontFamily || '');
  }

  function fecharBalaoTexto() {
    var balao = document.getElementById('edBalaoTexto');
    if (balao) balao.hidden = true;
  }

  function guardarTextoAtivo() {
    if (!textoAtivoEl || !textoAtivoSeletor) return;
    if (!estado.textos) estado.textos = {};

    var isMob = estaNoModoMobile();

    // 1. Conteúdo textual innerHTML (comum a desktop e mobile)
    if (!estado.textos[textoAtivoSeletor]) estado.textos[textoAtivoSeletor] = {};
    estado.textos[textoAtivoSeletor].html = textoAtivoEl.innerHTML;
    if (textoAtivoEl.style.fontFamily) estado.textos[textoAtivoSeletor].fontFamily = textoAtivoEl.style.fontFamily;
    if (textoAtivoEl.style.color) estado.textos[textoAtivoSeletor].color = textoAtivoEl.style.color;

    // 2. Tamanho e espaçamento por dispositivo
    if (isMob) {
      if (!estado.mobile) estado.mobile = { textos: {}, seccoes: {}, cards: {} };
      if (!estado.mobile.textos) estado.mobile.textos = {};
      if (!estado.mobile.textos[textoAtivoSeletor]) estado.mobile.textos[textoAtivoSeletor] = {};
      if (textoAtivoEl.style.fontSize) estado.mobile.textos[textoAtivoSeletor].fontSize = textoAtivoEl.style.fontSize;
      if (textoAtivoEl.style.marginTop) estado.mobile.textos[textoAtivoSeletor].marginTop = textoAtivoEl.style.marginTop;
      if (textoAtivoEl.style.textAlign) estado.mobile.textos[textoAtivoSeletor].textAlign = textoAtivoEl.style.textAlign;
    } else {
      if (textoAtivoEl.style.fontSize) estado.textos[textoAtivoSeletor].fontSize = textoAtivoEl.style.fontSize;
      if (textoAtivoEl.style.marginTop) estado.textos[textoAtivoSeletor].marginTop = textoAtivoEl.style.marginTop;
      if (textoAtivoEl.style.textAlign) estado.textos[textoAtivoSeletor].textAlign = textoAtivoEl.style.textAlign;
    }

    aplicarEstilosDinamicos();
    guardarEstado();
  }

  function eliminarTextoAtivo() {
    if (!textoAtivoEl || !textoAtivoSeletor) return;
    var isMob = estaNoModoMobile();

    if (isMob) {
      if (!estado.mobile) estado.mobile = { textos: {}, seccoes: {}, cards: {} };
      if (!estado.mobile.textos) estado.mobile.textos = {};
      if (!estado.mobile.textos[textoAtivoSeletor]) estado.mobile.textos[textoAtivoSeletor] = {};
      estado.mobile.textos[textoAtivoSeletor].eliminado = true;
    } else {
      if (!estado.textos) estado.textos = {};
      if (!estado.textos[textoAtivoSeletor]) estado.textos[textoAtivoSeletor] = {};
      estado.textos[textoAtivoSeletor].eliminado = true;
    }

    textoAtivoEl.style.display = 'none';
    fecharBalaoTexto();
    aplicarEstilosDinamicos();
    guardarEstado();
    mostrarToast('🗑️ Texto eliminado' + (isMob ? ' (apenas no Celular)' : ' (no PC)') + '. Pode restaurar em "Textos Ocultos".');
  }

  function obterTextoAtivoValido() {
    if (textoAtivoEl && document.body.contains(textoAtivoEl)) return textoAtivoEl;
    var sel = document.activeElement;
    if (sel && sel.classList && (sel.classList.contains('ed-editavel') || sel.hasAttribute('data-ed-txt'))) {
      textoAtivoEl = sel;
      var txtId = sel.getAttribute('data-ed-txt');
      textoAtivoSeletor = sel.id ? '#' + sel.id : ('[data-ed-txt="' + txtId + '"]');
      return textoAtivoEl;
    }
    return null;
  }

  function ajustarPosicaoVerticalTexto(deltaPx) {
    var el = obterTextoAtivoValido();
    if (!el) return;
    var cs = window.getComputedStyle(el);
    var atual = parseInt(el.style.marginTop || cs.marginTop, 10) || 0;
    var novo = atual + deltaPx;
    el.style.marginTop = novo + 'px';

    var range = document.getElementById('edRangePosTexto');
    var badge = document.getElementById('edBadgePosTxt');
    if (range) range.value = novo;
    if (badge) badge.textContent = (novo > 0 ? '+' : '') + novo + 'px';

    guardarTextoAtivo();
    mostrarToast(deltaPx < 0 ? '⬆️ Texto subiu ' + Math.abs(deltaPx) + 'px' : '⬇️ Texto desceu ' + deltaPx + 'px');
  }

  function ajustarTamanhoTexto(deltaPx) {
    var el = obterTextoAtivoValido();
    if (!el) return;
    var cs = window.getComputedStyle(el);
    var atual = parseInt(el.style.fontSize || cs.fontSize, 10) || 16;
    var novo = Math.max(10, Math.min(120, atual + deltaPx));
    el.style.fontSize = novo + 'px';

    var range = document.getElementById('edRangeTamTexto');
    var badge = document.getElementById('edBadgeTamTxt');
    if (range) range.value = novo;
    if (badge) badge.textContent = novo + 'px';

    guardarTextoAtivo();
    mostrarToast(deltaPx > 0 ? 'Tamanho aumentado para ' + novo + 'px' : 'Tamanho reduzido para ' + novo + 'px');
  }

  function configurarEdicaoTextosDireta() {
    identificarElementosTexto();

    var elementos = document.querySelectorAll(seletoresTextoGlobais.join(', '));
    elementos.forEach(function (el, index) {
      el.classList.add('ed-editavel');
      if (!el.getAttribute('data-ed-txt')) {
        el.setAttribute('data-ed-txt', 't' + index);
      }
    });

    document.addEventListener('click', function (e) {
      var targetTxt = e.target.closest('.ed-editavel') || e.target.closest('[data-ed-txt]');
      if (targetTxt) {
        if (document.body.classList.contains('ed-preview-mode')) return;
        if (targetTxt.tagName === 'A') e.preventDefault();

        textoAtivoEl = targetTxt;
        var txtId = targetTxt.getAttribute('data-ed-txt');
        textoAtivoSeletor = targetTxt.id ? '#' + targetTxt.id : ('[data-ed-txt="' + txtId + '"]');

        targetTxt.contentEditable = 'true';
        targetTxt.focus();
        posicionarBalao(targetTxt);
        return;
      }

      if (e.target.closest('#edBalaoTexto') || e.target.closest('#barraEditor') || e.target.closest('.ed-modal-dialog')) return;
      fecharBalaoTexto();
      if (textoAtivoEl) {
        textoAtivoEl.contentEditable = 'false';
      }
    });

    document.addEventListener('input', function (e) {
      var targetTxt = e.target.closest('.ed-editavel') || e.target.closest('[data-ed-txt]');
      if (targetTxt) {
        textoAtivoEl = targetTxt;
        guardarTextoAtivo();
      }
    });
  }

  /* ============================================================
     3. MODAL PROFISSIONAL DE FOTOGRAFIA & CARDS
     ============================================================ */

  var PRESETS_FOTOS = [
    { nome: 'Hero Principal', url: 'assets/img/hero.jpg' },
    { nome: 'Foto 01', url: 'assets/img/foto-01.jpg' },
    { nome: 'Foto 02', url: 'assets/img/foto-02.jpg' },
    { nome: 'Foto 03', url: 'assets/img/foto-03.jpg' },
    { nome: 'Foto 04', url: 'assets/img/foto-04.jpg' },
    { nome: 'Foto 05', url: 'assets/img/foto-05.jpg' },
    { nome: 'Foto 06', url: 'assets/img/foto-06.jpg' },
    { nome: 'Foto 07', url: 'assets/img/foto-07.jpg' },
    { nome: 'Foto 08', url: 'assets/img/foto-08.jpg' },
    { nome: 'Portfólio W1', url: 'assets/img/w1.jpg' },
    { nome: 'Portfólio W2', url: 'assets/img/w2.jpg' },
    { nome: 'Portfólio W3', url: 'assets/img/w3-nova.jpg' }
  ];

  function criarModalProfissionalFoto() {
    var backdrop = document.createElement('div');
    backdrop.id = 'edModalBackdrop';
    backdrop.className = 'ed-modal-backdrop';
    backdrop.hidden = true;
    document.body.appendChild(backdrop);

    var modal = document.createElement('div');
    modal.id = 'edModalFoto';
    modal.className = 'ed-modal-dialog';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    var thumbsHtml = PRESETS_FOTOS.map(function (p) {
      return '<img src="' + p.url + '" class="ed-preset-thumb" data-preset="' + p.url + '" title="' + p.nome + '" alt="' + p.nome + '">';
    }).join('');

    modal.innerHTML = [
      '<div class="ed-modal-topo">',
      '  <div class="ed-modal-topo-info">',
      '    <h3 id="edModalFotoTitulo">Editar Fotografia & Card</h3>',
      '    <p id="edModalFotoSub">Substitua a foto, enquadre ou reduza o tamanho do card</p>',
      '  </div>',
      '  <button type="button" class="ed-btn-fechar" id="edBtnFecharModal" title="Fechar (Esc)">✕</button>',
      '</div>',

      '<div class="ed-foto-preview-caixa">',
      '  <img id="edModalPrevImg" alt="Pré-visualização da fotografia">',
      '  <div class="ed-preview-overlay-info" id="edModalPrevDim">Pré-visualização</div>',
      '</div>',

      '<input type="file" id="edInputFicheiroReal" accept="image/png, image/jpeg, image/jpg, image/webp" style="display:none !important;">',
      '<button type="button" class="ed-btn-upload-principal" id="edBtnAbrirExplorador">',
      '  <span class="ed-upload-icon">📁</span>',
      '  <div class="ed-upload-text">',
      '    <strong>Escolher foto do computador</strong>',
      '    <span>Clique para abrir os seus ficheiros (JPG, PNG, WebP)</span>',
      '  </div>',
      '</button>',

      '<div class="ed-drop-zone" id="edModalDropZone">',
      '  <span>Ou arraste uma foto para aqui</span>',
      '</div>',

      '<div class="ed-presets-bloco">',
      '  <span class="ed-presets-titulo">Ou escolha uma foto existente da galeria:</span>',
      '  <div class="ed-presets-grade">' + thumbsHtml + '</div>',
      '</div>',

      '<!-- Controles de Proporção e Tamanho do Card -->',
      '<div class="ed-card-tamanho-bloco" id="edBlocoTamanhoCard">',
      '  <div class="ed-card-tamanho-titulo">',
      '    <span>📏 Proporção & Tamanho do Card</span>',
      '    <small style="font-weight:normal;color:#999;">Reduzir ou ajustar altura</small>',
      '  </div>',
      '  <div class="ed-presets-grade-cards">',
      '    <button type="button" class="ed-btn-preset-card" data-ratio="4 / 5">Compacto (4:5)</button>',
      '    <button type="button" class="ed-btn-preset-card" data-ratio="3 / 4">Foto (3:4)</button>',
      '    <button type="button" class="ed-btn-preset-card" data-ratio="2 / 3">Alongado (2:3)</button>',
      '    <button type="button" class="ed-btn-preset-card" data-ratio="1 / 1">Quadrado (1:1)</button>',
      '    <button type="button" class="ed-btn-preset-card" data-ratio="16 / 9">Largo (16:9)</button>',
      '  </div>',
      '  <label class="ed-checkbox-linha">',
      '    <input type="checkbox" id="edCheckTodosCards" checked>',
      '    <span>Aplicar esta proporção a todos os cards semelhantes</span>',
      '  </label>',
      '</div>',

      '<div class="ed-sliders-caixa">',
      '  <div class="ed-slider-linha">',
      '    <label><span>Redimensionar / Zoom</span><b id="edTxtValZoom">1.00x</b></label>',
      '    <input type="range" id="edRangeZoom" min="1" max="2.5" step="0.05" value="1">',
      '  </div>',
      '  <div class="ed-slider-linha">',
      '    <label><span>Posição Horizontal (Foco X)</span><b id="edTxtValX">50%</b></label>',
      '    <input type="range" id="edRangeX" min="0" max="100" step="1" value="50">',
      '  </div>',
      '  <div class="ed-slider-linha">',
      '    <label><span>Posição Vertical (Foco Y)</span><b id="edTxtValY">50%</b></label>',
      '    <input type="range" id="edRangeY" min="0" max="100" step="1" value="50">',
      '  </div>',
      '  <div class="ed-sliders-acoes">',
      '    <button type="button" class="ed-btn-pequeno" id="edBtnCentrar">↺ Centrar Enquadramento</button>',
      '    <button type="button" class="ed-btn-pequeno" id="edBtnResetFotoOriginal">↺ Foto Original</button>',
      '  </div>',
      '</div>',

      '<div class="ed-modal-rodape">',
      '  <span style="font-size:11.5px;color:#888;">Alterações aplicadas em tempo real</span>',
      '  <div class="ed-rodape-acoes">',
      '    <button type="button" class="ed-btn-cancelar" id="edBtnCancelarModal">Fechar</button>',
      '    <button type="button" class="ed-btn-concluir" id="edBtnConcluirModal">✓ Concluído</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) { e.stopPropagation(); });
    backdrop.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      fecharModalFoto();
    });

    document.getElementById('edBtnFecharModal').addEventListener('click', fecharModalFoto);
    document.getElementById('edBtnCancelarModal').addEventListener('click', fecharModalFoto);
    document.getElementById('edBtnConcluirModal').addEventListener('click', function () {
      fecharModalFoto();
      mostrarToast('✓ Fotografia e card atualizados!');
    });

    // Upload
    var inputFicheiro = document.getElementById('edInputFicheiroReal');
    var btnAbrir = document.getElementById('edBtnAbrirExplorador');
    btnAbrir.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      inputFicheiro.value = '';
      inputFicheiro.click();
    });

    inputFicheiro.addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (file) processarFicheiroImagem(file);
    });

    // Drag and drop
    var dropZone = document.getElementById('edModalDropZone');
    ['dragenter', 'dragover'].forEach(function (tipo) {
      dropZone.addEventListener(tipo, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (tipo) {
      dropZone.addEventListener(tipo, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      });
    });
    dropZone.addEventListener('drop', function (e) {
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && file.type.indexOf('image/') === 0) processarFicheiroImagem(file);
    });

    // Presets
    modal.querySelectorAll('.ed-preset-thumb').forEach(function (thumb) {
      thumb.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        aplicarNovaFotoSrc(this.dataset.preset);
        mostrarToast('Foto selecionada da galeria!');
      });
    });

    // Presets de Proporção de Cards
    modal.querySelectorAll('.ed-btn-preset-card').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        modal.querySelectorAll('.ed-btn-preset-card').forEach(function (b) { b.classList.remove('ativo'); });
        this.classList.add('ativo');

        var ratio = this.dataset.ratio;
        var aplicarTodos = document.getElementById('edCheckTodosCards').checked;

        aplicarProporcaoCard(ratio, aplicarTodos);
        mostrarToast('Proporção do card alterada para ' + ratio);
      });
    });

    // Sliders
    var rangeZoom = document.getElementById('edRangeZoom');
    var rangeX = document.getElementById('edRangeX');
    var rangeY = document.getElementById('edRangeY');
    var prevImg = document.getElementById('edModalPrevImg');

    function sincronizarSliders() {
      if (!fotoAtivaItem || !fotoAtivaEl) return;

      var z = parseFloat(rangeZoom.value);
      var x = rangeX.value + '%';
      var y = rangeY.value + '%';

      document.getElementById('edTxtValZoom').textContent = z.toFixed(2) + 'x';
      document.getElementById('edTxtValX').textContent = x;
      document.getElementById('edTxtValY').textContent = y;

      prevImg.style.transform = 'scale(' + z + ')';
      prevImg.style.objectPosition = x + ' ' + y;
      prevImg.style.transformOrigin = x + ' ' + y;

      fotoAtivaEl.style.setProperty('--fz', String(z));
      fotoAtivaEl.style.setProperty('--fx', x);
      fotoAtivaEl.style.setProperty('--fy', y);

      if (fotoAtivaItem.chave === 'hero') {
        fotoAtivaEl.style.backgroundPosition = x + ' ' + y;
      }

      if (!estado.fotos) estado.fotos = {};
      if (!estado.fotos[fotoAtivaItem.chave]) estado.fotos[fotoAtivaItem.chave] = {};
      estado.fotos[fotoAtivaItem.chave].fz = z;
      estado.fotos[fotoAtivaItem.chave].fx = x;
      estado.fotos[fotoAtivaItem.chave].fy = y;

      guardarEstado();
    }

    rangeZoom.addEventListener('input', sincronizarSliders);
    rangeX.addEventListener('input', sincronizarSliders);
    rangeY.addEventListener('input', sincronizarSliders);

    document.getElementById('edBtnCentrar').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      rangeZoom.value = 1;
      rangeX.value = 50;
      rangeY.value = 50;
      sincronizarSliders();
      mostrarToast('Enquadramento centrado.');
    });

    document.getElementById('edBtnResetFotoOriginal').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!fotoAtivaItem) return;
      if (estado.fotos && estado.fotos[fotoAtivaItem.chave]) {
        delete estado.fotos[fotoAtivaItem.chave];
        guardarEstado(true);
      }
      mostrarToast('Fotografia restaurada para o original!');
      setTimeout(function () { location.reload(); }, 400);
    });
  }

  function aplicarProporcaoCard(ratio, aplicarATodos) {
    if (!fotoAtivaItem) return;
    if (!estado.cards) estado.cards = {};

    var chaveGrupo = fotoAtivaItem.chave.indexOf('evento-') === 0 ? 'eventos-todos' :
                     fotoAtivaItem.chave.indexOf('port-') === 0 ? 'galeria-todas' : fotoAtivaItem.chave;

    var chaveAlvo = aplicarATodos ? chaveGrupo : fotoAtivaItem.chave;
    var alvos = buscarElementosCards(chaveAlvo);

    alvos.forEach(function (cardEl) {
      cardEl.style.setProperty('aspect-ratio', ratio, 'important');
      cardEl.style.setProperty('height', 'auto', 'important');
    });

    estado.cards[chaveAlvo] = { aspectRatio: ratio };
    guardarEstado(true);
  }

  function processarFicheiroImagem(file) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var maxDim = 1920;
        var w = img.width;
        var h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        var dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        aplicarNovaFotoSrc(dataUrl);
        mostrarToast('✓ Fotografia carregada com sucesso do computador!');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function aplicarNovaFotoSrc(novaSrc) {
    if (!fotoAtivaItem || !fotoAtivaEl) return;

    var prevImg = document.getElementById('edModalPrevImg');
    prevImg.src = novaSrc;

    if (fotoAtivaItem.chave === 'hero') {
      var fx = (estado.fotos && estado.fotos['hero'] && estado.fotos['hero'].fx) || '50%';
      var fy = (estado.fotos && estado.fotos['hero'] && estado.fotos['hero'].fy) || '25%';
      fotoAtivaEl.style.backgroundImage = 'linear-gradient(90deg, rgba(0,0,0,.85), rgba(0,0,0,.3)), url("' + novaSrc + '")';
      fotoAtivaEl.style.backgroundPosition = fx + ' ' + fy;
    } else if (fotoAtivaItem.chave === 'cta') {
      fotoAtivaEl.style.backgroundImage = 'url("' + novaSrc + '")';
    } else if (fotoAtivaEl.tagName === 'IMG') {
      fotoAtivaEl.src = novaSrc;
    } else {
      fotoAtivaEl.style.backgroundImage = 'url("' + novaSrc + '")';
    }

    if (!estado.fotos) estado.fotos = {};
    if (!estado.fotos[fotoAtivaItem.chave]) estado.fotos[fotoAtivaItem.chave] = {};
    estado.fotos[fotoAtivaItem.chave].src = novaSrc;

    guardarEstado(true);
  }

  function abrirModalFoto(item) {
    fotoAtivaItem = item;
    fotoAtivaEl = buscarElementoFoto(item.chave);
    if (!fotoAtivaEl) return;

    var backdrop = document.getElementById('edModalBackdrop');
    var modal = document.getElementById('edModalFoto');

    document.getElementById('edModalFotoTitulo').textContent = item.titulo;
    document.getElementById('edModalFotoSub').textContent = 'Edição da secção: ' + item.titulo;

    var dados = (estado.fotos && estado.fotos[item.chave]) || {};
    var src = dados.src;
    if (!src) {
      if (fotoAtivaEl.tagName === 'IMG') {
        src = fotoAtivaEl.src;
      } else {
        var bg = window.getComputedStyle(fotoAtivaEl).backgroundImage;
        src = bg.replace(/url\(['"]?(.*?)['"]?\)/i, '$1');
      }
    }

    var prevImg = document.getElementById('edModalPrevImg');
    prevImg.src = src || '';

    var fz = dados.fz !== undefined ? dados.fz : 1;
    var fx = dados.fx ? parseInt(dados.fx, 10) : 50;
    var fy = dados.fy ? parseInt(dados.fy, 10) : 50;

    var rangeZoom = document.getElementById('edRangeZoom');
    var rangeX = document.getElementById('edRangeX');
    var rangeY = document.getElementById('edRangeY');

    rangeZoom.value = fz;
    rangeX.value = fx;
    rangeY.value = fy;

    document.getElementById('edTxtValZoom').textContent = parseFloat(fz).toFixed(2) + 'x';
    document.getElementById('edTxtValX').textContent = fx + '%';
    document.getElementById('edTxtValY').textContent = fy + '%';

    prevImg.style.transform = 'scale(' + fz + ')';
    prevImg.style.objectPosition = fx + '% ' + fy + '%';
    prevImg.style.transformOrigin = fx + '% ' + fy + '%';

    // Exibe ou oculta bloco de proporção do card
    var blocoCard = document.getElementById('edBlocoTamanhoCard');
    if (blocoCard) {
      var isCard = (item.chave.indexOf('evento-') === 0 || item.chave.indexOf('port-') === 0 || item.chave === 'experiencia');
      blocoCard.hidden = !isCard;
    }

    backdrop.hidden = false;
    modal.hidden = false;
  }

  function fecharModalFoto() {
    var backdrop = document.getElementById('edModalBackdrop');
    var modal = document.getElementById('edModalFoto');
    if (backdrop) backdrop.hidden = true;
    if (modal) modal.hidden = true;
    fotoAtivaItem = null;
    fotoAtivaEl = null;
  }

  function configurarEdicaoFotosDireta() {
    var mapaFotos = [
      { chave: 'hero', seletor: '.hero', titulo: 'Foto de Capa (Hero)' },
      { chave: 'sobre', seletor: '.intro-foto img', titulo: 'Foto Sobre Nós' },
      { chave: 'evento-aniversario', seletor: '.event-card[data-tipo="Aniversário"] img', titulo: 'Evento: Aniversário' },
      { chave: 'evento-noivado', seletor: '.event-card[data-tipo="Noivado"] img', titulo: 'Evento: Noivado' },
      { chave: 'evento-casamento', seletor: '.event-card[data-tipo="Casamento"] img', titulo: 'Evento: Casamento' },
      { chave: 'evento-outro', seletor: '.event-card[data-tipo="Outro"] img', titulo: 'Evento: Outro' },
      { chave: 'port-1', seletor: '.gallery-item.large img', titulo: 'Portfólio: Destaque Principal' },
      { chave: 'port-2', seletor: '.gallery-item:nth-child(2) img', titulo: 'Portfólio: Foto 2' },
      { chave: 'port-3', seletor: '.gallery-item:nth-child(3) img', titulo: 'Portfólio: Foto 3' },
      { chave: 'port-4', seletor: '.gallery-item:nth-child(4) img', titulo: 'Portfólio: Foto 4' },
      { chave: 'port-5', seletor: '.gallery-item:nth-child(5) img', titulo: 'Portfólio: Foto 5' },
      { chave: 'experiencia', seletor: '.experience-image img', titulo: 'Foto de Experiência' },
      { chave: 'cta', seletor: '.cta', titulo: 'Fundo da Chamada Final (CTA)' }
    ];

    mapaFotos.forEach(function (item) {
      var el = document.querySelector(item.seletor);
      if (!el) return;

      if (item.chave === 'hero' || item.chave === 'cta') {
        var badgeHero = document.createElement('div');
        badgeHero.className = 'ed-hero-badge';
        badgeHero.innerHTML = [
          '<button type="button" class="ed-foto-badge-btn" title="Substituir foto de fundo">📷 Trocar Fundo</button>',
          '<button type="button" class="ed-foto-badge-btn enquadrar" title="Escolher direto do computador">📁 Escolher do PC</button>'
        ].join('');

        el.style.position = 'relative';
        el.appendChild(badgeHero);

        badgeHero.querySelector('.ed-foto-badge-btn').addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          abrirModalFoto(item);
        });

        badgeHero.querySelector('.enquadrar').addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          abrirModalFoto(item);
          setTimeout(function () {
            var inp = document.getElementById('edInputFicheiroReal');
            if (inp) { inp.value = ''; inp.click(); }
          }, 60);
        });

        return;
      }

      var container = el.parentElement;
      if (!container || container === document.body || container === document.documentElement) {
        container = el;
      }
      container.classList.add('ed-foto-alvo');

      var badgeWrap = document.createElement('div');
      badgeWrap.className = 'ed-foto-badge-wrap';
      badgeWrap.innerHTML = [
        '<button type="button" class="ed-foto-badge-btn trocar" title="Abrir explorador para escolher foto">📁 Trocar Foto</button>',
        '<button type="button" class="ed-foto-badge-btn enquadrar" title="Ajustar zoom, foco ou tamanho">⚙️ Ajustar & Tamanho</button>'
      ].join('');
      container.appendChild(badgeWrap);

      badgeWrap.querySelector('.trocar').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        abrirModalFoto(item);
        setTimeout(function () {
          var inp = document.getElementById('edInputFicheiroReal');
          if (inp) { inp.value = ''; inp.click(); }
        }, 60);
      });

      badgeWrap.querySelector('.enquadrar').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        abrirModalFoto(item);
      });

      el.addEventListener('click', function (e) {
        if (document.body.classList.contains('ed-preview-mode')) return;
        if (e.target.closest('.ed-editavel')) return;
        e.preventDefault();
        e.stopPropagation();
        abrirModalFoto(item);
      });
    });
  }

  /* ============================================================
     4. GESTÃO, DUPLICAÇÃO, REORDENAÇÃO & TAMANHO DE SECÇÕES
     ============================================================ */

  function obterInfoSeccao(secId) {
    var base = SECCOES_LISTA.find(function (s) { return s.id === secId; });
    if (base) return Object.assign({}, base, { duplicada: false });
    if (estado.seccoesDuplicadas && Array.isArray(estado.seccoesDuplicadas)) {
      var dup = estado.seccoesDuplicadas.find(function (d) { return d.id === secId; });
      if (dup) return Object.assign({}, dup, { duplicada: true });
    }
    return { id: secId, nome: secId, duplicada: false };
  }

  function obterListaTodasSeccoes() {
    var lista = SECCOES_LISTA.map(function (s) { return Object.assign({}, s, { duplicada: false }); });
    if (estado.seccoesDuplicadas && Array.isArray(estado.seccoesDuplicadas)) {
      estado.seccoesDuplicadas.forEach(function (dup) {
        if (!lista.some(function (item) { return item.id === dup.id; })) {
          lista.push(Object.assign({}, dup, { duplicada: true }));
        }
      });
    }
    return lista;
  }

  function ehSeccaoValida(secId) {
    if (SECCOES_LISTA.some(function (s) { return s.id === secId; })) return true;
    if (estado.seccoesDuplicadas && estado.seccoesDuplicadas.some(function (d) { return d.id === secId; })) return true;
    return false;
  }

  // Extrai o HTML limpo da secção, sem os controles do editor (pills, badges, listeners)
  function obterHtmlLimpoSeccao(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll('.ed-seccao-pill, .ed-foto-badge-wrap, .ed-redimensionador-altura, .ed-redimensionador-alca, .ed-card-ctrls').forEach(function (node) {
      node.remove();
    });
    clone.querySelectorAll('.ed-editavel, .ed-foto-alvo, .ed-elemento-eliminado-visivel, .ed-card-alvo, .ed-drag-over, .ed-dragging').forEach(function (node) {
      node.classList.remove('ed-editavel', 'ed-foto-alvo', 'ed-elemento-eliminado-visivel', 'ed-card-alvo', 'ed-drag-over', 'ed-dragging');
    });
    clone.querySelectorAll('[contenteditable]').forEach(function (node) {
      node.removeAttribute('contenteditable');
    });
    clone.querySelectorAll('[data-ed-listener-ativo]').forEach(function (node) {
      node.removeAttribute('data-ed-listener-ativo');
    });
    return clone.innerHTML;
  }

  function atualizarHtmlSeccoesDuplicadasNoEstado() {
    if (!estado.seccoesDuplicadas || !Array.isArray(estado.seccoesDuplicadas)) return;
    estado.seccoesDuplicadas.forEach(function (dup) {
      var secEl = document.getElementById(dup.id);
      if (secEl) {
        dup.innerHTML = obterHtmlLimpoSeccao(secEl);
      }
    });
  }

  function recriarSeccoesDuplicadasNoDOM() {
    var idsValidos = (estado.seccoesDuplicadas || []).map(function (d) { return d.id; });
    document.querySelectorAll('[data-sec-duplicada]').forEach(function (sec) {
      if (idsValidos.indexOf(sec.id) === -1) {
        sec.remove();
      }
    });

    if (!estado.seccoesDuplicadas || !Array.isArray(estado.seccoesDuplicadas)) return;
    estado.seccoesDuplicadas.forEach(function (dup) {
      var existente = document.getElementById(dup.id);
      if (!existente) {
        var novaSec = document.createElement(dup.tagName || 'section');
        novaSec.id = dup.id;
        if (dup.className) novaSec.className = dup.className;
        if (dup.styleAttr) novaSec.setAttribute('style', dup.styleAttr);
        novaSec.innerHTML = dup.innerHTML || '';
        novaSec.setAttribute('data-sec-duplicada', '1');
        novaSec.setAttribute('data-sec-base', dup.baseId || '');

        var footer = document.querySelector('footer');
        if (footer && footer.parentNode) {
          footer.parentNode.insertBefore(novaSec, footer);
        } else {
          document.body.appendChild(novaSec);
        }

        if (isEditor) {
          injetarPillEmSeccao(novaSec, dup);
          configurarEdicaoTextosEmElemento(novaSec);
          configurarEdicaoFotosEmElemento(novaSec, dup.id);
          configurarAcoesCardsEBlocos();
        }
      } else {
        if (dup.className) existente.className = dup.className;
        if (dup.styleAttr) existente.setAttribute('style', dup.styleAttr);
        if (isEditor) {
          configurarEdicaoTextosEmElemento(existente);
          configurarEdicaoFotosEmElemento(existente, dup.id);
          configurarAcoesCardsEBlocos();
        }
      }
    });
  }

  function configurarEdicaoTextosEmElemento(container) {
    if (!isEditor) return;
    var seletores = seletoresTextoGlobais.concat(['[data-ed-txt]']);
    var elementos = container.querySelectorAll(seletores.join(', '));
    elementos.forEach(function (el) {
      if (el.hasAttribute('data-ed-listener-ativo')) return;
      el.setAttribute('data-ed-listener-ativo', '1');
      el.classList.add('ed-editavel');

      var seletorId = el.getAttribute('data-ed-txt') ? '[data-ed-txt="' + el.getAttribute('data-ed-txt') + '"]' : (el.id ? '#' + el.id : '');

      el.addEventListener('click', function (e) {
        if (document.body.classList.contains('ed-preview-mode')) return;
        if (el.tagName === 'A') e.preventDefault();

        textoAtivoEl = el;
        textoAtivoSeletor = seletorId || ('[data-ed-txt="' + el.getAttribute('data-ed-txt') + '"]');

        el.contentEditable = 'true';
        el.focus();
        posicionarBalao(el);
      });

      el.addEventListener('input', function () {
        guardarTextoAtivo();
      });

      el.addEventListener('blur', function () {
        guardarTextoAtivo();
      });
    });
  }

  function configurarEdicaoFotosEmElemento(container, secId) {
    if (!isEditor) return;
    var imgs = container.querySelectorAll('img');
    imgs.forEach(function (img, idx) {
      var fotoChave = '#' + secId + ' img:nth-of-type(' + (idx + 1) + ')';
      img.setAttribute('data-ed-foto-chave', fotoChave);

      var parent = img.parentElement;
      if (parent && !parent.querySelector('.ed-foto-badge-wrap')) {
        parent.classList.add('ed-foto-alvo');
        var badgeWrap = document.createElement('div');
        badgeWrap.className = 'ed-foto-badge-wrap';
        badgeWrap.innerHTML = [
          '<button type="button" class="ed-foto-badge-btn trocar" title="Abrir explorador para escolher foto">📁 Trocar Foto</button>',
          '<button type="button" class="ed-foto-badge-btn enquadrar" title="Ajustar zoom, foco ou tamanho">⚙️ Ajustar & Tamanho</button>'
        ].join('');
        parent.appendChild(badgeWrap);

        var itemFoto = { chave: fotoChave, titulo: 'Foto ' + (idx + 1) + ' (' + secId + ')' };
        badgeWrap.querySelector('.trocar').addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          abrirModalFoto(itemFoto);
          setTimeout(function () {
            var inp = document.getElementById('edInputFicheiroReal');
            if (inp) { inp.value = ''; inp.click(); }
          }, 60);
        });
        badgeWrap.querySelector('.enquadrar').addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          abrirModalFoto(itemFoto);
        });
        img.addEventListener('click', function (e) {
          if (document.body.classList.contains('ed-preview-mode')) return;
          if (e.target.closest('.ed-editavel')) return;
          e.preventDefault(); e.stopPropagation();
          abrirModalFoto(itemFoto);
        });
      }
    });
  }

  function injetarPillEmSeccao(elSec, secInfo) {
    if (!elSec) return;
    var pillVelha = elSec.querySelector(':scope > .ed-seccao-pill');
    if (pillVelha) pillVelha.remove();

    var pill = document.createElement('div');
    pill.className = 'ed-seccao-pill';
    pill.setAttribute('data-sec-pill', secInfo.id);

    var visivel = !estado.seccoes || !estado.seccoes[secInfo.id] || estado.seccoes[secInfo.id].visivel !== false;

    var htmlPill = [
      '<span class="ed-sec-nome">📌 ' + secInfo.nome + (secInfo.duplicada ? ' <span class="ed-sec-badge-duplicada">Cópia</span>' : '') + '</span>',
      '<button type="button" class="ed-btn-sec-acao add-txt" title="Adicionar caixa de texto a esta secção">➕ Texto</button>',
      '<button type="button" class="ed-btn-sec-acao subir" title="Mover secção para cima">▲ Subir</button>',
      '<button type="button" class="ed-btn-sec-acao descer" title="Mover secção para baixo">▼ Descer</button>',
      '<button type="button" class="ed-btn-sec-acao tamanho" title="Ajustar margem superior, margem inferior e altura">📐 Margens & Tamanho</button>',
      '<button type="button" class="ed-btn-sec-acao duplicar" title="Criar uma cópia independente desta secção">👯 Duplicar</button>',
      '<button type="button" class="ed-btn-sec-acao eliminar" title="Eliminar esta secção">🗑️ Eliminar</button>'
    ];

    pill.innerHTML = htmlPill.join('');

    pill.querySelector('.add-txt').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      abrirModalAddTexto(secInfo.id);
    });

    pill.querySelector('.subir').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      moverSeccao(secInfo.id, 'cima');
    });

    pill.querySelector('.descer').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      moverSeccao(secInfo.id, 'baixo');
    });

    pill.querySelector('.tamanho').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      abrirModalTamanhoSec(secInfo.id);
    });

    pill.querySelector('.duplicar').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      duplicarSeccao(secInfo.id);
    });

    var btnElim = pill.querySelector('.eliminar');
    if (btnElim) {
      btnElim.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (secInfo.duplicada) {
          eliminarSeccaoDuplicada(secInfo.id);
        } else {
          eliminarSeccaoPadrao(secInfo.id);
        }
      });
    }

    elSec.appendChild(pill);
  }

  function duplicarSeccao(secId) {
    var elOriginal = document.getElementById(secId);
    if (!elOriginal) {
      mostrarToast('Secção não encontrada para duplicar.');
      return;
    }

    var secInfo = obterInfoSeccao(secId);
    var baseId = secInfo.baseId || secId;
    var baseNome = secInfo.nome.replace(/\s*\(Cópia.*?\)$/, '');

    if (!estado.seccoesDuplicadas) estado.seccoesDuplicadas = [];

    var contagem = estado.seccoesDuplicadas.filter(function (s) {
      return s.baseId === baseId || s.id.indexOf(baseId + '_copia') === 0;
    }).length + 1;

    var novoId = baseId + '_copia_' + Date.now().toString(36);
    var sugestaoNome = baseNome + ' (Cópia ' + contagem + ')';

    var nomeEscolhido = prompt('Nome para a secção duplicada:', sugestaoNome);
    if (nomeEscolhido === null) return; // Utilizador cancelou
    nomeEscolhido = nomeEscolhido.trim() || sugestaoNome;

    // 1. Cria o novo elemento da secção
    var novaSec = document.createElement(elOriginal.tagName.toLowerCase() || 'section');
    novaSec.id = novoId;
    novaSec.className = elOriginal.className.replace(/\bed-seccao-oculta\b/g, '').trim();

    var styleOrig = (elOriginal.getAttribute('style') || '').replace(/\bzoom:\s*[^;]+;?/gi, '').trim();
    if (styleOrig) novaSec.setAttribute('style', styleOrig);

    novaSec.innerHTML = obterHtmlLimpoSeccao(elOriginal);
    novaSec.setAttribute('data-sec-duplicada', '1');
    novaSec.setAttribute('data-sec-base', baseId);

    // 2. Reatribui identificadores data-ed-txt exclusivos a todos os textos da nova secção
    var seletoresTxt = seletoresTextoGlobais.concat(['[data-ed-txt]']);
    var textosInternos = novaSec.querySelectorAll(seletoresTxt.join(', '));
    textosInternos.forEach(function (txtEl, idx) {
      var velhoTxtId = txtEl.getAttribute('data-ed-txt');
      var novoTxtId = 'dup_' + novoId + '_' + idx;
      txtEl.setAttribute('data-ed-txt', novoTxtId);
      txtEl.removeAttribute('id');

      // Copia estilos e conteúdos do texto original se existirem
      var selVelho = velhoTxtId ? '[data-ed-txt="' + velhoTxtId + '"]' : '';
      if (selVelho && estado.textos && estado.textos[selVelho]) {
        if (!estado.textos) estado.textos = {};
        estado.textos['[data-ed-txt="' + novoTxtId + '"]'] = Object.assign({}, estado.textos[selVelho]);
      }
      if (selVelho && estado.mobile && estado.mobile.textos && estado.mobile.textos[selVelho]) {
        if (!estado.mobile.textos) estado.mobile.textos = {};
        estado.mobile.textos['[data-ed-txt="' + novoTxtId + '"]'] = Object.assign({}, estado.mobile.textos[selVelho]);
      }
    });

    // 2b. Reatribui identificadores data-ed-card exclusivos e limpa IDs conflitantes nos cards da cópia
    var seletoresCardsList = ['.intro-card', '.experience-layout', '.event-card', '.gallery-item', '.passo', '.feature', '.experience-content', '.ed-caixa-texto-criada', '[data-ed-card]'];
    var cardsInternos = novaSec.querySelectorAll(seletoresCardsList.join(', '));
    cardsInternos.forEach(function (cardEl, cIdx) {
      var velhoCardId = cardEl.getAttribute('data-ed-card') || cardEl.id;
      var novoCardId = 'dup_card_' + novoId + '_' + cIdx;
      if (cardEl.id) cardEl.removeAttribute('id');
      cardEl.setAttribute('data-ed-card', novoCardId);
      cardEl.classList.remove('ed-card-alvo', 'ed-layout-invertido');

      if (velhoCardId && estado.cards && estado.cards[velhoCardId]) {
        if (!estado.cards) estado.cards = {};
        estado.cards[novoCardId] = Object.assign({}, estado.cards[velhoCardId]);
        if (estado.cards[novoCardId].invertido) {
          cardEl.classList.add('ed-layout-invertido');
        }
      }
    });

    // 3. Insere no DOM logo a seguir à secção original
    if (elOriginal.nextSibling) {
      elOriginal.parentNode.insertBefore(novaSec, elOriginal.nextSibling);
    } else {
      elOriginal.parentNode.appendChild(novaSec);
    }

    // 4. Regista no array de secções duplicadas
    var dupObj = {
      id: novoId,
      baseId: baseId,
      nome: nomeEscolhido,
      tagName: novaSec.tagName.toLowerCase(),
      className: novaSec.className,
      styleAttr: novaSec.getAttribute('style') || '',
      innerHTML: obterHtmlLimpoSeccao(novaSec),
      duplicada: true
    };
    estado.seccoesDuplicadas.push(dupObj);

    // 5. Atualiza a lista de ordem das secções inserindo a cópia logo a seguir à original
    var ordem = obterOrdemAtualSeccoes();
    var pos = ordem.indexOf(secId);
    if (pos !== -1) {
      ordem.splice(pos + 1, 0, novoId);
    } else {
      ordem.push(novoId);
    }
    estado.ordemSeccoes = ordem;

    // 6. Copia dimensões/paddings da secção original se existirem
    if (estado.seccoes && estado.seccoes[secId]) {
      if (!estado.seccoes) estado.seccoes = {};
      estado.seccoes[novoId] = Object.assign({}, estado.seccoes[secId]);
    }
    if (estado.mobile && estado.mobile.seccoes && estado.mobile.seccoes[secId]) {
      if (!estado.mobile.seccoes) estado.mobile.seccoes = {};
      estado.mobile.seccoes[novoId] = Object.assign({}, estado.mobile.seccoes[secId]);
    }

    // 7. Injeta controles de edição e listeners
    if (isEditor) {
      injetarPillEmSeccao(novaSec, dupObj);
      configurarEdicaoTextosEmElemento(novaSec);
      configurarEdicaoFotosEmElemento(novaSec, novoId);
      configurarAcoesCardsEBlocos();
      atualizarBotoesPillSeccoes();
    }

    // 8. Aplica regras CSS dinâmicas e reordena se necessário
    aplicarEstilosDinamicos();
    aplicarOrdemSeccoesDOM(estado.ordemSeccoes);

    // 9. Rola suavemente até à nova secção
    setTimeout(function () {
      novaSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

    // 10. Grava o novo estado e atualiza a interface
    guardarEstado(true);
    if (document.getElementById('edModalOrdemSec') && !document.getElementById('edModalOrdemSec').hidden) {
      atualizarModalOrdemSecLista();
    }

    mostrarToast('✨ Secção “' + nomeEscolhido + '” duplicada com sucesso!');
  }

  function eliminarSeccaoDuplicada(secId) {
    var secInfo = obterInfoSeccao(secId);
    var nome = secInfo ? secInfo.nome : secId;

    if (!confirm('Tem a certeza que deseja eliminar definitivamente a secção duplicada “' + nome + '”?')) {
      return;
    }

    var el = document.getElementById(secId);
    if (el) el.remove();

    if (estado.seccoesDuplicadas) {
      estado.seccoesDuplicadas = estado.seccoesDuplicadas.filter(function (s) { return s.id !== secId; });
    }
    if (estado.ordemSeccoes) {
      estado.ordemSeccoes = estado.ordemSeccoes.filter(function (id) { return id !== secId; });
    }
    if (estado.seccoes && estado.seccoes[secId]) {
      delete estado.seccoes[secId];
    }
    if (estado.mobile && estado.mobile.seccoes && estado.mobile.seccoes[secId]) {
      delete estado.mobile.seccoes[secId];
    }

    // Remove referências de textos desta secção
    if (estado.textos) {
      for (var k in estado.textos) {
        if (k.indexOf('dup_' + secId) !== -1) delete estado.textos[k];
      }
    }
    if (estado.mobile && estado.mobile.textos) {
      for (var kM in estado.mobile.textos) {
        if (kM.indexOf('dup_' + secId) !== -1) delete estado.mobile.textos[kM];
      }
    }

    atualizarBotoesPillSeccoes();
    if (document.getElementById('edModalOrdemSec') && !document.getElementById('edModalOrdemSec').hidden) {
      atualizarModalOrdemSecLista();
    }

    guardarEstado(true);
    mostrarToast('🗑️ Secção duplicada eliminada com sucesso.');
  }

  function eliminarSeccaoPadrao(secId) {
    var secInfo = obterInfoSeccao(secId);
    var nome = secInfo ? secInfo.nome : secId;

    if (!confirm('Tem a certeza que deseja eliminar a secção “' + nome + '”?')) {
      return;
    }

    if (!estado.seccoes) estado.seccoes = {};
    if (!estado.seccoes[secId]) estado.seccoes[secId] = {};
    estado.seccoes[secId].eliminada = true;
    estado.seccoes[secId].visivel = false;

    var el = document.getElementById(secId);
    if (el) {
      el.classList.add('ed-seccao-oculta');
      el.style.display = 'none';
    }

    atualizarBotoesPillSeccoes();
    if (document.getElementById('edModalOrdemSec') && !document.getElementById('edModalOrdemSec').hidden) {
      atualizarModalOrdemSecLista();
    }

    guardarEstado(true);
    aplicarEstilosDinamicos();
    mostrarToast('🗑️ Secção “' + nome + '” eliminada com sucesso.');
  }

  /* ---------------- MODAL E GESTÃO DE ADIÇÃO DE CAIXAS DE TEXTO ---------------- */
  function criarModalAddTexto() {
    var modal = document.createElement('div');
    modal.id = 'edModalAddTexto';
    modal.className = 'ed-modal-dialog';
    modal.hidden = true;
    modal.style.maxWidth = '480px';
    modal.setAttribute('role', 'dialog');

    modal.innerHTML = [
      '<div class="ed-modal-topo">',
      '  <div class="ed-modal-topo-info">',
      '    <h3>➕ Criar Nova Caixa de Texto</h3>',
      '    <p>Adicione um novo título, parágrafo, destaque ou botão à secção escolhida</p>',
      '  </div>',
      '  <button type="button" class="ed-btn-fechar" id="edBtnFecharModalAddTxt">✕</button>',
      '</div>',
      '<div class="ed-modal-corpo" style="display:flex;flex-direction:column;gap:14px;padding:16px 0;">',
      '  <div>',
      '    <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px;">1. Selecionar Secção Alvo:</label>',
      '    <select id="edSelectSecAlvoAddTxt" class="ed-select-fonte" style="width:100%;padding:10px;background:#1a1a22;color:#fff;border:1px solid #444;border-radius:6px;font-size:13.5px;"></select>',
      '  </div>',
      '  <div>',
      '    <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px;">2. Tipo de Elemento:</label>',
      '    <select id="edSelectTipoAddTxt" class="ed-select-fonte" style="width:100%;padding:10px;background:#1a1a22;color:#fff;border:1px solid #444;border-radius:6px;font-size:13.5px;">',
      '      <option value="h2">Título Principal (H2)</option>',
      '      <option value="h3">Subtítulo (H3)</option>',
      '      <option value="p" selected>Parágrafo / Texto Normal (P)</option>',
      '      <option value="span">Destaque / Etiqueta (SPAN)</option>',
      '      <option value="a">Botão / Link (A)</option>',
      '    </select>',
      '  </div>',
      '  <div>',
      '    <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px;">3. Texto Inicial:</label>',
      '    <input type="text" id="edInputConteudoAddTxt" value="Digite aqui o seu novo texto..." style="width:100%;padding:10px;background:#1a1a22;color:#fff;border:1px solid #444;border-radius:6px;font-size:14px;">',
      '  </div>',
      '</div>',
      '<div class="ed-modal-rodape">',
      '  <button type="button" class="ed-btn-concluir" id="edBtnConfirmarAddTxt" style="width:100%;">➕ Criar Caixa de Texto Agora</button>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    document.getElementById('edBtnFecharModalAddTxt').addEventListener('click', fecharModalAddTexto);
    document.getElementById('edBtnConfirmarAddTxt').addEventListener('click', function () {
      var secId = document.getElementById('edSelectSecAlvoAddTxt').value;
      var tipo = document.getElementById('edSelectTipoAddTxt').value;
      var txt = document.getElementById('edInputConteudoAddTxt').value.trim();
      fecharModalAddTexto();
      adicionarCaixaTexto(secId, tipo, txt);
    });
  }

  function abrirModalAddTexto(secIdPref) {
    var backdrop = document.getElementById('edModalBackdrop');
    var modal = document.getElementById('edModalAddTexto');
    var selSec = document.getElementById('edSelectSecAlvoAddTxt');

    if (selSec) {
      selSec.innerHTML = '';
      var todas = obterListaTodasSeccoes();
      todas.forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.nome + (s.duplicada ? ' (Cópia)' : '');
        if (secIdPref && s.id === secIdPref) opt.selected = true;
        selSec.appendChild(opt);
      });
    }

    if (backdrop) backdrop.hidden = false;
    if (modal) modal.hidden = false;
  }

  function fecharModalAddTexto() {
    var backdrop = document.getElementById('edModalBackdrop');
    var modal = document.getElementById('edModalAddTexto');
    if (backdrop) backdrop.hidden = true;
    if (modal) modal.hidden = true;
  }

  function adicionarCaixaTexto(secId, tag, textoInicial) {
    secId = secId || 'topo';
    tag = (tag || 'p').toLowerCase();
    textoInicial = textoInicial || 'Clique aqui para digitar o seu texto...';

    var elSec = document.getElementById(secId);
    if (!elSec) {
      mostrarToast('Secção não encontrada para adicionar texto.');
      return;
    }

    var txtId = 'txt_custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    var novoEl = document.createElement(tag);
    novoEl.className = 'ed-caixa-texto-criada' + (isEditor ? ' ed-editavel' : '');
    novoEl.setAttribute('data-ed-txt', txtId);
    novoEl.setAttribute('data-sec-pai', secId);
    novoEl.innerHTML = textoInicial;
    if (tag === 'a') {
      novoEl.href = '#';
      novoEl.style.display = 'inline-block';
      novoEl.style.padding = '10px 20px';
      novoEl.style.background = 'var(--gold)';
      novoEl.style.color = '#111';
      novoEl.style.borderRadius = '30px';
      novoEl.style.fontWeight = 'bold';
    }

    var containerInner = elSec.querySelector('.intro-texto, .events-header, .portfolio-top, .como-header, .experience-content, .form-box, .cta-content') || elSec;
    containerInner.appendChild(novoEl);

    if (!estado.caixasTextoCriadas) estado.caixasTextoCriadas = [];
    estado.caixasTextoCriadas.push({
      id: txtId,
      secId: secId,
      tag: tag,
      html: textoInicial
    });

    var seletor = '[data-ed-txt="' + txtId + '"]';
    if (!estado.textos) estado.textos = {};
    estado.textos[seletor] = {
      html: textoInicial
    };

    if (isEditor) {
      textoAtivoEl = novoEl;
      textoAtivoSeletor = seletor;
      novoEl.contentEditable = 'true';
      novoEl.focus();
      posicionarBalao(novoEl);
    }

    guardarEstado(true);
    mostrarToast('✨ Nova caixa de texto adicionada! Pode editar o texto e alterar a fonte.');
  }

  function recriarCaixasTextoCriadasNoDOM() {
    if (!estado.caixasTextoCriadas || !Array.isArray(estado.caixasTextoCriadas)) return;
    estado.caixasTextoCriadas.forEach(function (c) {
      var existente = document.querySelector('[data-ed-txt="' + c.id + '"]');
      if (!existente) {
        var elSec = document.getElementById(c.secId);
        if (elSec) {
          var novoEl = document.createElement(c.tag || 'p');
          novoEl.className = 'ed-caixa-texto-criada' + (isEditor ? ' ed-editavel' : '');
          novoEl.setAttribute('data-ed-txt', c.id);
          novoEl.setAttribute('data-sec-pai', c.secId);
          novoEl.innerHTML = c.html || 'Texto personalizado';
          if (c.tag === 'a') {
            novoEl.href = '#';
            novoEl.style.display = 'inline-block';
            novoEl.style.padding = '10px 20px';
            novoEl.style.background = 'var(--gold)';
            novoEl.style.color = '#111';
            novoEl.style.borderRadius = '30px';
            novoEl.style.fontWeight = 'bold';
          }

          var containerInner = elSec.querySelector('.intro-texto, .events-header, .portfolio-top, .como-header, .experience-content, .form-box, .cta-content') || elSec;
          containerInner.appendChild(novoEl);
        }
      }
    });
  }

  function inverterLadoContainer(container) {
    if (!container) return;
    var cardId = container.getAttribute('data-ed-card') || container.id || 'intro-card';
    var invertido = container.classList.toggle('ed-layout-invertido');

    if (!estado.cards) estado.cards = {};
    if (!estado.cards[cardId]) estado.cards[cardId] = {};
    estado.cards[cardId].invertido = invertido;

    guardarEstado(true);
    mostrarToast('✨ Lado invertido! Foto e Texto trocaram de posição.');
  }

  function configurarAcoesCardsEBlocos() {
    if (!isEditor) return;

    var seletoresCards = [
      '.intro-card',
      '.experience-layout',
      '.event-card',
      '.gallery-item',
      '.passo',
      '.feature',
      '.experience-content',
      '.ed-caixa-texto-criada'
    ];

    var elementos = document.querySelectorAll(seletoresCards.join(', '));
    elementos.forEach(function (el, idx) {
      var secPai = el.closest('section, header, footer');
      var secId = secPai ? secPai.id : 'sec';

      var cardId = el.getAttribute('data-ed-card');
      if (!cardId) {
        if (secPai && secPai.hasAttribute('data-sec-duplicada')) {
          cardId = 'dup_card_' + secId + '_' + idx;
        } else {
          cardId = el.id || ('card_' + secId + '_' + idx);
        }
        el.setAttribute('data-ed-card', cardId);
      }

      if (el.id && document.querySelectorAll('#' + el.id).length > 1 && secPai && secPai.hasAttribute('data-sec-duplicada')) {
        el.removeAttribute('id');
      }

      var oldCtrls = el.querySelector(':scope > .ed-card-ctrls');
      if (oldCtrls) oldCtrls.remove();

      el.classList.add('ed-card-alvo');

      var ctrls = document.createElement('div');
      ctrls.className = 'ed-card-ctrls';
      ctrls.innerHTML = [
        '<button type="button" class="ed-card-btn-acao inverter" title="Inverter lado (colocar foto de um lado e texto do outro)">⇄ Inverter Lado</button>',
        '<button type="button" class="ed-card-btn-acao drag ed-drag-handle" title="Clique e arraste para reordenar">⠿ Arrastar</button>'
      ].join('');

      el.appendChild(ctrls);

      ctrls.querySelector('.inverter').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        inverterLadoContainer(el);
      });

      el.draggable = true;
      el.addEventListener('dragstart', function (e) {
        if (document.body.classList.contains('ed-preview-mode')) return;
        e.dataTransfer.setData('text/plain', cardId);
        el.classList.add('ed-dragging');
      });

      el.addEventListener('dragend', function () {
        el.classList.remove('ed-dragging');
        document.querySelectorAll('.ed-card-alvo').forEach(function (c) {
          c.classList.remove('ed-drag-over');
        });
      });

      el.addEventListener('dragover', function (e) {
        if (document.body.classList.contains('ed-preview-mode')) return;
        e.preventDefault();
        el.classList.add('ed-drag-over');
      });

      el.addEventListener('dragleave', function () {
        el.classList.remove('ed-drag-over');
      });

      el.addEventListener('drop', function (e) {
        if (document.body.classList.contains('ed-preview-mode')) return;
        e.preventDefault();
        el.classList.remove('ed-drag-over');

        var origemId = e.dataTransfer.getData('text/plain');
        if (!origemId || origemId === cardId) return;

        var origemEl = document.querySelector('[data-ed-card="' + origemId + '"]');
        if (origemEl) {
          if (origemEl.parentNode === el.parentNode) {
            origemEl.parentNode.insertBefore(origemEl, el);
            guardarEstado(true);
            mostrarToast('✨ Bloco reordenado com sucesso!');
          } else if (origemEl.parentNode === el || el.parentNode === origemEl) {
            var parentContainer = el.classList.contains('intro-card') || el.classList.contains('experience-layout') ? el : el.parentNode;
            inverterLadoContainer(parentContainer);
          }
        }
      });
    });
  }

  function injetarSecoesControles() {
    var todas = obterListaTodasSeccoes();
    todas.forEach(function (sec) {
      var elSec = document.getElementById(sec.id);
      if (!elSec) return;
      injetarPillEmSeccao(elSec, sec);
    });

    atualizarBotoesPillSeccoes();
  }

  function atualizarBotoesPillSeccoes() {
    var ordem = obterOrdemAtualSeccoes();
    ordem.forEach(function (secId, idx) {
      var pill = document.querySelector('.ed-seccao-pill[data-sec-pill="' + secId + '"]');
      if (pill) {
        var btnSubir = pill.querySelector('.subir');
        var btnDescer = pill.querySelector('.descer');
        if (btnSubir) btnSubir.disabled = (idx === 0);
        if (btnDescer) btnDescer.disabled = (idx === ordem.length - 1);
      }
    });
  }

  /* ---------------- MODAL DE REORDENAÇÃO DE SECÇÕES ---------------- */
  function criarModalOrdemSeccoes() {
    var modal = document.createElement('div');
    modal.id = 'edModalOrdemSec';
    modal.className = 'ed-modal-dialog ed-modal-ordem';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = [
      '<div class="ed-modal-topo">',
      '  <div class="ed-modal-topo-info">',
      '    <h3>📑 Mover, Duplicar & Reordenar Secções</h3>',
      '    <p>Organize a sequência do seu site: envie para cima, para baixo ou duplique qualquer secção</p>',
      '  </div>',
      '  <button type="button" class="ed-btn-fechar" id="edBtnFecharModalOrdem">✕</button>',
      '</div>',
      '<div class="ed-ordem-lista" id="edListaSecOrdem"></div>',
      '<div class="ed-modal-rodape">',
      '  <span style="font-size:11.5px;color:#888;">A nova ordem e secções aplicam-se imediatamente</span>',
      '  <button type="button" class="ed-btn-concluir" id="edBtnConcluirOrdem">✓ Concluído</button>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) { e.stopPropagation(); });

    document.getElementById('edBtnFecharModalOrdem').addEventListener('click', fecharModalOrdemSec);
    document.getElementById('edBtnConcluirOrdem').addEventListener('click', function () {
      fecharModalOrdemSec();
      mostrarToast('✓ Ordem das secções guardada!');
    });
  }

  function abrirModalOrdemSec() {
    var backdrop = document.getElementById('edModalBackdrop');
    var modal = document.getElementById('edModalOrdemSec');
    atualizarModalOrdemSecLista();
    if (backdrop) backdrop.hidden = false;
    if (modal) modal.hidden = false;
  }

  function fecharModalOrdemSec() {
    var backdrop = document.getElementById('edModalBackdrop');
    var modal = document.getElementById('edModalOrdemSec');
    if (backdrop) backdrop.hidden = true;
    if (modal) modal.hidden = true;
  }

  function atualizarModalOrdemSecLista() {
    var listaEl = document.getElementById('edListaSecOrdem');
    if (!listaEl) return;

    var ordem = obterOrdemAtualSeccoes();
    listaEl.innerHTML = '';

    ordem.forEach(function (secId, idx) {
      var secInfo = obterInfoSeccao(secId);
      var elSec = document.getElementById(secId);
      var eliminada = estado.seccoes && estado.seccoes[secId] && estado.seccoes[secId].eliminada;
      var visivel = elSec && (!estado.seccoes || !estado.seccoes[secId] || estado.seccoes[secId].visivel !== false) && !eliminada;

      var item = document.createElement('div');
      item.className = 'ed-ordem-item' + (eliminada ? ' ed-item-eliminado' : '');
      item.draggable = true;
      item.setAttribute('data-sec-id', secId);

      item.innerHTML = [
        '<div class="ed-ordem-item-info">',
        '  <span class="ed-drag-handle" style="cursor:grab;margin-right:6px;" title="Clique e arraste para reordenar">⠿</span>',
        '  <span class="ed-ordem-num">' + (idx + 1) + '</span>',
        '  <span class="ed-ordem-nome">' + secInfo.nome + (secInfo.duplicada ? ' <span class="ed-sec-badge-duplicada">Cópia</span>' : '') + (eliminada ? ' <span style="color:#e11d48;font-size:11px;">(Eliminada)</span>' : '') + '</span>',
        '</div>',
        '<div class="ed-ordem-acoes">',
        '  <button type="button" class="ed-btn-sec-acao" data-acao="cima"' + (idx === 0 ? ' disabled' : '') + ' title="Mover para cima">▲ Subir</button>',
        '  <button type="button" class="ed-btn-sec-acao" data-acao="baixo"' + (idx === ordem.length - 1 ? ' disabled' : '') + ' title="Mover para baixo">▼ Descer</button>',
        '  <button type="button" class="ed-btn-sec-acao tamanho" data-acao="tamanho" title="Ajustar margens e tamanho">📐 Margens</button>',
        '  <button type="button" class="ed-btn-sec-acao duplicar" data-acao="duplicar" title="Duplicar esta secção criando uma cópia independente">👯 Duplicar</button>',
        '  <button type="button" class="ed-btn-sec-acao eliminar" data-acao="eliminar" title="' + (eliminada ? 'Restaurar secção' : 'Eliminar secção') + '">' + (eliminada ? '↩ Restaurar' : '🗑️ Eliminar') + '</button>',
        '</div>'
      ].join('');

      // Drag and Drop para reordenar no modal
      item.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', secId);
        item.classList.add('ed-dragging');
      });

      item.addEventListener('dragend', function () {
        item.classList.remove('ed-dragging');
        document.querySelectorAll('#edListaSecOrdem .ed-ordem-item').forEach(function (el) {
          el.classList.remove('ed-drag-over');
        });
      });

      item.addEventListener('dragover', function (e) {
        e.preventDefault();
        item.classList.add('ed-drag-over');
      });

      item.addEventListener('dragleave', function () {
        item.classList.remove('ed-drag-over');
      });

      item.addEventListener('drop', function (e) {
        e.preventDefault();
        item.classList.remove('ed-drag-over');
        var origemId = e.dataTransfer.getData('text/plain');
        if (!origemId || origemId === secId) return;

        var ord = obterOrdemAtualSeccoes();
        var idxOrigem = ord.indexOf(origemId);
        var idxDest = ord.indexOf(secId);

        if (idxOrigem !== -1 && idxDest !== -1) {
          ord.splice(idxOrigem, 1);
          ord.splice(idxDest, 0, origemId);
          estado.ordemSeccoes = ord;
          aplicarOrdemSeccoesDOM(ord);
          atualizarModalOrdemSecLista();
          guardarEstado(true);
          mostrarToast('✨ Secções reordenadas!');
        }
      });

      item.querySelector('[data-acao="cima"]').addEventListener('click', function () {
        moverSeccao(secId, 'cima');
      });
      item.querySelector('[data-acao="baixo"]').addEventListener('click', function () {
        moverSeccao(secId, 'baixo');
      });
      item.querySelector('[data-acao="tamanho"]').addEventListener('click', function () {
        fecharModalOrdemSec();
        abrirModalTamanhoSec(secId);
      });
      item.querySelector('[data-acao="duplicar"]').addEventListener('click', function () {
        duplicarSeccao(secId);
      });

      var btnElim = item.querySelector('[data-acao="eliminar"]');
      if (btnElim) {
        btnElim.addEventListener('click', function () {
          if (eliminada) {
            // Restaurar
            if (!estado.seccoes) estado.seccoes = {};
            if (!estado.seccoes[secId]) estado.seccoes[secId] = {};
            estado.seccoes[secId].eliminada = false;
            estado.seccoes[secId].visivel = true;
            if (elSec) {
              elSec.classList.remove('ed-seccao-oculta');
              elSec.style.display = '';
            }
            guardarEstado(true);
            aplicarEstilosDinamicos();
            atualizarModalOrdemSecLista();
            mostrarToast('↩ Secção restaurada com sucesso!');
          } else {
            if (secInfo.duplicada) {
              eliminarSeccaoDuplicada(secId);
            } else {
              eliminarSeccaoPadrao(secId);
            }
          }
        });
      }

      listaEl.appendChild(item);
    });
  }

  /* ---------------- MODAL DE TAMANHO & MARGENS DE SECÇÃO ---------------- */
  var seccaoAtivaTamanhoId = null;
  var dispAtivoModalTam = 'mobile'; // 'pc' ou 'mobile'

  function criarModalTamanhoSeccoes() {
    var modal = document.createElement('div');
    modal.id = 'edModalTamanhoSec';
    modal.className = 'ed-modal-dialog ed-modal-tam-sec';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = [
      '<div class="ed-modal-topo">',
      '  <div class="ed-modal-topo-info">',
      '    <h3 id="edModalTamSecTitulo">📐 Ajustar Margens & Tamanho</h3>',
      '    <p>Ajuste individualmente a distância de cima, distância de baixo e altura</p>',
      '  </div>',
      '  <button type="button" class="ed-btn-fechar" id="edBtnFecharTamSec">✕</button>',
      '</div>',

      // Abas de Dispositivo (PC / Celular)
      '<div class="ed-modal-disp-tabs">',
      '  <button type="button" class="ed-btn-tab-disp" id="edTabDispPC">🖥️ Computador (PC)</button>',
      '  <button type="button" class="ed-btn-tab-disp ativo" id="edTabDispMobile">📱 Celular (Mobile)</button>',
      '</div>',

      // 1. Margem Superior (Aproximar/Afastar de Cima)
      '<div class="ed-sliders-caixa">',
      '  <div class="ed-slider-linha">',
      '    <label><span>Margem Superior (Distância da secção de cima)</span><b id="edTxtValPadTopSec">36px</b></label>',
      '    <input type="range" id="edRangePadTopSec" min="0" max="160" step="2" value="36">',
      '  </div>',
      '  <div class="ed-linha-passos-rapidos">',
      '    <span style="font-size:11px;color:#888;">Ajuste fino:</span>',
      '    <button type="button" class="ed-btn-passo" data-alvo="top" data-delta="-10">-10px</button>',
      '    <button type="button" class="ed-btn-passo" data-alvo="top" data-delta="-5">-5px</button>',
      '    <button type="button" class="ed-btn-passo" data-alvo="top" data-delta="5">+5px</button>',
      '    <button type="button" class="ed-btn-passo" data-alvo="top" data-delta="10">+10px</button>',
      '  </div>',
      '</div>',

      // 2. Margem Inferior (Aproximar/Afastar de Baixo)
      '<div class="ed-sliders-caixa" style="margin-top:10px;">',
      '  <div class="ed-slider-linha">',
      '    <label><span>Margem Inferior (Distância da secção de baixo)</span><b id="edTxtValPadBottomSec">36px</b></label>',
      '    <input type="range" id="edRangePadBottomSec" min="0" max="160" step="2" value="36">',
      '  </div>',
      '  <div class="ed-linha-passos-rapidos">',
      '    <span style="font-size:11px;color:#888;">Ajuste fino:</span>',
      '    <button type="button" class="ed-btn-passo" data-alvo="bottom" data-delta="-10">-10px</button>',
      '    <button type="button" class="ed-btn-passo" data-alvo="bottom" data-delta="-5">-5px</button>',
      '    <button type="button" class="ed-btn-passo" data-alvo="bottom" data-delta="5">+5px</button>',
      '    <button type="button" class="ed-btn-passo" data-alvo="bottom" data-delta="10">+10px</button>',
      '  </div>',
      '</div>',

      // 3. Altura da Secção
      '<div class="ed-sliders-caixa" id="edCaixaHeroMinHeight" hidden style="margin-top:10px;">',
      '  <div class="ed-slider-linha">',
      '    <label><span>Altura da Capa (Min-Height)</span><b id="edTxtValHeroH">56vh</b></label>',
      '    <input type="range" id="edRangeHeroH" min="35" max="100" step="2" value="56">',
      '  </div>',
      '</div>',

      '<div class="ed-sliders-caixa" id="edCaixaGeralMinHeight" hidden style="margin-top:10px;">',
      '  <div class="ed-slider-linha">',
      '    <label><span>Comprimento / Altura Mínima</span><b id="edTxtValMinHeightSec">Automática</b></label>',
      '    <input type="range" id="edRangeMinHeightSec" min="150" max="800" step="10" value="300">',
      '  </div>',
      '  <div class="ed-linha-passos-rapidos">',
      '    <button type="button" class="ed-btn-passo" id="edBtnMinHeightAuto">Altura Automática</button>',
      '  </div>',
      '</div>',

      // 4. Presets rápidos
      '<div class="ed-presets-grade-tam">',
      '  <button type="button" class="ed-btn-preset-tam" data-top="14" data-bottom="14">Ultra Compacto (14px / 14px)</button>',
      '  <button type="button" class="ed-btn-preset-tam" data-top="32" data-bottom="32">Equilibrado (32px / 32px)</button>',
      '  <button type="button" class="ed-btn-preset-tam" data-top="10" data-bottom="50">Aproximar de Cima (10px / 50px)</button>',
      '  <button type="button" class="ed-btn-preset-tam" data-top="50" data-bottom="10">Aproximar de Baixo (50px / 10px)</button>',
      '</div>',

      '<div class="ed-modal-rodape">',
      '  <button type="button" class="ed-btn-cancelar" id="edBtnResetTamSec">↺ Padrão desta Secção</button>',
      '  <div class="ed-rodape-acoes">',
      '    <button type="button" class="ed-btn-concluir" id="edBtnConcluirTamSec">✓ Concluído</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) { e.stopPropagation(); });
    document.getElementById('edBtnFecharTamSec').addEventListener('click', fecharModalTamanhoSec);

    // Abas de alternância de dispositivo
    document.getElementById('edTabDispPC').addEventListener('click', function () {
      trocarDispositivoModalTam('pc');
    });
    document.getElementById('edTabDispMobile').addEventListener('click', function () {
      trocarDispositivoModalTam('mobile');
    });

    // Sliders de margem superior e inferior
    var rangeTop = document.getElementById('edRangePadTopSec');
    var txtTop = document.getElementById('edTxtValPadTopSec');
    rangeTop.addEventListener('input', function () {
      if (!seccaoAtivaTamanhoId) return;
      var val = parseInt(this.value, 10);
      txtTop.textContent = val + 'px';
      atualizarMargemSeccao(seccaoAtivaTamanhoId, 'top', val);
    });

    var rangeBottom = document.getElementById('edRangePadBottomSec');
    var txtBottom = document.getElementById('edTxtValPadBottomSec');
    rangeBottom.addEventListener('input', function () {
      if (!seccaoAtivaTamanhoId) return;
      var val = parseInt(this.value, 10);
      txtBottom.textContent = val + 'px';
      atualizarMargemSeccao(seccaoAtivaTamanhoId, 'bottom', val);
    });

    // Botões de passo fino
    modal.querySelectorAll('.ed-btn-passo[data-alvo]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!seccaoAtivaTamanhoId) return;
        var alvo = this.dataset.alvo;
        var delta = parseInt(this.dataset.delta, 10);
        var inputEl = alvo === 'top' ? rangeTop : rangeBottom;
        var txtEl = alvo === 'top' ? txtTop : txtBottom;
        var val = Math.max(0, Math.min(160, parseInt(inputEl.value, 10) + delta));
        inputEl.value = val;
        txtEl.textContent = val + 'px';
        atualizarMargemSeccao(seccaoAtivaTamanhoId, alvo, val);
      });
    });

    // Presets rápidos
    modal.querySelectorAll('.ed-btn-preset-tam').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!seccaoAtivaTamanhoId) return;
        var pTop = parseInt(this.dataset.top, 10);
        var pBottom = parseInt(this.dataset.bottom, 10);
        rangeTop.value = pTop;
        txtTop.textContent = pTop + 'px';
        rangeBottom.value = pBottom;
        txtBottom.textContent = pBottom + 'px';
        atualizarMargemSeccao(seccaoAtivaTamanhoId, 'top', pTop);
        atualizarMargemSeccao(seccaoAtivaTamanhoId, 'bottom', pBottom);
        mostrarToast('Margens ajustadas: Cima ' + pTop + 'px · Baixo ' + pBottom + 'px (' + (dispAtivoModalTam === 'mobile' ? 'Celular' : 'PC') + ')');
      });
    });

    // Hero min-height
    var rangeHero = document.getElementById('edRangeHeroH');
    var txtHero = document.getElementById('edTxtValHeroH');
    rangeHero.addEventListener('input', function () {
      if (!seccaoAtivaTamanhoId) return;
      var hVal = this.value + 'vh';
      txtHero.textContent = hVal;
      atualizarMinHeightSeccao(seccaoAtivaTamanhoId, hVal);
    });

    // Altura automática / personalizada para outras secções
    var rangeMinH = document.getElementById('edRangeMinHeightSec');
    var txtMinH = document.getElementById('edTxtValMinHeightSec');
    rangeMinH.addEventListener('input', function () {
      if (!seccaoAtivaTamanhoId) return;
      var pxVal = this.value + 'px';
      txtMinH.textContent = pxVal;
      atualizarMinHeightSeccao(seccaoAtivaTamanhoId, pxVal);
    });

    document.getElementById('edBtnMinHeightAuto').addEventListener('click', function () {
      if (!seccaoAtivaTamanhoId) return;
      txtMinH.textContent = 'Automática';
      atualizarMinHeightSeccao(seccaoAtivaTamanhoId, 'auto');
      mostrarToast('Altura definida para automática.');
    });

    // Reset padrões
    document.getElementById('edBtnResetTamSec').addEventListener('click', function () {
      if (!seccaoAtivaTamanhoId) return;
      var elSec = document.getElementById(seccaoAtivaTamanhoId);
      if (dispAtivoModalTam === 'mobile') {
        if (estado.mobile && estado.mobile.seccoes && estado.mobile.seccoes[seccaoAtivaTamanhoId]) {
          delete estado.mobile.seccoes[seccaoAtivaTamanhoId].paddingTop;
          delete estado.mobile.seccoes[seccaoAtivaTamanhoId].paddingBottom;
          delete estado.mobile.seccoes[seccaoAtivaTamanhoId].paddingY;
          delete estado.mobile.seccoes[seccaoAtivaTamanhoId].minHeight;
        }
      } else {
        if (estado.seccoes && estado.seccoes[seccaoAtivaTamanhoId]) {
          delete estado.seccoes[seccaoAtivaTamanhoId].paddingTop;
          delete estado.seccoes[seccaoAtivaTamanhoId].paddingBottom;
          delete estado.seccoes[seccaoAtivaTamanhoId].paddingY;
          delete estado.seccoes[seccaoAtivaTamanhoId].minHeight;
        }
      }
      if (elSec) {
        elSec.style.removeProperty('padding-top');
        elSec.style.removeProperty('padding-bottom');
        elSec.style.removeProperty('min-height');
      }
      aplicarEstilosDinamicos();
      guardarEstado(true);
      preencherValoresModalTam(seccaoAtivaTamanhoId, dispAtivoModalTam);
      mostrarToast('Padrões restaurados para esta secção em ' + (dispAtivoModalTam === 'mobile' ? 'Celular' : 'PC') + '.');
    });

    document.getElementById('edBtnConcluirTamSec').addEventListener('click', function () {
      fecharModalTamanhoSec();
      mostrarToast('✓ Margens e tamanho guardados com sucesso!');
    });
  }

  function trocarDispositivoModalTam(disp) {
    dispAtivoModalTam = disp;
    document.getElementById('edTabDispPC').classList.toggle('ativo', disp === 'pc');
    document.getElementById('edTabDispMobile').classList.toggle('ativo', disp === 'mobile');
    if (seccaoAtivaTamanhoId) {
      preencherValoresModalTam(seccaoAtivaTamanhoId, disp);
    }
  }

  function atualizarMargemSeccao(secId, tipo, px) {
    var elSec = document.getElementById(secId);
    if (!elSec) return;

    if (dispAtivoModalTam === 'mobile') {
      if (!estado.mobile) estado.mobile = { textos: {}, seccoes: {}, cards: {} };
      if (!estado.mobile.seccoes) estado.mobile.seccoes = {};
      if (!estado.mobile.seccoes[secId]) estado.mobile.seccoes[secId] = {};
      if (tipo === 'top') estado.mobile.seccoes[secId].paddingTop = px;
      if (tipo === 'bottom') estado.mobile.seccoes[secId].paddingBottom = px;
    } else {
      if (!estado.seccoes) estado.seccoes = {};
      if (!estado.seccoes[secId]) estado.seccoes[secId] = {};
      if (tipo === 'top') estado.seccoes[secId].paddingTop = px;
      if (tipo === 'bottom') estado.seccoes[secId].paddingBottom = px;
    }

    aplicarEstilosDinamicos();
    guardarEstado();
  }

  function atualizarMinHeightSeccao(secId, minHeight) {
    var elSec = document.getElementById(secId);
    if (!elSec) return;

    if (dispAtivoModalTam === 'mobile') {
      if (!estado.mobile) estado.mobile = { textos: {}, seccoes: {}, cards: {} };
      if (!estado.mobile.seccoes) estado.mobile.seccoes = {};
      if (!estado.mobile.seccoes[secId]) estado.mobile.seccoes[secId] = {};
      estado.mobile.seccoes[secId].minHeight = minHeight;
    } else {
      if (!estado.seccoes) estado.seccoes = {};
      if (!estado.seccoes[secId]) estado.seccoes[secId] = {};
      estado.seccoes[secId].minHeight = minHeight;
    }

    aplicarEstilosDinamicos();
    guardarEstado();
  }

  function preencherValoresModalTam(secId, disp) {
    var elSec = document.getElementById(secId);
    if (!elSec) return;

    var cs = window.getComputedStyle(elSec);
    var confMob = (estado.mobile && estado.mobile.seccoes && estado.mobile.seccoes[secId]) || {};
    var confDesk = (estado.seccoes && estado.seccoes[secId]) || {};
    var conf = disp === 'mobile' ? confMob : confDesk;

    var pTop = conf.paddingTop !== undefined ? conf.paddingTop : (conf.paddingY !== undefined ? conf.paddingY : parseInt(cs.paddingTop, 10) || 36);
    var pBottom = conf.paddingBottom !== undefined ? conf.paddingBottom : (conf.paddingY !== undefined ? conf.paddingY : parseInt(cs.paddingBottom, 10) || 36);

    var rangeTop = document.getElementById('edRangePadTopSec');
    var txtTop = document.getElementById('edTxtValPadTopSec');
    rangeTop.value = pTop;
    txtTop.textContent = pTop + 'px';

    var rangeBottom = document.getElementById('edRangePadBottomSec');
    var txtBottom = document.getElementById('edTxtValPadBottomSec');
    rangeBottom.value = pBottom;
    txtBottom.textContent = pBottom + 'px';

    var caixaHero = document.getElementById('edCaixaHeroMinHeight');
    var caixaGeral = document.getElementById('edCaixaGeralMinHeight');
    caixaHero.hidden = (secId !== 'topo');
    caixaGeral.hidden = (secId === 'topo');

    if (secId === 'topo') {
      var hVal = conf.minHeight ? parseInt(conf.minHeight, 10) : (parseInt(cs.minHeight, 10) ? Math.round((parseInt(cs.minHeight, 10) / window.innerHeight) * 100) : 56);
      hVal = Math.max(35, Math.min(100, hVal || 56));
      document.getElementById('edRangeHeroH').value = hVal;
      document.getElementById('edTxtValHeroH').textContent = hVal + 'vh';
    } else {
      var minHPx = conf.minHeight && conf.minHeight !== 'auto' ? parseInt(conf.minHeight, 10) : (parseInt(cs.minHeight, 10) || 0);
      document.getElementById('edTxtValMinHeightSec').textContent = minHPx ? minHPx + 'px' : 'Automática';
      if (minHPx) document.getElementById('edRangeMinHeightSec').value = minHPx;
    }
  }

  function abrirModalTamanhoSec(secId) {
    seccaoAtivaTamanhoId = secId;
    dispAtivoModalTam = estaNoModoMobile() ? 'mobile' : 'pc';

    var secInfo = (typeof obterInfoSeccao === 'function') ? obterInfoSeccao(secId) : (SECCOES_LISTA.find(function (s) { return s.id === secId; }) || { id: secId, nome: secId });
    var backdrop = document.getElementById('edModalBackdrop');
    var modal = document.getElementById('edModalTamanhoSec');

    document.getElementById('edModalTamSecTitulo').textContent = '📐 ' + secInfo.nome;
    document.getElementById('edTabDispPC').classList.toggle('ativo', dispAtivoModalTam === 'pc');
    document.getElementById('edTabDispMobile').classList.toggle('ativo', dispAtivoModalTam === 'mobile');

    preencherValoresModalTam(secId, dispAtivoModalTam);

    if (backdrop) backdrop.hidden = false;
    if (modal) modal.hidden = false;
  }

  function fecharModalTamanhoSec() {
    var backdrop = document.getElementById('edModalBackdrop');
    var modal = document.getElementById('edModalTamanhoSec');
    if (backdrop) backdrop.hidden = true;
    if (modal) modal.hidden = true;
    seccaoAtivaTamanhoId = null;
  }

  /* ---------------- ATALHOS DE TECLADO ---------------- */
  function configurarAtalhosTeclado() {
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        salvarNoServidor();
      }
      if (e.key === 'Escape') {
        fecharBalaoTexto();
        fecharModalFoto();
        fecharModalOrdemSec();
        fecharModalTamanhoSec();
        fecharModalTemplates();
      }
    });
  }

  /* ---------------- MODAL DE TEMPLATES (ATÉ 4) ---------------- */
  function criarModalTemplates() {
    var modal = document.createElement('div');
    modal.id = 'edModalTemplates';
    modal.className = 'ed-modal-container';
    modal.hidden = true;
    modal.style.maxWidth = '640px';
    modal.innerHTML = [
      '<div class="ed-modal-topo">',
      '  <div class="ed-modal-titulo">🎨 Templates Salvos (Até 4)</div>',
      '  <button type="button" class="ed-btn-fechar" id="edBtnFecharModalTemplates">✕</button>',
      '</div>',
      '<div class="ed-modal-corpo">',
      '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">',
      '    <div>',
      '      <span id="edBadgeContadorTpl" style="background:#c8a45d; color:#111; font-weight:700; padding:3px 9px; border-radius:12px; font-size:12px;">0 / 4</span>',
      '      <span style="font-size:12.5px; color:#aaa; margin-left:8px;">Pode guardar até 4 versões completas do site.</span>',
      '    </div>',
      '    <button type="button" class="ed-btn ed-btn-primario" id="edBtnSalvarNovoTplEditor" style="background:var(--ed-gold); color:#111; border:none; padding:7px 14px; border-radius:8px; font-weight:700; cursor:pointer;">',
      '      ➕ Guardar Estado Atual',
      '    </button>',
      '  </div>',
      '  <div id="edListaTemplatesCorpo" style="display:flex; flex-direction:column; gap:10px; max-height:420px; overflow-y:auto;">',
      '    <p style="color:#888; font-size:13px; text-align:center; padding:20px 0;">A carregar templates…</p>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    document.getElementById('edBtnFecharModalTemplates').addEventListener('click', fecharModalTemplates);

    document.getElementById('edBtnSalvarNovoTplEditor').addEventListener('click', function () {
      salvarNovoTemplateNoEditor();
    });
  }

  function abrirModalTemplates() {
    var backdrop = document.getElementById('edModalBackdrop');
    var modal = document.getElementById('edModalTemplates');
    if (backdrop) backdrop.hidden = false;
    if (modal) modal.hidden = false;
    carregarTemplatesNoEditor();
  }

  function fecharModalTemplates() {
    var backdrop = document.getElementById('edModalBackdrop');
    var modal = document.getElementById('edModalTemplates');
    if (backdrop) backdrop.hidden = true;
    if (modal) modal.hidden = true;
  }

  function carregarTemplatesNoEditor() {
    var container = document.getElementById('edListaTemplatesCorpo');
    if (!container) return;

    fetch('/api/pub/templates-landing')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var tpls = (res && res.templates) || [];
        var badge = document.getElementById('edBadgeContadorTpl');
        if (badge) badge.textContent = tpls.length + ' / 4';

        var btnSalvar = document.getElementById('edBtnSalvarNovoTplEditor');
        if (btnSalvar) btnSalvar.disabled = tpls.length >= 4;

        if (!tpls.length) {
          container.innerHTML = '<p style="color:#888; font-size:13px; text-align:center; padding:20px 0;">Nenhum template guardado. Clique em "➕ Guardar Estado Atual" para guardar a sua primeira versão!</p>';
          return;
        }

        container.innerHTML = tpls.map(function (t, i) {
          var dataFormatada = t.criadoEm ? new Date(t.criadoEm).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
          var numTextos = t.estado && t.estado.textos ? Object.keys(t.estado.textos).length : 0;
          return [
            '<div style="background:#16161d; border:1px solid ' + (t.ativo ? 'var(--ed-gold)' : '#2a2a35') + '; border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">',
            '  <div>',
            '    <div style="font-weight:700; color:#fff; font-size:14px; display:flex; align-items:center; gap:8px;">',
            '      ' + (t.nome || ('Template ' + (i + 1))),
            (t.ativo ? '      <span style="background:#e6f6ec; color:#1f7a41; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">⭐ ATIVO NO SITE</span>' : ''),
            '    </div>',
            '    <div style="font-size:11.5px; color:#888; margin-top:3px;">Salvo em ' + dataFormatada + ' · ' + (numTextos ? numTextos + ' textos alterados' : 'design padrão') + '</div>',
            '  </div>',
            '  <div style="display:flex; gap:6px; align-items:center;">',
            '    <button type="button" class="ed-btn" data-act="aplicar-tpl" data-id="' + t.id + '" style="background:var(--ed-gold); color:#111; font-weight:700; border:none; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer;">' + (t.ativo ? '✓ Ativo no Site' : '🚀 Usar no Site') + '</button>',
            '    <button type="button" class="ed-btn" data-act="carregar-tpl" data-id="' + t.id + '" style="background:#2a2a35; color:#fff; border:none; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;">👁️ Ver</button>',
            '    <button type="button" class="ed-btn" data-act="eliminar-tpl" data-id="' + t.id + '" style="background:transparent; color:#e11d3b; border:1px solid rgba(225,29,59,0.3); padding:6px 8px; border-radius:6px; font-size:12px; cursor:pointer;">🗑️</button>',
            '  </div>',
            '</div>'
          ].join('');
        }).join('');

        container.querySelectorAll('[data-act="aplicar-tpl"]').forEach(function (b) {
          b.addEventListener('click', function () {
            efetivarTemplateNoEditor(this.getAttribute('data-id'));
          });
        });
        container.querySelectorAll('[data-act="carregar-tpl"]').forEach(function (b) {
          b.addEventListener('click', function () {
            carregarPreviaTemplateNoEditor(this.getAttribute('data-id'), tpls);
          });
        });
        container.querySelectorAll('[data-act="eliminar-tpl"]').forEach(function (b) {
          b.addEventListener('click', function () {
            eliminarTemplateNoEditor(this.getAttribute('data-id'));
          });
        });
      })
      .catch(function (e) {
        container.innerHTML = '<p style="color:#e11d3b; font-size:13px; text-align:center;">Erro ao carregar templates: ' + e.message + '</p>';
      });
  }

  function salvarNovoTemplateNoEditor() {
    var agora = new Date();
    var sugestao = 'Template · ' + agora.toLocaleDateString('pt-PT') + ' ' + agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    var nome = prompt('Nome do novo template:', sugestao);
    if (!nome) return;

    var ativarImediatamente = confirm('Deseja ativar este template imediatamente como a página principal do site?');

    fetch('/api/pub/templates-landing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: nome.trim() || sugestao,
        estado: estado,
        ativarImediatamente: ativarImediatamente
      })
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (err) { throw new Error(err.erro || 'Erro ao gravar'); });
        return r.json();
      })
      .then(function () {
        mostrarToast('✓ Template guardado com sucesso!' + (ativarImediatamente ? ' Efetivado no site.' : ''));
        if (ativarImediatamente && canalSync) {
          canalSync.postMessage({ tipo: 'landing_atualizada', estado: estado });
        }
        carregarTemplatesNoEditor();
      })
      .catch(function (e) {
        alert(e.message);
      });
  }

  function efetivarTemplateNoEditor(id) {
    fetch('/api/pub/templates-landing/' + encodeURIComponent(id) + '/aplicar', {
      method: 'POST'
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.estado) {
          window.__ESTADO_LANDING = res.estado;
          carregarEstado();
          aplicarEstado();
          guardarEstado(true);
          if (canalSync) canalSync.postMessage({ tipo: 'landing_atualizada', estado: res.estado });
        }
        mostrarToast('✓ Template ativado com sucesso! As alterações já estão a refletir no site principal.');
        fecharModalTemplates();
      })
      .catch(function (e) {
        alert('Erro ao ativar template: ' + e.message);
      });
  }

  function carregarPreviaTemplateNoEditor(id, lista) {
    var t = lista.find(function (x) { return x.id === id; });
    if (!t || !t.estado) return;
    window.__ESTADO_LANDING = t.estado;
    carregarEstado();
    aplicarEstado();
    guardarEstado(true);
    mostrarToast('👁️ Template “' + t.nome + '” carregado no editor para edição.');
    fecharModalTemplates();
  }

  function eliminarTemplateNoEditor(id) {
    if (!confirm('Deseja eliminar este template?')) return;
    fetch('/api/pub/templates-landing/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .then(function () {
        mostrarToast('✓ Template eliminado com sucesso.');
        carregarTemplatesNoEditor();
      })
      .catch(function (e) {
        alert('Erro ao eliminar template: ' + e.message);
      });
  }

  /* ---------------- COMUNICAÇÃO EXTERNA (PAINEL) ---------------- */
  function configurarComunicacao() {
    window.addEventListener('message', function (ev) {
      var d = ev.data;
      if (!d || typeof d !== 'object') return;

      if (d.tipo === 'pedir_estado') {
        window.parent.postMessage({ tipo: 'resposta_estado', estado: estado }, '*');
      }

      if (d.tipo === 'guardar_tudo') {
        salvarNoServidor();
      }

      if (d.tipo === 'modo_dispositivo' && d.modo) {
        ativarVisaoDispositivo(d.modo);
      }
    });
  }

  function mostrarToast(msg) {
    var antigo = document.querySelector('.ed-toast');
    if (antigo) antigo.remove();

    var toast = document.createElement('div');
    toast.className = 'ed-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode) toast.remove();
    }, 3200);
  }

  /* ============================================================
     5. INICIALIZAÇÃO RESILIENTE (DESKTOP, CELULAR & SITE PÚBLICO)
     ============================================================ */

  function buscarEstadoServidorSeNecessario() {
    if (!window.__ESTADO_LANDING) {
      fetch('/api/pub/landing')
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.estado && typeof res.estado === 'object' && Object.keys(res.estado).length > 0) {
            window.__ESTADO_LANDING = res.estado;
            carregarEstado();
            aplicarEstado();
          }
        })
        .catch(function () {});
    }
  }

  identificarElementosTexto();
  carregarEstado();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      identificarElementosTexto();
      aplicarEstado();
      buscarEstadoServidorSeNecessario();
      if (isEditor) inicializarModoEditor();
    });
  } else {
    identificarElementosTexto();
    aplicarEstado();
    buscarEstadoServidorSeNecessario();
    if (isEditor) inicializarModoEditor();
  }

  window.addEventListener('load', function () {
    identificarElementosTexto();
    aplicarEstado();
  });

})();
