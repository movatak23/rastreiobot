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

  CREATE TABLE IF NOT EXISTS carrinhos_enviados (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    checkout_id TEXT NOT NULL,
    store_id   TEXT NOT NULL,
    etapa      INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(checkout_id, etapa)
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
function jaCarrinhoEnviado(checkoutId, etapa) {
  return !!db.prepare('SELECT 1 FROM carrinhos_enviados WHERE checkout_id = ? AND etapa = ?').get(checkoutId, etapa);
}

function marcarCarrinhoEnviado(checkoutId, storeId, etapa) {
  db.prepare(`
    INSERT OR IGNORE INTO carrinhos_enviados (checkout_id, store_id, etapa) VALUES (?, ?, ?)
  `).run(checkoutId, storeId, etapa);
}

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

// ── Stats para dashboards ─────────────────────────────────────────────────────
function getAdminStats() {
  const totalClientes = db.prepare('SELECT COUNT(*) as n FROM instancias').get()?.n || 0;
  const totalStores   = db.prepare('SELECT COUNT(*) as n FROM tokens').get()?.n || 0;
  const clientesNovos = db.prepare(`SELECT COUNT(*) as n FROM instancias WHERE created_at >= datetime('now','-30 days')`).get()?.n || 0;
  const totalNotif    = db.prepare('SELECT COUNT(*) as n FROM notificados').get()?.n || 0;
  const totalConfirm  = db.prepare('SELECT COUNT(*) as n FROM confirmacoes').get()?.n || 0;
  const totalCarrinho = db.prepare('SELECT COUNT(*) as n FROM carrinhos_enviados').get()?.n || 0;
  const mrr           = totalClientes * 297;

  const notifMes      = db.prepare(`SELECT COUNT(*) as n FROM notificados WHERE created_at >= datetime('now','-30 days')`).get()?.n || 0;
  const confirmMes    = db.prepare(`SELECT COUNT(*) as n FROM confirmacoes WHERE created_at >= datetime('now','-30 days')`).get()?.n || 0;
  const carrinhoMes   = db.prepare(`SELECT COUNT(*) as n FROM carrinhos_enviados WHERE created_at >= datetime('now','-30 days')`).get()?.n || 0;
  const totalMsgMes   = notifMes + confirmMes + carrinhoMes;

  const clientes      = db.prepare('SELECT store_id, nome_cliente, zapi_instance, created_at FROM instancias ORDER BY created_at DESC').all();

  return {
    totalClientes, totalStores, clientesNovos, mrr,
    mensagens: { rastreio: totalNotif, pagamento: totalConfirm, carrinho: totalCarrinho, total: totalNotif + totalConfirm + totalCarrinho },
    mensagensMes: { rastreio: notifMes, pagamento: confirmMes, carrinho: carrinhoMes, total: totalMsgMes },
    clientes
  };
}

function getLojistaStats(storeId) {
  const notifTotal = db.prepare('SELECT COUNT(*) as n FROM notificados WHERE store_id = ?').get(storeId)?.n || 0;
  const notifHoje  = db.prepare(`SELECT COUNT(*) as n FROM notificados WHERE store_id = ? AND created_at >= date('now')`).get(storeId)?.n || 0;
  const notifMes   = db.prepare(`SELECT COUNT(*) as n FROM notificados WHERE store_id = ? AND created_at >= datetime('now','-30 days')`).get(storeId)?.n || 0;

  const confirmTotal = db.prepare('SELECT COUNT(*) as n FROM confirmacoes WHERE store_id = ?').get(storeId)?.n || 0;
  const confirmMes   = db.prepare(`SELECT COUNT(*) as n FROM confirmacoes WHERE store_id = ? AND created_at >= datetime('now','-30 days')`).get(storeId)?.n || 0;

  const carrinhoTotal = db.prepare('SELECT COUNT(*) as n FROM carrinhos_enviados WHERE store_id = ?').get(storeId)?.n || 0;
  const carrinhoMes   = db.prepare(`SELECT COUNT(*) as n FROM carrinhos_enviados WHERE store_id = ? AND created_at >= datetime('now','-30 days')`).get(storeId)?.n || 0;

  // Rastreios ativos (não entregues)
  const rastreiosAtivos = db.prepare(`SELECT COUNT(*) as n FROM rastreios WHERE status_atual != 'entregue'`).get()?.n || 0;
  const entregues       = db.prepare(`SELECT COUNT(*) as n FROM rastreios WHERE status_atual = 'entregue'`).get()?.n || 0;

  const totalMsgMes = notifMes + confirmMes + carrinhoMes;

  return {
    notificados: { total: notifTotal, hoje: notifHoje, mes: notifMes },
    pagamentos:  { total: confirmTotal, mes: confirmMes },
    carrinhos:   { total: carrinhoTotal, mes: carrinhoMes },
    rastreios:   { ativos: rastreiosAtivos, entregues },
    mensagensMes: totalMsgMes
  };
}

module.exports = {
  saveToken, getToken, getAllStores,
  marcarNotificado, jaNotificado,
  statusRastreio, atualizarStatusRastreio,
  jaConfirmacaoEnviada, marcarConfirmacaoEnviada,
  salvarInstancia, getInstancia, listarInstancias,
  jaCarrinhoEnviado, marcarCarrinhoEnviado,
  getAdminStats, getLojistaStats
};
