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

  CREATE TABLE IF NOT EXISTS satisfacao (
    order_id   TEXT PRIMARY KEY,
    store_id   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS msgs_dia (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    telefone   TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS boletos_enviados (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    TEXT NOT NULL,
    store_id    TEXT NOT NULL,
    etapa       INTEGER NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(order_id, etapa)
  );

  CREATE TABLE IF NOT EXISTS carrinhos_enviados (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    checkout_id TEXT NOT NULL,
    store_id    TEXT NOT NULL,
    etapa       INTEGER NOT NULL,
    telefone    TEXT,
    recuperado  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
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
function jaSatisfacaoEnviada(orderId) {
  return !!db.prepare('SELECT 1 FROM satisfacao WHERE order_id = ?').get(orderId);
}

function marcarSatisfacaoEnviada(orderId, storeId) {
  db.prepare('INSERT OR IGNORE INTO satisfacao (order_id, store_id) VALUES (?, ?)').run(orderId, storeId);
}

function limparRegistrosAntigos() {
  // msgs_dia: mantém só os últimos 7 dias
  db.prepare(`DELETE FROM msgs_dia WHERE created_at < datetime('now', '-7 days')`).run();
  // carrinhos_enviados: mantém só os últimos 60 dias
  db.prepare(`DELETE FROM carrinhos_enviados WHERE created_at < datetime('now', '-60 days')`).run();
  // boletos_enviados: mantém só os últimos 60 dias
  db.prepare(`DELETE FROM boletos_enviados WHERE created_at < datetime('now', '-60 days')`).run();
  // rastreios entregues há mais de 90 dias
  db.prepare(`DELETE FROM rastreios WHERE status_atual = 'entregue' AND atualizado_em < datetime('now', '-90 days')`).run();
  console.log('[DB] Registros antigos removidos.');
}

function mensagensHoje(telefone) {
  const row = db.prepare(`
    SELECT COUNT(*) as n FROM msgs_dia
    WHERE telefone = ? AND created_at >= date('now')
  `).get(telefone);
  return row?.n || 0;
}

function registrarMensagem(telefone) {
  db.prepare('INSERT INTO msgs_dia (telefone) VALUES (?)').run(telefone);
}

function jaBoletoEnviado(orderId, etapa) {
  return !!db.prepare('SELECT 1 FROM boletos_enviados WHERE order_id = ? AND etapa = ?').get(orderId, etapa);
}

function marcarBoletoEnviado(orderId, storeId, etapa) {
  db.prepare('INSERT OR IGNORE INTO boletos_enviados (order_id, store_id, etapa) VALUES (?, ?, ?)').run(orderId, storeId, etapa);
}

function jaCarrinhoEnviado(checkoutId, etapa) {
  return !!db.prepare('SELECT 1 FROM carrinhos_enviados WHERE checkout_id = ? AND etapa = ?').get(checkoutId, etapa);
}

function marcarCarrinhoEnviado(checkoutId, storeId, etapa, telefone) {
  db.prepare(`
    INSERT OR IGNORE INTO carrinhos_enviados (checkout_id, store_id, etapa, telefone) VALUES (?, ?, ?, ?)
  `).run(checkoutId, storeId, etapa, telefone || null);
}

function marcarCarrinhoRecuperado(telefone, storeId) {
  db.prepare(`
    UPDATE carrinhos_enviados SET recuperado = 1
    WHERE store_id = ? AND telefone = ? AND recuperado = 0
  `).run(storeId, telefone);
}

function getCarrinhoStats(storeId) {
  const total      = db.prepare('SELECT COUNT(DISTINCT checkout_id) as n FROM carrinhos_enviados WHERE store_id = ?').get(storeId)?.n || 0;
  const recuperados = db.prepare('SELECT COUNT(DISTINCT checkout_id) as n FROM carrinhos_enviados WHERE store_id = ? AND recuperado = 1').get(storeId)?.n || 0;
  const mes        = db.prepare(`SELECT COUNT(DISTINCT checkout_id) as n FROM carrinhos_enviados WHERE store_id = ? AND created_at >= datetime('now','-30 days')`).get(storeId)?.n || 0;
  const recMes     = db.prepare(`SELECT COUNT(DISTINCT checkout_id) as n FROM carrinhos_enviados WHERE store_id = ? AND recuperado = 1 AND created_at >= datetime('now','-30 days')`).get(storeId)?.n || 0;

  // Por etapa
  const etapas = db.prepare(`
    SELECT etapa,
      COUNT(DISTINCT checkout_id) as enviados,
      SUM(recuperado) as recuperados
    FROM carrinhos_enviados WHERE store_id = ?
    GROUP BY etapa ORDER BY etapa
  `).all(storeId);

  // Melhor etapa (maior taxa de recuperação)
  let melhorEtapa = null, melhorTaxa = 0;
  for (const e of etapas) {
    const taxa = e.enviados > 0 ? e.recuperados / e.enviados : 0;
    if (taxa > melhorTaxa) { melhorTaxa = taxa; melhorEtapa = e.etapa; }
  }

  // Ativos por etapa (último envio de cada checkout, sem recuperação)
  const ativosEtapa = db.prepare(`
    SELECT etapa, COUNT(DISTINCT checkout_id) as n
    FROM carrinhos_enviados
    WHERE store_id = ? AND recuperado = 0
    AND created_at >= datetime('now','-7 days')
    GROUP BY etapa ORDER BY etapa
  `).all(storeId);

  return {
    total, recuperados, mes, recMes,
    taxaGeral: total > 0 ? Math.round((recuperados / total) * 100) : 0,
    taxaMes:   mes   > 0 ? Math.round((recMes / mes) * 100) : 0,
    etapas, melhorEtapa, melhorTaxa: Math.round(melhorTaxa * 100),
    ativosEtapa
  };
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

// ── Planos ────────────────────────────────────────────────────────────────────
const PLANOS = {
  basico: {
    nome: 'Básico',
    preco: 97,
    limite_pedidos: 200,
    funcionalidades: ['rastreio', 'pagamento']
  },
  pro: {
    nome: 'Pro',
    preco: 297,
    limite_pedidos: null, // sem limite
    funcionalidades: ['rastreio', 'pagamento', 'carrinho', 'boleto', 'pos_entrega', 'alerta_parado', 'relatorio']
  }
};

function getPlano(storeId) {
  const row = db.prepare('SELECT * FROM planos WHERE store_id = ?').get(storeId);
  if (!row) {
    // Loja sem plano = trial de 7 dias automático
    const trialFim = new Date();
    trialFim.setDate(trialFim.getDate() + 7);
    db.prepare(`
      INSERT OR IGNORE INTO planos (store_id, plano, trial_fim, ativo)
      VALUES (?, 'pro', ?, 1)
    `).run(storeId, trialFim.toISOString());
    return getPlano(storeId);
  }
  return row;
}

function isTrialAtivo(storeId) {
  const p = getPlano(storeId);
  if (!p.trial_fim) return false;
  return new Date(p.trial_fim) > new Date();
}

function planoAtivo(storeId) {
  const p = getPlano(storeId);
  if (!p.ativo) return false;
  if (isTrialAtivo(storeId)) return true;
  return !!p.ativo;
}

function temFuncionalidade(storeId, func) {
  const p = getPlano(storeId);
  if (!planoAtivo(storeId)) return false;
  if (isTrialAtivo(storeId)) return true; // trial tem acesso a tudo
  const cfg = PLANOS[p.plano] || PLANOS.basico;
  return cfg.funcionalidades.includes(func);
}

function podePedido(storeId) {
  const p = getPlano(storeId);
  if (isTrialAtivo(storeId)) return true;
  const cfg = PLANOS[p.plano] || PLANOS.basico;
  if (!cfg.limite_pedidos) return true; // sem limite
  // Reset mensal
  const hoje = new Date().toISOString().slice(0, 7); // YYYY-MM
  const reset = (p.pedidos_reset || '').slice(0, 7);
  if (reset !== hoje) {
    db.prepare('UPDATE planos SET pedidos_mes = 0, pedidos_reset = date("now") WHERE store_id = ?').run(storeId);
    return true;
  }
  return (p.pedidos_mes || 0) < cfg.limite_pedidos;
}

function incrementarPedido(storeId) {
  db.prepare('UPDATE planos SET pedidos_mes = pedidos_mes + 1 WHERE store_id = ?').run(storeId);
}

function definirPlano(storeId, plano, trialFim) {
  db.prepare(`
    INSERT INTO planos (store_id, plano, trial_fim, ativo)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(store_id) DO UPDATE SET
      plano     = excluded.plano,
      trial_fim = excluded.trial_fim,
      ativo     = 1
  `).run(storeId, plano, trialFim || null);
}

function getPlanoDados(storeId) {
  const p = getPlano(storeId);
  const cfg = PLANOS[p.plano] || PLANOS.basico;
  const emTrial = isTrialAtivo(storeId);
  const trialDias = p.trial_fim
    ? Math.max(0, Math.ceil((new Date(p.trial_fim) - new Date()) / 86400000))
    : 0;
  return {
    plano: p.plano,
    nome: cfg.nome,
    preco: cfg.preco,
    ativo: planoAtivo(storeId),
    emTrial,
    trialDias,
    trialFim: p.trial_fim,
    limite_pedidos: cfg.limite_pedidos,
    pedidos_mes: p.pedidos_mes || 0,
    funcionalidades: emTrial ? Object.keys(PLANOS.pro.funcionalidades) : cfg.funcionalidades
  };
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
  jaSatisfacaoEnviada, marcarSatisfacaoEnviada,
  limparRegistrosAntigos,
  mensagensHoje, registrarMensagem,
  jaBoletoEnviado, marcarBoletoEnviado,
  jaCarrinhoEnviado, marcarCarrinhoEnviado, marcarCarrinhoRecuperado, getCarrinhoStats,
  getPlano, planoAtivo, temFuncionalidade, podePedido, incrementarPedido,
  definirPlano, getPlanoDados, isTrialAtivo, PLANOS,
  getAdminStats, getLojistaStats
};
