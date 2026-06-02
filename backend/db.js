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

  CREATE TABLE IF NOT EXISTS opt_out (
    telefone   TEXT PRIMARY KEY,
    store_id   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS configuracoes (
    store_id          TEXT PRIMARY KEY,
    silencio_inicio   INTEGER DEFAULT 22,
    silencio_fim      INTEGER DEFAULT 8,
    relatorio_ativo   INTEGER DEFAULT 1,
    alerta_parado_dias INTEGER DEFAULT 5,
    template_carrinho TEXT,
    template_boleto   TEXT,
    template_confirmacao TEXT,
    template_pos_entrega TEXT,
    pagamento_ativo   INTEGER DEFAULT 1,
    boleto_ativo      INTEGER DEFAULT 1,
    carrinho_ativo    INTEGER DEFAULT 1,
    rastreio_ativo    INTEGER DEFAULT 1,
    pos_entrega_ativo INTEGER DEFAULT 1,
    parado_ativo      INTEGER DEFAULT 1,
    created_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pos_entrega_enviados (
    order_id   TEXT PRIMARY KEY,
    store_id   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS licencas (
    chave      TEXT PRIMARY KEY,
    plano      TEXT NOT NULL,
    store_id   TEXT,
    payment_id TEXT,
    status     TEXT DEFAULT 'ativa',
    expira_em  TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    code       TEXT PRIMARY KEY,
    store_id   TEXT,
    status     TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alerta_parado_enviados (
    order_id   TEXT PRIMARY KEY,
    store_id   TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS clientes_ativos (
    telefone   TEXT PRIMARY KEY,
    store_id   TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS painel_usuarios (
    store_id      TEXT PRIMARY KEY,
    login         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS painel_sessoes (
    token      TEXT PRIMARY KEY,
    store_id   TEXT NOT NULL,
    login      TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS painel_templates (
    store_id   TEXT NOT NULL,
    chave      TEXT NOT NULL,
    conteudo   TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (store_id, chave)
  );

  CREATE TABLE IF NOT EXISTS automacao_logs (
    id         TEXT PRIMARY KEY,
    store_id   TEXT,
    tipo       TEXT,
    pedido     TEXT,
    telefone   TEXT,
    mensagem   TEXT,
    erro       TEXT,
    extra_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );


  CREATE TABLE IF NOT EXISTS envios_avulsos (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id             TEXT NOT NULL,
    codigo_envio          TEXT,
    nome_cliente          TEXT,
    telefone              TEXT NOT NULL,
    email                 TEXT,
    codigo_rastreio       TEXT NOT NULL,
    transportadora        TEXT DEFAULT 'Correios',
    modalidade            TEXT,
    prazo                 TEXT,
    valor                 TEXT,
    ultimo_status         TEXT,
    ultimo_evento_json    TEXT,
    primeira_mensagem_em  TEXT,
    entregue_em           TEXT,
    ativo                 INTEGER DEFAULT 1,
    raw_text              TEXT,
    created_at            TEXT DEFAULT (datetime('now')),
    updated_at            TEXT DEFAULT (datetime('now')),
    UNIQUE(store_id, codigo_rastreio)
  );


  CREATE TABLE IF NOT EXISTS financeiro_conectores (
    store_id       TEXT PRIMARY KEY,
    conector       TEXT DEFAULT 'mercado_pago',
    status         TEXT DEFAULT 'desconectado',
    mp_user_id     TEXT,
    access_token   TEXT,
    refresh_token  TEXT,
    expires_at     INTEGER,
    scope          TEXT,
    teto_saidas    REAL DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS financeiro_oauth_states (
    state      TEXT PRIMARY KEY,
    store_id   TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS financeiro_movimentacoes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id    TEXT NOT NULL,
    conector    TEXT DEFAULT 'mercado_pago',
    origem_id   TEXT NOT NULL,
    data        TEXT,
    descricao   TEXT,
    tipo        TEXT,
    valor       REAL DEFAULT 0,
    categoria   TEXT,
    raw_json    TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(store_id, conector, origem_id, tipo)
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


function jaPedidoRecebido(orderId, storeId, numero, rastreio) {
  const id = String(orderId || '');
  const loja = String(storeId || '');
  const num = String(numero || '');
  const cod = String(rastreio || '');

  if (id && db.prepare('SELECT 1 FROM satisfacao WHERE order_id = ?').get(id)) return true;

  if (id && db.prepare(`
    SELECT 1 FROM automacao_logs
    WHERE store_id = ?
      AND pedido = ?
      AND (
        tipo = 'pesquisa_satisfacao'
        OR lower(COALESCE(mensagem, '')) LIKE '%entreg%'
        OR lower(COALESCE(extra_json, '')) LIKE '%entreg%'
      )
    LIMIT 1
  `).get(loja, num || id)) return true;

  if (cod && db.prepare(`
    SELECT 1 FROM automacao_logs
    WHERE store_id = ?
      AND (
        lower(COALESCE(mensagem, '')) LIKE '%entreg%'
        OR lower(COALESCE(extra_json, '')) LIKE '%entreg%'
      )
      AND (
        COALESCE(extra_json, '') LIKE ?
        OR COALESCE(mensagem, '') LIKE ?
        OR pedido = ?
      )
    LIMIT 1
  `).get(loja, `%${cod}%`, `%${cod}%`, num)) return true;

  return false;
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

// ── Opt-out ───────────────────────────────────────────────────────────────────
function isOptOut(telefone) {
  return !!db.prepare('SELECT 1 FROM opt_out WHERE telefone = ?').get(telefone);
}

function marcarOptOut(telefone, storeId) {
  db.prepare('INSERT OR IGNORE INTO opt_out (telefone, store_id) VALUES (?, ?)').run(telefone, storeId || null);
}

function removerOptOut(telefone) {
  db.prepare('DELETE FROM opt_out WHERE telefone = ?').run(telefone);
}

// ── Configurações por loja ────────────────────────────────────────────────────
function getConfig(storeId) {
  return db.prepare('SELECT * FROM configuracoes WHERE store_id = ?').get(storeId) || {
    store_id: storeId,
    silencio_inicio: 22,
    silencio_fim: 8,
    relatorio_ativo: 1,
    alerta_parado_dias: 5,
    template_carrinho: null,
    template_boleto: null,
    template_confirmacao: null,
    template_pos_entrega: null,
    pagamento_ativo: 1,
    boleto_ativo: 1,
    carrinho_ativo: 1,
    rastreio_ativo: 1,
    pos_entrega_ativo: 1,
    parado_ativo: 1
  };
}

function salvarConfig(storeId, dados) {
  const cfg = getConfig(storeId);
  const merged = { ...cfg, ...dados, store_id: storeId };
  const b = v => (v === 0 || v === false) ? 0 : 1;
  db.prepare(`
    INSERT INTO configuracoes (store_id, silencio_inicio, silencio_fim, relatorio_ativo,
      alerta_parado_dias, template_carrinho, template_boleto, template_confirmacao, template_pos_entrega,
      pagamento_ativo, boleto_ativo, carrinho_ativo, rastreio_ativo, pos_entrega_ativo, parado_ativo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(store_id) DO UPDATE SET
      silencio_inicio      = excluded.silencio_inicio,
      silencio_fim         = excluded.silencio_fim,
      relatorio_ativo      = excluded.relatorio_ativo,
      alerta_parado_dias   = excluded.alerta_parado_dias,
      template_carrinho    = excluded.template_carrinho,
      template_boleto      = excluded.template_boleto,
      template_confirmacao = excluded.template_confirmacao,
      template_pos_entrega = excluded.template_pos_entrega,
      pagamento_ativo      = excluded.pagamento_ativo,
      boleto_ativo         = excluded.boleto_ativo,
      carrinho_ativo       = excluded.carrinho_ativo,
      rastreio_ativo       = excluded.rastreio_ativo,
      pos_entrega_ativo    = excluded.pos_entrega_ativo,
      parado_ativo         = excluded.parado_ativo
  `).run(
    storeId,
    merged.silencio_inicio, merged.silencio_fim, merged.relatorio_ativo,
    merged.alerta_parado_dias, merged.template_carrinho, merged.template_boleto,
    merged.template_confirmacao, merged.template_pos_entrega,
    b(merged.pagamento_ativo), b(merged.boleto_ativo), b(merged.carrinho_ativo),
    b(merged.rastreio_ativo), b(merged.pos_entrega_ativo), b(merged.parado_ativo)
  );
}

// ── Pós-entrega ───────────────────────────────────────────────────────────────
function jaPosEntregaEnviado(orderId) {
  return !!db.prepare('SELECT 1 FROM pos_entrega_enviados WHERE order_id = ?').get(orderId);
}

function marcarPosEntregaEnviado(orderId, storeId) {
  db.prepare('INSERT OR IGNORE INTO pos_entrega_enviados (order_id, store_id) VALUES (?, ?)').run(orderId, storeId);
}

// ── Alerta pedido parado ──────────────────────────────────────────────────────
function listarNotificadosRecentes() {
  return db.prepare('SELECT order_id, telefone, created_at FROM notificados ORDER BY created_at DESC LIMIT 20').all();
}

function registrarClienteAtivo(telefone, storeId) {
  if (!telefone) return;
  db.prepare(`
    INSERT INTO clientes_ativos (telefone, store_id, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(telefone) DO UPDATE SET updated_at = excluded.updated_at
  `).run(String(telefone), storeId || null);
}

function jaClienteAtivo(telefone) {
  if (!telefone) return false;
  const tel = String(telefone).replace(/\D/g, '');
  return !!(
    db.prepare('SELECT 1 FROM clientes_ativos WHERE telefone = ?').get(tel) ||
    db.prepare('SELECT 1 FROM clientes_ativos WHERE telefone = ?').get('55' + tel) ||
    db.prepare('SELECT 1 FROM clientes_ativos WHERE telefone = ?').get(tel.replace(/^55/, ''))
  );
}

function jaNotificadoPorTelefone(telefone) {
  return !!db.prepare('SELECT 1 FROM notificados WHERE telefone = ?').get(telefone);
}

function jaAlertaParadoEnviado(orderId) {
  return !!db.prepare('SELECT 1 FROM alerta_parado_enviados WHERE order_id = ?').get(orderId);
}

function marcarAlertaParadoEnviado(orderId, storeId) {
  db.prepare('INSERT OR IGNORE INTO alerta_parado_enviados (order_id, store_id) VALUES (?, ?)').run(orderId, storeId);
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

// ── Migração ──────────────────────────────────────────────────────────────────
function migrar() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS licencas (
      chave      TEXT PRIMARY KEY,
      plano      TEXT NOT NULL,
      store_id   TEXT,
      payment_id TEXT,
      status     TEXT DEFAULT 'ativa',
      expira_em  TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      code       TEXT PRIMARY KEY,
      store_id   TEXT,
      status     TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS painel_usuarios (
      store_id      TEXT PRIMARY KEY,
      login         TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT
    );
    CREATE TABLE IF NOT EXISTS painel_sessoes (
      token      TEXT PRIMARY KEY,
      store_id   TEXT NOT NULL,
      login      TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS painel_templates (
      store_id   TEXT NOT NULL,
      chave      TEXT NOT NULL,
      conteudo   TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (store_id, chave)
    );
    CREATE TABLE IF NOT EXISTS automacao_logs (
      id         TEXT PRIMARY KEY,
      store_id   TEXT,
      tipo       TEXT,
      pedido     TEXT,
      telefone   TEXT,
      mensagem   TEXT,
      erro       TEXT,
      extra_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

  CREATE TABLE IF NOT EXISTS envios_avulsos (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id             TEXT NOT NULL,
    codigo_envio          TEXT,
    nome_cliente          TEXT,
    telefone              TEXT NOT NULL,
    email                 TEXT,
    codigo_rastreio       TEXT NOT NULL,
    transportadora        TEXT DEFAULT 'Correios',
    modalidade            TEXT,
    prazo                 TEXT,
    valor                 TEXT,
    ultimo_status         TEXT,
    ultimo_evento_json    TEXT,
    primeira_mensagem_em  TEXT,
    entregue_em           TEXT,
    ativo                 INTEGER DEFAULT 1,
    raw_text              TEXT,
    created_at            TEXT DEFAULT (datetime('now')),
    updated_at            TEXT DEFAULT (datetime('now')),
    UNIQUE(store_id, codigo_rastreio)
  );
  `);
  // Adiciona coluna device_id se não existir
  try { db.exec("ALTER TABLE licencas ADD COLUMN device_id TEXT"); } catch(e) {}
  // Licença multi-dispositivo (0 = trava em 1 aparelho, 1 = libera vários)
  try { db.exec("ALTER TABLE licencas ADD COLUMN multi_dispositivo INTEGER DEFAULT 0"); } catch(e) {}
  // Flags de liga/desliga por automação (bancos existentes) — padrão ligado
  try { db.exec("ALTER TABLE configuracoes ADD COLUMN pagamento_ativo INTEGER DEFAULT 1"); } catch(e) {}
  try { db.exec("ALTER TABLE configuracoes ADD COLUMN boleto_ativo INTEGER DEFAULT 1"); } catch(e) {}
  try { db.exec("ALTER TABLE configuracoes ADD COLUMN carrinho_ativo INTEGER DEFAULT 1"); } catch(e) {}
  try { db.exec("ALTER TABLE configuracoes ADD COLUMN rastreio_ativo INTEGER DEFAULT 1"); } catch(e) {}
  try { db.exec("ALTER TABLE configuracoes ADD COLUMN pos_entrega_ativo INTEGER DEFAULT 1"); } catch(e) {}
  try { db.exec("ALTER TABLE configuracoes ADD COLUMN parado_ativo INTEGER DEFAULT 1"); } catch(e) {}
  db.exec(`

  CREATE TABLE IF NOT EXISTS financeiro_conectores (
    store_id       TEXT PRIMARY KEY,
    conector       TEXT DEFAULT 'mercado_pago',
    status         TEXT DEFAULT 'desconectado',
    mp_user_id     TEXT,
    access_token   TEXT,
    refresh_token  TEXT,
    expires_at     INTEGER,
    scope          TEXT,
    teto_saidas    REAL DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS financeiro_oauth_states (
    state      TEXT PRIMARY KEY,
    store_id   TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS financeiro_movimentacoes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id    TEXT NOT NULL,
    conector    TEXT DEFAULT 'mercado_pago',
    origem_id   TEXT NOT NULL,
    data        TEXT,
    descricao   TEXT,
    tipo        TEXT,
    valor       REAL DEFAULT 0,
    categoria   TEXT,
    raw_json    TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(store_id, conector, origem_id, tipo)
  );

  `);
  try { db.exec("ALTER TABLE financeiro_conectores ADD COLUMN teto_saidas REAL DEFAULT 0"); } catch(e) {}
    console.log('[DB] Migração concluída.');
}

// ── Licenças ──────────────────────────────────────────────────────────────────
// Tabela criada via migração no index.js

function criarLicenca(chave, plano, storeId, meses) {
  const expira = new Date();
  expira.setMonth(expira.getMonth() + meses);
  db.prepare(`
    INSERT INTO licencas (chave, plano, store_id, expira_em, status)
    VALUES (?, ?, ?, ?, 'ativa')
    ON CONFLICT(chave) DO NOTHING
  `).run(chave, plano, storeId || null, expira.toISOString());
}

function getLicenca(chave) {
  return db.prepare('SELECT * FROM licencas WHERE chave = ?').get(chave);
}

function getLicencaPorStore(storeId) {
  return db.prepare('SELECT * FROM licencas WHERE store_id = ? AND status = ? ORDER BY expira_em DESC LIMIT 1').get(storeId, 'ativa');
}

function vincularLicenca(chave, storeId) {
  db.prepare('UPDATE licencas SET store_id = ? WHERE chave = ?').run(storeId, chave);
}

function validarLicenca(chave, storeId, deviceId) {
  const lic = db.prepare('SELECT * FROM licencas WHERE chave = ?').get(chave);
  if (!lic) return { valida: false, motivo: 'Chave não encontrada.' };
  if (lic.status !== 'ativa') return { valida: false, motivo: 'Licença inativa.' };
  if (new Date(lic.expira_em) < new Date()) return { valida: false, motivo: 'Licença expirada.' };
  if (lic.store_id && lic.store_id !== String(storeId)) return { valida: false, motivo: 'Chave vinculada a outra loja.' };
  // Verificação de dispositivo — ignorada em licenças multi-dispositivo
  if (deviceId && !lic.multi_dispositivo) {
    if (lic.device_id && lic.device_id !== String(deviceId)) {
      return { valida: false, motivo: 'Esta chave já está vinculada a outro dispositivo. Adquira uma nova licença.' };
    }
    if (!lic.device_id) {
      db.prepare('UPDATE licencas SET device_id = ? WHERE chave = ?').run(String(deviceId), chave);
    }
  }
  if (!lic.store_id) db.prepare('UPDATE licencas SET store_id = ? WHERE chave = ?').run(String(storeId), chave);
  return { valida: true, plano: lic.plano, expira_em: lic.expira_em, multi_dispositivo: !!lic.multi_dispositivo };
}

// Marca/desmarca uma licença como multi-dispositivo (admin)
function setMultiDispositivo(chave, valor) {
  db.prepare('UPDATE licencas SET multi_dispositivo = ? WHERE chave = ?').run(valor ? 1 : 0, String(chave).trim());
  return getLicenca(String(chave).trim());
}

// Desvincular dispositivo (admin — para trocar o computador do cliente)
function desvincularDispositivo(chave) {
  db.prepare('UPDATE licencas SET device_id = NULL WHERE chave = ?').run(chave);
}

function getLicencasPorPayment(paymentId) {
  return db.prepare('SELECT * FROM licencas WHERE payment_id = ?').get(paymentId);
}

function salvarPaymentId(chave, paymentId) {
  db.prepare('UPDATE licencas SET payment_id = ? WHERE chave = ?').run(paymentId, chave);
}

// Busca licenca pela chave (para login do app mobile)
function getLicencaPorChave(chave) {
  return db.prepare("SELECT * FROM licencas WHERE chave = ? AND status = ?").get(chave, "ativa");
}

// Metas por loja
db.exec("CREATE TABLE IF NOT EXISTS metas (store_id TEXT PRIMARY KEY, faturamento REAL DEFAULT 0, pedidos INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')))");

function getMetas(storeId) {
  const row = db.prepare("SELECT faturamento, pedidos FROM metas WHERE store_id = ?").get(storeId);
  return row || { faturamento: 0, pedidos: 0 };
}

function salvarMetas(storeId, faturamento, pedidos) {
  db.prepare("INSERT INTO metas (store_id, faturamento, pedidos, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(store_id) DO UPDATE SET faturamento = excluded.faturamento, pedidos = excluded.pedidos, updated_at = excluded.updated_at").run(storeId, faturamento, pedidos);
}

// ── Auth Sessions ─────────────────────────────────────────────────────────────
function upsertAuthSession(code, status) {
  db.prepare('INSERT OR REPLACE INTO auth_sessions (code, status) VALUES (?, ?)').run(code, status);
}

function getAuthSession(code) {
  return db.prepare('SELECT * FROM auth_sessions WHERE code = ?').get(code);
}

function completeAuthSession(code, storeId) {
  db.prepare('UPDATE auth_sessions SET store_id = ?, status = ? WHERE code = ?').run(storeId, 'done', code);
}

function deleteAuthSession(code) {
  db.prepare('DELETE FROM auth_sessions WHERE code = ?').run(code);
}


// ── Premium: painel administrativo e logs persistentes ───────────────────────
function criarPainelUsuario(storeId, login, passwordHash) {
  db.prepare(`
    INSERT INTO painel_usuarios (store_id, login, password_hash)
    VALUES (?, ?, ?)
  `).run(String(storeId), String(login), String(passwordHash));
}

function getPainelUsuario(storeId) {
  return db.prepare('SELECT * FROM painel_usuarios WHERE store_id = ?').get(String(storeId));
}

function atualizarPainelCredenciais(storeId, login, passwordHash) {
  db.prepare(`
    UPDATE painel_usuarios
    SET login = ?, password_hash = ?, updated_at = datetime('now')
    WHERE store_id = ?
  `).run(String(login), String(passwordHash), String(storeId));
}

function criarPainelSessao(token, storeId, login, expiresAt) {
  db.prepare(`
    INSERT OR REPLACE INTO painel_sessoes (token, store_id, login, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(token), String(storeId), String(login), Date.now(), Number(expiresAt));
}

function getPainelSessao(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM painel_sessoes WHERE token = ?').get(String(token));
  if (!row) return null;
  if (Date.now() > Number(row.expires_at)) {
    db.prepare('DELETE FROM painel_sessoes WHERE token = ?').run(String(token));
    return null;
  }
  return row;
}

function deletarPainelSessao(token) {
  if (!token) return;
  db.prepare('DELETE FROM painel_sessoes WHERE token = ?').run(String(token));
}

function getPainelTemplates(storeId) {
  const rows = db.prepare('SELECT chave, conteudo FROM painel_templates WHERE store_id = ?').all(String(storeId));
  const out = {};
  for (const r of rows) out[r.chave] = r.conteudo;
  return out;
}

function salvarPainelTemplates(storeId, templates) {
  const tx = db.transaction((entries) => {
    for (const [chave, conteudo] of entries) {
      db.prepare(`
        INSERT INTO painel_templates (store_id, chave, conteudo, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(store_id, chave) DO UPDATE SET
          conteudo = excluded.conteudo,
          updated_at = excluded.updated_at
      `).run(String(storeId), String(chave), String(conteudo));
    }
  });
  tx(Object.entries(templates || {}));
}

function registrarLogAutomacao(evento) {
  const e = evento || {};
  db.prepare(`
    INSERT INTO automacao_logs (id, store_id, tipo, pedido, telefone, mensagem, erro, extra_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    e.id || require('crypto').randomBytes(8).toString('hex'),
    e.store_id ? String(e.store_id) : null,
    e.tipo ? String(e.tipo) : null,
    e.pedido ? String(e.pedido) : null,
    e.telefone ? String(e.telefone) : null,
    e.mensagem ? String(e.mensagem) : null,
    e.erro ? String(e.erro) : null,
    JSON.stringify(e.extra || {})
  );
}

function listarLogsAutomacao(limit = 1200) {
  const lim = Math.max(1, Math.min(Number(limit) || 1200, 5000));
  return db.prepare(`
    SELECT id, store_id, tipo, pedido, telefone, mensagem, erro, created_at
    FROM automacao_logs
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(lim).reverse();
}


function listarClientesOperacionais() {
  const stores = db.prepare(`
    SELECT
      t.store_id,
      t.created_at AS loja_conectada_em,
      i.nome_cliente,
      i.zapi_instance,
      i.created_at AS instancia_criada_em,
      u.login AS painel_login,
      u.created_at AS painel_criado_em,
      (
        SELECT plano FROM licencas l
        WHERE l.store_id = t.store_id AND l.status = 'ativa'
        ORDER BY datetime(l.expira_em) DESC
        LIMIT 1
      ) AS plano,
      (
        SELECT chave FROM licencas l
        WHERE l.store_id = t.store_id AND l.status = 'ativa'
        ORDER BY datetime(l.expira_em) DESC
        LIMIT 1
      ) AS chave,
      (
        SELECT expira_em FROM licencas l
        WHERE l.store_id = t.store_id AND l.status = 'ativa'
        ORDER BY datetime(l.expira_em) DESC
        LIMIT 1
      ) AS expira_em,
      (
        SELECT COUNT(*) FROM painel_templates pt
        WHERE pt.store_id = t.store_id
      ) AS templates_configurados,
      (
        SELECT COUNT(*) FROM automacao_logs al
        WHERE al.store_id = t.store_id
      ) AS total_logs,
      (
        SELECT COUNT(*) FROM automacao_logs al
        WHERE al.store_id = t.store_id AND date(al.created_at) = date('now')
      ) AS logs_hoje,
      (
        SELECT created_at FROM automacao_logs al
        WHERE al.store_id = t.store_id
        ORDER BY datetime(al.created_at) DESC
        LIMIT 1
      ) AS ultimo_log_em,
      (
        SELECT tipo FROM automacao_logs al
        WHERE al.store_id = t.store_id
        ORDER BY datetime(al.created_at) DESC
        LIMIT 1
      ) AS ultimo_tipo,
      (
        SELECT erro FROM automacao_logs al
        WHERE al.store_id = t.store_id AND al.erro IS NOT NULL AND al.erro != ''
        ORDER BY datetime(al.created_at) DESC
        LIMIT 1
      ) AS ultimo_erro
    FROM tokens t
    LEFT JOIN instancias i ON i.store_id = t.store_id
    LEFT JOIN painel_usuarios u ON u.store_id = t.store_id
    ORDER BY datetime(t.created_at) DESC
  `).all();

  return stores.map(s => ({
    ...s,
    premium_pronto: !!(s.store_id && s.plano === 'premium' && s.zapi_instance && s.painel_login && Number(s.templates_configurados || 0) >= 8),
    zapi_configurada: !!s.zapi_instance,
    painel_configurado: !!s.painel_login,
    licenca_ativa: !!s.plano,
    templates_ok: Number(s.templates_configurados || 0) >= 8
  }));
}

function getClienteOperacional(storeId) {
  return listarClientesOperacionais().find(c => String(c.store_id) === String(storeId)) || null;
}

function listarLogsPorStore(storeId, limit = 100) {
  const lim = Math.max(1, Math.min(Number(limit) || 100, 500));
  return db.prepare(`
    SELECT id, store_id, tipo, pedido, telefone, mensagem, erro, created_at
    FROM automacao_logs
    WHERE store_id = ?
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(String(storeId), lim).reverse();
}

function getResumoAutomacoesStore(storeId) {
  const total = db.prepare('SELECT COUNT(*) as n FROM automacao_logs WHERE store_id = ?').get(String(storeId))?.n || 0;
  const hoje = db.prepare("SELECT COUNT(*) as n FROM automacao_logs WHERE store_id = ? AND date(created_at) = date('now')").get(String(storeId))?.n || 0;
  const erros = db.prepare("SELECT COUNT(*) as n FROM automacao_logs WHERE store_id = ? AND erro IS NOT NULL AND erro != ''").get(String(storeId))?.n || 0;
  const porTipo = db.prepare(`
    SELECT tipo, COUNT(*) as total
    FROM automacao_logs
    WHERE store_id = ?
    GROUP BY tipo
    ORDER BY total DESC
  `).all(String(storeId));
  const ultimo = db.prepare(`
    SELECT * FROM automacao_logs
    WHERE store_id = ?
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `).get(String(storeId));
  return { total, hoje, erros, porTipo, ultimo };
}



// ── Envios Avulsos ───────────────────────────────────────────────────────────
function salvarEnvioAvulso(envio) {
  const e = envio || {};
  db.prepare(`
    INSERT INTO envios_avulsos (
      store_id, codigo_envio, nome_cliente, telefone, email, codigo_rastreio,
      transportadora, modalidade, prazo, valor, ultimo_status, ultimo_evento_json,
      primeira_mensagem_em, entregue_em, ativo, raw_text, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(store_id, codigo_rastreio) DO UPDATE SET
      codigo_envio = COALESCE(excluded.codigo_envio, envios_avulsos.codigo_envio),
      nome_cliente = COALESCE(excluded.nome_cliente, envios_avulsos.nome_cliente),
      telefone = COALESCE(excluded.telefone, envios_avulsos.telefone),
      email = COALESCE(excluded.email, envios_avulsos.email),
      transportadora = COALESCE(excluded.transportadora, envios_avulsos.transportadora),
      modalidade = COALESCE(excluded.modalidade, envios_avulsos.modalidade),
      prazo = COALESCE(excluded.prazo, envios_avulsos.prazo),
      valor = COALESCE(excluded.valor, envios_avulsos.valor),
      ultimo_status = COALESCE(excluded.ultimo_status, envios_avulsos.ultimo_status),
      ultimo_evento_json = COALESCE(excluded.ultimo_evento_json, envios_avulsos.ultimo_evento_json),
      primeira_mensagem_em = COALESCE(envios_avulsos.primeira_mensagem_em, excluded.primeira_mensagem_em),
      entregue_em = COALESCE(envios_avulsos.entregue_em, excluded.entregue_em),
      ativo = excluded.ativo,
      raw_text = COALESCE(excluded.raw_text, envios_avulsos.raw_text),
      updated_at = datetime('now')
  `).run(
    String(e.store_id),
    e.codigo_envio ? String(e.codigo_envio) : null,
    e.nome_cliente ? String(e.nome_cliente) : null,
    String(e.telefone),
    e.email ? String(e.email) : null,
    String(e.codigo_rastreio),
    e.transportadora ? String(e.transportadora) : 'Correios',
    e.modalidade ? String(e.modalidade) : null,
    e.prazo ? String(e.prazo) : null,
    e.valor ? String(e.valor) : null,
    e.ultimo_status ? String(e.ultimo_status) : null,
    e.ultimo_evento_json ? String(e.ultimo_evento_json) : null,
    e.primeira_mensagem_em ? String(e.primeira_mensagem_em) : null,
    e.entregue_em ? String(e.entregue_em) : null,
    e.ativo === 0 ? 0 : 1,
    e.raw_text ? String(e.raw_text) : null
  );
  return getEnvioAvulso(String(e.store_id), String(e.codigo_rastreio));
}

function getEnvioAvulso(storeId, codigoRastreio) {
  return db.prepare(`
    SELECT * FROM envios_avulsos
    WHERE store_id = ? AND codigo_rastreio = ?
  `).get(String(storeId), String(codigoRastreio));
}

function listarEnviosAvulsos(storeId, limit = 100) {
  const lim = Math.max(1, Math.min(Number(limit) || 100, 500));
  return db.prepare(`
    SELECT * FROM envios_avulsos
    WHERE store_id = ?
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(String(storeId), lim);
}

function listarEnviosAvulsosMonitorar(storeId, limit = 200) {
  const lim = Math.max(1, Math.min(Number(limit) || 200, 500));
  return db.prepare(`
    SELECT * FROM envios_avulsos
    WHERE store_id = ? AND ativo = 1 AND entregue_em IS NULL
    ORDER BY datetime(updated_at) ASC
    LIMIT ?
  `).all(String(storeId), lim);
}

function atualizarEnvioAvulsoStatus(storeId, codigoRastreio, status, evento, entregue) {
  db.prepare(`
    UPDATE envios_avulsos
    SET ultimo_status = ?,
        ultimo_evento_json = ?,
        entregue_em = CASE WHEN ? THEN COALESCE(entregue_em, datetime('now')) ELSE entregue_em END,
        ativo = CASE WHEN ? THEN 0 ELSE ativo END,
        updated_at = datetime('now')
    WHERE store_id = ? AND codigo_rastreio = ?
  `).run(
    status ? String(status) : null,
    evento ? JSON.stringify(evento) : null,
    entregue ? 1 : 0,
    entregue ? 1 : 0,
    String(storeId),
    String(codigoRastreio)
  );
  return getEnvioAvulso(storeId, codigoRastreio);
}

function marcarEnvioAvulsoPrimeiraMensagem(storeId, codigoRastreio) {
  db.prepare(`
    UPDATE envios_avulsos
    SET primeira_mensagem_em = COALESCE(primeira_mensagem_em, datetime('now')),
        updated_at = datetime('now')
    WHERE store_id = ? AND codigo_rastreio = ?
  `).run(String(storeId), String(codigoRastreio));
}



// ── Financeiro / Mercado Pago ────────────────────────────────────────────────
function criarFinanceiroState(state, storeId) {
  db.prepare(`
    INSERT OR REPLACE INTO financeiro_oauth_states (state, store_id, created_at)
    VALUES (?, ?, ?)
  `).run(String(state), String(storeId), Date.now());
}

function getFinanceiroState(state) {
  const row = db.prepare('SELECT * FROM financeiro_oauth_states WHERE state = ?').get(String(state));
  if (!row) return null;
  if ((Date.now() - Number(row.created_at || 0)) > 1000 * 60 * 20) {
    db.prepare('DELETE FROM financeiro_oauth_states WHERE state = ?').run(String(state));
    return null;
  }
  return row;
}

function deleteFinanceiroState(state) {
  db.prepare('DELETE FROM financeiro_oauth_states WHERE state = ?').run(String(state));
}

function salvarMercadoPagoConexao(storeId, dados) {
  const d = dados || {};
  db.prepare(`
    INSERT INTO financeiro_conectores (
      store_id, conector, status, mp_user_id, access_token, refresh_token,
      expires_at, scope, teto_saidas, updated_at
    ) VALUES (?, 'mercado_pago', 'conectado', ?, ?, ?, ?, ?, COALESCE((SELECT teto_saidas FROM financeiro_conectores WHERE store_id = ?), 0), datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET
      conector = 'mercado_pago',
      status = 'conectado',
      mp_user_id = excluded.mp_user_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      scope = excluded.scope,
      updated_at = datetime('now')
  `).run(
    String(storeId),
    d.mp_user_id ? String(d.mp_user_id) : (d.user_id ? String(d.user_id) : null),
    d.access_token ? String(d.access_token) : null,
    d.refresh_token ? String(d.refresh_token) : null,
    d.expires_at ? Number(d.expires_at) : null,
    d.scope ? String(d.scope) : null,
    String(storeId)
  );
  return getMercadoPagoConexao(storeId);
}

function getMercadoPagoConexao(storeId) {
  return db.prepare('SELECT * FROM financeiro_conectores WHERE store_id = ?').get(String(storeId)) || null;
}

function desconectarMercadoPago(storeId) {
  db.prepare(`
    UPDATE financeiro_conectores
    SET status = 'desconectado',
        access_token = NULL,
        refresh_token = NULL,
        updated_at = datetime('now')
    WHERE store_id = ?
  `).run(String(storeId));
  return getMercadoPagoConexao(storeId);
}

function salvarTetoSaidas(storeId, teto) {
  const valor = Number(teto || 0);
  db.prepare(`
    INSERT INTO financeiro_conectores (store_id, conector, status, teto_saidas, updated_at)
    VALUES (?, 'mercado_pago', 'desconectado', ?, datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET
      teto_saidas = excluded.teto_saidas,
      updated_at = datetime('now')
  `).run(String(storeId), valor);
  return getMercadoPagoConexao(storeId);
}

function salvarMovimentacaoFinanceira(m) {
  const x = m || {};
  db.prepare(`
    INSERT INTO financeiro_movimentacoes (
      store_id, conector, origem_id, data, descricao, tipo, valor, categoria, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(store_id, conector, origem_id, tipo) DO UPDATE SET
      data = excluded.data,
      descricao = excluded.descricao,
      valor = excluded.valor,
      categoria = excluded.categoria,
      raw_json = excluded.raw_json
  `).run(
    String(x.store_id),
    x.conector ? String(x.conector) : 'mercado_pago',
    String(x.origem_id),
    x.data ? String(x.data) : null,
    x.descricao ? String(x.descricao) : null,
    x.tipo ? String(x.tipo) : null,
    Number(x.valor || 0),
    x.categoria ? String(x.categoria) : null,
    x.raw_json ? JSON.stringify(x.raw_json) : null
  );
}

function listarMovimentacoesFinanceiras(storeId, inicio, fim, limit = 200) {
  const lim = Math.max(1, Math.min(Number(limit) || 200, 500));
  return db.prepare(`
    SELECT id, store_id, conector, origem_id, data, descricao, tipo, valor, categoria, created_at
    FROM financeiro_movimentacoes
    WHERE store_id = ?
      AND (date(data) >= date(?) OR ? IS NULL)
      AND (date(data) <= date(?) OR ? IS NULL)
    ORDER BY datetime(data) DESC
    LIMIT ?
  `).all(String(storeId), inicio || null, inicio || null, fim || null, fim || null, lim);
}

function getResumoFinanceiro(storeId, inicio, fim) {
  const rows = listarMovimentacoesFinanceiras(storeId, inicio, fim, 500);
  const conn = getMercadoPagoConexao(storeId);
  const resumo = {
    entradas: 0,
    saidas: 0,
    taxas: 0,
    estornos: 0,
    saldo_operacional: 0,
    teto_saidas: Number(conn?.teto_saidas || 0),
    disponivel_teto: Number(conn?.teto_saidas || 0),
    uso_teto_percentual: 0
  };

  for (const r of rows) {
    const v = Math.abs(Number(r.valor || 0));
    if (r.tipo === 'entrada') resumo.entradas += v;
    if (r.tipo === 'taxa') { resumo.taxas += v; resumo.saidas += v; }
    if (r.tipo === 'estorno') { resumo.estornos += v; resumo.saidas += v; }
    if (r.tipo === 'saida') resumo.saidas += v;
  }

  resumo.saldo_operacional = resumo.entradas - resumo.saidas;
  resumo.disponivel_teto = resumo.teto_saidas ? Math.max(0, resumo.teto_saidas - resumo.saidas) : 0;
  resumo.uso_teto_percentual = resumo.teto_saidas ? (resumo.saidas / resumo.teto_saidas) * 100 : 0;

  return { resumo, movimentacoes: rows, conexao: conn };
}

function limparSessoesPainelExpiradas() {
  db.prepare('DELETE FROM painel_sessoes WHERE expires_at < ?').run(Date.now());
}


module.exports = {
  criarFinanceiroState, getFinanceiroState, deleteFinanceiroState,
  salvarMercadoPagoConexao, getMercadoPagoConexao, desconectarMercadoPago,
  salvarTetoSaidas, salvarMovimentacaoFinanceira, listarMovimentacoesFinanceiras, getResumoFinanceiro,
    jaPedidoRecebido,
  salvarEnvioAvulso, getEnvioAvulso, listarEnviosAvulsos, listarEnviosAvulsosMonitorar,
  atualizarEnvioAvulsoStatus, marcarEnvioAvulsoPrimeiraMensagem,
  listarClientesOperacionais, getClienteOperacional, listarLogsPorStore, getResumoAutomacoesStore,
  criarPainelUsuario, getPainelUsuario, atualizarPainelCredenciais,
  criarPainelSessao, getPainelSessao, deletarPainelSessao,
  getPainelTemplates, salvarPainelTemplates,
  registrarLogAutomacao, listarLogsAutomacao, limparSessoesPainelExpiradas,
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
  isOptOut, marcarOptOut, removerOptOut,
  getConfig, salvarConfig,
  jaPosEntregaEnviado, marcarPosEntregaEnviado,
  jaAlertaParadoEnviado, marcarAlertaParadoEnviado,
  jaNotificadoPorTelefone, listarNotificadosRecentes,
  registrarClienteAtivo, jaClienteAtivo,
  getAdminStats, getLojistaStats,
  upsertAuthSession, getAuthSession, completeAuthSession, deleteAuthSession,
  criarLicenca, getLicenca, getLicencaPorStore, vincularLicenca, validarLicenca,
  getLicencasPorPayment, salvarPaymentId, getLicencaPorChave, getMetas, salvarMetas, desvincularDispositivo, setMultiDispositivo,
  migrar
};
