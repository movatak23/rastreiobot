const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'rastreiobot.db'));

// ── Tabelas ───────────────────────────────────────────────────────────────────
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
`);

// ── Tokens OAuth ──────────────────────────────────────────────────────────────
function saveToken(storeId, accessToken) {
  db.prepare(`
    INSERT INTO tokens (store_id, access_token)
    VALUES (?, ?)
    ON CONFLICT(store_id) DO UPDATE SET access_token = excluded.access_token
  `).run(storeId, accessToken);
}

function getToken(storeId) {
  return db.prepare('SELECT * FROM tokens WHERE store_id = ?').get(storeId);
}

function getAllStores() {
  return db.prepare('SELECT store_id FROM tokens').all();
}

// ── Notificados ───────────────────────────────────────────────────────────────
function marcarNotificado(orderId, storeId, rastreio, telefone) {
  db.prepare(`
    INSERT INTO notificados (order_id, store_id, rastreio, telefone)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET
      rastreio = excluded.rastreio,
      telefone = excluded.telefone
  `).run(orderId, storeId, rastreio || null, telefone || null);
}

function jaNotificado(orderId) {
  return !!db.prepare('SELECT 1 FROM notificados WHERE order_id = ?').get(orderId);
}

// ── Rastreios automáticos ─────────────────────────────────────────────────────
function statusRastreio(codigo) {
  const row = db.prepare('SELECT status_atual FROM rastreios WHERE codigo = ?').get(codigo);
  return row ? row.status_atual : null;
}

function atualizarStatusRastreio(codigo, statusAtual, atualizadoEm) {
  db.prepare(`
    INSERT INTO rastreios (codigo, status_atual, atualizado_em)
    VALUES (?, ?, ?)
    ON CONFLICT(codigo) DO UPDATE SET
      status_atual  = excluded.status_atual,
      atualizado_em = excluded.atualizado_em
  `).run(codigo, statusAtual, atualizadoEm || new Date().toISOString());
}

module.exports = {
  saveToken,
  getToken,
  getAllStores,
  marcarNotificado,
  jaNotificado,
  statusRastreio,
  atualizarStatusRastreio
};
