/* ============================================================
   GALERIA DO CLIENTE — ver, escolher (♥) e finalizar
   ============================================================ */

(function () {
  'use strict';

  var rota = window.__ROTA_GALERIA || {};
  var slug = rota.slug;

  var G = null;               /* dados da galeria */
  var escolhidas = [];        /* URLs escolhidas */
  var finalizada = false;
  var aberto = -1;            /* foto aberta no visor (-1 = fechado) */
  var gravarT = null;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  /* só dígitos — a normalização (indicativo 244) é feita no backend,
     para o login nunca divergir do que foi gravado */
  function digitos(v) {
    return String(v || '').replace(/\D/g, '');
  }
  function fmt(n) { return (parseInt(n, 10) || 0).toLocaleString('pt-PT'); }
  function dataCurta(iso) {
    try { return new Date(iso).toLocaleDateString('pt-PT'); } catch (e) { return ''; }
  }
  function limite() { return parseInt(G.limite, 10) || 0; }
  function preco() { return parseInt(G.precoExtra, 10) || 0; }
  function extras() { return limite() ? Math.max(0, escolhidas.length - limite()) : 0; }

  /* "Ver o site" é só para o fotógrafo: só aparece quando a galeria é aberta
     pelo painel ("Ver como cliente", que põe ?equipa=1 no link). O cliente,
     que abre o link puro, nunca vê o botão. */
  try {
    var paramsEquipa = new URLSearchParams(window.location.search);
    if (paramsEquipa.get('equipa') !== '1') {
      var linksSite = document.querySelectorAll('a.voltar[href="/"]');
      for (var li = 0; li < linksSite.length; li++) linksSite[li].hidden = true;
    }
  } catch (e) {}

  /* ---- acesso (galeria privada) ---- */
  var CHAVE_WHATS = 'elly_gal_' + slug;
  var CHAVE_SENHA = 'elly_gal_pwd_' + slug;
  function mem(chave, valor) {
    try {
      if (valor === undefined) return localStorage.getItem(chave);
      if (valor === null) localStorage.removeItem(chave);
      else localStorage.setItem(chave, valor);
    } catch (e) { return null; }
  }
  function cabecalho() {
    var whats = mem(CHAVE_WHATS);
    var senha = mem(CHAVE_SENHA);
    var h = {};
    if (whats) h['X-Gal-Acesso'] = whats;
    if (senha) h['X-Gal-Senha'] = senha;
    return h;
  }

  /* ================= carregar ================= */

  function carregar() {
    if (!slug) { mostrarErro('Link inválido.'); return Promise.resolve('erro'); }
    /* ID único por acesso (_=...): mesmo que a galeria seja a mesma, cada URL
       é diferente e nenhuma cache (navegador, proxy, CDN) consegue bater */
    var acessoId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return fetch('/api/pub/galeria/' + encodeURIComponent(slug) + '?_=' + acessoId, { headers: cabecalho(), cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return { erro: 'Resposta inválida.' }; }); })
      .then(function (d) {
        if (d.expirada) { mostrarExpirada(d); return 'expirada'; }
        if (d.fechada) { mostrarFechada(d); return 'fechada'; }
        if (d.erro) { mostrarErro(d.erro); return 'erro'; }
        if (d.requerAcesso) { mostrarAcesso(d); return 'acesso'; }
        G = d; arrancar(); return 'ok';
      })
      .catch(function () { mostrarErro('Não consegui abrir a galeria.'); return 'erro'; });
  }

  function mostrarErro(msg) {
    el('acesso').hidden = false;
    el('app').hidden = true;
    if (el('acessoExpirada')) el('acessoExpirada').hidden = true;
    if (el('acessoForm')) el('acessoForm').hidden = false;
    el('acessoTitulo').textContent = 'Galeria';
    el('acessoErro').textContent = msg;
    el('acessoErro').hidden = false;
  }

  function mostrarExpirada(d) {
    el('acesso').hidden = false;
    el('app').hidden = true;
    if (el('acessoForm')) el('acessoForm').hidden = true;
    el('acessoTitulo').textContent = (d && d.nome) || 'Galeria';
    var box = el('acessoExpirada');
    if (box) {
      box.hidden = false;
      var msg = el('expiradaMsg');
      if (msg) msg.textContent = 'Esta galeria expirou. O prazo de seleção terminou. Contacta o fotógrafo para reativar o link.';
      var btn = el('btnReativarWa');
      if (btn) {
        var tel = digitos((d && d.whatsappFotografo) || '244923123456');
        var textoWa = 'Olá! O link da minha galeria "' + ((d && d.nome) || '') + '" expirou. Podes reativar para eu concluir a seleção de fotografias?';
        btn.href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(textoWa);
      }
    }
    document.title = ((d && d.nome) || 'Galeria') + ' (Expirada) · Elly Fotógrafo';
  }

  function mostrarFechada(d) {
    el('acesso').hidden = false;
    el('app').hidden = true;
    if (el('acessoForm')) el('acessoForm').hidden = true;
    el('acessoTitulo').textContent = (d && d.nome) || 'Galeria';
    var box = el('acessoExpirada');
    if (box) {
      box.hidden = false;
      var msg = el('expiradaMsg');
      if (msg) msg.textContent = 'Esta seleção já foi concluída e o link está fechado. Se precisares de alterar alguma coisa, contacta o fotógrafo para reativar o link.';
      var btn = el('btnReativarWa');
      if (btn) {
        var tel = digitos((d && d.whatsappFotografo) || '244923123456');
        var textoWa = 'Olá! Concluí a seleção da galeria "' + ((d && d.nome) || '') + '" mas preciso de falar contigo sobre ela. Podes ajudar-me?';
        btn.href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(textoWa);
      }
    }
    document.title = ((d && d.nome) || 'Galeria') + ' (Seleção concluída) · Elly Fotógrafo';
  }

  function mostrarErroLocal(msg) {
    el('acessoErro').textContent = msg;
    el('acessoErro').hidden = false;
  }

  function mostrarAcesso(d) {
    el('acesso').hidden = false;
    el('app').hidden = true;
    if (el('acessoExpirada')) el('acessoExpirada').hidden = true;
    if (el('acessoForm')) el('acessoForm').hidden = false;
    el('acessoTitulo').textContent = d.nome || 'Galeria';
    el('acessoErro').hidden = true;
    var whatsGravado = mem(CHAVE_WHATS);
    var senhaGravada = mem(CHAVE_SENHA);
    if (whatsGravado && el('acessoNum')) el('acessoNum').value = whatsGravado;
    if (senhaGravada && el('acessoSenha')) el('acessoSenha').value = senhaGravada;
    document.title = (d.nome || 'Galeria') + ' · Elly Fotógrafo';
  }

  el('acessoForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var n = digitos(el('acessoNum').value);
    var p = (el('acessoSenha').value || '').trim();
    if (!n) { mostrarErroLocal('Escreve o teu contacto de WhatsApp.'); return; }
    if (!p) { mostrarErroLocal('Escreve a palavra-passe de acesso.'); return; }
    mem(CHAVE_WHATS, n);
    mem(CHAVE_SENHA, p);
    carregar().then(function (estado) {
      if (estado === 'acesso') {
        mem(CHAVE_WHATS, null);
        mem(CHAVE_SENHA, null);
        mostrarErroLocal('WhatsApp ou palavra-passe incorretos.');
      }
    });
  });

  /* ================= arranque ================= */

  function arrancar() {
    el('acesso').hidden = true;
    el('app').hidden = false;
    document.body.classList.add('e-galeria');

    document.title = G.nome + ' · Elly Fotógrafo';
    /* o nome da galeria aparece no centro com o estilo dourado do eyebrow;
       o h1 antigo fica escondido mas atualizado (acessibilidade/título) */
    if (el('capaNome')) el('capaNome').textContent = G.nome;
    el('titulo').textContent = G.nome;

    /* base da capa: cliente + nº de fotos (sem disponibilidade) */
    var cliEl = el('capaCliente');
    if (cliEl) {
      if (G.cliente) { cliEl.textContent = G.cliente; cliEl.hidden = false; }
      else cliEl.hidden = true;
    }
    el('capaSub').textContent = G.total + (G.total === 1 ? ' fotografia' : ' fotografias');

    var fundo = G.capa || (G.fotos && G.fotos[0]);
    if (fundo) {
      el('capaFoto').style.backgroundImage = 'url("' + fundo + '")';
      proporcaoCapa(fundo);
    }

    el('nTotal').textContent = G.total;
    el('semFotos').hidden = G.total > 0;

    escolhidas = (G.selecao && G.selecao.fotos) ? G.selecao.fotos.slice() : [];
    finalizada = !!(G.selecao && G.selecao.finalizada);

    desenharGrelha();
    actualizarContador();
    aplicarEstadoFinal();
    iniciarControlesGrade();
  }

  /* a ordem das fotos é definida no painel, no ato da criação — o cliente
     vê a ordem dada, sem controlos de ordenação */

  /* a capa usa a proporção da própria fotografia (sem a cortar em vertical) */
  function proporcaoCapa(url) {
    var im = new Image();
    im.onload = function () {
      if (!im.naturalWidth || !im.naturalHeight) return;
      var r = im.naturalWidth / im.naturalHeight;
      if (!(r > 0)) return;
      if (r < 0.85) r = 0.85;
      if (r > 1.9) r = 1.9;
      el('capaFoto').style.setProperty('--capa-r', String(Math.round(r * 1000) / 1000));
    };
    im.src = url;
  }

  /* Padrão por ecrã: 5 no computador, 3 no telemóvel (≤680px).
     O cliente pode trocar nos botões 3/5; a escolha é guardada. */
  var modoGrade = '5';
  function ecraTelemovel() {
    try {
      if (window.matchMedia) return window.matchMedia('(max-width: 680px)').matches;
      return (window.innerWidth || 0) <= 680;
    } catch (e) { return false; }
  }
  function definirModoGrade(modo) {
    /* migração dos modos antigos (2/4 → 3/5) */
    if (modo !== '3' && modo !== '5') modo = ecraTelemovel() ? '3' : '5';
    modoGrade = modo;
    var gEl = el('grelha');
    if (gEl) {
      gEl.classList.toggle('grelha-cols-3', modo === '3');
      gEl.classList.toggle('grelha-cols-5', modo === '5');
      gEl.classList.remove('grelha-compacta', 'grelha-confortavel', 'grelha-cols-2', 'grelha-cols-4');
    }
    if (el('btnGrade3')) el('btnGrade3').classList.toggle('on', modo === '3');
    if (el('btnGrade5')) el('btnGrade5').classList.toggle('on', modo === '5');
    try { localStorage.setItem('gal_grade_modo', modo); } catch (e) {}
  }

  function iniciarControlesGrade() {
    var salvo = null;
    try { salvo = localStorage.getItem('gal_grade_modo'); } catch (e) {}
    /* sem escolha guardada: 3 no telemóvel, 5 no computador */
    definirModoGrade(salvo || (ecraTelemovel() ? '3' : '5'));
    if (el('btnGrade3')) {
      el('btnGrade3').onclick = function () { definirModoGrade('3'); };
    }
    if (el('btnGrade5')) {
      el('btnGrade5').onclick = function () { definirModoGrade('5'); };
    }
  }

  function desenharGrelha() {
    var grelhaEl = el('grelha');
    if (!G || !G.fotos) return;

    // Se forem poucas fotos, reduz a largura máxima para que não fiquem gigantes e desproporcionais
    if (G.fotos.length > 0 && G.fotos.length < 5) {
      grelhaEl.style.maxWidth = Math.max(340, G.fotos.length * 240) + 'px';
    } else {
      grelhaEl.style.maxWidth = '1440px';
    }

    /* A ordem do clique é EXATAMENTE a ordem de G.fotos: cada cartão guarda
       data-i + data-url, e o clique confirma pela URL antes de abrir.
       O layout é masonry por colunas (sem vazios), por isso a ordem VISUAL
       (por colunas) difere da ordem do array — mas o clique abre sempre
       a foto que está por baixo do dedo. */
    grelhaEl.innerHTML = (G.fotos || []).map(function (f, i) {
      return '<figure class="foto" data-i="' + i + '" data-url="' + esc(f) + '">' +
        '<img src="' + esc(f) + '" alt="Fotografia ' + (i + 1) + '" loading="lazy" draggable="false">' +
        '<button class="sel" type="button" data-sel="' + i + '" title="Selecionar fotografia">' +
          '<span class="c">♥</span> Selecionar</button>' +
        '<span class="liga">♥</span>' +
      '</figure>';
    }).join('');
    marcarFotos();
  }

  /* ================= selecção ================= */

  function bloqueado() { return finalizada; }

  function marcarFotos() {
    var conjunto = {};
    escolhidas.forEach(function (u) { conjunto[u] = 1; });
    var nos = el('grelha').querySelectorAll('.foto');
    for (var i = 0; i < nos.length; i++) {
      var url = G.fotos[+nos[i].dataset.i];
      var escolhida = !!conjunto[url];
      nos[i].classList.toggle('escolhida', escolhida);
      var b = nos[i].querySelector('.sel');
      if (b) b.innerHTML = escolhida
        ? '<span class="c escolhido">♥</span> Escolhida'
        : '<span class="c">♥</span> Selecionar';
      if (b) b.disabled = bloqueado();
    }
  }

  function alternar(url) {
    if (bloqueado()) return;
    var i = escolhidas.indexOf(url);
    if (i >= 0) escolhidas.splice(i, 1);
    else escolhidas.push(url);
    marcarFotos();
    actualizarContador();
    aplicarEstadoFinal();
    guardar();
  }

  function textoExtras() {
    var L = limite(), P = preco(), ex = extras();
    if (!L || escolhidas.length <= L) return '';
    return 'Ultrapassaste as <b>' + L + '</b> fotografias contratadas. A partir daqui ' +
      'cada foto extra é contabilizada a <b>' + fmt(P) + ' Kz</b> — ' +
      '<b>' + ex + '</b> extra' + (ex === 1 ? '' : 's') +
      ' = <b>' + fmt(ex * P) + ' Kz</b>.';
  }

  /* quantas faltam / quanto já passou do contrato (mostrado no visor) */
  function actualizarQuota() {
    if (!G) return;
    var L = limite();
    var q = el('vLim');
    q.hidden = false;
    q.textContent = L ? escolhidas.length + ' / ' + L : String(escolhidas.length);
    q.setAttribute('title', L
      ? escolhidas.length + ' de ' + L + ' fotografias contratadas'
      : escolhidas.length + ' fotografias escolhidas');
    if (el('vBtnSelecionarBaixo')) {
      el('vBtnSelecionarBaixo').classList.toggle('quota-cheio', L > 0 && escolhidas.length >= L);
    }

    var msg = textoExtras();
    el('vExtras').innerHTML = msg;
    el('vExtras').hidden = !msg;
  }

  function actualizarContador() {
    el('nEscolhidas').textContent = escolhidas.length;
    el('nTotal').textContent = G ? G.total : 0;
    if (!G) return;

    var msg = textoExtras();
    el('avisoExtras').innerHTML = msg;
    el('avisoExtras').hidden = !msg;
    el('barra').classList.toggle('estourou', !!msg);
    actualizarQuota();
  }

  function aplicarEstadoFinal() {
    el('avisoFinalizada').hidden = !finalizada;
    if (!G) return;
    var base = finalizada ? 'Ver resumo'
      : (!escolhidas.length ? 'Escolher fotografias' : 'Finalizar seleção');
    var n = escolhidas.length;
    el('btnFinalizar').textContent = n ? base + ' (' + n + ')' : base;
    el('btnFinalizar').setAttribute('title',
      n ? base + ' — ' + n + (n === 1 ? ' fotografia escolhida' : ' fotografias escolhidas') : base);
    marcarFotos();
  }

  /* ================= gravação ================= */

  function guardar(agora) {
    if (!G) return Promise.resolve();
    clearTimeout(gravarT);
    var fazer = function () {
      return fetch('/api/pub/galeria/' + encodeURIComponent(slug) + '/selecao?_=' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), {
        cache: 'no-store',
        method: 'POST',
        headers: (function () {
          var h = cabecalho(); h['Content-Type'] = 'application/json'; return h;
        })(),
        body: JSON.stringify({ fotos: escolhidas, finalizada: finalizada })
      }).then(function (r) {
        if (!r.ok) throw new Error('Não consegui guardar.');
        return r.json();
      });
    };
    if (agora) return fazer();
    gravarT = setTimeout(function () { fazer().catch(function () {}); }, 700);
    return Promise.resolve();
  }

  /* ================= visor ================= */

  function posicionarCoracaoNoCantoDaFoto() {
    if (aberto < 0) return;
    /* no mobile o coração fica escondido (só o botão inferior) — saltar as
       leituras de layout deixa a navegação mais fluida */
    try { if (window.innerWidth <= 760) return; } catch (e) {}
    var img = el('vImg');
    var coracao = el('vCoracaoMarcado');
    var cont = el('vImgContainer');
    if (!img || !coracao || !cont) return;

    var url = G && G.fotos && G.fotos[aberto];
    var escolhida = url && escolhidas.indexOf(url) >= 0;
    if (!escolhida) return;

    var rImg = img.getBoundingClientRect();
    var rCont = cont.getBoundingClientRect();

    // Se a imagem ainda não tiver dimensões renderizadas, aguarda o carregamento
    if (!rImg.width || !rImg.height || rImg.width < 10 || rImg.height < 10) {
      return;
    }

    var isMobile = window.innerWidth <= 640;
    // Margem a partir do canto superior direito da fotografia
    var margem = isMobile ? 10 : 14;

    // Distância exata do topo e da direita da imagem em relação ao container
    var topo = Math.round(rImg.top - rCont.top + margem);
    var direita = Math.round(rCont.right - rImg.right + margem);

    if (topo < 6) topo = 6;
    if (direita < 6) direita = 6;

    coracao.style.top = topo + 'px';
    coracao.style.right = direita + 'px';
    coracao.style.bottom = 'auto';
    coracao.style.left = 'auto';
  }

  function abrirVisor(i) {
    if (!G || !G.fotos || !G.fotos.length) return;
    aberto = i;
    geracaoVisor++;
    el('visor').hidden = false;
    document.body.style.overflow = 'hidden';
    pintarVisor(0);
    requestAnimationFrame(function () {
      posicionarCoracaoNoCantoDaFoto();
      setTimeout(posicionarCoracaoNoCantoDaFoto, 60);
      setTimeout(posicionarCoracaoNoCantoDaFoto, 180);
    });
  }

  function fecharVisor() {
    el('visor').hidden = true;
    document.body.style.overflow = '';
    aberto = -1;
  }

  /* ============ carrossel contínuo (anterior | atual | seguinte) ============ */
  var animandoVisor = false;
  var assentFaixaTok = 0;
  var slideW = 0;

  function faixaEl() { return el('vFaixa'); }
  function medirSlide() {
    var cont = el('vImgContainer');
    var w = (cont && cont.getBoundingClientRect) ? cont.getBoundingClientRect().width : 0;
    if (!w) {
      var c = el('visorCentro');
      w = (c && c.clientWidth) || window.innerWidth || 360;
    }
    slideW = Math.max(1, Math.round(w));
    return slideW;
  }

  function saltoFaixa() {
    var f = faixaEl();
    if (!f) return;
    var W = slideW || medirSlide();
    f.style.transition = 'none';
    f.style.transform = 'translate3d(' + (-W) + 'px, 0, 0)';
    f.style.opacity = '1';
  }

  function definirSlide(img, url) {
    if (!img) return;
    if (url) {
      img.style.visibility = 'visible';
      if (img.getAttribute('src') !== url) img.src = url;
    } else {
      img.removeAttribute('src');
      img.style.visibility = 'hidden';
    }
  }

  function ligarSlides() {
    if (!G || !G.fotos) return;
    definirSlide(el('vImgAnt'), G.fotos[aberto - 1]);
    definirSlide(el('vImg'), G.fotos[aberto]);
    definirSlide(el('vImgSeg'), G.fotos[aberto + 1]);
  }

  function comporFaixa() {
    if (aberto < 0 || !G || !G.fotos || !G.fotos.length) return;
    medirSlide();
    ligarSlides();
    saltoFaixa();
    atualizarInfoVisor();
  }

  /* reposiciona sem mover (ex.: após selecionar) */
  function pintarVisor() {
    if (aberto < 0) return;
    comporFaixa();
  }

  function atualizarInfoVisor() {
    if (aberto < 0 || !G || !G.fotos || !G.fotos.length) return;
    var url = G.fotos[aberto];
    var nomeFich = decodeURIComponent(url.split('/').pop());
    var contadorTxt = (aberto + 1) + ' / ' + G.total;
    var meta = (G && G.fotosMeta && G.fotosMeta[url]) || {};
    var txtNome = meta.nomeOriginal || nomeFich;
    var htmlNome = '<span class="vfoto-nome">' + esc(txtNome) + '</span>';
    if (meta.hora) htmlNome += ' <span class="vfoto-hora">· ⏱️ ' + esc(meta.hora) + '</span>';
    if (meta.camera) htmlNome += ' <span class="vfoto-cam">· 📷 ' + esc(meta.camera) + '</span>';
    if (el('vNome')) el('vNome').innerHTML = htmlNome;
    if (el('vContaTopo')) el('vContaTopo').textContent = contadorTxt;

    var escolhida = escolhidas.indexOf(url) >= 0;
    var btnBaixo = el('vBtnSelecionarBaixo');
    var coracaoTopo = el('vCoracaoMarcado');
    var bloqueada = bloqueado();

    if (btnBaixo) {
      btnBaixo.hidden = false;
      btnBaixo.style.display = 'inline-flex';
      btnBaixo.disabled = bloqueada;
      btnBaixo.classList.toggle('selecionado', escolhida);
      var spanTxt = btnBaixo.querySelector('span');
      if (spanTxt) spanTxt.textContent = escolhida ? 'Selecionado' : 'Selecionar';
      btnBaixo.setAttribute('title', escolhida ? 'Fotografia selecionada · Clique para desmarcar' : 'Selecionar fotografia');
    }

    if (coracaoTopo) {
      coracaoTopo.hidden = !escolhida;
      coracaoTopo.style.display = escolhida ? 'flex' : 'none';
      coracaoTopo.disabled = bloqueada;
      if (escolhida) {
        posicionarCoracaoNoCantoDaFoto();
        requestAnimationFrame(posicionarCoracaoNoCantoDaFoto);
        setTimeout(posicionarCoracaoNoCantoDaFoto, 50);
      }
    }
    actualizarQuota();

    var desatAntes = aberto <= 0;
    var desatDepois = aberto >= G.fotos.length - 1;
    if (el('vAntes')) el('vAntes').disabled = desatAntes;
    if (el('vDepois')) el('vDepois').disabled = desatDepois;

    // Pré-carrega ±2 para a navegação contínua ser instantânea
    for (var k = -2; k <= 2; k++) {
      if (k === 0) continue;
      var u = G.fotos[aberto + k];
      if (u) { var im = new Image(); im.src = u; }
    }
  }

  /* anima a faixa até ao centro e recompõe no fim */
  function assentarFaixa() {
    var f = faixaEl();
    var tk = ++assentFaixaTok;
    animandoVisor = true;
    if (f) {
      f.style.transition = 'transform .23s cubic-bezier(.2,.8,.25,1)';
      f.style.transform = 'translate3d(' + (-(slideW || medirSlide())) + 'px, 0, 0)';
    }
    setTimeout(function () {
      if (tk !== assentFaixaTok) return;
      animandoVisor = false;
      comporFaixa();
    }, 250);
  }

  function irPara(n) {
    if (aberto < 0 || animandoVisor || !G || !G.fotos || !G.fotos.length) return;
    if (n < 0) n = 0;
    if (n > G.fotos.length - 1) n = G.fotos.length - 1;
    var f = faixaEl();
    var W = medirSlide();
    if (n === aberto) {
      /* ponta: elástico — encosta e volta ao estado normal */
      if (!f) return;
      var dir = (aberto === 0) ? 1 : -1;
      var tk0 = ++assentFaixaTok;
      animandoVisor = true;
      f.style.transition = 'transform .18s ease-out';
      f.style.transform = 'translate3d(' + (-W + dir * Math.min(46, W * 0.12)) + 'px, 0, 0)';
      setTimeout(function () {
        if (tk0 !== assentFaixaTok) return;
        saltoFaixa();
        animandoVisor = false;
      }, 200);
      return;
    }
    var d = n > aberto ? 1 : -1;
    aberto = n;
    ligarSlides();
    atualizarInfoVisor();
    if (f) {
      /* para continuidade: a foto antiga está a d janelas de distância */
      f.style.transition = 'none';
      f.style.transform = 'translate3d(' + (-W + d * W) + 'px, 0, 0)';
      void f.offsetWidth;
      requestAnimationFrame(function () { assentarFaixa(); });
    } else {
      comporFaixa();
    }
  }

  function passo(d) {
    if (animandoVisor || aberto < 0 || !G || !G.fotos) return;
    irPara(aberto + d);
  }

  el('grelha').addEventListener('click', function (ev) {
    var s = ev.target.closest('[data-sel]');
    if (s) {
      ev.preventDefault(); ev.stopPropagation();
      var si = +s.dataset.sel;
      var sUrl = (s.closest('[data-url]') || {}).getAttribute
        ? s.closest('[data-url]').getAttribute('data-url')
        : null;
      var sIdx = G.fotos.indexOf(sUrl);
      alternar(sIdx >= 0 ? G.fotos[sIdx] : G.fotos[si]);
      return;
    }
    var f = ev.target.closest('[data-i]');
    if (f) {
      /* O índice pode vir de um HTML antigo em cache: confirma-se pela URL
         gravada no próprio cartão, para abrir sempre a foto clicada. */
      var url = f.getAttribute ? f.getAttribute('data-url') : null;
      var idx = url ? G.fotos.indexOf(url) : -1;
      abrirVisor(idx >= 0 ? idx : (+f.dataset.i));
    }
  });

  if (el('vFecharTopo')) el('vFecharTopo').addEventListener('click', fecharVisor);
  if (el('vAntes')) el('vAntes').addEventListener('click', function () { passo(-1); });
  if (el('vDepois')) el('vDepois').addEventListener('click', function () { passo(1); });

  /* Gestos touch sobre a faixa: horizontal acompanha o dedo com foto a foto
     (contínuo, só transform, sem leituras de layout no movimento); soltar com
     velocidade ou deslocamento muda de foto; nas pontas há elástico e volta
     ao estado normal. Para baixo a partir de ~110px fecha o visor. */
  var arrX0 = 0, arrY0 = 0, arrDX = 0, arrDY = 0, arrEixo = null, arrAtivo = false;
  var arrFaixaX = 0, arrAmostras = [];
  var geracaoVisor = 0;
  var centroEl = el('visorCentro');
  if (centroEl) {
    centroEl.addEventListener('touchstart', function (e) {
      if (aberto < 0 || animandoVisor || !G || !G.fotos) { arrAtivo = false; return; }
      if (e.touches && e.touches.length === 1) {
        medirSlide();
        arrX0 = e.touches[0].clientX;
        arrY0 = e.touches[0].clientY;
        arrDX = 0; arrDY = 0; arrEixo = null; arrAtivo = true;
        arrFaixaX = -slideW;
        arrAmostras = [{ t: Date.now(), x: 0 }];
        var f0 = faixaEl();
        if (f0) f0.style.transition = 'none';
      } else { arrAtivo = false; }
    }, { passive: true });
    centroEl.addEventListener('touchmove', function (e) {
      if (!arrAtivo || aberto < 0) return;
      if (!e.touches || e.touches.length !== 1) { arrAtivo = false; return; }
      arrDX = e.touches[0].clientX - arrX0;
      arrDY = e.touches[0].clientY - arrY0;
      if (!arrEixo && Math.abs(arrDX) + Math.abs(arrDY) > 14) {
        arrEixo = Math.abs(arrDX) >= Math.abs(arrDY) ? 'x' : 'y';
      }
      if (!arrEixo) return;
      var f = faixaEl();
      if (!f) return;
      if (arrEixo === 'x') {
        var dx = arrDX;
        /* elástico nas pontas: sem vizinho, o movimento encurta */
        if ((aberto === 0 && dx > 0) || (aberto === G.fotos.length - 1 && dx < 0)) dx = dx * 0.35;
        arrFaixaX = -slideW + dx;
        f.style.transform = 'translate3d(' + Math.round(arrFaixaX) + 'px, 0, 0)';
        f.style.opacity = '1';
        arrAmostras.push({ t: Date.now(), x: arrDX });
        if (arrAmostras.length > 4) arrAmostras.shift();
      } else {
        f.style.transform = 'translate3d(0, ' + Math.round(Math.max(arrDY, -60)) + 'px, 0)';
        f.style.opacity = String(Math.max(0.3, 1 - Math.abs(arrDY) / 480));
      }
    }, { passive: true });
    function encerrarArrasto() {
      if (!arrAtivo) return;
      arrAtivo = false;
      var f = faixaEl();
      if (arrEixo === 'y' && arrDY > 110) {
        /* arrastar para baixo fecha */
        var gFechar = geracaoVisor;
        if (f) {
          f.style.transition = 'transform .22s ease-out, opacity .22s ease-out';
          f.style.transform = 'translate3d(0, 42vh, 0)';
          f.style.opacity = '0';
        }
        setTimeout(function () { if (gFechar === geracaoVisor) fecharVisor(); }, 200);
      } else if (arrEixo === 'x') {
        var W = slideW || medirSlide();
        var limiar = Math.max(56, W * 0.16);
        var v = 0;
        if (arrAmostras.length >= 2) {
          var a0 = arrAmostras[0], a1 = arrAmostras[arrAmostras.length - 1];
          if (a1.t > a0.t) v = (a1.x - a0.x) / (a1.t - a0.t);
        }
        var alvo = aberto;
        if ((arrDX < -limiar || v < -0.45) && aberto < G.fotos.length - 1) alvo = aberto + 1;
        else if ((arrDX > limiar || v > 0.45) && aberto > 0) alvo = aberto - 1;
        if (alvo !== aberto) {
          var d = alvo > aberto ? 1 : -1;
          aberto = alvo;
          ligarSlides();
          atualizarInfoVisor();
          if (f) {
            /* continuidade: a vista atual está a d janelas da nova */
            f.style.transition = 'none';
            f.style.transform = 'translate3d(' + Math.round(arrFaixaX + d * W) + 'px, 0, 0)';
            void f.offsetWidth;
            requestAnimationFrame(function () { assentarFaixa(); });
          } else {
            comporFaixa();
          }
        } else if (f) {
          /* sem vizinho ou gesto curto: volta ao estado normal */
          f.style.transition = 'transform .2s ease-out, opacity .2s ease-out';
          f.style.transform = 'translate3d(' + (-W) + 'px, 0, 0)';
          f.style.opacity = '1';
          var tk = ++assentFaixaTok;
          animandoVisor = true;
          setTimeout(function () {
            if (tk !== assentFaixaTok) return;
            animandoVisor = false;
            comporFaixa();
          }, 220);
        }
      } else if (f) {
        f.style.transition = 'transform .18s ease-out, opacity .18s ease-out';
        f.style.transform = 'translate3d(' + (-(slideW || medirSlide())) + 'px, 0, 0)';
        f.style.opacity = '1';
      }
      arrEixo = null;
    }
    centroEl.addEventListener('touchend', function () { encerrarArrasto(); }, { passive: true });
    centroEl.addEventListener('touchcancel', function () {
      arrAtivo = false; arrEixo = null;
      saltoFaixa();
    }, { passive: true });
  }

  if (el('vBtnSelecionarBaixo')) {
    el('vBtnSelecionarBaixo').addEventListener('click', function () {
      if (aberto < 0 || bloqueado()) return;
      alternar(G.fotos[aberto]);
      pintarVisor(0);
    });
  }
  if (el('vCoracaoMarcado')) {
    el('vCoracaoMarcado').addEventListener('click', function () {
      if (aberto < 0 || bloqueado()) return;
      alternar(G.fotos[aberto]);
      pintarVisor(0);
    });
  }

  if (el('vImg')) {
    el('vImg').addEventListener('load', function () {
      posicionarCoracaoNoCantoDaFoto();
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    var visorRO = new ResizeObserver(function () {
      posicionarCoracaoNoCantoDaFoto();
    });
    if (el('vImg')) visorRO.observe(el('vImg'));
    if (el('vImgContainer')) visorRO.observe(el('vImgContainer'));
  }

  window.addEventListener('resize', posicionarCoracaoNoCantoDaFoto);
  window.addEventListener('resize', function () {
    /* rotação/resize com o visor aberto: recentra a faixa na foto atual */
    if (aberto >= 0 && !arrAtivo) saltoFaixa();
  });
  window.addEventListener('orientationchange', function () {
    setTimeout(posicionarCoracaoNoCantoDaFoto, 80);
    setTimeout(posicionarCoracaoNoCantoDaFoto, 250);
  });

  document.addEventListener('keydown', function (ev) {
    if (aberto < 0) {
      if (ev.key === 'Escape') fecharResumo();
      return;
    }
    if (ev.key === 'Escape') fecharVisor();
    else if (ev.key === 'ArrowRight') passo(1);
    else if (ev.key === 'ArrowLeft') passo(-1);
    else if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      if (!bloqueado()) {
        alternar(G.fotos[aberto]);
        pintarVisor(0);
      }
    }
  });

  /* ================= resumo ================= */

  function abrirResumo() {
    if (!G) return;
    if (!escolhidas.length && !finalizada) {
      el('grelha').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    var L = limite(), P = preco(), ex = extras();

    el('rTotal').textContent = G.total;
    el('rEscolhidas').textContent = escolhidas.length;
    el('rLimite').textContent = L ? L : 'sem limite definido';
    el('rExtras').textContent = ex;
    el('rValor').textContent = fmt(ex * P) + ' Kz';
    el('rExtras').classList.toggle('alerta', ex > 0);
    el('rValor').classList.toggle('alerta', ex > 0);
    el('rEstado').textContent = finalizada ? 'Concluída' : 'Em curso';
    el('rMini').innerHTML = escolhidas.map(function (u) {
      return '<img src="' + u + '" alt="">';
    }).join('');

    el('fundo').hidden = false;
    el('resumo').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function fecharResumo() {
    el('fundo').hidden = true;
    el('resumo').hidden = true;
    if (aberto < 0) document.body.style.overflow = '';
  }

  /* avisos dentro do próprio resumo (sem popups do navegador) */
  var notaOriginal = '';
  function avisoResumo(msg) {
    var n = el('rNota');
    if (!n) { try { alert(msg); } catch (e) {} return; }
    if (!notaOriginal) notaOriginal = n.textContent;
    n.textContent = msg;
    n.classList.add('aviso');
    setTimeout(function () {
      var n2 = el('rNota');
      if (n2) { n2.textContent = notaOriginal; n2.classList.remove('aviso'); }
    }, 4500);
  }

  el('btnFinalizar').addEventListener('click', abrirResumo);
  el('rFechar').addEventListener('click', fecharResumo);
  el('rVoltar').addEventListener('click', fecharResumo);

  /* ---- PDF ---- */
  el('rPdf').addEventListener('click', function () {
    var b = el('rPdf');
    if (!escolhidas.length) { avisoResumo('Ainda não escolheste nenhuma fotografia.'); return; }
    b.disabled = true; b.textContent = 'A gerar…';

    var L = limite(), P = preco(), ex = extras();
    window.PDF.gerar({
      titulo: G.nome,
      subtitulo: 'Elly Fotógrafo · seleção de fotografias',
      linhas: [
        'Cliente: ' + (G.cliente || '—'),
        'Data: ' + new Date().toLocaleDateString('pt-PT'),
        'Total na galeria: ' + G.total,
        'Escolhidas: ' + escolhidas.length,
        'Incluídas no contrato: ' + (L ? L : '—'),
        'Fotografias extra: ' + ex + (P ? '  (' + fmt(ex * P) + ' Kz)' : ''),
        'Link: ' + location.href
      ],
      fotos: escolhidas
    }).then(function (bytes) {
      window.PDF.baixar(bytes, 'selecao-' + slug + '.pdf');
    }).catch(function (e) {
      avisoResumo(e.message || 'Não consegui gerar o PDF.');
    }).then(function () {
      b.disabled = false; b.textContent = 'Descarregar PDF';
    });
  });

  /* ---- concluir ---- */
  el('rConcluir').addEventListener('click', function () {
    if (!escolhidas.length) { avisoResumo('Ainda não escolheste nenhuma fotografia.'); return; }
    var b = el('rConcluir');
    b.disabled = true; b.textContent = 'A guardar…';
    finalizada = true;
    guardar(true).then(function () {
      aplicarEstadoFinal();
      fecharResumo();
      enviarWhatsApp();
    }).catch(function (e) {
      finalizada = false;
      avisoResumo(e.message || 'Não consegui guardar.');
    }).then(function () {
      b.disabled = false; b.textContent = 'Concluir seleção';
    });
  });

  function enviarWhatsApp() {
    var L = limite(), P = preco(), ex = extras();
    var texto = 'Olá! Terminei a seleção da galeria "' + G.nome + '".\n' +
      'Escolhidas: ' + escolhidas.length + ' de ' + G.total + '\n' +
      (L ? 'Contratadas: ' + L + ' · extras: ' + ex + ' (' + fmt(ex * P) + ' Kz)\n' : '') +
      'Link: ' + location.href + '\n' +
      'Envio também o PDF com as fotografias escolhidas.';
    window.open('https://wa.me/' + digitos(G.whatsappFotografo) +
      '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
  }

  /* ================= arranque ================= */

  /* sem isto, voltar à aba pelo histórico mostra o ecrã antigo (ex.: "link
     fechado") sem ir ao servidor — força recarregar do zero */
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) location.reload();
  });

  carregar();
})();
