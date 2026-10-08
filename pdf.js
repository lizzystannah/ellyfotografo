/* ============================================================
   PDF.js — monta um PDF com as fotografias escolhidas.
   Sem dependências: PDF 1.4 escrito à mão, JPEG embutido com
   /Filter /DCTDecode.  O JPEG sai de um <canvas>, por isso
   funciona com JPG, PNG ou WebP na origem.
   ============================================================ */

(function (glob) {
  'use strict';

  var A4_L = 842, A4_P = 595;          // A4 deitado, em pontos
  var MARGEM = 40;
  var LADO_MAX = 1400;                 // px máximos por foto no PDF
  var QUALIDADE = 0.82;

  function enc(s) {
    /* simple font Helvetica → bytes WinAnsi/latin1 */
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      out[i] = c <= 255 ? c : 63;
    }
    return out;
  }

  function escapar(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function juntar(partes) {
    var total = 0, i;
    for (i = 0; i < partes.length; i++) total += partes[i].length;
    var saida = new Uint8Array(total), off = 0;
    for (i = 0; i < partes.length; i++) { saida.set(partes[i], off); off += partes[i].length; }
    return saida;
  }

  function base64ParaBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ---- imagem → JPEG ---- */

  function carregarJpeg(url) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
        var esc = Math.min(1, LADO_MAX / Math.max(iw, ih));
        var w = Math.max(1, Math.round(iw * esc));
        var h = Math.max(1, Math.round(ih * esc));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        var dados;
        try { dados = c.toDataURL('image/jpeg', QUALIDADE); }
        catch (e) { return rej(new Error('Não consegui ler ' + url)); }
        res({ bytes: base64ParaBytes(dados.split(',')[1]), w: w, h: h });
      };
      img.onerror = function () { rej(new Error('Não consegui abrir ' + url)); };
      img.src = url;
    });
  }

  /* ---- texto ---- */

  function textoCinzento(x, y, tam, s, cinza) {
    return 'BT ' + cinza + ' g /F1 ' + tam + ' Tf 1 0 0 1 ' + x + ' ' + y + ' Tm (' +
      escapar(s) + ') Tj ET\n';
  }

  /* ---- montagem ---- */

  function construir(titulo, subtitulo, linhas, fotos) {
    /* numeração: 1 catálogo, 2 páginas, 3 fonte, 4+ páginas */
    var objetos = [];               // [num] = string | {cabeca, bytes}
    var numsPaginas = [];
    var corpos = [];                // conteúdo de cada página
    var i;

    /* página do resumo */
    var y = A4_P - MARGEM - 26;
    var c = '';
    c += textoCinzento(MARGEM, y, 22, titulo, '0');
    y -= 34;
    c += textoCinzento(MARGEM, y, 12, subtitulo, '0.35');
    y -= 40;
    for (i = 0; i < linhas.length; i++) {
      if (y < MARGEM + 20) break;
      c += textoCinzento(MARGEM, y, 12, linhas[i], '0.1');
      y -= 22;
    }
    corpos.push(c);

    /* páginas das fotografias */
    for (i = 0; i < fotos.length; i++) {
      var f = fotos[i];
      var disponivelW = A4_L - MARGEM * 2;
      var disponivelH = A4_P - MARGEM * 2 - 26;
      var esc = Math.min(disponivelW / f.w, disponivelH / f.h);
      var w = Math.round(f.w * esc), h = Math.round(f.h * esc);
      var x = Math.round((A4_L - w) / 2);
      var py = Math.round(MARGEM + 26 + (disponivelH - h) / 2);
      var s = '';
      s += 'q\n' + w + ' 0 0 ' + h + ' ' + x + ' ' + py + ' cm\n/Im0 Do\nQ\n';
      s += textoCinzento(Math.round((A4_L - f.nome.length * 5.2) / 2), MARGEM + 6, 10,
                         f.nome, '0.4');
      corpos.push(s);
    }

    /* atribui números de objecto */
    for (i = 0; i < corpos.length; i++) numsPaginas.push(4 + i * 3);

    for (i = 0; i < corpos.length; i++) {
      var numPag = numsPaginas[i];
      var numCont = numPag + 1;
      var numImg = numPag + 2;
      var temFoto = i > 0;

      var recursos = '<< /Font << /F1 3 0 R >>' +
        (temFoto ? ' /XObject << /Im0 ' + numImg + ' 0 R >>' : '') + ' >>';

      objetos[numPag] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + A4_L + ' ' + A4_P +
        '] /Resources ' + recursos + ' /Contents ' + numCont + ' 0 R >>';

      var bytesCont = enc(corpos[i]);
      objetos[numCont] = {
        cabeca: '<< /Length ' + bytesCont.length + ' >>',
        bytes: bytesCont
      };

      if (temFoto) {
        var img = fotos[i - 1];
        objetos[numImg] = {
          cabeca: '<< /Type /XObject /Subtype /Image /Width ' + img.w + ' /Height ' + img.h +
                  ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
                  img.bytes.length + ' >>',
          bytes: img.bytes
        };
      }
    }

    objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objetos[2] = '<< /Type /Pages /Kids [' +
      numsPaginas.map(function (n) { return n + ' 0 R'; }).join(' ') +
      '] /Count ' + numsPaginas.length + ' >>';
    objetos[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

    return montar(objetos, numsPaginas.length);
  }

  function montar(objetos, nPaginas) {
    var partes = [], offsets = [], tamanho = 0;
    function empurrar(u8) { partes.push(u8); tamanho += u8.length; }

    empurrar(enc('%PDF-1.4\n'));

    for (var num = 1; num < objetos.length; num++) {
      var o = objetos[num];
      if (o === undefined) continue;
      offsets[num] = tamanho;
      empurrar(enc(num + ' 0 obj\n'));
      if (typeof o === 'string') empurrar(enc(o));
      else { empurrar(enc(o.cabeca + '\nstream\n')); empurrar(o.bytes); empurrar(enc('\nendstream')); }
      empurrar(enc('\nendobj\n'));
    }

    var max = objetos.length - 1;
    var inicioXref = tamanho;
    var xref = 'xref\n0 ' + (max + 1) + '\n0000000000 65535 f \n';
    for (var i = 1; i <= max; i++) {
      var off = offsets[i];
      if (off === undefined) xref += '0000000000 65535 f \n';
      else xref += ('0000000000' + off).slice(-10) + ' 00000 n \n';
    }
    empurrar(enc(xref));
    empurrar(enc('trailer\n<< /Size ' + (max + 1) + ' /Root 1 0 R >>\nstartxref\n' +
                 inicioXref + '\n%%EOF\n'));

    return juntar(partes);
  }

  /* ---- API ---- */

  function gerar(opcoes) {
    var titulo = opcoes.titulo || 'Seleção de fotografias';
    var subtitulo = opcoes.subtitulo || '';
    var linhas = opcoes.linhas || [];
    var urls = opcoes.fotos || [];

    return Promise.all(urls.map(function (u) {
      var nome = typeof u === 'string' ? u.split('/').pop() : u.nome;
      var url = typeof u === 'string' ? u : u.url;
      return carregarJpeg(url).then(function (d) {
        d.nome = decodeURIComponent(nome);
        return d;
      });
    })).then(function (fotos) {
      return construir(titulo, subtitulo, linhas, fotos);
    });
  }

  function baixar(bytes, nomeFicheiro) {
    var blob = new Blob([bytes], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nomeFicheiro;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  glob.PDF = { gerar: gerar, baixar: baixar };
})(window);
