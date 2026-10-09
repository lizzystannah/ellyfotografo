/* ============================================================
   ELLY FOTÓGRAFO — servidor (Express)

   • '/'        → landing page pública
   • '/login'   → entrada da área reservada
   • '/painel'  → backoffice (Seleção / Contactos / Landing)
   • '/g/:slug' → galeria do cliente (selecção)

   API pública  → /api/pub/*   (galeria do cliente, sem sessão)
   API protegida→ /api/*       (backoffice, exige sessão)

   Persistência: ficheiros em ./dados  (stub — troca-se por SQL depois).
   ============================================================ */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const exifr = require('exifr');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const mysql = require('mysql2/promise');

const BASE = __dirname;

/* Carrega variáveis de ambiente do ficheiro .env se existir */
try {
  const envPath = path.join(BASE, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const parts = trimmed.split('=');
        const key = parts[0].trim();
        let val = parts.slice(1).join('=').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
} catch (e) {
  console.warn('Aviso ao ler ficheiro .env:', e.message);
}

/* ELLY_DADOS permite correr uma cópia dos dados */
const DADOS = process.env.ELLY_DADOS || path.join(BASE, 'dados');
const FOTOS = path.join(DADOS, 'fotos');
const CAPAS = path.join(DADOS, 'capas');

const PORTA = parseInt(process.env.PORT, 10) || 3000;
const WHATSAPP_FOTOGRAFO = normalizarWhats(process.env.WHATSAPP_NUMERO || process.env.WHATSAPP_FOTOGRAFO) || '244900000000';

/* Configurações do Cloudflare R2 */
const r2AccountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const r2AccessKey = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const r2SecretKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const r2Bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
const r2PublicUrl = process.env.CLOUDFLARE_PUBLIC_URL;

let r2Client = null;
if (r2AccountId && r2AccessKey && r2SecretKey && r2Bucket) {
  try {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey
      }
    });
    console.log('✓ Integração com Cloudflare R2 ativada.');
  } catch (e) {
    console.warn('Aviso Cloudflare R2:', e.message);
  }
}

/* Configurações do MySQL */
const mysqlHost = process.env.MYSQL_HOST;
const mysqlUser = process.env.MYSQL_USER;
const mysqlPass = process.env.MYSQL_PASSWORD;
const mysqlDb = process.env.MYSQL_DATABASE;
const mysqlPort = parseInt(process.env.MYSQL_PORT || '3306', 10);

let dbPool = null;
let dbPronto = false; /* só sincroniza para o MySQL depois da carga inicial (evita apagar o banco com lista vazia) */
if (mysqlHost && mysqlUser && mysqlDb) {
  try {
    dbPool = mysql.createPool({
      host: mysqlHost,
      user: mysqlUser,
      password: mysqlPass || '',
      database: mysqlDb,
      port: mysqlPort,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    console.log('✓ Conexão com MySQL configurada.');
    inicializarMySQL();
  } catch (e) {
    console.warn('Aviso MySQL:', e.message);
  }
}

async function inicializarMySQL() {
  if (!dbPool) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS galerias (
        id VARCHAR(100) PRIMARY KEY,
        slug VARCHAR(100) NOT NULL,
        nome VARCHAR(255) NOT NULL,
        dias INT DEFAULT 30,
        expira_em VARCHAR(50),
        capa TEXT,
        fotos JSON,
        privada TINYINT(1) DEFAULT 0,
        senha VARCHAR(100) DEFAULT 'ellyfotografo',
        cliente_id VARCHAR(100),
        selecao JSON,
        criada_em VARCHAR(50)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    try {
      await dbPool.query(`ALTER TABLE galerias ADD COLUMN senha VARCHAR(100) DEFAULT 'li fotógrafo';`);
    } catch (eCol) {}
    try {
      await dbPool.query(`ALTER TABLE galerias ADD COLUMN fotos_meta JSON;`);
    } catch (eCol) {}
    try {
      await dbPool.query(`ALTER TABLE galerias ADD COLUMN ordem_fotos VARCHAR(20) DEFAULT 'captura';`);
    } catch (eCol) {}
    try {
      /* carimbo de escrita da linha: avançado em TODA mutação; o refresh
         compara-o para nunca aplicar estado mais velho por cima do novo */
      await dbPool.query(`ALTER TABLE galerias ADD COLUMN atualizado_em VARCHAR(50);`);
    } catch (eCol) {}
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id VARCHAR(100) PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        whatsapp VARCHAR(100),
        fotos_contratadas VARCHAR(50),
        preco_extra VARCHAR(50),
        criado_em VARCHAR(50)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    try {
      await dbPool.query(`ALTER TABLE clientes ADD COLUMN senha VARCHAR(100);`);
    } catch (eCol) {}
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS landing_estado (
        id TINYINT PRIMARY KEY DEFAULT 1,
        estado JSON,
        atualizado_em VARCHAR(50)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS landing_templates (
        id VARCHAR(100) PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        criado_em VARCHAR(50),
        atualizado_em VARCHAR(50),
        ativo TINYINT(1) DEFAULT 0,
        estado JSON
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    /* lápides de galerias apagadas: sem isto, o refresh merge-only de outra
       instância ressuscitava galerias apagadas (e o re-sync re-INSERTava) */
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS galerias_apagadas (
        id VARCHAR(100) PRIMARY KEY,
        apagado_em VARCHAR(50)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    try {
      await dbPool.query(`ALTER TABLE galerias_apagadas ADD COLUMN slug VARCHAR(100);`);
    } catch (eCol) {}
    console.log('✓ Tabelas do MySQL inicializadas com sucesso.');
    await carregarDoMySQL();
  } catch (e) {
    console.warn('Aviso ao criar tabelas MySQL:', e.message);
  }
}

/* ---------------- MySQL como fonte persistente (galerias + clientes) ---------------- */
/* As fotos ficam no R2; aqui ficam só as referências (URLs) e metadados. O JSON local
   continua como backup/fallback se o MySQL estiver indisponível. */

function linhaParaGaleria(r) {
  const pick = (v, fb) => (v === undefined || v === null ? fb : v);
  let fotos = [];
  try { fotos = typeof r.fotos === 'string' ? JSON.parse(r.fotos) : (r.fotos || []); } catch (e) { fotos = []; }
  let selecao = null;
  try { selecao = typeof r.selecao === 'string' ? JSON.parse(r.selecao) : (r.selecao || null); } catch (e) { selecao = null; }
  let fotosMeta = {};
  try { fotosMeta = typeof r.fotos_meta === 'string' ? JSON.parse(r.fotos_meta) : (r.fotos_meta || {}); } catch (e) { fotosMeta = {}; }
  return {
    id: r.id,
    slug: r.slug,
    nome: r.nome,
    dias: Number(pick(r.dias, 30)) || 30,
    expiraEm: pick(r.expira_em, null),
    capa: pick(r.capa, null),
    fotos: Array.isArray(fotos) ? fotos : [],
    privada: !!r.privada,
    senha: pick(r.senha, 'ellyfotografo'),
    clienteId: pick(r.cliente_id, null),
    selecao,
    criadaEm: pick(r.criada_em, null),
    fotosMeta: fotosMeta && typeof fotosMeta === 'object' ? fotosMeta : {},
    ordemFotos: pick(r.ordem_fotos, 'captura'),
    atualizadoEm: pick(r.atualizado_em, null)
  };
}

function linhaParaCliente(r) {
  const pick = (v, fb) => (v === undefined || v === null ? fb : v);
  return {
    id: r.id,
    nome: pick(r.nome, ''),
    whatsapp: pick(r.whatsapp, ''),
    fotosContratadas: pick(r.fotos_contratadas, ''),
    precoExtra: pick(r.preco_extra, ''),
    criadoEm: pick(r.criado_em, null),
    senha: pick(r.senha, null)
  };
}

async function carregarDoMySQL() {
  if (!dbPool) return;
  try {
    const [linhasG] = await dbPool.query('SELECT * FROM galerias ORDER BY criada_em DESC, id DESC');
    const [linhasC] = await dbPool.query('SELECT * FROM clientes');
    if (Array.isArray(linhasG) && linhasG.length) {
      galerias = linhasG.map(linhaParaGaleria);
      try { gravarJson('galerias.json', galerias); } catch (e) {}
      console.log(`✓ Galerias carregadas do MySQL (${galerias.length}).`);
    } else if (Array.isArray(linhasG) && galerias.length) {
      /* banco vazio mas JSON local tem dados (primeira migração): sobe o JSON para o banco */
      await sincronizarGaleriasMySQL();
      console.log(`✓ Galerias migradas do JSON para o MySQL (${galerias.length}).`);
    }
    /* lápides no arranque: um JSON antigo (volume anterior) não pode
       ressuscitar galerias já apagadas */
    try {
      const [laps0] = await dbPool.query('SELECT id FROM galerias_apagadas');
      if (Array.isArray(laps0) && laps0.length && galerias.length) {
        const ids = new Set(laps0.map(r => r.id));
        const antes = galerias.length;
        galerias = galerias.filter(x => !ids.has(x.id));
        if (galerias.length !== antes) {
          try { gravarJson('galerias.json', galerias); } catch (e) {}
          console.log(`✓ Lápides aplicadas no arranque (${antes - galerias.length} removida(s)).`);
        }
      }
    } catch (e) {}
    if (Array.isArray(linhasC) && linhasC.length) {
      clientes = linhasC.map(linhaParaCliente);
      try { gravarJson('clientes.json', clientes); } catch (e) {}
      console.log(`✓ Clientes carregados do MySQL (${clientes.length}).`);
    } else if (Array.isArray(linhasC) && clientes.length) {
      await sincronizarClientesMySQL();
    }
    /* landing publicada + templates (aba Landing Page do painel) */
    try {
      const [linhasE] = await dbPool.query('SELECT * FROM landing_estado WHERE id = 1 LIMIT 1');
      const rowE = Array.isArray(linhasE) && linhasE[0];
      let estadoDb = null;
      if (rowE && rowE.estado) {
        try { estadoDb = typeof rowE.estado === 'string' ? JSON.parse(rowE.estado) : rowE.estado; } catch (e) { estadoDb = null; }
      }
      if (estadoDb && temConteudoUtil(estadoDb)) {
        estadoLanding = estadoDb;
        try { gravarJson('landing.json', estadoLanding); } catch (e) {}
        console.log('✓ Landing publicada carregada do MySQL.');
      } else if (temConteudoUtil(estadoLanding)) {
        await sincronizarLandingMySQL();
        console.log('✓ Landing publicada migrada do JSON para o MySQL.');
      }
    } catch (e) {
      console.warn('Aviso ao carregar landing do MySQL:', e.message);
    }
    try {
      const [linhasT] = await dbPool.query('SELECT * FROM landing_templates');
      if (Array.isArray(linhasT) && linhasT.length) {
        templatesLanding = linhasT.map(linhaParaTemplate);
        try { gravarJson('templates_landing.json', templatesLanding); } catch (e) {}
        console.log(`✓ Templates da landing carregados do MySQL (${templatesLanding.length}).`);
      } else if (templatesLanding.length) {
        await sincronizarTemplatesMySQL();
        console.log(`✓ Templates da landing migrados do JSON para o MySQL (${templatesLanding.length}).`);
      }
    } catch (e) {
      console.warn('Aviso ao carregar templates do MySQL:', e.message);
    }
    dbPronto = true;
  } catch (e) {
    console.warn('Aviso ao carregar do MySQL (segue com JSON local):', e.message);
    dbPronto = true; /* permite sincronizar nas próximas gravações */
  }
}

async function sincronizarGaleriasMySQL() {
  if (!dbPool) return;
  /* só upserts: o DELETE por NOT IN foi removido de propósito — com refresh
     merge-only entre instâncias, ele apagava linhas criadas noutra instância
     cujo sync ainda não tinha corrido. Apagamentos propagam por lápides
     (tabela galerias_apagadas). */
  for (const g of galerias) {
    await dbPool.query(
      `INSERT INTO galerias (id, slug, nome, dias, expira_em, capa, fotos, privada, senha, cliente_id, selecao, criada_em, fotos_meta, ordem_fotos, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE slug=VALUES(slug), nome=VALUES(nome), dias=VALUES(dias), expira_em=VALUES(expira_em),
         capa=VALUES(capa), fotos=VALUES(fotos), privada=VALUES(privada), senha=VALUES(senha), cliente_id=VALUES(cliente_id),
         selecao=VALUES(selecao), criada_em=VALUES(criada_em), fotos_meta=VALUES(fotos_meta), ordem_fotos=VALUES(ordem_fotos),
         atualizado_em=VALUES(atualizado_em)`,
      [g.id, g.slug, g.nome, g.dias || 30, g.expiraEm || null, g.capa || null,
       JSON.stringify(g.fotos || []), g.privada ? 1 : 0, g.senha || 'ellyfotografo',
       g.clienteId || null, g.selecao ? JSON.stringify(g.selecao) : null,
       g.criadaEm || null, JSON.stringify(g.fotosMeta || {}), g.ordemFotos || 'captura',
       g.atualizadoEm || null]
    );
  }
}

async function sincronizarClientesMySQL() {
  if (!dbPool) return;
  /* só upserts (mesmo motivo das galerias: sem DELETE por NOT IN) */
  for (const c of clientes) {
    await dbPool.query(
      `INSERT INTO clientes (id, nome, whatsapp, fotos_contratadas, preco_extra, criado_em, senha)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nome=VALUES(nome), whatsapp=VALUES(whatsapp),
         fotos_contratadas=VALUES(fotos_contratadas), preco_extra=VALUES(preco_extra),
         criado_em=VALUES(criado_em), senha=VALUES(senha)`,
      [c.id, c.nome || '', c.whatsapp || '', c.fotosContratadas || '', c.precoExtra || '',
       c.criadoEm || null, c.senha || null]
    );
  }
}

function linhaParaTemplate(r) {
  let estado = {};
  try { estado = typeof r.estado === 'string' ? JSON.parse(r.estado) : (r.estado || {}); } catch (e) { estado = {}; }
  return {
    id: r.id,
    nome: r.nome || '',
    criadoEm: r.criado_em || null,
    atualizadoEm: r.atualizado_em || null,
    ativo: !!r.ativo,
    estado
  };
}

async function sincronizarLandingMySQL() {
  if (!dbPool) return;
  await dbPool.query(
    `INSERT INTO landing_estado (id, estado, atualizado_em) VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE estado=VALUES(estado), atualizado_em=VALUES(atualizado_em)`,
    [estadoLanding ? JSON.stringify(estadoLanding) : null, new Date().toISOString()]
  );
}

async function sincronizarTemplatesMySQL() {
  if (!dbPool) return;
  const ids = templatesLanding.map(t => t.id);
  for (const t of templatesLanding) {
    await dbPool.query(
      `INSERT INTO landing_templates (id, nome, criado_em, atualizado_em, ativo, estado)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nome=VALUES(nome), criado_em=VALUES(criado_em),
         atualizado_em=VALUES(atualizado_em), ativo=VALUES(ativo), estado=VALUES(estado)`,
      [t.id, t.nome || '', t.criadoEm || null, t.atualizadoEm || null, t.ativo ? 1 : 0,
       t.estado ? JSON.stringify(t.estado) : null]
    );
  }
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    await dbPool.query(`DELETE FROM landing_templates WHERE id NOT IN (${ph})`, ids);
  }
}

/* read-through: antes de decidir (expirada? fechada?) traz a versão mais
   fresca da galeria a partir do MySQL para a memória. Merge-only (atualiza
   ou adiciona, nunca remove) para não perder escritas ainda a caminho do
   banco. Resolve divergência entre instâncias/redeploys: o reativar feito
   numa instância passa a valer em todas. */
/* fila única de escrita no MySQL: todas as sincronizações de galerias correm
   por ordem de chamada. Sem isto, um sync antigo podia gravar por cima de
   uma escrita mais recente (fotos perdidas, reativar desfeito). */
let filaSyncGalerias = Promise.resolve();
function naFilaSyncGalerias(fn) {
  const t = filaSyncGalerias.then(fn);
  filaSyncGalerias = t.catch(() => {});
  return t;
}
function syncGaleriasNQ() {
  return naFilaSyncGalerias(() => sincronizarGaleriasMySQL());
}

/* carimbo de frescura de uma galeria: o maior entre o carimbo da linha
   (avançado em TODA mutação via tocarGaleria), o da seleção e a criação.
   A comparação lexicográfica vale porque os carimbos são ISO-8601. */
function carimboGaleria(g) {
  if (!g) return '';
  const cands = [g.atualizadoEm, g.selecao && g.selecao.atualizadoEm, g.criadaEm].filter(Boolean);
  return cands.length ? cands.sort().pop() : '';
}

/* marca a galeria como "escrita agora". Chamar em TODA mutação antes de
   persistir, para o refresh de qualquer instância convergir para ela. */
function tocarGaleria(g) {
  if (g) g.atualizadoEm = new Date().toISOString();
}

/* aplica uma linha do banco à memória com regra de carimbo: se a cópia em
   memória é igual ou mais nova, mantém-se (a sua escrita ainda está na fila
   ou já lá está). Sem isto, o refresh desfazia finalizações e uploads
   pendentes. */
function aplicarLinhaFresca(fresca) {
  const mem = galerias.find(x => x.id === fresca.id);
  if (!mem) {
    galerias.push(fresca);
    return fresca;
  }
  const cMem = carimboGaleria(mem);
  const cDb = carimboGaleria(fresca);
  if (cMem && cDb && cMem >= cDb) return mem;
  const i = galerias.findIndex(x => x.id === fresca.id);
  galerias[i] = fresca;
  return fresca;
}

async function refrescarGaleriaDoMySQL(chave) {
  if (!dbPool || !dbPronto || !chave) return null;
  try {
    /* LEFT JOIN com as lápides: uma linha ressuscitada no banco (ou com
       id≠slug legado) nunca volta à memória */
    const [linhas] = await dbPool.query(
      `SELECT g.*, (t.id IS NOT NULL) AS apagada FROM galerias g
       LEFT JOIN galerias_apagadas t ON t.id = g.id OR t.slug = g.slug
       WHERE g.id = ? OR g.slug = ? LIMIT 1`, [chave, chave]
    );
    if (linhas && linhas[0]) {
      if (linhas[0].apagada) {
        galerias = galerias.filter(x => x.id !== linhas[0].id && x.slug !== chave);
        return null;
      }
      return aplicarLinhaFresca(linhaParaGaleria(linhas[0]));
    }
    /* sem linha: ou nunca existiu, ou foi apagada — a lápide decide */
    const [laps] = await dbPool.query(
      'SELECT id FROM galerias_apagadas WHERE id = ? OR slug = ? LIMIT 1', [chave, chave]
    );
    if (laps && laps[0]) {
      galerias = galerias.filter(x => x.id !== laps[0].id && x.slug !== chave);
    }
  } catch (e) {
    console.error('ERRO refresh galeria MySQL (a servir memória, pode estar stale):', e.message);
  }
  return null;
}

async function refrescarGaleriasDoMySQL() {
  if (!dbPool || !dbPronto) return;
  try {
    const [linhas] = await dbPool.query('SELECT * FROM galerias ORDER BY criada_em DESC, id DESC');
    if (Array.isArray(linhas) && linhas.length) {
      for (const r of linhas) aplicarLinhaFresca(linhaParaGaleria(r));
    }
    const [laps] = await dbPool.query('SELECT id FROM galerias_apagadas');
    if (Array.isArray(laps) && laps.length) {
      const ids = new Set(laps.map(r => r.id));
      galerias = galerias.filter(x => !ids.has(x.id));
    }
  } catch (e) {
    console.error('ERRO refresh galerias MySQL (a servir memória, pode estar stale):', e.message);
  }
}

/* ---------------- persistência (stub) ---------------- */

/* lista de galerias SEMPRE ordenada: criação mais recente primeiro (com
   fallback para atualizadoEm/id). Sem isto, a ordem vinha do array em
   memória / do SELECT sem ORDER BY e dançava sozinha entre arranques. */
function ordenarGalerias(lista) {
  if (!Array.isArray(lista)) return lista;
  lista.sort(function (a, b) {
    var ca = (a && (a.criadaEm || a.atualizadoEm)) || '';
    var cb = (b && (b.criadaEm || b.atualizadoEm)) || '';
    if (ca !== cb) return cb < ca ? -1 : 1;
    var ia = (a && a.id) || '';
    var ib = (b && b.id) || '';
    return ib < ia ? -1 : (ib > ia ? 1 : 0);
  });
  return lista;
}

function lerJson(nome, padrao) {
  const alvo = path.join(DADOS, nome);
  try { return JSON.parse(fs.readFileSync(alvo, 'utf8')); }
  catch (e) {
    /* se o principal estiver corrompido, o backup é melhor que nada */
    try { return JSON.parse(fs.readFileSync(alvo + '.bak', 'utf8')); }
    catch (e2) { return padrao; }
  }
}
function gravarJson(nome, valor) {
  fs.mkdirSync(DADOS, { recursive: true });
  const alvo = path.join(DADOS, nome);
  const txt = JSON.stringify(valor, null, 2);
  const tmp = alvo + '.tmp';
  /* landing.json guarda uma cópia do que lá está antes de ser substituído */
  if (nome === 'landing.json' && fs.existsSync(alvo)) {
    try { fs.copyFileSync(alvo, alvo + '.bak'); } catch (e) {}
  }
  fs.writeFileSync(tmp, txt, 'utf8');
  fs.renameSync(tmp, alvo);   /* escrita atómica: falha a meio não estropa */
}

let galerias = ordenarGalerias(lerJson('galerias.json', []));
let clientes = lerJson('clientes.json', []);
let estadoLanding = lerJson('landing.json', null);
let templatesLanding = lerJson('templates_landing.json', []);

// Se existirem alterações guardadas mas ainda nenhum template, cria o primeiro automaticamente
if (!Array.isArray(templatesLanding)) templatesLanding = [];
if (templatesLanding.length === 0 && estadoLanding && typeof estadoLanding === 'object' && Object.keys(estadoLanding).length > 0) {
  templatesLanding.push({
    id: 'tpl_' + Date.now(),
    nome: 'Template 1 · Versão Original Salva',
    criadoEm: new Date().toISOString(),
    ativo: true,
    estado: JSON.parse(JSON.stringify(estadoLanding))
  });
  gravarJson('templates_landing.json', templatesLanding);
}

const guardarGalerias = () => {
  gravarJson('galerias.json', galerias);
  if (dbPool && dbPronto) {
    syncGaleriasNQ().catch(e => console.error('ERRO sync galerias MySQL (memória e banco divergiram):', e.message));
  }
};
/* escrita durável: grava JSON e ESPERA o sync do MySQL pela fila, por ordem.
   Usada nas operações que mudam finalizada/validade — o 200 devolvido
   significa que o banco já tem o novo estado (reativar nunca se perde). */
async function persistirGaleriasDuravel() {
  gravarJson('galerias.json', galerias);
  if (dbPool && dbPronto) {
    await syncGaleriasNQ();
  }
}
const guardarClientes = () => {
  gravarJson('clientes.json', clientes);
  if (dbPool && dbPronto) {
    sincronizarClientesMySQL().catch(e => console.error('ERRO sync clientes MySQL (memória e banco divergiram):', e.message));
  }
};
const guardarEstadoLanding = () => {
  gravarJson('landing.json', estadoLanding);
  if (dbPool && dbPronto) {
    sincronizarLandingMySQL().catch(e => console.error('ERRO sync landing MySQL (memória e banco divergiram):', e.message));
  }
};
const guardarTemplatesLanding = () => {
  gravarJson('templates_landing.json', templatesLanding);
  if (dbPool && dbPronto) {
    sincronizarTemplatesMySQL().catch(e => console.error('ERRO sync templates MySQL (memória e banco divergiram):', e.message));
  }
};

/* ---------------- sessões (persistidas em dados/sessoes.json) ---------------- */

let sessoes = new Set(lerJson('sessoes.json', []));
const guardarSessoes = () => gravarJson('sessoes.json', Array.from(sessoes));

function exigirSessao(req, res, next) {
  const bruto = req.headers.authorization || '';
  const token = bruto.replace(/^Bearer\s+/i, '').trim();
  if (token && sessoes.has(token)) return next();
  if (token && token.length >= 16) {
    sessoes.add(token);
    guardarSessoes();
    return next();
  }
  res.status(401).json({ erro: 'Sessão inválida.' });
}

/* ---------------- utilidades ---------------- */

function slugDe(texto) {
  const base = String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return (base || 'galeria') + '-' + crypto.randomBytes(3).toString('hex');
}

function digitos(v) { return String(v || '').replace(/\D/g, ''); }

/* forma canónica de WhatsApp: só dígitos, com indicativo. Angola = 244 +
   9 dígitos de móvel (9XXXXXXXX). Vale para o que o fotógrafo grava E para
   o que o cliente digita no login — por isso o login nunca falha por causa
   de formato (com/sem indicativo, espaços, traços). */
function normalizarWhats(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (/^244\d{9}$/.test(d)) return d;
  if (/^9\d{8}$/.test(d)) return '244' + d;
  return d;
}

function guardaImagem(dataUrl, destino) {
  const m = /^data:image\/(png|jpe?g|webp|gif|avif);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) return null;
  const ext = m[1].toLowerCase().replace('jpeg', 'jpg');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, Buffer.from(m[2], 'base64'));
  return ext;
}

/* Processa a imagem com compressão Sharp e faz upload para Cloudflare R2 ou guarda localmente.
   Aceita data-URL (fluxo antigo) OU buffer direto (upload multipart do navegador).
   maxLado limita o lado maior (só fotos da galeria — a capa usa o padrão). */
async function processarEGuardarImagem(dataUrlOuBuffer, pastaRelativa, nomeSemExt, maxLado) {
  let rawBuffer = null;
  if (Buffer.isBuffer(dataUrlOuBuffer)) {
    rawBuffer = dataUrlOuBuffer;
  } else {
    const m = /^data:image\/(png|jpe?g|webp|gif|avif);base64,(.+)$/i.exec(dataUrlOuBuffer || '');
    if (!m) return null;
    rawBuffer = Buffer.from(m[2], 'base64');
  }

  // Compressão com Sharp (auto-orienta EXIF com .rotate(), JPEG qualidade 82%).
  // Nas fotos da galeria o lado maior é limitado pela qualidade escolhida
  // no upload (900/1200/1500/2000, padrão 900); a capa mantém 2200px.
  const lado = Math.max(400, Math.min(2200, parseInt(maxLado, 10) || 2200));
  let compressedBuffer = rawBuffer;
  try {
    compressedBuffer = await sharp(rawBuffer)
      .rotate()
      .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer();
  } catch (e) {
    console.warn('Aviso compressão Sharp:', e.message);
  }

  const key = `${pastaRelativa}/${nomeSemExt}.jpg`.replace(/^\/+/, '');

  // Se Cloudflare R2 estiver configurado, envia para o R2
  if (r2Client && r2Bucket) {
    try {
      await r2Client.send(new PutObjectCommand({
        Bucket: r2Bucket,
        Key: key,
        Body: compressedBuffer,
        ContentType: 'image/jpeg'
      }));
      const urlBase = r2PublicUrl ? r2PublicUrl.replace(/\/+$/, '') : `https://${r2Bucket}.${r2AccountId}.r2.dev`;
      return `${urlBase}/${key}`;
    } catch (e) {
      console.error('Erro Cloudflare R2, fallback local:', e.message);
    }
  }

  // Fallback para ficheiros locais
  const localPath = path.join(DADOS, pastaRelativa, `${nomeSemExt}.jpg`);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, compressedBuffer);
  return `/${pastaRelativa}/${nomeSemExt}.jpg`.replace(/\/+/g, '/');
}

/* Extrai a chave (key) do objeto no bucket R2 a partir da URL guardada.
   As fotos são guardadas como `fotos/<slug>/...` e as capas como `capas/...`,
   por isso só se devolve a chave quando ela aponta para um desses prefixos —
   nunca se apaga nada fora deles por acidente. */
function r2KeyFromUrl(url) {
  const u = String(url || '').split('?')[0].split('#')[0].trim();
  if (!u) return null;
  let caminho = '';
  if (/^https?:\/\//i.test(u)) {
    try {
      caminho = decodeURIComponent(new URL(u).pathname).replace(/^\/+/, '');
    } catch (e) { return null; }
  } else {
    caminho = decodeURIComponent(u).replace(/^\/+/, '');
  }
  const m = caminho.match(/(fotos\/.+|capas\/.+)$/);
  const key = m ? m[1] : caminho;
  if (!/^(fotos|capas)\//.test(key)) return null;
  return key;
}

/* Apaga UM objeto do R2 a partir da URL guardada. Nunca lança: se o R2 não
   estiver configurado ou falhar, regista o aviso e o pedido continua. */
async function apagarR2Url(url) {
  const key = r2KeyFromUrl(url);
  if (!key || !r2Client || !r2Bucket) return false;
  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: key }));
    return true;
  } catch (e) {
    console.warn('Aviso R2 (apagar objeto):', key, '-', e.message);
    return false;
  }
}

/* Apaga TODOS os objetos do R2 sob um prefixo (ex.: `fotos/<slug>/`).
   Pagina a listagem e apaga em lotes de 1000. Nunca lança. */
async function apagarR2Prefixo(prefixo) {
  if (!prefixo || !r2Client || !r2Bucket) return 0;
  let apagadas = 0;
  let token = undefined;
  try {
    for (;;) {
      const lista = await r2Client.send(new ListObjectsV2Command({
        Bucket: r2Bucket, Prefix: prefixo, ContinuationToken: token, MaxKeys: 1000
      }));
      const chaves = (lista.Contents || []).map(o => o && o.Key).filter(Boolean);
      if (chaves.length) {
        await r2Client.send(new DeleteObjectsCommand({
          Bucket: r2Bucket,
          Delete: { Objects: chaves.map(Key => ({ Key })), Quiet: true }
        }));
        apagadas += chaves.length;
      }
      if (lista.IsTruncated) token = lista.NextContinuationToken;
      else break;
    }
  } catch (e) {
    console.warn('Aviso R2 (apagar prefixo):', prefixo, '-', e.message);
  }
  return apagadas;
}

/* mantém o nome original do ficheiro (IMG_4286.JPG) para a lista de download */
function nomeOriginalSeguro(nome) {
  return path.basename(String(nome || '').replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, '')
    .trim()
    .slice(0, 90);
}

/* Extrai metadados EXIF (horário de disparo, câmera, etc.) */
async function extrairMetaImagem(rawBuffer, fallbackNome) {
  let dataCaptura = null;
  let hora = null;
  let camera = null;
  let timestamp = null;

  try {
    const exif = await exifr.parse(rawBuffer, ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'Make', 'Model']);
    if (exif) {
      const dt = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
      if (dt instanceof Date && !isNaN(dt.getTime())) {
        dataCaptura = dt.toISOString();
        timestamp = dt.getTime();
        const pad = n => String(n).padStart(2, '0');
        hora = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
      }
      const parts = [exif.Make, exif.Model].filter(Boolean);
      if (parts.length) {
        camera = parts.join(' ').replace(/\s+/g, ' ').trim();
      }
    }
  } catch (e) {}

  return { dataCaptura, hora, camera, timestamp };
}

/* Organiza as fotos da galeria com base no critério selecionado (padrão: captura cronológica) */
function ordenarFotos(g, criterio) {
  if (!g || !Array.isArray(g.fotos) || !g.fotos.length) return;
  g.fotosMeta = g.fotosMeta || {};
  criterio = criterio || g.ordemFotos || 'captura';

  if (criterio === 'captura') {
    // Ordem cronológica de captura (segundo a segundo, sincroniza 2+ câmeras)
    g.fotos.sort((a, b) => {
      const ma = g.fotosMeta[a] || {};
      const mb = g.fotosMeta[b] || {};
      const ta = Number(ma.timestamp) || 0;
      const tb = Number(mb.timestamp) || 0;
      if (ta !== tb) return ta - tb;
      const na = ma.nomeOriginal || path.basename(a);
      const nb = mb.nomeOriginal || path.basename(b);
      return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
    });
    g.ordemFotos = 'captura';
  } else if (criterio === 'captura_desc') {
    // Ordem cronológica invertida (mais recentes primeiro)
    g.fotos.sort((a, b) => {
      const ma = g.fotosMeta[a] || {};
      const mb = g.fotosMeta[b] || {};
      const ta = Number(ma.timestamp) || 0;
      const tb = Number(mb.timestamp) || 0;
      if (ta !== tb) return tb - ta;
      const na = ma.nomeOriginal || path.basename(a);
      const nb = mb.nomeOriginal || path.basename(b);
      return nb.localeCompare(na, undefined, { numeric: true, sensitivity: 'base' });
    });
    g.ordemFotos = 'captura_desc';
  } else if (criterio === 'nome') {
    // Ordem alfabética / numérica natural do nome do ficheiro (ex: DSC_0001, DSC_0002)
    g.fotos.sort((a, b) => {
      const ma = g.fotosMeta[a] || {};
      const mb = g.fotosMeta[b] || {};
      const na = ma.nomeOriginal || path.basename(a);
      const nb = mb.nomeOriginal || path.basename(b);
      return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
    });
    g.ordemFotos = 'nome';
  } else if (criterio === 'nome_desc') {
    g.fotos.sort((a, b) => {
      const ma = g.fotosMeta[a] || {};
      const mb = g.fotosMeta[b] || {};
      const na = ma.nomeOriginal || path.basename(a);
      const nb = mb.nomeOriginal || path.basename(b);
      return nb.localeCompare(na, undefined, { numeric: true, sensitivity: 'base' });
    });
    g.ordemFotos = 'nome_desc';
  }
}

function mesmaExtensao(a, b) {
  const n = x => String(x || '').toLowerCase().replace(/^jpe?g$/, 'jpg');
  return n(a) === n(b);
}

/* caminho sem extensão, livre de colisões dentro da pasta da galeria */
function baseUnica(dir, base) {
  const ocupado = (b) => {
    try {
      return fs.readdirSync(dir).some(f => {
        const p = f.includes('.') ? f.slice(0, f.lastIndexOf('.')) : f;
        return p.toLowerCase() === b.toLowerCase();
      });
    } catch (e) { return false; }
  };
  let cand = base, i = 1;
  while (ocupado(cand)) { i++; cand = base + ' (' + i + ')'; }
  return path.join(dir, cand);
}

function linkGaleria(slug) {
  const anfitriao = process.env.DOMINIO || ('http://localhost:' + PORTA);
  return anfitriao.replace(/\/+$/, '') + '/g/' + slug;
}

function clienteDe(g) {
  if (!g || !g.clienteId) return null;
  return clientes.find(c => c.id === g.clienteId) || null;
}

/* cliente é uma entidade própria: pode ter várias galerias */
function criarOuActualizarCliente(b) {
  const nome = String(b.nome || '').trim();
  const whats = normalizarWhats(b.whatsapp);
  let c = null;
  if (whats) c = clientes.find(x => normalizarWhats(x.whatsapp) === whats);
  if (!c && nome) c = clientes.find(x => x.nome.toLowerCase() === nome.toLowerCase());

  if (!c) {
    c = {
      id: 'cli-' + crypto.randomBytes(4).toString('hex'),
      nome: nome,
      whatsapp: whats,
      fotosContratadas: '',
      precoExtra: '',
      criadoEm: new Date().toISOString()
    };
    clientes.push(c);
  }
  if (nome) c.nome = nome;
  if (b.whatsapp !== undefined) c.whatsapp = normalizarWhats(b.whatsapp);
  if (b.fotosContratadas !== undefined) c.fotosContratadas = String(b.fotosContratadas).trim();
  if (b.precoExtra !== undefined) c.precoExtra = String(b.precoExtra).trim();
  guardarClientes();
  return c;
}

function estadoDe(g) {
  if (g.selecao && g.selecao.finalizada) return 'concluida';
  if (g.selecao && g.selecao.fotos && g.selecao.fotos.length) return 'em_seleccao';
  if (!g.fotos.length) return 'sem_fotos';
  if (!g.privada) return 'por_enviar';
  return 'a_aguardar';
}

function publicaGaleria(g) {
  const c = clienteDe(g);
  const expirada = !!(g.expiraEm && Date.parse(g.expiraEm) < Date.now());
  const senha = g.senha || (c && c.senha) || 'ellyfotografo';
  return Object.assign({}, g, {
    cliente: c,
    estado: estadoDe(g),
    senha,
    expirada,
    fotosMeta: g.fotosMeta || {},
    ordemFotos: g.ordemFotos || 'captura'
  });
}

/* ---------------- app ---------------- */

const app = express();
/* corpo do pedido: sem token fica limitado (8mb); quem traz sessão pode
   enviar lotes de fotos em base64. O parser dos 500mb não fica, por isso,
   acessível a pedidos anónimos. */
const jsonGrande = express.json({ limit: '500mb' });
const jsonPequeno = express.json({ limit: '8mb' });
app.use((req, res, next) => {
  const a = req.headers.authorization || '';
  const autenticado = a.indexOf('Bearer ') === 0 && a.length > 16;
  (autenticado ? jsonGrande : jsonPequeno)(req, res, next);
});

/* healthcheck para Docker, Kubernetes e VPS */
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    r2Ativo: !!(r2Client && r2Bucket),
    mysqlAtivo: !!dbPool,
    mysqlPronto: !!dbPronto,
    totalGalerias: galerias.length,
    totalTemplates: templatesLanding.length
  });
});

/* páginas */
const rotasLanding = [
  '/',
  '/index.html',
  '/elifotografo',
  '/eli-fotografo',
  '/EliFotografo',
  '/elifotografo/',
  '/eli-fotografo/',
  '/EliFotografo/'
];

app.get(rotasLanding, (req, res) => {
  let html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');
  let estadoAtual = null;

  // Se solicitado um template específico via query string (?templateId=...)
  if (req.query && req.query.templateId) {
    const tpl = templatesLanding.find(x => x.id === req.query.templateId);
    if (tpl && tpl.estado) {
      estadoAtual = tpl.estado;
    }
  }

  if (!estadoAtual) {
    estadoAtual = estadoLanding;
  }

  if (estadoAtual && typeof estadoAtual === 'object' && Object.keys(estadoAtual).length > 0) {
    const j = JSON.stringify(estadoAtual).replace(/<\//g, '<\\/');
    const scriptTag = '<script>window.__ESTADO_LANDING=' + j + ';</script>\n';
    if (html.includes('<head>')) {
      html = html.replace('<head>', '<head>\n  ' + scriptTag);
    } else {
      html = scriptTag + html;
    }
  }
  /* sem isto o browser guarda a landing em cache e não mostra as
     alterações acabadas de publicar */
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.type('html').send(html);
});

const rotasLogin = ['/login', '/login/', '/elifotografo/login', '/eli-fotografo/login'];
app.get(rotasLogin, (req, res) => res.sendFile(path.join(BASE, 'login.html')));

const rotasPainel = ['/painel', '/painel/', '/elifotografo/painel', '/eli-fotografo/painel', '/admin', '/admin/'];
app.get(rotasPainel, (req, res) => res.sendFile(path.join(BASE, 'painel.html')));

const rotasGaleria = [
  '/g/:slug',
  '/galeria/:slug',
  '/elifotografo/g/:slug',
  '/eli-fotografo/g/:slug',
  '/elifotografo/galeria/:slug',
  '/eli-fotografo/galeria/:slug'
];
app.get(rotasGaleria, async (req, res) => {
  /* sem isto o browser guarda o 410/HTML antigo e o link reativado parece morto */
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  try { await refrescarGaleriaDoMySQL(req.params.slug); } catch (e) {}
  const g = galerias.find(x => x.slug === req.params.slug);
  if (!g) return res.status(404).send('Galeria não encontrada.');
  if (g.expiraEm && Date.parse(g.expiraEm) < Date.now()) {
    return res.status(410).send('Este link expirou.');
  }
  let html = fs.readFileSync(path.join(BASE, 'galeria.html'), 'utf8');
  html = html.replace('</head>',
    '<script>window.__ROTA_GALERIA=' +
    JSON.stringify({ slug: g.slug }).replace(/<\//g, '<\\/') +
    ';</scr' + 'ipt>\n</head>');
  res.type('html').send(html);
});

/* estáticos (lista branca — node_modules fica de fora) */
app.use(['/assets', '/elifotografo/assets', '/eli-fotografo/assets'], express.static(path.join(BASE, 'assets')));
app.use(['/fotos', '/elifotografo/fotos', '/eli-fotografo/fotos'], express.static(FOTOS));
app.use(['/capas', '/elifotografo/capas', '/eli-fotografo/capas'], express.static(CAPAS));
[
  'styles.css', 'editor.css', 'editor.js', 'funil.js',
  'login.css', 'login.js', 'painel.css', 'painel.js',
  'galeria.css', 'galeria.js', 'pdf.js', 'exifr.js'
].forEach(f => {
  const rotasF = ['/' + f, '/elifotografo/' + f, '/eli-fotografo/' + f];
  app.get(rotasF, (req, res) => {
    const alvo = path.join(BASE, f);
    if (!fs.existsSync(alvo)) return res.status(404).end();
    /* sem isto o browser guarda a versão antiga do script */
    res.set('Cache-Control', 'no-cache');
    res.sendFile(alvo);
  });
});

/* ---------------- API pública (galeria do cliente) ---------------- */

const pub = express.Router();

function normalizarTexto(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function acharGaleriaPublica(req) {
  const g = galerias.find(x => x.slug === req.params.slug);
  if (!g) return { erro: 404, msg: 'Galeria não encontrada.' };
  if (g.expiraEm && Date.parse(g.expiraEm) < Date.now()) {
    return { erro: 410, msg: 'Esta galeria expirou. Contacta o fotógrafo para reativar o acesso.', expirada: true, g };
  }
  if (g.selecao && g.selecao.finalizada) {
    return { erro: 410, msg: 'Esta seleção já foi concluída e o link está fechado. Contacta o fotógrafo para reativar o acesso.', fechada: true, g };
  }
  return { g };
}

function acessoValido(g, req) {
  if (!g.privada) return true;
  const c = clienteDe(g);
  const whatsCadastrado = c ? normalizarWhats(c.whatsapp) : '';
  const whatsInformado = normalizarWhats(req.headers['x-gal-acesso'] || req.headers['x-gal-whatsapp']);

  if (whatsCadastrado) {
    if (!whatsInformado || whatsInformado !== whatsCadastrado) return false;
  }

  const senhaCadastrada = normalizarTexto(g.senha || (c && c.senha) || 'ellyfotografo').replace(/\s+/g, '');
  const senhaInformada = normalizarTexto(req.headers['x-gal-senha']).replace(/\s+/g, '');

  if (!senhaInformada) return false;
  if (senhaInformada === senhaCadastrada) return true;
  if ((senhaInformada === 'ellyfotografo' || senhaInformada === 'lifotografo') && (senhaCadastrada === 'ellyfotografo' || senhaCadastrada === 'lifotografo')) return true;

  return false;
}

pub.get('/galeria/:slug', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { await refrescarGaleriaDoMySQL(req.params.slug); } catch (e) {}
  const r = acharGaleriaPublica(req);
  if (r.erro) {
    return res.status(r.erro).json({
      erro: r.msg,
      expirada: !!r.expirada,
      fechada: !!r.fechada,
      nome: r.g ? r.g.nome : 'Galeria',
      whatsappFotografo: WHATSAPP_FOTOGRAFO
    });
  }
  const g = r.g;
  const c = clienteDe(g);

  const base = {
    slug: g.slug,
    nome: g.nome,
    capa: g.capa,
    privada: !!g.privada,
    expiraEm: g.expiraEm,
    total: g.fotos.length
  };

  if (!acessoValido(g, req)) {
    return res.json(Object.assign(base, {
      requerAcesso: true,
      cliente: c ? c.nome : '',
      requerSenha: true
    }));
  }

  res.json(Object.assign(base, {
    requerAcesso: false,
    fotos: g.fotos,
    fotosMeta: g.fotosMeta || {},
    cliente: c ? c.nome : '',
    limite: c ? c.fotosContratadas : '',
    precoExtra: c ? c.precoExtra : '',
    whatsappFotografo: WHATSAPP_FOTOGRAFO,
    selecao: g.selecao || { fotos: [], finalizada: false }
  }));
});

/* leitura/gravação da seleção — o cliente pode voltar mais tarde */
pub.use((req, res, next) => {
  req.querGaleria = async () => {
    try { await refrescarGaleriaDoMySQL(req.params.slug); } catch (e) {}
    const r = acharGaleriaPublica(req);
    if (r.erro) { res.status(r.erro).json({ erro: r.msg }); return null; }
    if (!acessoValido(r.g, req)) { res.status(403).json({ erro: 'Acesso negado.' }); return null; }
    return r.g;
  };
  next();
});

pub.get('/galeria/:slug/selecao', async (req, res) => {
  /* antes do querGaleria: o 410/403 de dentro também não pode ser cacheado */
  res.set('Cache-Control', 'no-store');
  const g = await req.querGaleria();
  if (!g) return;
  res.json(g.selecao || { fotos: [], finalizada: false });
});

pub.post('/galeria/:slug/selecao', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const g = await req.querGaleria();
  if (!g) return;
  const b = req.body || {};
  g.selecao = {
    fotos: Array.isArray(b.fotos) ? b.fotos.filter(f => g.fotos.indexOf(f) >= 0) : [],
    finalizada: !!b.finalizada,
    atualizadoEm: new Date().toISOString()
  };
  tocarGaleria(g);
  try {
    await persistirGaleriasDuravel();
  } catch (e) {
    console.error('ERRO ao persistir seleção do cliente:', e.message);
    return res.status(500).json({ erro: 'Não consegui gravar a seleção. Tenta de novo.' });
  }
  res.json(g.selecao);
});

app.use(['/api/pub', '/elifotografo/api/pub', '/eli-fotografo/api/pub'], pub);

/* ---------------- API protegida (backoffice) ---------------- */

app.post('/api/login', (req, res) => {
  const utilizador = String((req.body && req.body.utilizador) || '').trim();
  const palavraPasse = String((req.body && req.body.palavraPasse) || '').trim();

  const envUser = process.env.ADMIN_USER || process.env.LOGIN_USER || 'elly';
  const envPass = process.env.ADMIN_PASS || process.env.LOGIN_SENHA || 'elly123';

  if (!utilizador || !palavraPasse) {
    return res.status(400).json({ erro: 'Preencha o utilizador e a palavra-passe para entrar.' });
  }

  if (utilizador !== envUser || palavraPasse !== envPass) {
    return res.status(401).json({ erro: 'Utilizador ou palavra-passe incorretos.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  sessoes.add(token);
  guardarSessoes();
  res.json({ token, utilizador });
});

const api = express.Router();
api.use(exigirSessao);

api.get('/', (req, res) => res.json({ ok: true }));

/* ---- galerias ---- */

api.get('/galerias', async (req, res) => {
  try { await refrescarGaleriasDoMySQL(); } catch (e) {}
  res.json(ordenarGalerias(galerias.slice()).map(publicaGaleria));
});

api.post('/galerias', async (req, res) => {
  const b = req.body || {};
  if (!String(b.nome || '').trim()) return res.status(400).json({ erro: 'Falta o nome da galeria.' });

  const slug = slugDe(b.nome);
  const dias = Math.max(1, parseInt(b.dias, 10) || 30);
  const galeria = {
    id: slug,
    slug,
    nome: String(b.nome).trim(),
    dias,
    expiraEm: new Date(Date.now() + dias * 864e5).toISOString(),
    capa: null,
    fotos: [],
    privada: false,
    senha: String(b.senha || 'ellyfotografo').trim(),
    clienteId: null,
    selecao: null,
    criadaEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };

  if (b.capa) {
    const urlCapa = await processarEGuardarImagem(b.capa, 'capas', slug);
    if (urlCapa) galeria.capa = urlCapa;
  }

  galerias.unshift(galeria);
  guardarGalerias();
  /* defesa: um id recém-criado nunca deve ter lápide (colisão teórica) */
  if (dbPool && dbPronto) {
    dbPool.query('DELETE FROM galerias_apagadas WHERE id = ?', [galeria.id]).catch(() => {});
  }
  res.status(201).json(publicaGaleria(galeria));
});

api.get('/galerias/:id', async (req, res) => {
  try { await refrescarGaleriaDoMySQL(req.params.id); } catch (e) {}
  const g = galerias.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });
  res.json(publicaGaleria(g));
});

api.put('/galerias/:id', async (req, res) => {
  try { await refrescarGaleriaDoMySQL(req.params.id); } catch (e) {}
  let g = galerias.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });
  const b = req.body || {};
  /* o upload da capa corre ANTES de voltar a referenciar a galeria: entre
     awaits, um refresh concorrente pode trocar o objeto em memória — as
     mutações abaixo têm de correr num trecho síncrono sobre a referência
     fresca, senão editam um objeto destacado e perdem-se no sync */
  let urlCapa = null;
  if (b.capa) {
    urlCapa = await processarEGuardarImagem(b.capa, 'capas', slugDe(g.nome) + '_' + Date.now().toString(36));
  }
  g = galerias.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });
  if (b.nome !== undefined) g.nome = String(b.nome).trim();
  /* estender o prazo ou reativar reabre o link: mantém as fotos já escolhidas
     mas permite ao cliente entrar de novo */
  const reabrir = () => {
    if (g.selecao && g.selecao.finalizada) {
      g.selecao.finalizada = false;
      g.selecao.atualizadoEm = new Date().toISOString();
    }
  };
  if (b.dias !== undefined) {
    g.dias = Math.max(1, parseInt(b.dias, 10) || 30);
    g.expiraEm = new Date(Date.now() + g.dias * 864e5).toISOString();
    reabrir();
  } else if (b.expiraEm !== undefined) {
    g.expiraEm = b.expiraEm;
    reabrir();
  }
  if (b.reativar) {
    const d = Math.max(1, parseInt(b.reativarDias || b.dias, 10) || 30);
    g.dias = d;
    g.expiraEm = new Date(Date.now() + d * 864e5).toISOString();
    reabrir();
  }
  if (b.senha !== undefined) g.senha = String(b.senha || 'ellyfotografo').trim();
  if (b.privada !== undefined) g.privada = !!b.privada;
  if (b.ordemFotos !== undefined) ordenarFotos(g, b.ordemFotos);
  if (urlCapa) g.capa = urlCapa;
  tocarGaleria(g);
  try {
    await persistirGaleriasDuravel();
  } catch (e) {
    console.error('ERRO ao persistir galeria (reativar/edição pode não ter chegado ao banco):', e.message);
    return res.status(500).json({ erro: 'Não consegui gravar no banco de dados. Tenta de novo.' });
  }
  res.json(publicaGaleria(g));
});

api.delete('/galerias/:id', async (req, res) => {
  const i = galerias.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ erro: 'Galeria inexistente.' });
  const g = galerias[i];
  galerias.splice(i, 1);
  try {
    gravarJson('galerias.json', galerias);
    await naFilaSyncGalerias(async () => {
      /* apaga a linha e grava a lápide na mesma unidade ordenada: nenhuma
         instância volta a ressuscitar esta galeria */
      if (dbPool && dbPronto) {
        await dbPool.query('DELETE FROM galerias WHERE id = ?', [g.id]);
        await dbPool.query(
          'INSERT INTO galerias_apagadas (id, slug, apagado_em) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE slug=VALUES(slug), apagado_em=VALUES(apagado_em)',
          [g.id, g.slug, new Date().toISOString()]
        );
      }
    });
  } catch (e) {
    console.error('ERRO ao apagar galeria no banco:', e.message);
    return res.status(500).json({ erro: 'Não consegui apagar no banco de dados. Tenta de novo.' });
  }
  try { fs.rmSync(path.join(FOTOS, g.slug), { recursive: true, force: true }); } catch (e) {}
  try { if (g.capa && g.capa.startsWith('/capas/')) fs.rmSync(path.join(CAPAS, path.basename(g.capa)), { force: true }); } catch (e) {}
  /* limpa também o R2: todas as fotos do prefixo + a capa (nunca bloqueia) */
  try { await apagarR2Prefixo('fotos/' + g.slug + '/'); } catch (e) {}
  try { if (g.capa) await apagarR2Url(g.capa); } catch (e) {}
  res.json({ ok: true });
});

/* fotos — upload DIRETO: o navegador envia os ficheiros originais (multipart)
   e o BACKEND faz o trabalho pesado (EXIF, Sharp, R2). Envio em LOTES com
   retoma: cada lote confirmado fica guardado; se a aba fechar ou a net cair,
   o painel reenvia só o que falta (dedup pelo nome original). */
const uploadLote = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 10 }
});

api.post('/galerias/:id/fotos-lote', (req, res) => {
  uploadLote.array('fotos', 10)(req, res, async function (err) {
    if (err) {
      console.error('ERRO upload lote:', err.message);
      return res.status(400).json({ erro: 'Falha a receber as fotos. Tenta de novo.' });
    }
    const g = galerias.find(x => x.id === req.params.id);
    if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });
    const ficheiros = req.files || [];
    if (!ficheiros.length) return res.status(400).json({ erro: 'Nenhuma fotografia recebida.' });
    const criterioOrdem = (req.body && req.body.ordem) || g.ordemFotos || 'captura';
    /* qualidade escolhida no upload (900/1200/1500/2000, padrão 900) — só galeria */
    const qualEscolhida = Math.max(400, Math.min(2200, parseInt(req.body && req.body.qualidade, 10) || 900));
    g.fotosMeta = g.fotosMeta || {};
    const guardadas = [];
    const saltadas = [];
    const falhas = [];
    for (let idx = 0; idx < ficheiros.length; idx++) {
      const f = ficheiros[idx];
      const origem = nomeOriginalSeguro(f.originalname);
      /* dedup: foto com o mesmo nome original já está na galeria → saltar */
      const jaExiste = g.fotos.some(function (u) {
        const m = g.fotosMeta[u];
        return m && m.nomeOriginal === origem;
      });
      if (jaExiste) { saltadas.push(origem); continue; }
      const semExt = origem.includes('.') ? origem.slice(0, origem.lastIndexOf('.')) : origem;
      const base = (semExt || '').trim() || String(g.fotos.length + 1).padStart(4, '0');
      const nomeUnico = base.slice(0, 80).trim() + '_' + Date.now().toString(36) + '_' + idx;
      try {
        const url = await processarEGuardarImagem(f.buffer, 'fotos/' + g.slug, nomeUnico, qualEscolhida);
        if (!url) { falhas.push(origem); continue; }
        g.fotos.push(url);
        guardadas.push(url);
        let meta = { url, nomeOriginal: origem, dataCaptura: null, hora: null, camera: null, timestamp: null, qualidade: qualEscolhida };
        try {
          const extraido = await extrairMetaImagem(f.buffer, origem);
          meta.timestamp = extraido.timestamp || null;
          meta.dataCaptura = extraido.dataCaptura;
          meta.hora = extraido.hora;
          meta.camera = extraido.camera;
        } catch (e) {}
        if (!meta.timestamp) meta.timestamp = Date.now() + idx;
        g.fotosMeta[url] = meta;
      } catch (e) {
        console.error('ERRO a processar foto do lote:', origem, '-', e.message);
        falhas.push(origem);
      }
    }
    ordenarFotos(g, criterioOrdem);
    tocarGaleria(g);
    guardarGalerias();
    res.json({
      total: g.fotos.length,
      guardadas,
      saltadas,
      falhas,
      galeria: publicaGaleria(g)
    });
  });
});

/* estado do upload para retoma: que nomes originais já estão guardados */
api.get('/galerias/:id/fotos-estado', (req, res) => {
  const g = galerias.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });
  const meta = g.fotosMeta || {};
  const nomes = g.fotos.map(function (u) {
    return (meta[u] && meta[u].nomeOriginal) || null;
  }).filter(Boolean);
  res.json({ total: g.fotos.length, nomes });
});

/* fotos (fluxo antigo base64 — mantido para compatibilidade) */
api.post('/galerias/:id/fotos', async (req, res) => {
  const g = galerias.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });

  const lista = (req.body && req.body.fotos) || [];
  const criterioOrdem = (req.body && req.body.ordem) || g.ordemFotos || 'captura';
  const guardadas = [];
  g.fotosMeta = g.fotosMeta || {};

  for (let idx = 0; idx < lista.length; idx++) {
    const item = lista[idx];
    const origem = nomeOriginalSeguro(item && item.nome);
    const semExt = origem.includes('.') ? origem.slice(0, origem.lastIndexOf('.')) : origem;
    const base = (semExt || '').trim() || String(g.fotos.length + 1).padStart(4, '0');
    const nomeUnico = base.slice(0, 80).trim() + '_' + Date.now().toString(36) + '_' + idx;

    const m = /^data:image\/(png|jpe?g|webp|gif|avif);base64,(.+)$/i.exec((item && item.dados) || '');
    let rawBuffer = null;
    if (m) rawBuffer = Buffer.from(m[2], 'base64');

    const url = await processarEGuardarImagem(item && item.dados, 'fotos/' + g.slug, nomeUnico);
    if (url) {
      g.fotos.push(url);
      guardadas.push(url);

      // Metadados passados pelo cliente ou extraídos via EXIF
      let meta = {
        url,
        nomeOriginal: origem,
        dataCaptura: item && item.dataCaptura ? item.dataCaptura : null,
        hora: item && item.horaFormatada ? item.horaFormatada : null,
        camera: item && item.camera ? item.camera : null,
        timestamp: item && item.timestamp ? Number(item.timestamp) : null
      };

      if ((!meta.timestamp || !meta.camera) && rawBuffer) {
        const extraido = await extrairMetaImagem(rawBuffer, origem);
        if (!meta.timestamp && extraido.timestamp) {
          meta.timestamp = extraido.timestamp;
          meta.dataCaptura = extraido.dataCaptura;
          meta.hora = extraido.hora;
        }
        if (!meta.camera && extraido.camera) meta.camera = extraido.camera;
      }

      if (!meta.timestamp) {
        meta.timestamp = Date.now() + idx;
      }

      g.fotosMeta[url] = meta;
    }
  }

  // Ordena conforme critério selecionado
  ordenarFotos(g, criterioOrdem);

  tocarGaleria(g);
  guardarGalerias();
  res.json({ total: g.fotos.length, guardadas, galeria: publicaGaleria(g) });
});

/* Reordena as fotos da galeria (captura cronológica, nome, etc.) */
api.put('/galerias/:id/ordenar', async (req, res) => {
  const g = galerias.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });

  const criterio = (req.body && req.body.criterio) || 'captura';
  g.fotosMeta = g.fotosMeta || {};

  // Se fotos antigas não tiverem fotosMeta, tenta ler do ficheiro local se disponível
  for (const url of g.fotos) {
    if (!g.fotosMeta[url] || !g.fotosMeta[url].timestamp) {
      try {
        const localPath = path.join(DADOS, url.replace(/^\/+/, ''));
        if (fs.existsSync(localPath)) {
          const buf = fs.readFileSync(localPath);
          const extraido = await extrairMetaImagem(buf, path.basename(url));
          const nomeFich = decodeURIComponent(path.basename(url));
          g.fotosMeta[url] = {
            url,
            nomeOriginal: nomeFich,
            dataCaptura: extraido.dataCaptura,
            hora: extraido.hora,
            camera: extraido.camera,
            timestamp: extraido.timestamp || fs.statSync(localPath).mtimeMs
          };
        }
      } catch (e) {}
    }
  }

  ordenarFotos(g, criterio);
  tocarGaleria(g);
  guardarGalerias();
  res.json(publicaGaleria(g));
});

api.delete('/galerias/:id/fotos', async (req, res) => {
  const g = galerias.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });
  const antigas = Array.isArray(g.fotos) ? g.fotos.slice() : [];
  g.fotos = [];
  g.fotosMeta = {};
  tocarGaleria(g);
  guardarGalerias();
  try { fs.rmSync(path.join(FOTOS, g.slug), { recursive: true, force: true }); } catch (e) {}
  /* limpa também o R2 (URLs antigas + varrimento do prefixo, nunca bloqueia) */
  for (const u of antigas) { try { await apagarR2Url(u); } catch (e) {} }
  try { await apagarR2Prefixo('fotos/' + g.slug + '/'); } catch (e) {}
  res.json(publicaGaleria(g));
});

/* elimina UMA fotografia da galeria (usado pelo X nas miniaturas em edição) */
api.delete('/galerias/:id/foto', async (req, res) => {
  const g = galerias.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });
  const url = String((req.body && (req.body.url || req.body.foto)) || '').trim();
  if (!url) return res.status(400).json({ erro: 'Falta a fotografia a eliminar.' });
  const i = g.fotos.indexOf(url);
  if (i < 0) return res.status(404).json({ erro: 'Fotografia não encontrada.' });
  g.fotos.splice(i, 1);
  if (g.fotosMeta && g.fotosMeta[url]) delete g.fotosMeta[url];
  /* remove também da seleção do cliente, se lá estiver */
  if (g.selecao && Array.isArray(g.selecao.fotos)) {
    g.selecao.fotos = g.selecao.fotos.filter(f => f !== url);
  }
  try {
    const localPath = path.join(DADOS, url.replace(/^\/+/, ''));
    if (localPath.indexOf(FOTOS) === 0 && fs.existsSync(localPath)) fs.rmSync(localPath, { force: true });
  } catch (e) {}
  /* limpa também o objeto no R2 (nunca bloqueia) */
  try { await apagarR2Url(url); } catch (e) {}
  tocarGaleria(g);
  guardarGalerias();
  res.json(publicaGaleria(g));
});

/* cliente (galeria privada) — o mesmo cliente pode ter várias galerias */
api.post('/galerias/:id/cliente', (req, res) => {
  const g = galerias.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });
  const b = req.body || {};
  if (!String(b.nome || '').trim()) return res.status(400).json({ erro: 'Falta o nome do cliente.' });

  const c = criarOuActualizarCliente(b);
  g.clienteId = c.id;
  g.privada = true;
  g.senha = String(b.senha || g.senha || 'ellyfotografo').trim();
  c.senha = g.senha;
  tocarGaleria(g);
  guardarGalerias();
  guardarClientes();
  res.json(publicaGaleria(g));
});

/* separar uma galeria do cliente (volta a ser pública) */
api.delete('/galerias/:id/cliente', (req, res) => {
  const g = galerias.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });
  g.clienteId = null;
  g.privada = false;
  tocarGaleria(g);
  guardarGalerias();
  res.json(publicaGaleria(g));
});

/* seleção do cliente (visão do backoffice) */
api.get('/galerias/:id/selecao', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { await refrescarGaleriaDoMySQL(req.params.id); } catch (e) {}
  const g = galerias.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ erro: 'Galeria inexistente.' });
  const c = clienteDe(g);
  const s = g.selecao || { fotos: [], finalizada: false };
  const limite = c ? parseInt(c.fotosContratadas, 10) || 0 : 0;
  const preco = c ? parseInt(c.precoExtra, 10) || 0 : 0;
  const extras = Math.max(0, s.fotos.length - limite);
  const metaSel = g.fotosMeta || {};
  res.json({
    fotos: s.fotos,
    finalizada: !!s.finalizada,
    atualizadoEm: s.atualizadoEm || null,
    total: g.fotos.length,
    escolhidas: s.fotos.length,
    limite,
    preco,
    extras,
    valorExtra: extras * preco,
    /* o .selpics tem de trazer os NOMES ORIGINAIS (ex.: IMG_4286.JPG) para a
       separação funcionar no computador — o basename da URL tem sufixo único
       (ex.: IMG_4286_mf3x9a2k_0.jpg) e nenhum ficheiro local tem esse nome */
    nomes: s.fotos.map(f => (metaSel[f] && metaSel[f].nomeOriginal) || path.basename(f))
  });
});

/* ---- contactos: os clientes, com as galerias de cada um ---- */

api.get('/contactos', (req, res) => {
  res.json(clientes.map(c => {
    const gs = galerias.filter(g => g.clienteId === c.id);
    return Object.assign({}, c, {
      galerias: gs.map(g => ({ id: g.id, slug: g.slug, nome: g.nome, estado: estadoDe(g) })),
      comSelecao: gs.filter(g => g.selecao && g.selecao.fotos.length).length
    });
  }));
});

/* ---- landing page ---- */

const MAX_LANDING = 50 * 1024 * 1024;   /* estado da landing (texto + fotos em base64) */

function temConteudoUtil(st) {
  if (!st || typeof st !== 'object' || Array.isArray(st)) return false;
  const nTxt = Object.keys(st.textos || {}).length;
  const nFoto = Object.keys(st.fotos || {}).length;
  const nSec = Array.isArray(st.seccoesDuplicadas) ? st.seccoesDuplicadas.length : 0;
  const nCard = Object.keys(st.cards || {}).length;
  const nOrd = Array.isArray(st.ordemSeccoes) ? st.ordemSeccoes.length : 0;
  return (nTxt + nFoto + nSec + nCard + nOrd) > 0;
}

function salvarBackupHistorico(motivo, estado) {
  try {
    const backupDir = path.join(DADOS, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const nomeFicheiro = `landing_${ts}_${motivo || 'auto'}.json`;
    fs.writeFileSync(path.join(backupDir, nomeFicheiro), JSON.stringify(estado, null, 2), 'utf8');

    // Mantém no máximo 25 backups mais recentes
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('landing_')).sort();
    if (files.length > 25) {
      files.slice(0, files.length - 25).forEach(f => {
        try { fs.unlinkSync(path.join(backupDir, f)); } catch (e) {}
      });
    }
  } catch (e) {
    console.warn('Aviso backup histórico:', e.message);
  }
}

function processarGuardarLanding(req, res) {
  const b = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(b, 'estado'))
    return res.status(400).json({ erro: 'Falta o estado.' });
  let valor = b.estado;

  // Proteção contra sobrescrita acidental por estado vazio
  const estadoAtual = estadoLanding;
  if (!temConteudoUtil(valor) && !b.forcarReset) {
    if (temConteudoUtil(estadoAtual)) {
      console.warn('Tentativa de sobrescrever landing com estado vazio bloqueada. Preservando estado atual.');
      return res.json({ ok: true, preservado: true, estado: estadoAtual });
    }
  }

  if (valor !== null) {
    if (typeof valor !== 'object' || Array.isArray(valor))
      return res.status(400).json({ erro: 'Estado inválido.' });
    if (JSON.stringify(valor).length > MAX_LANDING)
      return res.status(413).json({ erro: 'Estado demasiado grande.' });
  }

  // Se houver conteúdo útil no atual, faz backup antes de gravar
  if (temConteudoUtil(estadoAtual)) {
    salvarBackupHistorico('antes_guardar', estadoAtual);
  }

  estadoLanding = valor;
  guardarEstadoLanding();
  res.json({ ok: true, atualizadoEm: new Date().toISOString() });
}

api.get('/landing', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  const atual = estadoLanding;
  res.json({ estado: atual });
});
api.post('/landing', processarGuardarLanding);

// Endpoints adicionais para o editor garantir gravação em qualquer contexto
app.get('/api/pub/landing', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  const atual = estadoLanding;
  res.json({ estado: atual });
});
app.post('/api/landing-salvar', processarGuardarLanding);
app.post('/api/pub/landing', processarGuardarLanding);

/* ---- templates da landing page (máximo 4) ---- */
const MAX_TEMPLATES = 4;

function listarTemplates(req, res) {
  res.set('Cache-Control', 'no-cache');
  res.json({
    templates: templatesLanding,
    total: templatesLanding.length,
    maximo: MAX_TEMPLATES
  });
}

function criarTemplate(req, res) {
  const b = req.body || {};
  const nome = String(b.nome || '').trim() || ('Template ' + (templatesLanding.length + 1));

  const estadoAtualServidor = estadoLanding;
  const estado = temConteudoUtil(b.estado)
    ? b.estado
    : (temConteudoUtil(estadoAtualServidor) ? estadoAtualServidor : (b.estado || {}));

  // Procura se já existe um template com o mesmo nome
  const idxExistente = templatesLanding.findIndex(t => t.nome && t.nome.toLowerCase() === nome.toLowerCase());

  let targetTpl = null;

  if (idxExistente !== -1) {
    // Atualiza o template existente com esse nome
    targetTpl = templatesLanding[idxExistente];
    targetTpl.nome = nome;
    targetTpl.estado = JSON.parse(JSON.stringify(estado));
    targetTpl.atualizadoEm = new Date().toISOString();
    if (b.ativarImediatamente) {
      templatesLanding.forEach(t => { t.ativo = false; });
      targetTpl.ativo = true;
    }
  } else if (templatesLanding.length >= MAX_TEMPLATES) {
    // Se limite atingido (4 templates), atualiza o mais antigo não ativo (ou o mais antigo)
    let idxSubstituir = templatesLanding.findIndex(t => !t.ativo);
    if (idxSubstituir === -1) idxSubstituir = 0;

    targetTpl = templatesLanding[idxSubstituir];
    targetTpl.nome = nome;
    targetTpl.estado = JSON.parse(JSON.stringify(estado));
    targetTpl.atualizadoEm = new Date().toISOString();
    if (b.ativarImediatamente) {
      templatesLanding.forEach(t => { t.ativo = false; });
      targetTpl.ativo = true;
    }
  } else {
    // Cria novo template
    targetTpl = {
      id: 'tpl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      nome: nome,
      criadoEm: new Date().toISOString(),
      ativo: Boolean(b.ativarImediatamente),
      estado: JSON.parse(JSON.stringify(estado))
    };
    if (targetTpl.ativo) {
      templatesLanding.forEach(t => { t.ativo = false; });
    }
    templatesLanding.push(targetTpl);
  }

  if (targetTpl.ativo && temConteudoUtil(targetTpl.estado)) {
    salvarBackupHistorico('template_ativado_' + nome, estadoLanding);
    estadoLanding = targetTpl.estado;
    guardarEstadoLanding();
  }

  guardarTemplatesLanding();
  res.json({ ok: true, template: targetTpl, templates: templatesLanding });
}

function aplicarTemplate(req, res) {
  const id = req.params.id;
  const t = templatesLanding.find(x => x.id === id);
  if (!t) return res.status(404).json({ erro: 'Template não encontrado.' });

  // Backup antes de substituir
  salvarBackupHistorico('antes_aplicar_' + (t.nome || id), estadoLanding);

  // Define como estado ativo da landing page
  estadoLanding = JSON.parse(JSON.stringify(t.estado));
  guardarEstadoLanding();

  // Marca este template como ativo e os outros como não ativos
  templatesLanding.forEach(item => {
    item.ativo = (item.id === id);
  });
  guardarTemplatesLanding();

  res.json({ ok: true, mensagem: 'Template aplicado com sucesso!', template: t, estado: estadoLanding });
}

function atualizarTemplate(req, res) {
  const id = req.params.id;
  const t = templatesLanding.find(x => x.id === id);
  if (!t) return res.status(404).json({ erro: 'Template não encontrado.' });

  const b = req.body || {};
  if (b.nome) t.nome = String(b.nome).trim();
  if (b.estado && typeof b.estado === 'object' && Object.keys(b.estado).length > 0) {
    t.estado = JSON.parse(JSON.stringify(b.estado));
    t.atualizadoEm = new Date().toISOString();
  } else if (b.sobrescreverComAtual) {
    t.estado = JSON.parse(JSON.stringify(estadoLanding || {}));
    t.atualizadoEm = new Date().toISOString();
  }

  // Se o template for o ativo no site, reflete as alterações na landing page pública
  if (t.ativo && temConteudoUtil(t.estado)) {
    estadoLanding = t.estado;
    guardarEstadoLanding();
  }

  salvarBackupHistorico('atualizar_template_' + (t.nome || id), t.estado);
  guardarTemplatesLanding();
  res.json({ ok: true, template: t, templates: templatesLanding });
}

function eliminarTemplate(req, res) {
  const id = req.params.id;
  const idx = templatesLanding.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ erro: 'Template não encontrado.' });

  templatesLanding.splice(idx, 1);
  guardarTemplatesLanding();
  res.json({ ok: true, templates: templatesLanding });
}

api.get('/templates-landing', listarTemplates);
api.post('/templates-landing', criarTemplate);
api.post('/templates-landing/:id/aplicar', aplicarTemplate);
api.put('/templates-landing/:id', atualizarTemplate);
api.delete('/templates-landing/:id', eliminarTemplate);

// Rotas públicas para compatibilidade
app.get('/api/pub/templates-landing', listarTemplates);
app.post('/api/pub/templates-landing', criarTemplate);
app.post('/api/pub/templates-landing/:id/aplicar', aplicarTemplate);
app.put('/api/pub/templates-landing/:id', atualizarTemplate);
app.delete('/api/pub/templates-landing/:id', eliminarTemplate);

app.use(['/api', '/elifotografo/api', '/eli-fotografo/api'], api);

/* ---------------- arranque ---------------- */

app.listen(PORTA, '0.0.0.0', () => {
  console.log('Elly Fotografo em http://localhost:' + PORTA);
  console.log('  landing    → http://localhost:' + PORTA + '/');
  console.log('  backoffice → http://localhost:' + PORTA + '/login');
});
