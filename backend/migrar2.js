// migrar2.js — rode UMA VEZ após o deploy para criar as novas tabelas
// Comando no Railway: node migrar2.js

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'rastreiobot.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS opt_out (
    telefone   TEXT PRIMARY KEY,
    store_id   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS configuracoes (
    store_id             TEXT PRIMARY KEY,
    silencio_inicio      INTEGER DEFAULT 22,
    silencio_fim         INTEGER DEFAULT 8,
    relatorio_ativo      INTEGER DEFAULT 1,
    alerta_parado_dias   INTEGER DEFAULT 5,
    template_carrinho    TEXT,
    template_boleto      TEXT,
    template_confirmacao TEXT,
    template_pos_entrega TEXT,
    created_at           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pos_entrega_enviados (
    order_id   TEXT PRIMARY KEY,
    store_id   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alerta_parado_enviados (
    order_id   TEXT PRIMARY KEY,
    store_id   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

console.log('✓ Tabelas criadas: opt_out, configuracoes, pos_entrega_enviados, alerta_parado_enviados');
console.log('\nMigração 2 concluída.');
db.close();
