// migrar3.js — rode UMA VEZ após o deploy para criar a tabela de planos
// Comando no Railway: node migrar3.js

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'rastreiobot.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS planos (
    store_id      TEXT PRIMARY KEY,
    plano         TEXT NOT NULL DEFAULT 'basico',
    trial_fim     TEXT,
    ativo         INTEGER DEFAULT 1,
    pedidos_mes   INTEGER DEFAULT 0,
    pedidos_reset TEXT DEFAULT (date('now')),
    created_at    TEXT DEFAULT (datetime('now'))
  );
`);

// Lojas existentes entram automaticamente no trial Pro de 7 dias
const stores = db.prepare('SELECT store_id FROM tokens').all();
const trialFim = new Date();
trialFim.setDate(trialFim.getDate() + 7);

let inseridos = 0;
for (const s of stores) {
  const existe = db.prepare('SELECT 1 FROM planos WHERE store_id = ?').get(s.store_id);
  if (!existe) {
    db.prepare(`
      INSERT INTO planos (store_id, plano, trial_fim, ativo)
      VALUES (?, 'pro', ?, 1)
    `).run(s.store_id, trialFim.toISOString());
    inseridos++;
  }
}

console.log(`✓ Tabela 'planos' criada`);
console.log(`✓ ${inseridos} loja(s) existente(s) colocada(s) em trial Pro de 7 dias`);
console.log('\nMigração 3 concluída.');
db.close();
