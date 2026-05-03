const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS tokens (
    store_id     TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    created_at   INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS notificados (
    order_id   TEXT PRIMARY KEY,
    store_id   TEXT NOT NULL,
    rastreio   TEXT,
    telefone   TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

module.exports = {
  saveToken(storeId, token) {
    db.prepare(`INSERT INTO tokens(store_id,access_token) VALUES(?,?)
      ON CONFLICT(store_id) DO UPDATE SET access_token=excluded.access_token`)
      .run(String(storeId), token);
  },
  getToken(storeId) {
    return db.prepare('SELECT access_token FROM tokens WHERE store_id=?').get(String(storeId));
  },
  getAllStores() {
    return db.prepare('SELECT store_id FROM tokens').all();
  },
  marcarNotificado(orderId, storeId, rastreio, telefone) {
    db.prepare(`INSERT OR IGNORE INTO notificados(order_id,store_id,rastreio,telefone)
      VALUES(?,?,?,?)`).run(String(orderId), String(storeId), rastreio, telefone);
  },
  jaNotificado(orderId) {
    return !!db.prepare('SELECT 1 FROM notificados WHERE order_id=?').get(String(orderId));
  },
  getNotificados(storeId) {
    return db.prepare('SELECT * FROM notificados WHERE store_id=? ORDER BY created_at DESC LIMIT 200')
      .all(String(storeId));
  }
};
