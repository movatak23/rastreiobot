const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'rastreiobot.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS tokens (
    store_id     TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notificados (
    order_id   TEXT PRIMARY KEY,
    store_id   TEXT,
    rastreio   TEXT,
    telefone   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rastreios (
    codigo        TEXT PRIMARY KEY,
    status_atual  TEXT,
    atualizado_em TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS confirmacoes (
    order_id   TEXT PRIMARY KEY,
    store_id   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS instancias (
    store_id          TEXT PRIMARY KEY,
    zapi_instance     TEXT NOT NULL,
    zapi_token        TEXT NOT NULL,
    zapi_client_token TEXT NOT NULL,
    nome_cliente      TEXT,
    created_at        TEXT DEFAULT (datetime('now'))
  );
`);

function saveToken(storeId, accessToken) {
  db.prepare(`
    INSERT INTO tokens (store_id, access_token) VALUES (?, ?)
    ON CONFLICT(store_id) DO UPDATE SET access_token = excluded.access_token
  `).run(storeId, accessToken);
}

function getToken(storeId) {
  return db.prepare('SELECT * FROM tokens WHERE store_id = ?').get(storeId);
}

function getAllStores() {
  return db.prepare('SELECT store_id FROM tokens').all();
}

// ── Instâncias Z-API por cliente ─────────────────────────────────────────────
function salvarInstancia(storeId, zapiInstance, zapiToken, zapiClientToken, nomeCliente) {
  db.prepare(`
    INSERT INTO instancias (store_id, zapi_instance, zapi_token, zapi_client_token, nome_cliente)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(store_id) DO UPDATE SET
      zapi_instance      = excluded.zapi_instance,
      zapi_token         = excluded.zapi_token,
      zapi_client_token  = excluded.zapi_client_token,
      nome_cliente       = excluded.nome_cliente
  `).run(storeId, zapiInstance, zapiToken, zapiClientToken, nomeCliente || null);
}

function getInstancia(storeId) {
  return db.prepare('SELECT * FROM instancias WHERE store_id = ?').get(storeId);
}

function listarInstancias() {
  return db.prepare('SELECT store_id, nome_cliente, zapi_instance, created_at FROM instancias').all();
}

function marcarNotificado(orderId, storeId, rastreio, telefone) {
  db.prepare(`
    INSERT INTO notificados (order_id, store_id, rastreio, telefone) VALUES (?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET rastreio = excluded.rastreio, telefone = excluded.telefone
  `).run(orderId, storeId, rastreio || null, telefone || null);
}

function jaNotificado(orderId) {
  return !!db.prepare('SELECT 1 FROM notificados WHERE order_id = ?').get(orderId);
}

function statusRastreio(codigo) {
  const row = db.prepare('SELECT status_atual FROM rastreios WHERE codigo = ?').get(codigo);
  return row ? row.status_atual : null;
}

function atualizarStatusRastreio(codigo, statusAtual, atualizadoEm) {
  db.prepare(`
    INSERT INTO rastreios (codigo, status_atual, atualizado_em) VALUES (?, ?, ?)
    ON CONFLICT(codigo) DO UPDATE SET status_atual = excluded.status_atual, atualizado_em = excluded.atualizado_em
  `).run(codigo, statusAtual, atualizadoEm || new Date().toISOString());
}

function jaConfirmacaoEnviada(orderId) {
  return !!db.prepare('SELECT 1 FROM confirmacoes WHERE order_id = ?').get(orderId);
}

function marcarConfirmacaoEnviada(orderId, storeId) {
  db.prepare(`
    INSERT INTO confirmacoes (order_id, store_id) VALUES (?, ?)
    ON CONFLICT(order_id) DO NOTHING
  `).run(orderId, storeId);
}

module.exports = {
  saveToken, getToken, getAllStores,
  marcarNotificado, jaNotificado,
  statusRastreio, atualizarStatusRastreio,
  jaConfirmacaoEnviada, marcarConfirmacaoEnviada,
  salvarInstancia, getInstancia, listarInstancias
};
