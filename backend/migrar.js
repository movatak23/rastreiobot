// migrar.js — rode UMA VEZ no Railway para adicionar as novas colunas
// Comando: node migrar.js

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'rastreiobot.db');
const db = new Database(DB_PATH);

function addColumnIfNotExists(table, column, definition) {
  const cols = db.pragma(`table_info(${table})`).map(c => c.name);
  if (!cols.includes(column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    console.log(`✓ Coluna '${column}' adicionada em '${table}'`);
  } else {
    console.log(`— Coluna '${column}' já existe em '${table}', pulando`);
  }
}

addColumnIfNotExists('carrinhos_enviados', 'telefone',   'TEXT');
addColumnIfNotExists('carrinhos_enviados', 'recuperado', 'INTEGER DEFAULT 0');

console.log('\nMigração concluída.');
db.close();
