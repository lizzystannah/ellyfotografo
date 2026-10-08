/* Entrada da área reservada.
   Fase 1: credenciais artificiais — basta escrever qualquer coisa. */
(function () {
  'use strict';

  var CHAVE = 'elly_sessao';

  try {
    if (localStorage.getItem(CHAVE)) { location.replace('/painel'); return; }
  } catch (e) {}

  var form = document.getElementById('formLogin');
  var erro = document.getElementById('erro');

  function falhar(msg) {
    erro.textContent = msg;
    erro.hidden = false;
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    erro.hidden = true;

    var utilizador = document.getElementById('utilizador').value.trim();
    var palavraPasse = document.getElementById('palavraPasse').value;

    if (!utilizador) return falhar('Escreve qualquer coisa para entrares.');

    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utilizador: utilizador, palavraPasse: palavraPasse })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) return falhar(res.d.erro || 'Não deu para entrar.');
        try {
          localStorage.setItem(CHAVE, JSON.stringify({
            token: res.d.token,
            utilizador: res.d.utilizador,
            entrouEm: Date.now()
          }));
        } catch (e) {}
        location.href = '/painel';
      })
      .catch(function () { falhar('Servidor indisponível.'); });
  });
})();
