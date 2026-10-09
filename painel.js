/* ============================================================
   BACKOFFICE — Seleção, Contactos e Landing page
   ============================================================ */

(function () {
  'use strict';

  var CHAVE_SESSAO = 'elly_sessao';
  var CHAVE_LANDING = 'elly_pagina_editada_v1';

  /* ---------------- sessão ---------------- */

  var sessao = null;
  try { sessao = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null'); } catch (e) {}
  if (!sessao || !sessao.token) { location.replace('/login'); return; }

  var quem = document.getElementById('quem');
  if (quem) quem.textContent = sessao.utilizador || 'convidado';

  document.getElementById('sair').addEventListener('click', function () {
    try { localStorage.removeItem(CHAVE_SESSAO); } catch (e) {}
    location.href = '/login';
  });

  function api(caminho, opcoes) {
    var o = opcoes || {};
    o.headers = Object.assign({ 'Authorization': 'Bearer ' + sessao.token }, o.headers || {});
    if (o.body && typeof o.body !== 'string') {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(o.body);
    }
    return fetch('/api' + caminho, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401) {
          try { localStorage.removeItem(CHAVE_SESSAO); } catch (e) {}
          location.replace('/login');
          throw new Error('sessão');
        }
        if (!r.ok) throw new Error(d.erro || 'Falhou');
        return d;
      });
    });
  }

  /* ---------------- utilidades ---------------- */

  /* ---------------- avisos e perguntas dentro do site ---------------- */

  function el(id) { return document.getElementById(id); }
  function toast(msg, tipo) {
    var caixa = el('toasts');
    if (!caixa) { try { alert(msg); } catch (e) {} return; }
    var t = document.createElement('div');
    t.className = 'toast ' + (tipo || 'info');
    var s = document.createElement('span');
    s.textContent = msg;
    var x = document.createElement('button');
    x.type = 'button';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Fechar aviso');
    x.onclick = function () { if (t.parentNode) t.parentNode.removeChild(t); };
    t.appendChild(s);
    t.appendChild(x);
    caixa.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5000);
  }

  var modalResolver = null;
  function fecharModal(valor) {
    el('modal').hidden = true;
    el('fundoModal').hidden = true;
    document.body.style.overflow = '';
    var r = modalResolver;
    modalResolver = null;
    if (r) r(valor);
  }

  function abrirModal(op) {
    var o = op || {};
    el('modalTitulo').textContent = o.titulo || 'Confirmar';
    el('modalTexto').textContent = o.texto || '';
    var wrap = el('modalCampoWrap');
    var campo = el('modalCampo');
    var temCampo = !!o.campo;
    wrap.hidden = !temCampo;
    if (temCampo) {
      campo.value = o.valorInicial || '';
      campo.placeholder = o.placeholder || '';
      campo.type = o.tipoCampo || 'text';
      if (o.inputMode) campo.inputMode = o.inputMode; else campo.removeAttribute('inputmode');
    }
    var ok = el('modalOk');
    ok.textContent = o.ok || 'Confirmar';
    ok.classList.toggle('perigo', !!o.perigo);
    el('modalCancelar').textContent = o.cancelar || 'Cancelar';
    el('fundoModal').hidden = false;
    el('modal').hidden = false;
    document.body.style.overflow = 'hidden';
    return new Promise(function (res) {
      modalResolver = res;
      if (temCampo) setTimeout(function () { campo.focus(); campo.select(); }, 60);
    });
  }

  if (el('modalCancelar')) el('modalCancelar').addEventListener('click', function () { fecharModal(false); });
  if (el('fundoModal')) el('fundoModal').addEventListener('click', function () { fecharModal(false); });
  if (el('modalOk')) el('modalOk').addEventListener('click', function () {
    var wrap = el('modalCampoWrap');
    if (wrap && !wrap.hidden) fecharModal(el('modalCampo').value);
    else fecharModal(true);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && modalResolver) fecharModal(false);
    if (ev.key === 'Enter' && modalResolver && el('modal') && !el('modal').hidden) {
      ev.preventDefault();
      el('modalOk').click();
    }
  });

  /* pergunta sim/não → Promise<boolean> */
  function confirmar(titulo, texto, okTxt, perigo) {
    return abrirModal({ titulo: titulo, texto: texto, ok: okTxt || 'Confirmar', perigo: perigo });
  }

  /* pede um valor em texto → Promise<string|null> (null = cancelou) */
  function perguntar(titulo, texto, valorInicial, okTxt) {
    return abrirModal({ titulo: titulo, texto: texto, campo: true, valorInicial: valorInicial, ok: okTxt || 'Guardar' })
      .then(function (v) {
        if (v === false) return null;
        return v;
      });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* nome da galeria, seguro para o nome de um ficheiro do sistema */
  function nomeFicheiro(texto, reserva) {
    var n = String(texto == null ? '' : texto)
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '')
      .slice(0, 100)
      .replace(/[. ]+$/, '');
    return n || String(reserva || 'selecao');
  }
  function dataCurta(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('pt-PT'); } catch (e) { return '—'; }
  }
  function tempoRestanteExpira(iso) {
    if (!iso) return 'sem prazo';
    var t = Date.parse(iso);
    if (isNaN(t)) return 'sem prazo';
    var agora = Date.now();
    var difMs = t - agora;
    if (difMs <= 0) {
      var difPassado = Math.abs(difMs);
      var horasPassadas = Math.floor(difPassado / (1000 * 60 * 60));
      var diasPassados = Math.floor(difPassado / (1000 * 60 * 60 * 24));
      if (diasPassados <= 0) {
        if (horasPassadas <= 0) return 'expirou há minutos';
        return 'expirou há ' + horasPassadas + (horasPassadas === 1 ? ' hora' : ' horas');
      }
      if (diasPassados === 1) return 'expirou ontem';
      if (diasPassados < 30) return 'expirou há ' + diasPassados + ' dias';
      var mesesPassados = Math.floor(diasPassados / 30);
      return 'expirou há ' + mesesPassados + (mesesPassados === 1 ? ' mês' : ' meses');
    }
    var minutos = Math.floor(difMs / (1000 * 60));
    var horas = Math.floor(difMs / (1000 * 60 * 60));
    var dias = Math.floor(difMs / (1000 * 60 * 60 * 24));
    if (horas < 1) return 'expira em ' + Math.max(1, minutos) + ' min';
    if (dias < 1) return 'expira em ' + horas + (horas === 1 ? ' hora' : ' horas');
    if (dias === 1) return 'expira em 1 dia';
    if (dias < 30) return 'expira em ' + dias + ' dias';
    var meses = Math.floor(dias / 30);
    if (meses === 1) return 'expira em 1 mês';
    if (meses < 12) return 'expira em ' + meses + ' meses';
    var anos = Math.floor(dias / 365);
    return 'expira em ' + (anos === 1 ? '1 ano' : anos + ' anos');
  }
  function numeroWa(n) {
    var d = String(n || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 9) d = '244' + d;
    return d;
  }
  function linkWa(numero, texto) {
    var n = numeroWa(numero);
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(texto);
  }
  function lerFicheiro(f) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = rej;
      fr.readAsDataURL(f);
    });
  }

  /* ---------------- abas ---------------- */

  var abas = document.querySelectorAll('.aba');
  abas.forEach(function (b) {
    b.addEventListener('click', function () {
      abas.forEach(function (x) { x.classList.toggle('on', x === b); });
      ['selecao', 'contactos', 'landing'].forEach(function (n) {
        el('aba-' + n).hidden = (n !== b.dataset.aba);
      });
      if (b.dataset.aba === 'contactos') carregarContactos();
      if (b.dataset.aba === 'landing') abrirLanding();
    });
  });

  /* ================= SELEÇÃO ================= */

  var galerias = [];

  function carregarGalerias() {
    return api('/galerias').then(function (lista) {
      galerias = lista;
      desenharGalerias();
    });
  }

  function estadoDe(g) {
    if (g.selecao && g.selecao.finalizada) return { t: 'Concluída', c: 'e-concluida' };
    if (g.selecao && g.selecao.fotos && g.selecao.fotos.length) {
      return { t: 'Em seleção · ' + g.selecao.fotos.length, c: 'e-seleccao' };
    }
    if (!g.fotos.length) return { t: 'Sem fotos', c: 'e-vazia' };
    if (!g.privada) return { t: 'Por enviar', c: 'e-aguardar' };
    return { t: 'A aguardar cliente', c: 'e-aguardar' };
  }

  function copiarTexto(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(txt).catch(function () {
        fallbackCopiar(txt);
      });
    }
    fallbackCopiar(txt);
  }
  function fallbackCopiar(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function desenharGalerias() {
    var alvo = el('listaGalerias');
    el('galeriasVazias').hidden = galerias.length > 0;
    alvo.innerHTML = galerias.map(function (g) {
      var capa = g.capa ? 'style="background-image:url(' + esc(g.capa) + ')"' : '';
      var est = estadoDe(g);
      var expirou = g.expiraEm && Date.parse(g.expiraEm) < Date.now();
      var tempoExpira = tempoRestanteExpira(g.expiraEm);

      var iconeCadeado = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
      var iconeGlobo = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
      var selo = g.privada
        ? '<span class="selo privada">' + iconeCadeado + ' Privada</span>'
        : '<span class="selo publica">' + iconeGlobo + ' Pública</span>';

      var link = location.origin + '/g/' + g.slug;
      var senha = g.senha || (g.cliente && g.cliente.senha) || 'ellyfotografo';
      var msg = g.cliente
        ? 'Olá ' + g.cliente.nome + '! A tua galeria de seleção já está pronta:\n' +
          link + '\n\n📱 WhatsApp: ' + (g.cliente.whatsapp || '') +
          '\n🔑 Palavra-passe: ' + senha +
          '\n⏳ ' + (expirou ? 'Expirou (' + tempoExpira + ')' : 'Disponível: ' + tempoExpira) + '.'
        : 'Galeria de seleção:\n' + link +
          '\n🔑 Palavra-passe: ' + senha +
          '\n⏳ ' + (expirou ? 'Expirou (' + tempoExpira + ')' : 'Disponível: ' + tempoExpira) + '.';
      var podeEnviar = !!(g.cliente && g.cliente.whatsapp);

      var iconeOlhoPequeno = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      var iconeCopiar = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
      var iconeOlho = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      var iconeLapis = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
      var iconeWhats = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm5.78 14.07c-.24.68-1.39 1.3-1.92 1.37-.5.07-1.14.1-3.32-.8-2.79-1.15-4.58-3.99-4.72-4.17-.14-.18-1.13-1.5-1.13-2.87 0-1.36.71-2.03.96-2.31.25-.28.56-.35.75-.35.19 0 .37 0 .53.01.17.01.4.06.61.57.24.57.8 1.95.87 2.09.07.14.12.31.02.5-.09.19-.14.3-.28.46-.14.16-.3.35-.43.47-.14.14-.29.3-.12.59.16.28.73 1.21 1.57 1.95 1.08.96 1.98 1.26 2.27 1.4.28.14.45.12.62-.07.17-.19.73-.85.92-1.14.19-.28.38-.24.64-.14.26.09 1.65.78 1.93.92.28.14.47.21.54.33.07.12.07.7-.17 1.38z"/></svg>';
      var iconeRaio = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>';
      var iconeLixo = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

      return '' +
        '<article class="cartao ' + (expirou ? 'cartao-expirada' : '') + '" data-detalhe="' + esc(g.id) + '">' +
          '<div class="capa" ' + capa + '>' +
            (g.capa ? '' : '<span class="capa-letra">' + esc(g.nome.charAt(0).toUpperCase()) + '</span>') +
            '<span class="btn-ver-detalhes" data-detalhe="' + esc(g.id) + '">' + iconeOlhoPequeno + ' <span>Ver detalhes</span></span>' +
          '</div>' +
          '<div class="corpo">' +
            '<div class="linha-topo">' +
              '<button class="titulo" type="button" data-detalhe="' + esc(g.id) + '" title="' + esc(g.nome) + '">' + esc(g.nome) + '</button>' +
              '<span class="estado ' + (expirou ? 'e-vazia expirada' : est.c) + '">' +
                '<span class="ponto-status" aria-hidden="true"></span>' +
                '<span>' + (expirou ? 'Expirada' : esc(est.t)) + '</span>' +
              '</span>' +
            '</div>' +
            '<div class="linha-meta">' +
              '<span class="meta">' + g.fotos.length + ' fotos · ' + (expirou ? '<b class="txt-expirou">' + tempoExpira + '</b>' : tempoExpira) + '</span>' +
            '</div>' +
            '<div class="linha-privacidade">' +
              selo +
            '</div>' +
            '<div class="fila acoes-icones">' +
              '<button type="button" class="btn-icone btn-copiar-dados" data-copiar="' + esc(g.id) + '" title="Copiar link e dados de acesso" aria-label="Copiar link e dados de acesso">' + iconeCopiar + '</button>' +
              '<a class="btn-icone btn-ver" href="/g/' + g.slug + '?equipa=1" target="_blank" rel="noopener" title="Ver galeria como cliente" aria-label="Ver galeria como cliente">' + iconeOlho + '</a>' +
              '<button type="button" class="btn-icone btn-editar" data-editar="' + esc(g.id) + '" title="Editar galeria" aria-label="Editar galeria">' + iconeLapis + '</button>' +
              (podeEnviar
                ? '<a class="btn-icone btn-whats" target="_blank" rel="noopener" href="' + esc(linkWa(g.cliente.whatsapp, msg)) + '" title="Enviar dados no WhatsApp" aria-label="Enviar dados no WhatsApp">' + iconeWhats + '</a>'
                : '') +
              (expirou
                ? '<button type="button" class="btn-icone btn-reativar-rapido" data-reativar="' + esc(g.id) + '" title="⚡ Reativar galeria expirada" aria-label="Reativar galeria">' + iconeRaio + '</button>'
                : '') +
              '<button type="button" class="btn-icone btn-apagar perigo" data-apagar="' + esc(g.id) + '" title="Eliminar galeria" aria-label="Eliminar galeria">' + iconeLixo + '</button>' +
            '</div>' +
          '</div>' +
        '</article>';
    }).join('');
  }

  /* a lista fica em memória: antes de abrir, busca a galeria actualizada
     (senão a edição não vê as fotografias entretanto carregadas) */
  function galeriaFresca(id, abridor) {
    api('/galerias/' + encodeURIComponent(id)).then(abridor).catch(function () {
      var g = galerias.find(function (x) { return x.id === id; });
      if (g) abridor(g);
    });
  }

  el('listaGalerias').addEventListener('click', function (ev) {
    /* primeiro os controlos do cartão: editar/apagar/título, ou links normais */
    var controlo = ev.target.closest('button, a[href]');
    if (controlo) {
      if (controlo.hasAttribute('data-copiar')) {
        ev.stopPropagation();
        var gId = controlo.dataset.copiar;
        var gAlvo = galerias.find(function (x) { return x.id === gId; });
        if (!gAlvo) return;
        var linkAcesso = location.origin + '/g/' + gAlvo.slug;
        var senhaAcesso = gAlvo.senha || (gAlvo.cliente && gAlvo.cliente.senha) || 'ellyfotografo';
        var textoCopiar = [
          '📸 *Galeria de Seleção · Elly Fotógrafo*',
          'Galeria: ' + gAlvo.nome,
          (gAlvo.cliente && gAlvo.cliente.nome ? '👤 Cliente: ' + gAlvo.cliente.nome : ''),
          (gAlvo.cliente && gAlvo.cliente.whatsapp ? '📱 WhatsApp: ' + gAlvo.cliente.whatsapp : ''),
          '🔗 Link: ' + linkAcesso,
          '🔑 Palavra-passe: ' + senhaAcesso,
          '⏳ ' + (Date.parse(gAlvo.expiraEm) < Date.now() ? 'Expirou (' + tempoRestanteExpira(gAlvo.expiraEm) + ')' : 'Disponível: ' + tempoRestanteExpira(gAlvo.expiraEm) + ' (até ' + dataCurta(gAlvo.expiraEm) + ')')
        ].filter(Boolean).join('\n');

        copiarTexto(textoCopiar);
        var txtAntigo = controlo.innerHTML;
        var iconeCheck = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        controlo.innerHTML = iconeCheck;
        controlo.classList.add('copiado-sucesso');
        controlo.setAttribute('title', '✓ Dados de acesso copiados!');
        setTimeout(function () {
          controlo.innerHTML = txtAntigo;
          controlo.classList.remove('copiado-sucesso');
          controlo.setAttribute('title', 'Copiar link e dados de acesso');
        }, 2200);
        return;
      }
      if (controlo.hasAttribute('data-reativar')) {
        ev.stopPropagation();
        var gId = controlo.dataset.reativar;
        var gAlvo = galerias.find(function (x) { return x.id === gId; });
        if (!gAlvo) return;
        reativarGaleriaPrompt(gAlvo);
        return;
      }
      if (controlo.hasAttribute('data-apagar')) {
        var g = galerias.find(function (x) { return x.id === controlo.dataset.apagar; });
        if (!g) return;
        confirmar('Apagar galeria?', '«' + g.nome + '» será apagada definitivamente, incluindo as fotografias.', 'Apagar', true)
          .then(function (ok) {
            if (!ok) return null;
            return api('/galerias/' + encodeURIComponent(g.id), { method: 'DELETE' })
              .then(carregarGalerias);
          })
          .catch(function (e) { toast(e.message, 'erro'); });
        return;
      }
      if (controlo.hasAttribute('data-editar')) {
        galeriaFresca(controlo.dataset.editar, abrirAssistente);
        return;
      }
      if (controlo.hasAttribute('data-detalhe')) {
        galeriaFresca(controlo.dataset.detalhe, abrirDetalhe);
        return;
      }
      return; /* "Ver como cliente" / WhatsApp: comportamento do próprio link */
    }

    /* resto do cartão (capa, metadados, espaços vazios) → detalhe */
    var cartao = ev.target.closest('[data-detalhe]');
    if (cartao) galeriaFresca(cartao.dataset.detalhe, abrirDetalhe);
  });

  /* ---------------- assistente ---------------- */

  var ast = el('assistente');
  var fundo = el('fundo');
  var actual = novoActual();

  function novoActual() {
    return {
      passo: 1, editando: false, id: null, slug: null, expiraEm: null,
      capa: null, existentes: [], fotos: [], cliente: null, ordemFotos: 'captura'
    };
  }

  function mostrarPasso(n) {
    actual.passo = n;
    ast.classList.toggle('editando', !!actual.editando);
    ast.querySelectorAll('.ast-corpo').forEach(function (s) {
      s.hidden = Number(s.dataset.passo) !== n;
    });
    ast.querySelectorAll('.passos li').forEach(function (li) {
      li.classList.toggle('on', Number(li.dataset.p) === n);
    });
    el('astVoltar').hidden = n === 1;
    el('astSeguinte').textContent = n === 4 ? 'Concluir' : 'Continuar';
    el('astTitulo').textContent = actual.editando
      ? 'Editar galeria' : 'Nova galeria';
  }

  /* a editar, os passos são clicáveis: salta direto ao campo, gravando o
     passo atual antes de mudar (na criação segue-se a sequência normal) */
  ast.querySelectorAll('.passos li').forEach(function (li) {
    li.addEventListener('click', function () {
      var n = Number(li.dataset.p);
      if (!n || n === actual.passo || !actual.editando) return;
      if (!validarPasso()) return;
      el('astSeguinte').disabled = true;
      Promise.resolve()
        .then(function () { return trabalharPasso(); })
        .then(function () {
          el('astSeguinte').disabled = false;
          mostrarPasso(n);
          if (n === 4) preencherResumo();
        })
        .catch(function (e) {
          el('astSeguinte').disabled = false;
          toast(e && e.message ? e.message : 'Não consegui gravar.', 'erro');
        });
    });
  });

  function abrirAssistente(g) {
    actual = novoActual();
    actual.editando = !!g;
    actual.id = g ? g.id : null;
    actual.slug = g ? g.slug : null;
    actual.expiraEm = g ? g.expiraEm : null;
    actual.existentes = g ? (g.fotos || []) : [];
    actual.cliente = g ? g.cliente : null;
    actual.ordemFotos = (g && g.ordemFotos) || 'captura';

    el('gNome').value = g ? g.nome : '';
    el('gDias').value = g ? String(g.dias || 30) : '30';
    el('gCapa').value = '';
    el('capaPrev').hidden = !(g && g.capa);
    if (g && g.capa) el('capaPrev').querySelector('img').src = g.capa;

    el('gFotos').value = '';
    desenharMiniaturas();

    var privada = !!(g && g.privada);
    document.querySelector('input[name="acesso"][value="' +
      (privada ? 'privada' : 'publica') + '"]').checked = true;
    el('formCliente').hidden = !privada;
    el('cNome').value = (g && g.cliente && g.cliente.nome) || '';
    el('cWhats').value = (g && g.cliente && g.cliente.whatsapp) || '';
    el('cFotos').value = (g && g.cliente && g.cliente.fotosContratadas) || '';
    el('cExtra').value = (g && g.cliente && g.cliente.precoExtra) || '';
    if (el('cSenha')) el('cSenha').value = (g && g.senha) || (g && g.cliente && g.cliente.senha) || 'ellyfotografo';

    fundo.hidden = false;
    ast.hidden = false;
    mostrarPasso(1);
  }

  function fecharAssistente() {
    fundo.hidden = true;
    ast.hidden = true;
  }

  el('novaGaleria').addEventListener('click', function () { abrirAssistente(null); });
  el('astFechar').addEventListener('click', function () {
    if (actual.passo <= 1) { fecharAssistente(); return; }
    confirmar('Fechar sem concluir?', 'Vais perder o que ainda falta neste assistente.', 'Fechar', true)
      .then(function (ok) { if (ok) fecharAssistente(); });
  });

  /* Função auxiliar para animar e processar a foto com progresso, desfoque (unblur) e leve compressão mantendo orientação original */
  function animarLerEProcessarFoto(ficheiro, callbackProgresso) {
    var blobUrl = URL.createObjectURL(ficheiro);
    var p = 0.08;
    callbackProgresso(p, blobUrl, false);

    // Incrementa progresso suavemente enquanto comprime a imagem no cliente
    var stepTimer = setInterval(function () {
      if (p < 0.85) {
        p += 0.08;
        callbackProgresso(p, blobUrl, false);
      }
    }, 40);

    function finalizarComBase64(compressedBase64) {
      clearInterval(stepTimer);
      var finalP = 0.88;
      var finTimer = setInterval(function () {
        finalP += 0.04;
        if (finalP >= 1) {
          finalP = 1;
          clearInterval(finTimer);
          try { URL.revokeObjectURL(blobUrl); } catch (err) {}
          callbackProgresso(1, compressedBase64, true);
        } else {
          callbackProgresso(finalP, blobUrl, false);
        }
      }, 30);
    }

    if (window.createImageBitmap) {
      createImageBitmap(ficheiro, { imageOrientation: 'from-image' }).then(function (bmp) {
        var canvas = document.createElement('canvas');
        var maxDim = 2200;
        var width = bmp.width;
        var height = bmp.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0, width, height);
        bmp.close();

        var compressedBase64 = canvas.toDataURL('image/jpeg', 0.84);
        finalizarComBase64(compressedBase64);
      }).catch(function () {
        fallbackReader();
      });
    } else {
      fallbackReader();
    }

    function fallbackReader() {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var maxDim = 2200;
          var width = img.width;
          var height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          var compressedBase64 = canvas.toDataURL('image/jpeg', 0.84);
          finalizarComBase64(compressedBase64);
        };
        img.onerror = function () {
          clearInterval(stepTimer);
          callbackProgresso(1, e.target.result, true);
        };
        img.src = e.target.result;
      };
      reader.onerror = function () {
        clearInterval(stepTimer);
        toast('Erro ao processar a fotografia ' + ficheiro.name, 'erro');
      };
      reader.readAsDataURL(ficheiro);
    }
  }

  /* passo 1 → capa com animação de progresso e unblur */
  el('gCapa').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) { el('capaPrev').hidden = true; return; }

    var prevContainer = el('capaPrev');
    prevContainer.hidden = false;
    prevContainer.innerHTML = [
      '<div class="u-item-upload u-carregando" id="uCapaItem" style="height: 160px; max-width: 220px;">',
      '  <img src="" alt="Capa" id="uCapaImg">',
      '  <div class="u-prog-overlay">',
      '    <span class="u-prog-num" id="uCapaProgTxt">0%</span>',
      '    <div class="u-prog-bar-wrap"><div class="u-prog-bar-fill" id="uCapaBarFill" style="width:0%"></div></div>',
      '  </div>',
      '</div>'
    ].join('');

    animarLerEProcessarFoto(f, function (prog, srcUrl, concluido) {
      var itemEl = el('uCapaItem');
      var imgEl = el('uCapaImg');
      var txtEl = el('uCapaProgTxt');
      var barEl = el('uCapaBarFill');

      if (imgEl && srcUrl) {
        if (!imgEl.src || concluido) imgEl.src = srcUrl;
        imgEl.style.filter = 'blur(' + Math.max(0, (1 - prog) * 16).toFixed(1) + 'px)';
        imgEl.style.opacity = (0.28 + 0.72 * prog).toFixed(2);
      }
      if (itemEl) itemEl.style.setProperty('--u-prog', prog);
      if (txtEl) txtEl.textContent = Math.round(prog * 100) + '%';
      if (barEl) barEl.style.width = Math.round(prog * 100) + '%';

      if (prog >= 1) {
        if (itemEl) {
          itemEl.classList.remove('u-carregando');
          itemEl.classList.add('u-concluido');
        }
        if (txtEl) txtEl.innerHTML = '<span class="u-prog-sucesso">✓ Concluído</span>';
        actual.capa = srcUrl;
      }
    });
  });

  /* Extrai metadados EXIF do ficheiro de fotografia antes ou durante o upload */
  function extrairMetaFicheiro(file) {
    var pExif = (window.exifr && window.exifr.parse)
      ? window.exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'Make', 'Model'])
          .catch(function () { return null; })
      : Promise.resolve(null);

    return pExif.then(function (exif) {
      var dataCaptura = null;
      var horaFormatada = null;
      var camera = null;
      var timestamp = null;

      if (exif) {
        var dt = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
        if (dt instanceof Date && !isNaN(dt.getTime())) {
          dataCaptura = dt.toISOString();
          timestamp = dt.getTime();
          var pad = function (n) { return (n < 10 ? '0' : '') + n; };
          horaFormatada = pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':' + pad(dt.getSeconds());
        }
        var parts = [exif.Make, exif.Model].filter(Boolean);
        if (parts.length) {
          camera = parts.join(' ').replace(/\s+/g, ' ').trim();
        }
      }

      // Se não houver EXIF explícito, usa a data do arquivo (gravada pela câmera no cartão)
      if (!timestamp) {
        var lm = file.lastModified;
        if (lm) {
          timestamp = lm;
          var d = new Date(lm);
          var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
          horaFormatada = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
          dataCaptura = d.toISOString();
        }
      }

      return {
        nome: file.name,
        dataCaptura: dataCaptura,
        horaFormatada: horaFormatada,
        camera: camera,
        timestamp: timestamp || Date.now()
      };
    });
  }

  function ordenarFotosActual(criterio) {
    actual.ordemFotos = criterio;
    if (criterio === 'captura') {
      actual.fotos.sort(function (a, b) {
        var ta = Number(a.timestamp) || 0;
        var tb = Number(b.timestamp) || 0;
        if (ta !== tb) return ta - tb;
        return (a.nome || '').localeCompare(b.nome || '', undefined, { numeric: true });
      });
    } else if (criterio === 'captura_desc') {
      actual.fotos.sort(function (a, b) {
        var ta = Number(a.timestamp) || 0;
        var tb = Number(b.timestamp) || 0;
        if (ta !== tb) return tb - ta;
        return (b.nome || '').localeCompare(a.nome || '', undefined, { numeric: true });
      });
    } else if (criterio === 'nome') {
      actual.fotos.sort(function (a, b) {
        return (a.nome || '').localeCompare(b.nome || '', undefined, { numeric: true });
      });
    } else if (criterio === 'nome_desc') {
      actual.fotos.sort(function (a, b) {
        return (b.nome || '').localeCompare(a.nome || '', undefined, { numeric: true });
      });
    }
    atualizarBotoesOrdemUI();
    desenharMiniaturas();
  }

  function atualizarBotoesOrdemUI() {
    var c = actual.ordemFotos || 'captura';
    if (el('btnOrdemCaptura')) el('btnOrdemCaptura').classList.toggle('on', c === 'captura');
    if (el('btnOrdemNome')) el('btnOrdemNome').classList.toggle('on', c === 'nome');
  }

  function atualizarPainelMetadados() {
    var pEl = el('painelOrdemFotos');
    if (!pEl) return;
    if (!actual.fotos.length && !actual.existentes.length) {
      pEl.hidden = true;
      return;
    }
    pEl.hidden = false;

    var cams = {};
    var comHora = 0;
    actual.fotos.forEach(function (f) {
      if (f.camera) cams[f.camera] = (cams[f.camera] || 0) + 1;
      if (f.horaFormatada) comHora++;
    });

    var listaCams = Object.keys(cams);
    var txtEl = el('txtMetaCam');
    if (txtEl) {
      if (listaCams.length > 1) {
        txtEl.textContent = listaCams.length + ' câmeras detectadas: ' + listaCams.map(function (c) { return c + ' (' + cams[c] + ')'; }).join(' · ');
      } else if (listaCams.length === 1) {
        txtEl.textContent = 'Câmera: ' + listaCams[0] + ' (' + actual.fotos.length + ' fotos)';
      } else {
        txtEl.textContent = comHora ? comHora + ' fotos com data/hora de captura detectadas' : 'Metadados prontos para organização';
      }
    }
    atualizarBotoesOrdemUI();
  }

  if (el('btnOrdemCaptura')) {
    el('btnOrdemCaptura').onclick = function () { ordenarFotosActual('captura'); };
  }
  if (el('btnOrdemNome')) {
    el('btnOrdemNome').onclick = function () { ordenarFotosActual('nome'); };
  }
  if (el('btnInverterOrdem')) {
    el('btnInverterOrdem').onclick = function () {
      var prox = (actual.ordemFotos === 'captura') ? 'captura_desc' : ((actual.ordemFotos === 'nome') ? 'nome_desc' : 'captura');
      ordenarFotosActual(prox);
    };
  }

  /* passo 2 → fotos da galeria com leitura de EXIF, metadados e animação */
  var cancelados = new Set();
  el('gFotos').addEventListener('change', function () {
    var lista = Array.prototype.slice.call(this.files || []);
    if (!lista.length) return;

    var container = el('miniaturas');

    lista.forEach(function (file, idx) {
      var idUnico = 'u_foto_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 6);

      var tempDiv = document.createElement('div');
      tempDiv.className = 'u-item-upload u-carregando';
      tempDiv.id = idUnico;
      tempDiv.innerHTML = [
        '<img src="" alt="' + esc(file.name) + '">',
        '<button type="button" class="u-remover" data-cancelar="' + idUnico + '" title="Não carregar esta fotografia" aria-label="Cancelar carregamento de ' + esc(file.name) + '">✕</button>',
        '<div class="u-prog-overlay">',
        '  <span class="u-prog-num">0%</span>',
        '  <div class="u-prog-bar-wrap"><div class="u-prog-bar-fill" style="width:0%"></div></div>',
        '</div>'
      ].join('');

      container.appendChild(tempDiv);

      var metaPromise = extrairMetaFicheiro(file);

      animarLerEProcessarFoto(file, function (prog, srcUrl, concluido) {
        var imgEl = tempDiv.querySelector('img');
        var txtEl = tempDiv.querySelector('.u-prog-num');
        var barEl = tempDiv.querySelector('.u-prog-bar-fill');

        if (imgEl && srcUrl) {
          if (!imgEl.src || concluido) imgEl.src = srcUrl;
          imgEl.style.filter = 'blur(' + Math.max(0, (1 - prog) * 16).toFixed(1) + 'px)';
          imgEl.style.opacity = (0.28 + 0.72 * prog).toFixed(2);
        }
        tempDiv.style.setProperty('--u-prog', prog);
        if (txtEl) txtEl.textContent = Math.round(prog * 100) + '%';
        if (barEl) barEl.style.width = Math.round(prog * 100) + '%';

        if (prog >= 1) {
          metaPromise.then(function (meta) {
            if (cancelados.has(idUnico)) {
              cancelados.delete(idUnico);
              return;
            }
            tempDiv.classList.remove('u-carregando');
            tempDiv.classList.add('u-concluido');
            if (txtEl) txtEl.innerHTML = '<span class="u-prog-sucesso">✓</span>';
            actual.fotos.push({
              nome: file.name,
              dados: srcUrl,
              dataCaptura: meta.dataCaptura,
              horaFormatada: meta.horaFormatada,
              camera: meta.camera,
              timestamp: meta.timestamp
            });
            ordenarFotosActual(actual.ordemFotos || 'captura');
          });
        }
      });
    });
  });

  function atualizarContagemFotos() {
    var total = actual.existentes.length + actual.fotos.length;
    var extra = actual.existentes.length ? ' · ' + actual.existentes.length + ' já na galeria' : '';
    el('contagemFotos').textContent = total + (total === 1 ? ' fotografia' : ' fotografias') + extra;
  }

  function desenharMiniaturas() {
    atualizarContagemFotos();
    atualizarPainelMetadados();
    var container = el('miniaturas');
    /* preservar cartões ainda em processamento — innerHTML abaixo os apagaria */
    var carregando = Array.prototype.slice.call(container.querySelectorAll('.u-carregando'));
    carregando.forEach(function (d) { if (d.parentNode) d.parentNode.removeChild(d); });
    container.innerHTML =
      actual.existentes.map(function (f) {
        return '<div class="u-item-upload u-concluido"><img src="' + esc(f) + '" alt="Fotografia da galeria"></div>';
      }).join('') +
      actual.fotos.map(function (f, i) {
        var metaTag = f.horaFormatada
          ? '<span class="u-foto-meta-tag">⏱️ ' + esc(f.horaFormatada) + (f.camera ? ' · ' + esc(f.camera.split(' ')[0]) : '') + '</span>'
          : '';
        return '<div class="u-item-upload u-concluido"><img src="' + f.dados + '" alt="' + esc(f.nome) + '">' + metaTag +
          '<button type="button" class="u-remover" data-rmpend="' + i + '" title="Não carregar esta fotografia" aria-label="Não carregar ' + esc(f.nome) + '">✕</button></div>';
      }).join('');
    /* reanexar os cartões em processamento ao final */
    carregando.forEach(function (d) { container.appendChild(d); });
  }

  /* tirar uma fotografia pendente antes de carregar para a galeria */
  el('miniaturas').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-rmpend]');
    if (b) {
      ev.preventDefault();
      ev.stopPropagation();
      var i = parseInt(b.dataset.rmpend, 10);
      if (i >= 0 && i < actual.fotos.length) {
        actual.fotos.splice(i, 1);
        desenharMiniaturas();
        toast('Fotografia retirada da lista de carregamento.', 'info');
      }
      return;
    }
    var c = ev.target.closest('[data-cancelar]');
    if (c) {
      ev.preventDefault();
      ev.stopPropagation();
      var id = c.dataset.cancelar;
      if (cancelados.has(id)) return;
      cancelados.add(id);
      var d = el(id);
      if (d) { d.remove(); try { URL.revokeObjectURL(d.querySelector('img') && d.querySelector('img').src); } catch (err) {} }
      toast('Carregamento cancelado.', 'info');
    }
  });

  /* passo 3 → público/privado */
  ast.querySelectorAll('input[name="acesso"]').forEach(function (r) {
    r.addEventListener('change', function () {
      el('formCliente').hidden = (this.value !== 'privada');
    });
  });

  function validarPasso() {
    if (actual.passo === 1) {
      if (!el('gNome').value.trim()) { toast('Dá um nome à galeria.', 'aviso'); return false; }
      if (actual.id) return true;   // já criada
      return true;
    }
    if (actual.passo === 3) {
      var privada = ast.querySelector('input[name="acesso"]:checked').value === 'privada';
      if (privada && !el('cNome').value.trim()) { toast('Falta o nome do cliente.', 'aviso'); return false; }
    }
    return true;
  }

  function trabalharPasso() {
    if (actual.passo === 1) {
      if (!actual.id) {
        return api('/galerias', {
          method: 'POST',
          body: { nome: el('gNome').value.trim(), dias: el('gDias').value, capa: actual.capa }
        }).then(function (g) {
          actual.id = g.id; actual.slug = g.slug; actual.expiraEm = g.expiraEm;
        });
      }
      return api('/galerias/' + encodeURIComponent(actual.id), {
        method: 'PUT',
        body: {
          nome: el('gNome').value.trim(),
          dias: el('gDias').value,
          capa: actual.capa || undefined
        }
      }).then(function (g) { actual.expiraEm = g.expiraEm; });
    }

    if (actual.passo === 2 && actual.fotos.length) {
      return api('/galerias/' + encodeURIComponent(actual.id) + '/fotos', {
        method: 'POST', body: { fotos: actual.fotos, ordem: actual.ordemFotos || 'captura' }
      }).then(function (r) {
        actual.existentes = r.total ? actual.existentes.concat(r.guardadas) : actual.existentes;
        actual.fotos = [];
      });
    }

    if (actual.passo === 3) {
      var privada = ast.querySelector('input[name="acesso"]:checked').value === 'privada';
      if (!privada) {
        actual.cliente = null;
        return api('/galerias/' + encodeURIComponent(actual.id), { method: 'PUT', body: { privada: false } });
      }
      var senhaDef = (el('cSenha') && el('cSenha').value ? el('cSenha').value.trim() : '') || 'ellyfotografo';
      actual.cliente = {
        nome: el('cNome').value.trim(),
        whatsapp: el('cWhats').value.trim(),
        senha: senhaDef,
        fotosContratadas: el('cFotos').value.trim(),
        precoExtra: el('cExtra').value.trim()
      };
      actual.senha = senhaDef;
      return api('/galerias/' + encodeURIComponent(actual.id) + '/cliente', {
        method: 'POST', body: actual.cliente
      });
    }

    return Promise.resolve();
  }

  function preencherResumo() {
    var link = location.origin + '/g/' + actual.slug;
    var c = actual.cliente;
    var senha = (c && c.senha) || actual.senha || 'ellyfotografo';
    el('rCliente').textContent = c ? c.nome : 'Galeria pública';
    el('rNumero').textContent = c && c.whatsapp ? c.whatsapp : '—';
    if (el('rSenha')) el('rSenha').textContent = senha;
    el('rLink').innerHTML = '<a href="' + esc(link) + '" target="_blank" rel="noopener">' +
                            esc(link) + '</a>';
    el('rExpira').textContent = dataCurta(actual.expiraEm);

    var texto = [
      '📸 *Galeria de Seleção · Elly Fotógrafo*',
      'Olá ' + (c ? c.nome : '') + '! A tua galeria de seleção já está pronta:',
      link,
      (c && c.whatsapp ? '📱 WhatsApp: ' + c.whatsapp : ''),
      '🔑 Palavra-passe: ' + senha,
      '⏳ Abre até ' + dataCurta(actual.expiraEm) + '.'
    ].filter(Boolean).join('\n');
    el('rEnviar').href = linkWa(c && c.whatsapp, texto);
  }

  el('astSeguinte').addEventListener('click', function () {
    if (!validarPasso()) return;
    el('astSeguinte').disabled = true;
    trabalharPasso()
      .then(function () {
        if (actual.passo === 4) {
          fecharAssistente();
          carregarGalerias();
          return;
        }
        mostrarPasso(actual.passo + 1);
        if (actual.passo === 4) preencherResumo();
      })
      .catch(function (e) { toast(e.message, 'erro'); })
      .then(function () { el('astSeguinte').disabled = false; });
  });

  el('astVoltar').addEventListener('click', function () {
    if (actual.passo > 1) mostrarPasso(actual.passo - 1);
  });

  /* ================= DETALHE DA GALERIA ================= */

  var det = el('detalhe');
  var detFundo = el('fundoDet');
  var galeriaDetalhe = null;

  var ROTULO_ESTADO = {
    sem_fotos: 'Sem fotografias',
    por_enviar: 'Por enviar ao cliente',
    a_aguardar: 'A aguardar o cliente',
    em_seleccao: 'Em seleção',
    concluida: 'Selecção concluída'
  };

  function pathNome(u) {
    return decodeURIComponent(String(u || '').split('/').pop());
  }

  function abrirDetalhe(g) {
    galeriaDetalhe = g;
    el('dNome').textContent = g.nome;
    var expirou = g.expiraEm && Date.parse(g.expiraEm) < Date.now();
    var rotulo = ROTULO_ESTADO[g.estado] || '—';
    var classePill = 'e-aguardar';
    if (g.estado === 'concluida') classePill = 'e-concluida';
    else if (g.estado === 'em_seleccao') classePill = 'e-seleccao';
    else if (g.estado === 'sem_fotos') classePill = 'e-vazia';
    if (expirou) classePill = 'e-expirada';
    el('dEstado').innerHTML =
      '<span class="det-estado-pill ' + classePill + '">' + esc(expirou ? 'Expirada' : rotulo) + '</span>' +
      '<span> · ' + (expirou ? 'expirou ' : 'expira ') + dataCurta(g.expiraEm) +
      ' · ' + (g.privada ? 'privada' : 'pública') + '</span>';
    el('dTotal').textContent = g.fotos.length;
    el('dSemFotos').hidden = g.fotos.length > 0;
    el('dFotos').innerHTML = g.fotos.map(function (f, i) {
      var meta = (g.fotosMeta && g.fotosMeta[f]) || {};
      var tag = meta.hora
        ? '<span class="u-foto-meta-tag">⏱️ ' + esc(meta.hora) + (meta.camera ? ' · ' + esc(meta.camera.split(' ')[0]) : '') + '</span>'
        : '';
      return '<div class="u-item-upload u-concluido" title="' + esc(meta.nomeOriginal || pathNome(f)) + (meta.hora ? ' · ⏱️ ' + meta.hora : '') + (meta.camera ? ' · 📷 ' + meta.camera : '') + '">' +
        '<img src="' + esc(f) + '" alt="Fotografia ' + (i + 1) + '" loading="lazy">' + tag + '</div>';
    }).join('');

    var linkAcesso = location.origin + '/g/' + g.slug;
    el('dInfo').innerHTML = [
      ['Cliente', g.cliente ? esc(g.cliente.nome) : 'sem cliente registado'],
      ['WhatsApp', g.cliente && g.cliente.whatsapp ? esc(g.cliente.whatsapp) : '—'],
      ['Palavra-passe', esc(g.senha || (g.cliente && g.cliente.senha) || 'ellyfotografo')],
      ['Fotos contratadas', g.cliente && g.cliente.fotosContratadas ? esc(g.cliente.fotosContratadas) : '—'],
      ['Preço por foto extra', g.cliente && g.cliente.precoExtra ? esc(g.cliente.precoExtra) + ' Kz' : '—'],
      ['Link de acesso', '<a href="' + esc(linkAcesso) + '" target="_blank" rel="noopener">' + esc(linkAcesso) + '</a><button type="button" class="det-link-copiar" id="dCopiarLink">Copiar</button>'],
      ['Validade', (g.expiraEm ? dataCurta(g.expiraEm) : '—') + (expirou ? ' <b style="color:var(--verm);">(Expirada)</b>' : '')],
      ['Criada em', dataCurta(g.criadaEm)]
    ].map(function (l) { return '<dt>' + l[0] + '</dt><dd>' + l[1] + '</dd>'; }).join('');
    var btnCopiar = el('dCopiarLink');
    if (btnCopiar) {
      btnCopiar.onclick = function () {
        copiarTexto(linkAcesso);
        btnCopiar.textContent = 'Copiado!';
        setTimeout(function () { btnCopiar.textContent = 'Copiar'; }, 2000);
      };
    }

    var link = location.origin + '/g/' + g.slug;
    el('dAbrir').href = link + '?equipa=1';
    var wa = el('dWhats');
    if (g.cliente && g.cliente.whatsapp) {
      wa.hidden = false;
      wa.href = linkWa(g.cliente.whatsapp,
        'Olá ' + g.cliente.nome + '! A tua galeria de seleção já está pronta:\n' + link +
        '\nAbre até ' + dataCurta(g.expiraEm) + '.');
    } else { wa.hidden = true; }

    el('dSel').hidden = true;
    el('dNomes').onclick = null;
    detFundo.hidden = false;
    det.hidden = false;

    api('/galerias/' + encodeURIComponent(g.id) + '/selecao')
      .then(function (s) { desenharSelecao(s); })
      .catch(function () {});
  }

  function desenharSelecao(s) {
    if (!s || !s.fotos || !s.fotos.length) return;
    var concluida = !!s.finalizada;
    el('dSel').hidden = false;
    el('dSelTitulo').innerHTML = 'Seleção do cliente <span class="det-chip ' +
      (concluida ? 'ok' : 'curso') + '">' + (concluida ? 'Concluída' : 'Em curso') + '</span>';
    el('dResumo').innerHTML = [
      ['Escolhidas', s.escolhidas, false],
      ['Total na galeria', s.total, false],
      ['Contratadas', s.limite || '—', false],
      ['Extras', s.extras, s.extras > 0],
      ['Valor extra', fmtKz(s.valorExtra), s.extras > 0],
      ['Estado', concluida ? 'Concluída' : 'Em curso', concluida]
    ].map(function (x) {
      return '<div class="' + (x[2] ? 'alerta' : '') + '">' + x[0] +
             '<b>' + x[1] + '</b></div>';
    }).join('');

    el('dMini').innerHTML = s.fotos.map(function (f) {
      return '<img src="' + esc(f) + '" alt="" loading="lazy">';
    }).join('');

    /* um único arquivo: para cada foto, a linha JPEG seguida da linha RAW
       (.CR3, mesmo nome base), para separares os dois formatos de uma vez
       com a mesma ferramenta. Só disponível com a seleção finalizada. */
    var b = el('dNomes');
    b.hidden = !concluida;
    if (concluida) {
      b.textContent = 'Descarregar seleção concluída (.selpics)';
      b.classList.remove('secundario');
      b.classList.add('primario');
      b.onclick = function () {
        var linhas = [];
        (s.nomes || []).forEach(function (n) {
          n = String(n);
          linhas.push(n);
          linhas.push(n.replace(/\.(jpe?g|png|webp|gif|avif)$/i, '.CR3'));
        });
        if (!linhas.length) { toast('Esta seleção ainda não tem fotografias.', 'aviso'); return; }
        /* exactamente como o formato pedido: um nome por linha, LF, sem linha final */
        var blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = nomeFicheiro(galeriaDetalhe.nome, galeriaDetalhe.slug) + '.selpics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      };
    } else {
      b.onclick = null;
    }
  }

  function fmtKz(v) { return (v || 0).toLocaleString('pt-PT') + ' Kz'; }

  function fecharDetalhe() { det.hidden = true; detFundo.hidden = true; }

  function reativarGaleriaPrompt(g) {
    if (!g) return;
    var diasDef = String(g.dias || 30);
    perguntar('Reativar galeria', 'Por quantos dias pretendes reativar «' + g.nome + '»?', diasDef, 'Reativar')
      .then(function (diasStr) {
        if (diasStr === null) return null;
        var dias = parseInt(diasStr, 10);
        if (!(dias > 0)) { toast('Por favor, indica um número de dias válido.', 'aviso'); return null; }

        return api('/galerias/' + encodeURIComponent(g.id), {
          method: 'PUT',
          body: { reativar: true, dias: dias }
        }).then(function (atualizada) {
          var idx = galerias.findIndex(function (x) { return x.id === g.id; });
          if (idx !== -1) galerias[idx] = atualizada;
          desenharGalerias();
          if (galeriaDetalhe && galeriaDetalhe.id === g.id) {
            abrirDetalhe(atualizada);
          }

          var linkAcesso = location.origin + '/g/' + atualizada.slug;
          var senhaAcesso = atualizada.senha || (atualizada.cliente && atualizada.cliente.senha) || 'ellyfotografo';
          var resumoReativada = [
            '🎉 *Galeria Reativada · Elly Fotógrafo*',
            'Galeria: ' + atualizada.nome,
            (atualizada.cliente && atualizada.cliente.nome ? '👤 Cliente: ' + atualizada.cliente.nome : ''),
            (atualizada.cliente && atualizada.cliente.whatsapp ? '📱 WhatsApp: ' + atualizada.cliente.whatsapp : ''),
            '🔗 Link: ' + linkAcesso,
            '🔑 Palavra-passe: ' + senhaAcesso,
            '⏳ Novo prazo: até ' + dataCurta(atualizada.expiraEm) + ' (' + dias + ' dias)'
          ].filter(Boolean).join('\n');

          copiarTexto(resumoReativada);
          if (atualizada.cliente && atualizada.cliente.whatsapp) {
            return confirmar(
              'Galeria reativada!',
              'Nova validade: ' + dataCurta(atualizada.expiraEm) + '. Os dados de acesso foram copiados. Pretendes abrir o WhatsApp para reenviar ao cliente agora?',
              'Abrir WhatsApp'
            ).then(function (ok) {
              if (ok) window.open(linkWa(atualizada.cliente.whatsapp, resumoReativada), '_blank', 'noopener');
            });
          }
          toast('Galeria reativada até ' + dataCurta(atualizada.expiraEm) + '! Dados copiados.', 'ok');
        }).catch(function (e) {
          toast('Erro ao reativar galeria: ' + e.message, 'erro');
        });
      });
  }

  function reordenarGaleriaServidor(id, criterio) {
    api('/galerias/' + encodeURIComponent(id) + '/ordenar', {
      method: 'PUT',
      body: { criterio: criterio }
    }).then(function (atualizada) {
      galeriaDetalhe = atualizada;
      var idx = galerias.findIndex(function (x) { return x.id === id; });
      if (idx !== -1) galerias[idx] = atualizada;
      desenharGalerias();
      abrirDetalhe(atualizada);
      var msg = criterio === 'captura'
        ? 'Galeria organizada por horário de captura (cronológico)! Câmeras sincronizadas.'
        : (criterio === 'nome' ? 'Galeria organizada por nome de ficheiro (A-Z)!' : 'Ordem invertida com sucesso!');
      toast('✓ ' + msg, 'ok');
    }).catch(function (e) {
      toast('Erro ao reorganizar: ' + e.message, 'erro');
    });
  }

  if (el('dBtnOrdemCaptura')) {
    el('dBtnOrdemCaptura').addEventListener('click', function () {
      if (!galeriaDetalhe) return;
      reordenarGaleriaServidor(galeriaDetalhe.id, 'captura');
    });
  }
  if (el('dBtnOrdemNome')) {
    el('dBtnOrdemNome').addEventListener('click', function () {
      if (!galeriaDetalhe) return;
      reordenarGaleriaServidor(galeriaDetalhe.id, 'nome');
    });
  }
  if (el('dBtnInverter')) {
    el('dBtnInverter').addEventListener('click', function () {
      if (!galeriaDetalhe) return;
      var prox = (galeriaDetalhe.ordemFotos === 'captura') ? 'captura_desc' : ((galeriaDetalhe.ordemFotos === 'nome') ? 'nome_desc' : 'captura');
      reordenarGaleriaServidor(galeriaDetalhe.id, prox);
    });
  }

  el('dFechar').addEventListener('click', fecharDetalhe);
  detFundo.addEventListener('click', fecharDetalhe);
  if (el('dReativar')) {
    el('dReativar').addEventListener('click', function () {
      if (!galeriaDetalhe) return;
      reativarGaleriaPrompt(galeriaDetalhe);
    });
  }
  el('dEditar').addEventListener('click', function () {
    if (!galeriaDetalhe) return;
    fecharDetalhe();
    abrirAssistente(galeriaDetalhe);
  });
  el('dApagar').addEventListener('click', function () {
    if (!galeriaDetalhe) return;
    var id = galeriaDetalhe.id;
    confirmar('Apagar galeria?', '«' + galeriaDetalhe.nome + '» será apagada definitivamente, incluindo as fotografias.', 'Apagar', true)
      .then(function (ok) {
        if (!ok) return null;
        return api('/galerias/' + encodeURIComponent(id), { method: 'DELETE' })
          .then(function () { fecharDetalhe(); carregarGalerias(); });
      })
      .catch(function (e) { toast(e.message, 'erro'); });
  });

  /* ================= CONTACTOS ================= */

  var contactos = [];

  function desenharContactos() {
    var q = (el('buscaContacto').value || '').toLowerCase();
    var filtrados = contactos.filter(function (c) {
      var texto = (c.nome + ' ' + c.whatsapp + ' ' +
        (c.galerias || []).map(function (g) { return g.nome; }).join(' ')).toLowerCase();
      return !q || texto.indexOf(q) >= 0;
    });

    el('contactosVazios').hidden = filtrados.length > 0;
    el('corpoContactos').innerHTML = filtrados.map(function (c) {
      var galeriasDo = c.galerias || [];
      var link = galeriasDo.length ? '/g/' + galeriasDo[galeriasDo.length - 1].slug : '';
      var texto = 'Olá ' + c.nome + '! A tua galeria de seleção já está pronta:\n' +
                  (link ? location.origin + link : '');
      var lista = galeriasDo.length
        ? galeriasDo.map(function (g) {
            return '<a href="/g/' + g.slug + '" target="_blank" rel="noopener">' +
                   esc(g.nome) + '</a>' +
                   '<span class="pequeno">' + esc(ROTULO_ESTADO[g.estado] || '') + '</span>';
          }).join('')
        : '<span class="pequeno">sem galerias</span>';

      return '<tr>' +
        '<td><b>' + esc(c.nome) + '</b></td>' +
        '<td>' + esc(c.whatsapp || '—') + '</td>' +
        '<td>' + esc(c.fotosContratadas || '—') + '</td>' +
        '<td>' + (c.precoExtra ? esc(c.precoExtra) + ' Kz' : '—') + '</td>' +
        '<td><div class="gal-lista">' + lista + '</div></td>' +
        '<td style="text-align:right;white-space:nowrap">' +
          (c.whatsapp
            ? '<a href="' + esc(linkWa(c.whatsapp, texto)) +
              '" target="_blank" rel="noopener">WhatsApp</a>'
            : '') +
          (galeriasDo.length
            ? ' &nbsp;·&nbsp; <a href="' + location.origin + link +
              '" target="_blank" rel="noopener">Última galeria</a>'
            : '') +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function carregarContactos() {
    api('/contactos').then(function (lista) {
      contactos = lista;
      desenharContactos();
    });
  }

  el('buscaContacto').addEventListener('input', desenharContactos);

  /* ================= LANDING PAGE ================= */

  var frame = el('frameLanding');
  var landingCarregada = false;

  function carregarFrame() {
    try { frame.contentWindow.__SEM_DESCARGA = 1; } catch (e) {}
    frame.src = '/?editor=1&t=' + Date.now();
    landingCarregada = true;
  }

  function abrirLanding(forcar) {
    if (landingCarregada && !forcar) return;
    api('/landing').then(function (r) {
      if (r.estado && typeof r.estado === 'object') {
        try { localStorage.setItem(CHAVE_LANDING, JSON.stringify(r.estado)); } catch (e) {}
        el('notaLanding').innerHTML = '✨ <strong>Modo Espelho Ativo:</strong> Clique diretamente em qualquer texto ou foto abaixo para editar. Alterações sincronizadas com o servidor.';
      } else {
        el('notaLanding').innerHTML = '✨ <strong>Modo Espelho Ativo:</strong> Clique diretamente em qualquer texto ou foto abaixo para editar na hora.';
      }
      carregarFrame();
    }).catch(function () {
      el('notaLanding').textContent = 'Não consegui ler o servidor.';
      carregarFrame();
    });
  }

  // Ouvinte de mensagens do iframe
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.tipo === 'landing_alterada') {
      try { localStorage.setItem(CHAVE_LANDING, JSON.stringify(d.estado)); } catch (e) {}
      el('notaLanding').innerHTML = '✏️ Alterações detectadas. Clique em <strong>"💾 Guardar alterações"</strong> para publicar no site.';
    }
    if (d.tipo === 'guardado_sucesso') {
      var btnG = el('guardarLanding');
      if (btnG) {
        btnG.disabled = false;
        btnG.textContent = '💾 Guardar alterações';
      }
      try { localStorage.setItem(CHAVE_LANDING, JSON.stringify(d.estado)); } catch (e) {}
      el('notaLanding').innerHTML =
        '✓ <strong>Guardado com sucesso</strong> às ' + (d.data || new Date().toLocaleTimeString('pt-PT')) +
        '. As alterações já estão ativas para todos os visitantes do site público!';
    }
    if (d.tipo === 'trocar_dispositivo' && d.modo) {
      ativarModoDispositivo(d.modo);
    }
  });

  /* Seletor de dispositivo (Computador, Tablet, Celular) */
  function ativarModoDispositivo(disp) {
    document.querySelectorAll('#seletorDispositivo .btn-disp').forEach(function (b) {
      b.classList.toggle('on', b.dataset.disp === disp);
    });
    var wrapper = el('molduraWrapper');
    var topo = el('molduraBarraTopo');
    var rotulo = el('dispRotulo');

    if (wrapper) {
      wrapper.classList.remove('modo-pc', 'modo-tablet', 'modo-mobile');
      wrapper.classList.add('modo-' + disp);
    }
    if (topo) {
      topo.hidden = (disp === 'pc');
    }
    if (rotulo) {
      rotulo.textContent = disp === 'mobile' ? '📱 Celular (390px - Vista Mobile)' : '📟 Tablet (768px)';
    }
    try {
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ tipo: 'modo_dispositivo', modo: disp }, '*');
      }
    } catch (e) {}
  }

  /* ---------------- Controle de Encolher/Ocultar Menu Lateral ---------------- */
  var CHAVE_MENU_ENCOLHIDO = 'elly_menu_encolhido';
  var btnToggleMenu = el('btnToggleMenu');
  var btnMostrarMenuTopo = el('btnMostrarMenuTopo');
  var btnPainelCompleto = el('btnPainelCompleto');

  function aplicarMenuEncolhido(encolhido) {
    document.body.classList.toggle('menu-encolhido', encolhido);
    if (btnToggleMenu) {
      btnToggleMenu.title = encolhido ? 'Expandir menu lateral' : 'Encolher menu lateral';
    }
    try {
      localStorage.setItem(CHAVE_MENU_ENCOLHIDO, encolhido ? '1' : '0');
    } catch (e) {}
  }

  if (btnToggleMenu) {
    btnToggleMenu.addEventListener('click', function () {
      var encolhido = !document.body.classList.contains('menu-encolhido');
      aplicarMenuEncolhido(encolhido);
    });
  }

  // Restaura preferência salva do menu
  try {
    if (localStorage.getItem(CHAVE_MENU_ENCOLHIDO) === '1') {
      aplicarMenuEncolhido(true);
    }
  } catch (e) {}

  /* ---------------- Modo Painel Completo / Tela Cheia ---------------- */
  function alternarPainelCompleto(forcar) {
    var ativo = forcar !== undefined ? forcar : !document.body.classList.contains('painel-completo');
    document.body.classList.toggle('painel-completo', ativo);

    if (btnPainelCompleto) {
      btnPainelCompleto.innerHTML = ativo ? '✕ Sair do Painel Completo' : '⛶ Painel Completo';
      btnPainelCompleto.title = ativo ? 'Restaurar menu lateral' : 'Maximizar / Abrir em painel completo sem menu lateral';
    }
    if (btnMostrarMenuTopo) {
      btnMostrarMenuTopo.hidden = !ativo;
    }
  }

  if (btnPainelCompleto) {
    btnPainelCompleto.addEventListener('click', function () {
      alternarPainelCompleto();
    });
  }

  if (btnMostrarMenuTopo) {
    btnMostrarMenuTopo.addEventListener('click', function () {
      alternarPainelCompleto(false);
    });
  }

  document.querySelectorAll('#seletorDispositivo .btn-disp').forEach(function (btn) {
    btn.addEventListener('click', function () {
      ativarModoDispositivo(this.dataset.disp);
    });
  });

  el('recarregarLanding').addEventListener('click', function () { abrirLanding(true); });
  el('abrirLanding').addEventListener('click', function () {
    window.open('/?editor=1', '_blank', 'noopener');
  });

  el('reporLanding').addEventListener('click', function () {
    confirmar('Repor padrão original?', 'Todos os textos, fotografias e secções voltam ao padrão original de fábrica.', 'Repor', true)
      .then(function (ok) {
        if (!ok) return null;
        try {
          localStorage.removeItem(CHAVE_LANDING);
          if (frame && frame.contentWindow && frame.contentWindow.localStorage) {
            frame.contentWindow.localStorage.removeItem(CHAVE_LANDING);
          }
        } catch (e) {}

        return api('/landing', { method: 'POST', body: { estado: null } })
          .then(function () {
            carregarFrame();
            el('notaLanding').innerHTML = '✓ Padrão original de fábrica restaurado com sucesso!';
          });
      })
      .catch(function (e) { toast('Erro ao repor: ' + e.message, 'erro'); });
  });

  el('guardarLanding').addEventListener('click', function () {
    var btn = el('guardarLanding');
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    el('notaLanding').innerHTML = '⏳ A gravar alterações no servidor…';

    // 1. Tenta acionar diretamente se mesmo domínio
    try {
      if (frame && frame.contentWindow && typeof frame.contentWindow.__salvarLandingDireto === 'function') {
        frame.contentWindow.__salvarLandingDireto()
          .then(function () {
            btn.disabled = false;
            btn.textContent = '💾 Guardar alterações';
          })
          .catch(function () {
            executarSalvarServidorPainel();
          });
        return;
      }
    } catch (e) {}

    // 2. Notifica iframe
    try {
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ tipo: 'guardar_tudo' }, '*');
      }
    } catch (e) {}

    // 3. Salva também pelo painel
    executarSalvarServidorPainel();
  });

  var canalSync = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      canalSync = new BroadcastChannel('elly_landing_sync');
    }
  } catch (e) {}

  function notificarLandingAtualizada(est) {
    if (canalSync && est) {
      try { canalSync.postMessage({ tipo: 'landing_atualizada', estado: est }); } catch (e) {}
    }
  }

  function executarSalvarServidorPainel() {
    var estadoParaSalvar = null;
    try {
      if (frame && frame.contentWindow && typeof frame.contentWindow.__obterEstadoLanding === 'function') {
        estadoParaSalvar = frame.contentWindow.__obterEstadoLanding();
      }
    } catch (e) {}

    if (!estadoParaSalvar) {
      var bruto = null;
      try {
        if (frame && frame.contentWindow && frame.contentWindow.localStorage) {
          bruto = frame.contentWindow.localStorage.getItem(CHAVE_LANDING);
        }
      } catch (e) {}
      if (!bruto) {
        try { bruto = localStorage.getItem(CHAVE_LANDING); } catch (e) {}
      }
      if (bruto) {
        try { estadoParaSalvar = JSON.parse(bruto); } catch (e) {}
      }
    }

    if (!estadoParaSalvar || (!Object.keys(estadoParaSalvar.textos || {}).length && (!estadoParaSalvar.seccoesDuplicadas || !estadoParaSalvar.seccoesDuplicadas.length))) {
      console.warn('Estado para salvar está vazio. A evitar gravação acidental de estado vazio.');
      el('guardarLanding').disabled = false;
      el('guardarLanding').textContent = '💾 Guardar alterações';
      el('notaLanding').innerHTML = '⚠️ Nenhuma alteração detetada para guardar.';
      return;
    }

    api('/landing', { method: 'POST', body: { estado: estadoParaSalvar } })
      .then(function () {
        notificarLandingAtualizada(estadoParaSalvar);
        el('notaLanding').innerHTML =
          '✓ <strong>Guardado com sucesso</strong> às ' + new Date().toLocaleTimeString('pt-PT') +
          '. As alterações já estão ativas para todos os visitantes do site público!';
        carregarTemplates();
      })
      .catch(function (e) {
        fetch('/api/landing-salvar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: estadoParaSalvar })
        }).then(function (r) {
          if (!r.ok) throw new Error('Erro ' + r.status);
          notificarLandingAtualizada(estadoParaSalvar);
          el('notaLanding').innerHTML =
            '✓ <strong>Guardado com sucesso</strong> às ' + new Date().toLocaleTimeString('pt-PT') +
            '. As alterações já estão ativas para todos os visitantes do site público!';
          carregarTemplates();
        }).catch(function (err) {
          el('notaLanding').textContent = 'Falha ao guardar: ' + (e.message || err.message);
        });
      })
      .then(function () {
        el('guardarLanding').disabled = false;
        el('guardarLanding').textContent = '💾 Guardar alterações';
      });
  }

  /* ============================================================
     GESTÃO DE TEMPLATES (MÁXIMO 4)
     ============================================================ */
  var templatesArmazenados = [];

  function carregarTemplates() {
    return api('/templates-landing')
      .then(function (res) {
        templatesArmazenados = (res && res.templates) || [];
        renderizarTemplates();
      })
      .catch(function (e) {
        fetch('/api/pub/templates-landing')
          .then(function (r) { return r.json(); })
          .then(function (res) {
            templatesArmazenados = (res && res.templates) || [];
            renderizarTemplates();
          })
          .catch(function (err) {
            console.warn('Erro ao carregar templates:', err);
          });
      });
  }

  function renderizarTemplates() {
    var cont = el('contadorTemplates');
    if (cont) cont.textContent = templatesArmazenados.length + ' / 4';

    var btnNovo = el('btnSalvarNovoTemplate');
    if (btnNovo) {
      btnNovo.disabled = templatesArmazenados.length >= 4;
      btnNovo.title = templatesArmazenados.length >= 4 ? 'Limite de 4 templates atingido. Elimine um para salvar novo.' : 'Gravar configuração atual como template';
    }

    var lista = el('listaTemplatesLanding');
    if (!lista) return;

    if (!templatesArmazenados.length) {
      lista.innerHTML = '<p class="vazio" style="grid-column: 1 / -1; padding: 18px 0; font-size: 13.5px;">' +
        'Ainda não tem templates guardados. Pode guardar até 4 versões completas clicando em <strong>“➕ Guardar Alterações como Template”</strong> acima!</p>';
      return;
    }

    lista.innerHTML = templatesArmazenados.map(function (tpl, idx) {
      var dataStr = tpl.criadoEm ? new Date(tpl.criadoEm).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      var numTxt = tpl.estado && tpl.estado.textos ? Object.keys(tpl.estado.textos).length : 0;
      var hasMob = tpl.estado && tpl.estado.mobile && tpl.estado.mobile.textos && Object.keys(tpl.estado.mobile.textos).length;

      return [
        '<div class="template-card ' + (tpl.ativo ? 'ativo' : '') + '" data-id="' + esc(tpl.id) + '">',
        '  <div class="template-card-topo">',
        '    <div>',
        '      <h4 class="template-nome">' + esc(tpl.nome || ('Template ' + (idx + 1))) + '</h4>',
        '      <div class="template-data">Salvo em ' + esc(dataStr) + '</div>',
        '    </div>',
        '    <span class="badge-status-template ' + (tpl.ativo ? 'ativo' : 'salvo') + '">' + (tpl.ativo ? '⭐ No Site' : '💾 Guardado') + '</span>',
        '  </div>',
        '  <div class="template-detalhes">',
        '    <span class="template-tag">🖥️ PC</span>',
        '    <span class="template-tag">📱 Celular' + (hasMob ? ' (' + hasMob + ')' : '') + '</span>',
        (numTxt ? '    <span class="template-tag">✨ ' + numTxt + ' textos</span>' : ''),
        '  </div>',
        '  <div class="template-acoes">',
        '    <button type="button" class="btn-tpl-aplicar" data-act="aplicar" title="Publicar este template imediatamente na página principal">' + (tpl.ativo ? '✓ Ativo no Site' : '🚀 Usar no Site') + '</button>',
        '    <button type="button" class="btn-tpl-carregar" data-act="carregar" title="Ver e editar este template na pré-visualização">👁️ Ver</button>',
        '    <button type="button" class="btn-tpl-eliminar" data-act="eliminar" title="Eliminar este template para libertar espaço">🗑️</button>',
        '  </div>',
        '</div>'
      ].join('');
    }).join('');

    lista.querySelectorAll('.template-card').forEach(function (card) {
      var id = card.getAttribute('data-id');
      var btnAplicar = card.querySelector('[data-act="aplicar"]');
      var btnCarregar = card.querySelector('[data-act="carregar"]');
      var btnEliminar = card.querySelector('[data-act="eliminar"]');

      if (btnAplicar) {
        btnAplicar.addEventListener('click', function () {
          efetivarTemplate(id);
        });
      }
      if (btnCarregar) {
        btnCarregar.addEventListener('click', function () {
          carregarTemplatePrevia(id);
        });
      }
      if (btnEliminar) {
        btnEliminar.addEventListener('click', function () {
          eliminarTemplate(id);
        });
      }
    });
  }

  function efetivarTemplate(id) {
    var tpl = templatesArmazenados.find(function (x) { return x.id === id; });
    var nome = tpl ? tpl.nome : 'o template';
    el('notaLanding').innerHTML = '⏳ A efetivar “' + esc(nome) + '” no site principal…';

    api('/templates-landing/' + encodeURIComponent(id) + '/aplicar', { method: 'POST' })
      .then(function (res) {
        el('notaLanding').innerHTML = '✓ <strong>“' + esc(nome) + '” está ativo no site principal!</strong> As alterações já estão a refletir para todos os visitantes.';
        if (res && res.estado) {
          try { localStorage.setItem(CHAVE_LANDING, JSON.stringify(res.estado)); } catch (e) {}
          notificarLandingAtualizada(res.estado);
        }
        carregarFrame();
        carregarTemplates();
      })
      .catch(function (e) {
        fetch('/api/pub/templates-landing/' + encodeURIComponent(id) + '/aplicar', { method: 'POST' })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            el('notaLanding').innerHTML = '✓ <strong>“' + esc(nome) + '” está ativo no site principal!</strong> As alterações já estão a refletir para todos os visitantes.';
            if (res && res.estado) {
              try { localStorage.setItem(CHAVE_LANDING, JSON.stringify(res.estado)); } catch (err) {}
              notificarLandingAtualizada(res.estado);
            }
            carregarFrame();
            carregarTemplates();
          })
          .catch(function (err) {
            toast('Erro ao efetivar template: ' + (e.message || err.message), 'erro');
          });
      });
  }

  function carregarTemplatePrevia(id) {
    var tpl = templatesArmazenados.find(function (x) { return x.id === id; });
    if (!tpl || !tpl.estado) return;

    try {
      localStorage.setItem(CHAVE_LANDING, JSON.stringify(tpl.estado));
    } catch (e) {}

    frame.src = '/?editor=1&templateId=' + encodeURIComponent(id) + '&t=' + Date.now();
    landingCarregada = true;

    el('notaLanding').innerHTML = '👁️ <strong>A editar template: “' + esc(tpl.nome) + '”</strong>. Todas as alterações feitas no espelho serão salvas com segurança. Clique em <strong>“🚀 Usar no Site”</strong> quando desejar ativá-lo na página pública!';
  }

  function eliminarTemplate(id) {
    var tpl = templatesArmazenados.find(function (x) { return x.id === id; });
    var nome = tpl ? tpl.nome : 'este template';
    confirmar('Eliminar template?', '«' + nome + '» será eliminado. Esta ação liberta uma vaga dos 4 templates.', 'Eliminar', true)
      .then(function (ok) {
        if (!ok) return null;
        return api('/templates-landing/' + encodeURIComponent(id), { method: 'DELETE' })
          .then(function () {
            el('notaLanding').innerHTML = '✓ Template “' + esc(nome) + '” eliminado com sucesso.';
            carregarTemplates();
          })
          .catch(function (e) {
            return fetch('/api/pub/templates-landing/' + encodeURIComponent(id), { method: 'DELETE' })
              .then(function (r) { return r.json(); })
              .then(function () {
                el('notaLanding').innerHTML = '✓ Template “' + esc(nome) + '” eliminado com sucesso.';
                carregarTemplates();
              })
              .catch(function (err) {
                toast('Erro ao eliminar template: ' + (e.message || err.message), 'erro');
              });
          });
      });
  }

  var btnSalvarNovo = el('btnSalvarNovoTemplate');
  if (btnSalvarNovo) {
    btnSalvarNovo.addEventListener('click', function () {
      if (templatesArmazenados.length >= 4) {
        toast('Já tem 4 templates guardados (limite máximo atingido). Elimine um template existente para poder guardar um novo.', 'aviso');
        return;
      }

      var agora = new Date();
      var sugestao = 'Template ' + (templatesArmazenados.length + 1) + ' · ' + agora.toLocaleDateString('pt-PT') + ' ' + agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      perguntar('Guardar template', 'Dá um nome a esta versão do site:', sugestao, 'Continuar')
        .then(function (nomeResp) {
          if (nomeResp === null) return null;
          var nome = (nomeResp || '').trim() || sugestao;

          var estadoAtual = null;
          try {
            if (frame && frame.contentWindow && typeof frame.contentWindow.__obterEstadoLanding === 'function') {
              estadoAtual = frame.contentWindow.__obterEstadoLanding();
            }
          } catch (e) {}

          if (!estadoAtual) {
            var bruto = localStorage.getItem(CHAVE_LANDING);
            if (bruto) {
              try { estadoAtual = JSON.parse(bruto); } catch (e) {}
            }
          }

          function obterEstadoFinal() {
            if (estadoAtual && (Object.keys(estadoAtual.textos || {}).length > 0 || (estadoAtual.seccoesDuplicadas && estadoAtual.seccoesDuplicadas.length > 0))) {
              return Promise.resolve(estadoAtual);
            }
            return fetch('/api/pub/landing')
              .then(function (r) { return r.json(); })
              .then(function (res) {
                return (res && res.estado) ? res.estado : (estadoAtual || {});
              })
              .catch(function () {
                return estadoAtual || {};
              });
          }

          return obterEstadoFinal().then(function (estadoParaEnviar) {
            return confirmar('Ativar já?', 'Desejas ativar «' + nome + '» imediatamente como o design oficial no site principal?', 'Guardar e ativar')
              .then(function (ativarImediatamente) {
                return api('/templates-landing', {
                  method: 'POST',
                  body: {
                    nome: nome,
                    estado: estadoParaEnviar,
                    ativarImediatamente: ativarImediatamente
                  }
                })
                  .then(function () {
                    el('notaLanding').innerHTML = '✓ Template “<strong>' + esc(nome) + '</strong>” guardado com sucesso!' +
                      (ativarImediatamente ? ' Já está ativo no site principal.' : '');
                    if (ativarImediatamente && estadoParaEnviar) {
                      notificarLandingAtualizada(estadoParaEnviar);
                    }
                    carregarTemplates();
                  })
                  .catch(function (e) {
                    return fetch('/api/pub/templates-landing', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        nome: nome,
                        estado: estadoParaEnviar,
                        ativarImediatamente: ativarImediatamente
                      })
                    }).then(function (r) { return r.json(); })
                      .then(function () {
                        el('notaLanding').innerHTML = '✓ Template “<strong>' + esc(nome) + '</strong>” guardado com sucesso!';
                        carregarTemplates();
                      })
                      .catch(function (err) {
                        toast('Erro ao guardar template: ' + (e.message || err.message), 'erro');
                      });
                  });
              });
          });
        });
    });
  }

  // Carrega templates ao abrir a aba da landing page
  var abaLandingBtn = document.querySelector('.aba[data-aba="landing"]');
  if (abaLandingBtn) {
    abaLandingBtn.addEventListener('click', function () {
      carregarTemplates();
    });
  }
  carregarTemplates();

  /* ================= ARRANQUE ================= */

  carregarGalerias().catch(function (e) {
    el('listaGalerias').innerHTML = '<p class="vazio">Não consegui carregar: ' + esc(e.message) + '</p>';
  });
})();
