/* ============================================================
   ELLY FOTÓGRAFO — funil de captação
   Envia cada lead para o Google Planilhas (Apps Script Web App).

   CONFIGURAÇÃO:
   1. Cria uma Planilha com as colunas (aba "Leads"):
      A data_registo | B nome | C whatsapp | D email | E tipo_evento
      F data_evento | G cidade | H interesse | I horas | J notas
      K origem | L userAgent | M estado | N utm_source | O utm_campaign
   2. Extensões → Apps Script → cola o código de SHEETS_BACKEND
      → Executar → Implementar como app web → copia o URL
   3. Cola esse URL em PLANILHA_ENDPOINT abaixo.
   ============================================================ */

const PLANILHA_ENDPOINT = ''; // ex.: 'https://script.google.com/macros/s/AKfy.../exec'
const NUM_WHATSAPP = '244900000000'; // TODO: número real do Elly

const TOTAL_PASSOS = 3;
const CHAVE_LEADS = 'elly_leads';
const CHAVE_FILA = 'elly_leads_fila';

const form = document.getElementById('formFunil');
const passos = [...form.querySelectorAll('.passo')];
const btnVoltar = document.getElementById('btnVoltar');
const btnAvancar = document.getElementById('btnAvancar');
const btnEnviar = document.getElementById('btnEnviar');
const sucessoEl = document.getElementById('sucesso');

/* O editor repõe o innerHTML de alguns parágrafos (aplicarTexto), o que
   substitui nós como o contador do passo. Nunca guardamos referências a
   esses elementos: buscamos sempre à árvore viva. */
const ref = id => document.getElementById(id);

let actual = 1;
let timerAuto = null;
let localTocado = false;

/* ---------------- navegação ---------------- */

function cancelarAuto() {
  if (timerAuto !== null) { clearTimeout(timerAuto); timerAuto = null; }
}

function agendarAuto(ms) {
  cancelarAuto();
  timerAuto = setTimeout(avancarAuto, ms);
}

function avancarAuto() {
  timerAuto = null;
  if (actual >= TOTAL_PASSOS) return;
  if (!validar(actual)) return;
  actual++;
  mostrar(actual);
}

function mostrar(n) {
  cancelarAuto();
  passos.forEach(p => { p.hidden = Number(p.dataset.passo) !== n; });
  const rotulo = ref('passoAtual');
  if (rotulo) rotulo.textContent = n;
  const barra = ref('barraFill');
  if (barra) barra.style.width = (n / TOTAL_PASSOS * 100) + '%';
  btnVoltar.hidden = n === 1;
  btnAvancar.hidden = n === TOTAL_PASSOS;
  btnEnviar.hidden = n !== TOTAL_PASSOS;
  const err = ref('erroForm');
  if (err) err.hidden = true;
}

function erro(msg) {
  const err = ref('erroForm');
  if (!err) return;
  err.textContent = msg;
  err.hidden = false;
}

function validar(n) {
  const p = passos[n - 1];
  const obrigatorios = [...p.querySelectorAll('[required]')];

  // grupo de rádio
  if (obrigatorios.length && obrigatorios[0].type === 'radio') {
    const nome = obrigatorios[0].name;
    if (!p.querySelector(`input[name="${nome}"]:checked`)) {
      erro('Escolhe uma opção para continuar.');
      return false;
    }
    return true;
  }

  for (const campo of obrigatorios) {
    campo.classList.remove('invalido');
    if (!campo.value.trim()) {
      campo.classList.add('invalido');
      campo.focus();
      erro('Preenche este campo para continuar.');
      return false;
    }
    if (campo.type === 'tel' && campo.value.replace(/\D/g, '').length < 9) {
      campo.classList.add('invalido');
      campo.focus();
      erro('Indica um número de WhatsApp válido.');
      return false;
    }
    if (campo.type === 'date' && new Date(campo.value) < new Date(new Date().toDateString())) {
      campo.classList.add('invalido');
      campo.focus();
      erro('A data do evento não pode estar no passado.');
      return false;
    }
  }
  const err = ref('erroForm');
  if (err) err.hidden = true;
  return true;
}

btnAvancar.addEventListener('click', () => {
  if (!validar(actual)) return;
  if (actual < TOTAL_PASSOS) { actual++; mostrar(actual); }
});

btnVoltar.addEventListener('click', () => {
  if (actual > 1) { actual--; mostrar(actual); }
});

/* ---------------- avanço automático ----------------
   Responder à pergunta passa à seguinte sem carregar em Continuar.
   Nos campos opcionais (local, horas) só avança quando o cliente
   sai deles, para dar tempo a preencher. */

const campoData = document.getElementById('data_evento');
const campoCidade = document.getElementById('cidade');

function dataValida() {
  if (!campoData.value) return false;
  return new Date(campoData.value) >= new Date(new Date().toDateString());
}

form.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'tipo_evento') {
    agendarAuto(400);                                   // passo 1
  } else if (t === campoData) {
    if (dataValida() && localTocado) agendarAuto(150);   // passo 2
  }
});

/* Saiu de um campo opcional com o resto respondido → avança.
   Se a saída foi para Continuar/Voltar, quem navega é o botão. */
function saiuDoOpcional(e, cond) {
  if (e.relatedTarget === btnAvancar || e.relatedTarget === btnVoltar) return;
  if (cond()) agendarAuto(60);
}

campoCidade.addEventListener('focus', () => { localTocado = true; });
campoCidade.addEventListener('blur', e =>
  saiuDoOpcional(e, () => actual === 2 && dataValida()));

form.addEventListener('keydown', e => {
  if (e.key === 'Enter' && actual < TOTAL_PASSOS && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
    btnAvancar.click();
  }
});

/* ---------------- lead ---------------- */

function lerFormulario() {
  const d = new FormData(form);
  const obj = {};
  for (const [k, v] of d.entries()) obj[k] = v;
  return obj;
}

function utm() {
  const q = new URLSearchParams(location.search);
  return {
    utm_source: q.get('utm_source') || '',
    utm_campaign: q.get('utm_campaign') || ''
  };
}

function construirLead(dados) {
  const agora = new Date();
  return {
    // colunas por ordem da Planilha
    data_registo: agora.toISOString().replace('T', ' ').slice(0, 19),
    nome: dados.nome || '',
    whatsapp: dados.whatsapp || '',
    email: dados.email || '',
    tipo_evento: dados.tipo_evento || '',
    data_evento: dados.data_evento || '',
    cidade: dados.cidade || '',
    interesse: dados.interesse || '',
    horas: dados.horas || '',
    notas: dados.notas || '',
    origem: location.pathname,
    userAgent: navigator.userAgent.slice(0, 120),
    estado: 'novo',
    ...utm(),
    // referência interna
    _id: 'L' + agora.getTime()
  };
}

const COLUNAS = [
  'data_registo', 'nome', 'whatsapp', 'email', 'tipo_evento',
  'data_evento', 'cidade', 'interesse', 'horas', 'notas',
  'origem', 'userAgent', 'estado', 'utm_source', 'utm_campaign'
];

/* ---------------- Google Planilhas ---------------- */

function paraLinha(lead) {
  return COLUNAS.map(c => lead[c] ?? '');
}

function guardarLocal(lead) {
  const a = JSON.parse(localStorage.getItem(CHAVE_LEADS) || '[]');
  a.push(lead);
  localStorage.setItem(CHAVE_LEADS, JSON.stringify(a));
}

function lerFila() {
  return JSON.parse(localStorage.getItem(CHAVE_FILA) || '[]');
}

function gravarFila(fila) {
  localStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
}

/* Envia o lead. Se falhar, fica numa fila local e tentamos de novo depois. */
async function enviarParaPlanilha(lead) {
  const fila = lerFila();

  if (PLANILHA_ENDPOINT) {
    try {
      const resp = await fetch(PLANILHA_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ acao: 'criar_lead', lead, linha: paraLinha(lead) })
      });
      if (resp.ok) {
        if (fila.length) {
          // esvazia pendências antigas
          await Promise.all(fila.map(l => enviarDireto(l)));
          gravarFila([]);
        }
        return { ok: true };
      }
    } catch (e) {
      // segue para fila local
    }
  }

  fila.push(lead);
  gravarFila(fila);
  return { ok: false, naFila: true };
}

async function enviarDireto(lead) {
  await fetch(PLANILHA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ acao: 'criar_lead', lead, linha: paraLinha(lead) })
  });
}

// tenta reenviar pendências quando a página carrega
window.addEventListener('load', async () => {
  const fila = lerFila();
  if (!fila.length || !PLANILHA_ENDPOINT) return;
  const ainda = [];
  for (const l of fila) {
    try {
      const r = await enviarDireto(l);
      if (!r.ok) ainda.push(l);
    } catch { ainda.push(l); }
  }
  gravarFila(ainda);
});

/* ---------------- submit ---------------- */

function dataLegivel(iso) {
  if (!iso) return 'data a combinar';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-PT', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
  } catch { return iso; }
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!validar(TOTAL_PASSOS)) return;

  btnEnviar.disabled = true;
  btnAvancar.disabled = true;
  const enviando = ref('enviando');
  if (enviando) enviando.hidden = false;

  const dados = lerFormulario();
  const lead = construirLead(dados);

  guardarLocal(lead);
  await enviarParaPlanilha(lead);

  const aMandar = ref('enviando');
  if (aMandar) aMandar.hidden = true;
  btnEnviar.disabled = false;
  btnAvancar.disabled = false;

  document.getElementById('sucessoResumo').textContent = [
    '🎉 Tipo de Evento: ' + (dados.tipo_evento || '—'),
    '📅 Data Prevista: ' + dataLegivel(dados.data_evento),
    dados.cidade ? '📍 Local: ' + dados.cidade : null,
    dados.nome ? '👤 Nome: ' + dados.nome : null,
    dados.notas ? '📝 Notas: ' + dados.notas : null
  ].filter(Boolean).join('\n');

  const texto = [
    'Olá, Elly! Gostaria de reservar uma data.',
    '',
    `Nome: ${dados.nome}`,
    `Evento: ${dados.tipo_evento}`,
    `Data: ${dataLegivel(dados.data_evento)}`,
    dados.cidade ? `Local: ${dados.cidade}` : null,
    dados.whatsapp ? `WhatsApp: ${dados.whatsapp}` : null,
    dados.email ? `E-mail: ${dados.email}` : null,
    dados.notas ? `Notas: ${dados.notas}` : null
  ].filter(Boolean).join('\n');

  document.getElementById('btnWhats').href =
    `https://wa.me/${NUM_WHATSAPP}?text=${encodeURIComponent(texto)}`;

  form.hidden = true;
  sucessoEl.hidden = false;
  sucessoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

document.getElementById('btnRecomecar').addEventListener('click', () => {
  form.reset();
  localTocado = false;
  form.hidden = false;
  document.querySelector('.funil-topo').hidden = false;
  sucessoEl.hidden = true;
  actual = 1;
  mostrar(actual);
  document.getElementById('reservar').scrollIntoView({ behavior: 'smooth' });
});

/* ---------------- pré-preenchimento a partir dos cards ----------------
   Clicar num card de evento leva ao funil já com a pergunta 1 respondida. */

function escolherTipo(valor) {
  const alvo = [...form.querySelectorAll('input[name="tipo_evento"]')]
    .find(i => i.value === valor);
  if (!alvo) return false;
  alvo.checked = true;
  return true;
}

document.querySelectorAll('[data-tipo]').forEach(card => {
  card.addEventListener('click', () => {
    if (!escolherTipo(card.dataset.tipo)) return;
    // no passo 1 deixa ver a resposta marcada e segue sozinho;
    // mais adiante só actualiza a resposta, sem puxar para trás
    if (actual === 1) agendarAuto(400);
  });
});

mostrar(1);

/* O editor repõe o innerHTML dos parágrafos no DOMContentLoaded (depois de
   eu arrancar), o que recria o contador do passo. Ao fim da página, volta
   a pôr o número certo. */
window.addEventListener('load', () => mostrar(actual));

/* ============================================================
   CÓDIGO PARA O APPS SCRIPT (Extensões → Apps Script)
   Cria o trigger "AO ENVIAR" como doPost.

function doPost(e) {
  const dados = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActive().getSheetByName('Leads');
  if (dados.acao === 'criar_lead') {
    sheet.appendRow(dados.linha);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
   ============================================================ */
