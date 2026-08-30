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

  CREATE TABLE IF NOT EXISTS prospeccao_lojas (
    domain      TEXT PRIMARY KEY,
    store_name  TEXT,
    niche       TEXT,
    email       TEXT,
    whatsapp    TEXT,
    instagram   TEXT,
    final_url   TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
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


  CREATE TABLE IF NOT EXISTS financeiro_relatorios_mp (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id        TEXT NOT NULL,
    report_id       TEXT,
    file_name       TEXT,
    status          TEXT,
    begin_date      TEXT,
    end_date        TEXT,
    raw_json        TEXT,
    imported_at     TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(store_id, report_id)
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

// Marca que a loja teve um evento de pedido/checkout (via webhook Nuvemshop).
// O cron passa a só consultar a Nuvemshop de lojas com evento recente → elimina
// o polling de lojas paradas (fonte dos 404 "Last page is 0").
function marcarEventoLoja(storeId) {
  try {
    db.prepare("UPDATE tokens SET ultimo_evento_em = datetime('now') WHERE store_id = ?").run(String(storeId));
  } catch (e) { /* coluna garantida no migrar(); ignora corrida de boot */ }
}

function lojaComEventoRecente(storeId, janelaMs) {
  const row = db.prepare('SELECT ultimo_evento_em FROM tokens WHERE store_id = ?').get(String(storeId));
  if (!row || !row.ultimo_evento_em) return false;
  const t = Date.parse(String(row.ultimo_evento_em).replace(' ', 'T') + 'Z');
  if (isNaN(t)) return false;
  return (Date.now() - t) < janelaMs;
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

// Info completa do rastreio (p/ decidir registrar 1x vs deixar o webhook cuidar)
function getRastreioInfo(codigo) {
  return db.prepare('SELECT status_atual, atualizado_em, created_at FROM rastreios WHERE codigo = ?').get(codigo) || null;
}

function atualizarStatusRastreio(codigo, statusAtual, atualizadoEm) {
  db.prepare(`
    INSERT INTO rastreios (codigo, status_atual, atualizado_em) VALUES (?, ?, ?)
    ON CONFLICT(codigo) DO UPDATE SET status_atual = excluded.status_atual, atualizado_em = excluded.atualizado_em
  `).run(codigo, statusAtual, atualizadoEm || new Date().toISOString());
}

function foiRastreioConsultadoHoje(codigo) {
  const row = db.prepare('SELECT atualizado_em FROM rastreios WHERE codigo = ?').get(codigo);
  if (!row?.atualizado_em) return false;
  const ultima = new Date(row.atualizado_em);
  const agora  = new Date();
  return ultima.toISOString().slice(0, 10) === agora.toISOString().slice(0, 10);
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

// Leads do formulário da landing (/cadastro).
function salvarLead(nome, email, whatsapp, plano) {
  const info = db.prepare('INSERT INTO leads (nome, email, whatsapp, plano) VALUES (?,?,?,?)')
    .run(String(nome || '').trim(), String(email || '').trim().toLowerCase(), String(whatsapp || '').trim(), String(plano || '').trim());
  return info.lastInsertRowid;
}
// Lista os leads mais recentes, marcando quem já conectou a loja (casa pelo e-mail
// do cadastro com o e-mail da loja gravado em tokens, quando existir).
function listarLeads(limite) {
  return db.prepare(`SELECT id, nome, email, whatsapp, plano, store_id, criado_em
                     FROM leads ORDER BY datetime(criado_em) DESC LIMIT ?`).all(Number(limite) || 100);
}
// Casa o lead com a loja quando ela conecta o OAuth. O e-mail do formulário nem sempre
// é o mesmo cadastrado na Nuvemshop, então tenta os dois. Só marca lead ainda solto
// (store_id NULL) e pega o mais recente — assim o mesmo e-mail pode instalar 2 lojas.
function vincularLeadALoja(storeId, ...emails) {
  const lista = emails.map(e => String(e || '').trim().toLowerCase()).filter(Boolean);
  if (!storeId || !lista.length) return 0;
  // Se essa loja já foi casada antes, não faz de novo (reinstalação não rouba outro lead).
  const jaTem = db.prepare('SELECT 1 FROM leads WHERE store_id = ?').get(String(storeId));
  if (jaTem) return 0;
  const marcadores = lista.map(() => '?').join(',');
  const alvo = db.prepare(
    `SELECT id FROM leads WHERE store_id IS NULL AND lower(email) IN (${marcadores})
     ORDER BY datetime(criado_em) DESC LIMIT 1`).get(...lista);
  if (!alvo) return 0;
  return db.prepare('UPDATE leads SET store_id = ? WHERE id = ?').run(String(storeId), alvo.id).changes;
}
function deletarLead(id) {
  return db.prepare('DELETE FROM leads WHERE id = ?').run(Number(id)).changes;
}
function contarLeads() {
  const n = (sql) => { try { return db.prepare(sql).get().n || 0; } catch (e) { return 0; } };
  return {
    total: n('SELECT COUNT(*) n FROM leads'),
    hoje:  n("SELECT COUNT(*) n FROM leads WHERE criado_em >= date('now')"),
    d7:    n("SELECT COUNT(*) n FROM leads WHERE criado_em >= datetime('now','-7 days')"),
    d30:   n("SELECT COUNT(*) n FROM leads WHERE criado_em >= datetime('now','-30 days')")
  };
}

// Rastreios avulsos do MÊS CORRENTE (crédito extra que o admin concede).
// Aceita qtd negativa pra corrigir um lançamento errado; nunca deixa o saldo abaixo de 0.
function addRastreioExtra(storeId, qtd) {
  const n = Math.trunc(Number(qtd) || 0);
  if (!storeId || !n) return getRastreioExtra(storeId);
  // Linha nova não pode nascer negativa; linha existente soma o valor real (n pode ser < 0).
  db.prepare(`INSERT INTO rastreio_extra (store_id, ano_mes, qtd)
              VALUES (?, strftime('%Y-%m','now'), ?)
              ON CONFLICT(store_id, ano_mes) DO UPDATE SET
                qtd = MAX(0, qtd + ?), atualizado_em = datetime('now')`)
    .run(String(storeId), Math.max(0, n), n);
  return getRastreioExtra(storeId);
}
function getRastreioExtra(storeId) {
  if (!storeId) return 0;
  const r = db.prepare(`SELECT qtd FROM rastreio_extra WHERE store_id=? AND ano_mes=strftime('%Y-%m','now')`)
    .get(String(storeId));
  return (r && r.qtd) || 0;
}

// Registra 1 visita da landing no dia de hoje (contador simples de pageviews).
function registrarVisita() {
  try {
    db.prepare(`INSERT INTO visitas (dia, total) VALUES (date('now'), 1)
                ON CONFLICT(dia) DO UPDATE SET total = total + 1`).run();
  } catch (e) {}
}

// Painel de gestão / funil: visitas → instalações → pagantes, com MRR e breakdown.
function getGestaoStats() {
  const n = (sql) => { try { return db.prepare(sql).get()?.n || 0; } catch (e) { return 0; } };

  const instalacoes = {
    total: n('SELECT COUNT(*) n FROM tokens'),
    hoje:  n("SELECT COUNT(*) n FROM tokens WHERE created_at >= date('now')"),
    d7:    n("SELECT COUNT(*) n FROM tokens WHERE created_at >= datetime('now','-7 days')"),
    d30:   n("SELECT COUNT(*) n FROM tokens WHERE created_at >= datetime('now','-30 days')"),
    serie: (() => { try { return db.prepare("SELECT date(created_at) dia, COUNT(*) total FROM tokens WHERE created_at >= datetime('now','-13 days') GROUP BY date(created_at) ORDER BY dia").all(); } catch (e) { return []; } })()
  };

  // Pagantes = lojas com licença ativa, não expirada, de plano pago (basic/premium).
  let pagantesRows = [];
  try {
    pagantesRows = db.prepare(`SELECT store_id, LOWER(plano) plano FROM licencas
       WHERE status='ativa' AND expira_em > datetime('now') AND LOWER(plano) IN ('basic','premium') AND store_id IS NOT NULL
       GROUP BY store_id`).all();
  } catch (e) { pagantesRows = []; }
  const essencial = pagantesRows.filter(r => r.plano === 'basic').length;
  const pro       = pagantesRows.filter(r => r.plano === 'premium').length;
  const pagantes  = pagantesRows.length;
  const mrr       = essencial * 97 + pro * 147;

  // Trial vs Free entre as lojas não-pagantes (trial = instalou há < 7 dias).
  const pagosSet = new Set(pagantesRows.map(r => String(r.store_id)));
  let stores = [];
  try { stores = db.prepare('SELECT store_id, created_at FROM tokens').all(); } catch (e) { stores = []; }
  const seteDias = 7 * 86400000;
  let trial = 0;
  for (const s of stores) {
    if (pagosSet.has(String(s.store_id))) continue;
    const t = Date.parse(String(s.created_at || '').replace(' ', 'T') + 'Z');
    if (!isNaN(t) && (Date.now() - t) < seteDias) trial++;
  }
  const free = Math.max(0, instalacoes.total - pagantes - trial);

  const visitas = {
    total: n('SELECT COALESCE(SUM(total),0) n FROM visitas'),
    hoje:  n("SELECT COALESCE(SUM(total),0) n FROM visitas WHERE dia = date('now')"),
    d7:    n("SELECT COALESCE(SUM(total),0) n FROM visitas WHERE dia >= date('now','-7 days')"),
    serie: (() => { try { return db.prepare("SELECT dia, total FROM visitas WHERE dia >= date('now','-13 days') ORDER BY dia").all(); } catch (e) { return []; } })()
  };

  const taxas = {
    visita_para_install: visitas.d7 > 0 ? +(instalacoes.d7 / visitas.d7 * 100).toFixed(1) : null,
    install_para_pagante: instalacoes.total > 0 ? +(pagantes / instalacoes.total * 100).toFixed(1) : null
  };

  return { visitas, instalacoes, planos: { pagantes, essencial, pro, trial, free }, mrr, taxas };
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
  try { db.exec("ALTER TABLE tokens ADD COLUMN ultimo_evento_em TEXT"); } catch(e) {}
  // Contador de visitas da landing (para o painel de gestão / funil).
  try { db.exec("CREATE TABLE IF NOT EXISTS visitas (dia TEXT PRIMARY KEY, total INTEGER DEFAULT 0)"); } catch(e) {}
  // Leads do formulário da landing. Antes o /cadastro só mandava e-mail e NÃO gravava
  // nada — quem se cadastrava não aparecia em painel nenhum (o funil só enxerga loja
  // que completou o OAuth, na tabela tokens).
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS leads (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nome      TEXT,
      email     TEXT,
      whatsapp  TEXT,
      plano     TEXT,
      store_id  TEXT,
      criado_em TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)');
  } catch(e) {}
  // Rastreios AVULSOS: crédito extra por loja, válido só no mês em que foi dado.
  // Soma ao teto do plano em getLimiteRastreio. Expira sozinho na virada do mês.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS rastreio_extra (
      store_id  TEXT,
      ano_mes   TEXT,
      qtd       INTEGER DEFAULT 0,
      atualizado_em TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (store_id, ano_mes)
    )`);
  } catch(e) {}
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

  CREATE TABLE IF NOT EXISTS financeiro_relatorios_mp (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id        TEXT NOT NULL,
    report_id       TEXT,
    file_name       TEXT,
    status          TEXT,
    begin_date      TEXT,
    end_date        TEXT,
    raw_json        TEXT,
    imported_at     TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(store_id, report_id)
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
  try { db.exec("ALTER TABLE financeiro_conectores ADD COLUMN teto_saidas REAL DEFAULT 0"); } catch(e) {}
  try { db.exec("ALTER TABLE financeiro_movimentacoes ADD COLUMN nome_custom TEXT"); } catch(e) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS rastreio_contexto (
      codigo        TEXT PRIMARY KEY,
      store_id      TEXT,
      order_number  TEXT,
      contact_name  TEXT,
      telefone      TEXT,
      transportadora TEXT,
      updated_at    TEXT DEFAULT (datetime('now'))
    )`);
  } catch(e) {}
  // Migração aditiva: tabelas antigas não tinham 'transportadora' (rastreio de
  // transportadora — Jadlog/Loggi/etc. — passou a ser suportado, não só Correios).
  try { db.exec(`ALTER TABLE rastreio_contexto ADD COLUMN transportadora TEXT`); } catch(e) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS rastreio_uso (
      store_id    TEXT,
      ano_mes     TEXT,
      codigo      TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(store_id, ano_mes, codigo)
    )`);
  } catch(e) {}
  // Marca lojas que já converteram de trial → plano pago (para zerar o contador 1x na virada).
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS trial_convertido (
      store_id      TEXT PRIMARY KEY,
      convertido_em TEXT DEFAULT (datetime('now'))
    )`);
  } catch(e) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS assinaturas (
      store_id       TEXT PRIMARY KEY,
      preapproval_id TEXT,
      plano          TEXT,
      status         TEXT,
      email          TEXT,
      proxima_cobranca TEXT,
      atualizado_em  TEXT DEFAULT (datetime('now'))
    )`);
  } catch(e) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS painel_reset (
      store_id   TEXT PRIMARY KEY,
      codigo     TEXT,
      expira_em  TEXT,
      criado_em  TEXT DEFAULT (datetime('now'))
    )`);
  } catch(e) {}
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

// Licença de TESTE (trial) de N dias, vinculada à loja. Chave determinística TRIAL-<store>.
// ON CONFLICT DO NOTHING = 1 trial por loja (reconectar não renova/reabre → sem abuso).
function criarTrial(storeId, plano, dias) {
  const expira = new Date(Date.now() + Number(dias || 7) * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO licencas (chave, plano, store_id, expira_em, status)
    VALUES (?, ?, ?, ?, 'ativa')
    ON CONFLICT(chave) DO NOTHING
  `).run('TRIAL-' + String(storeId), plano || 'premium', String(storeId), expira);
  return getLicencaPorStore(String(storeId));
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

// ── Assinaturas recorrentes (Mercado Pago preapproval) ──────────────────────
function upsertAssinatura(storeId, preapprovalId, plano, status, email, proximaCobranca) {
  db.prepare(`
    INSERT INTO assinaturas (store_id, preapproval_id, plano, status, email, proxima_cobranca, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET
      preapproval_id = excluded.preapproval_id,
      plano = excluded.plano,
      status = excluded.status,
      email = COALESCE(excluded.email, assinaturas.email),
      proxima_cobranca = COALESCE(excluded.proxima_cobranca, assinaturas.proxima_cobranca),
      atualizado_em = datetime('now')
  `).run(String(storeId), preapprovalId || null, plano || null, status || null, email || null, proximaCobranca || null);
}
function getAssinatura(storeId) {
  return db.prepare('SELECT * FROM assinaturas WHERE store_id = ?').get(String(storeId)) || null;
}
// Ativa/renova a licença da loja de forma rolável (chave determinística SUB-<store>).
function ativarAssinaturaLicenca(storeId, plano, diasValidade) {
  const chave = 'SUB-' + String(storeId);
  const expira = new Date(Date.now() + (Number(diasValidade || 35) * 24 * 60 * 60 * 1000)).toISOString();
  db.prepare(`
    INSERT INTO licencas (chave, plano, store_id, expira_em, status)
    VALUES (?, ?, ?, ?, 'ativa')
    ON CONFLICT(chave) DO UPDATE SET
      plano = excluded.plano, store_id = excluded.store_id,
      expira_em = excluded.expira_em, status = 'ativa'
  `).run(chave, plano, String(storeId), expira);
}
function cancelarAssinaturaLicenca(storeId, novoStatus) {
  db.prepare('UPDATE assinaturas SET status = ?, atualizado_em = datetime(\'now\') WHERE store_id = ?').run(novoStatus || 'cancelled', String(storeId));
  // A licença deixa de ser renovada; expira naturalmente. (Não força inativa p/ dar carência até a data.)
}
function listarAssinaturas() {
  return db.prepare('SELECT * FROM assinaturas ORDER BY atualizado_em DESC').all();
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

function salvarResetPainel(storeId, codigo, expiraEm) {
  db.prepare(`INSERT INTO painel_reset (store_id, codigo, expira_em, criado_em) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET codigo=excluded.codigo, expira_em=excluded.expira_em, criado_em=datetime('now')`)
    .run(String(storeId), String(codigo), String(expiraEm));
}
function getResetPainel(storeId) {
  return db.prepare('SELECT * FROM painel_reset WHERE store_id = ?').get(String(storeId)) || null;
}
function deleteResetPainel(storeId) {
  db.prepare('DELETE FROM painel_reset WHERE store_id = ?').run(String(storeId));
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
      tipo = excluded.tipo,
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

function salvarRastreioContexto(codigo, storeId, orderNumber, contactName, telefone, transportadora) {
  if (!codigo) return;
  db.prepare(`
    INSERT INTO rastreio_contexto (codigo, store_id, order_number, contact_name, telefone, transportadora, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(codigo) DO UPDATE SET
      store_id = excluded.store_id,
      order_number = excluded.order_number,
      contact_name = excluded.contact_name,
      telefone = excluded.telefone,
      transportadora = COALESCE(excluded.transportadora, rastreio_contexto.transportadora),
      updated_at = datetime('now')
  `).run(String(codigo).toUpperCase(), String(storeId || ''), String(orderNumber || ''), contactName || null, telefone || null, transportadora || null);
}

function getRastreioContexto(codigo) {
  if (!codigo) return null;
  return db.prepare('SELECT * FROM rastreio_contexto WHERE codigo = ?').get(String(codigo).toUpperCase()) || null;
}

// Uso de rastreios por loja no mês (1 rastreio = 1 código único no mês corrente)
function registrarUsoRastreio(storeId, codigo) {
  if (!storeId || !codigo) return;
  db.prepare(`INSERT OR IGNORE INTO rastreio_uso (store_id, ano_mes, codigo)
    VALUES (?, strftime('%Y-%m','now'), ?)`).run(String(storeId), String(codigo).toUpperCase());
}
function usoRastreioJaContado(storeId, codigo) {
  const r = db.prepare(`SELECT 1 FROM rastreio_uso WHERE store_id=? AND ano_mes=strftime('%Y-%m','now') AND codigo=?`)
    .get(String(storeId), String(codigo).toUpperCase());
  return !!r;
}
function contarUsoRastreio(storeId) {
  const r = db.prepare(`SELECT COUNT(*) c FROM rastreio_uso WHERE store_id=? AND ano_mes=strftime('%Y-%m','now')`)
    .get(String(storeId));
  return r?.c || 0;
}
// Total de rastreios do mês somando TODAS as lojas (= consumo da conta Seu Rastreio)
function totalRastreiosMes() {
  const r = db.prepare(`SELECT COUNT(*) c FROM rastreio_uso WHERE ano_mes=strftime('%Y-%m','now')`).get();
  return r?.c || 0;
}
// Zera o contador de rastreios do MÊS CORRENTE de uma loja (usado na virada trial → plano pago).
function zerarUsoRastreioMes(storeId) {
  if (!storeId) return;
  db.prepare(`DELETE FROM rastreio_uso WHERE store_id=? AND ano_mes=strftime('%Y-%m','now')`).run(String(storeId));
}
// Controle "1x por loja" da conversão trial → pago (evita zerar o contador toda hora).
function trialJaConvertido(storeId) {
  return !!db.prepare('SELECT 1 FROM trial_convertido WHERE store_id=?').get(String(storeId));
}
function marcarTrialConvertido(storeId) {
  db.prepare('INSERT OR IGNORE INTO trial_convertido (store_id) VALUES (?)').run(String(storeId));
}

function salvarNomeMovimentacao(storeId, origemId, nome) {
  const limpo = String(nome || '').trim();
  const info = db.prepare(`
    UPDATE financeiro_movimentacoes
    SET nome_custom = ?
    WHERE store_id = ? AND origem_id = ? AND conector = 'mercado_pago'
  `).run(limpo ? limpo.slice(0, 120) : null, String(storeId), String(origemId));
  return { atualizadas: info.changes, nome: limpo || null };
}

function listarNomesMovimentacoes(storeId) {
  const rows = db.prepare(`
    SELECT origem_id, nome_custom FROM financeiro_movimentacoes
    WHERE store_id = ? AND conector = 'mercado_pago' AND nome_custom IS NOT NULL AND nome_custom <> ''
  `).all(String(storeId));
  const mapa = {};
  for (const r of rows) mapa[r.origem_id] = r.nome_custom;
  return mapa;
}

function listarMovimentacoesFinanceiras(storeId, inicio, fim, limit = 200) {
  const lim = Math.max(1, Math.min(Number(limit) || 200, 500));
  return db.prepare(`
    SELECT id, store_id, conector, origem_id, data, descricao, tipo, valor, categoria, created_at, nome_custom
    FROM financeiro_movimentacoes
    WHERE store_id = ?
      AND (date(data) >= date(?) OR ? IS NULL)
      AND (date(data) <= date(?) OR ? IS NULL)
    ORDER BY datetime(data) DESC
    LIMIT ?
  `).all(String(storeId), inicio || null, inicio || null, fim || null, fim || null, lim);
}


function salvarRelatorioMercadoPago(storeId, rel) {
  const r = rel || {};
  const reportId = r.id || r.report_id || r.generation_id || r.task_id || r.file_name || require('crypto').randomBytes(8).toString('hex');
  db.prepare(`
    INSERT INTO financeiro_relatorios_mp (
      store_id, report_id, file_name, status, begin_date, end_date, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(store_id, report_id) DO UPDATE SET
      file_name = COALESCE(excluded.file_name, financeiro_relatorios_mp.file_name),
      status = COALESCE(excluded.status, financeiro_relatorios_mp.status),
      begin_date = COALESCE(excluded.begin_date, financeiro_relatorios_mp.begin_date),
      end_date = COALESCE(excluded.end_date, financeiro_relatorios_mp.end_date),
      raw_json = excluded.raw_json,
      updated_at = datetime('now')
  `).run(
    String(storeId),
    String(reportId),
    r.file_name ? String(r.file_name) : null,
    r.status ? String(r.status) : null,
    r.begin_date ? String(r.begin_date) : null,
    r.end_date ? String(r.end_date) : null,
    JSON.stringify(r)
  );
  return getRelatorioMercadoPago(storeId, reportId);
}

function getRelatorioMercadoPago(storeId, reportId) {
  return db.prepare(`
    SELECT * FROM financeiro_relatorios_mp
    WHERE store_id = ? AND report_id = ?
  `).get(String(storeId), String(reportId));
}

function listarRelatoriosMercadoPago(storeId, limit = 20) {
  const lim = Math.max(1, Math.min(Number(limit) || 20, 100));
  return db.prepare(`
    SELECT * FROM financeiro_relatorios_mp
    WHERE store_id = ?
    ORDER BY datetime(updated_at) DESC
    LIMIT ?
  `).all(String(storeId), lim);
}

function marcarRelatorioMercadoPagoImportado(storeId, reportId, fileName) {
  db.prepare(`
    UPDATE financeiro_relatorios_mp
    SET status = 'importado',
        file_name = COALESCE(?, file_name),
        imported_at = datetime('now'),
        updated_at = datetime('now')
    WHERE store_id = ? AND report_id = ?
  `).run(fileName ? String(fileName) : null, String(storeId), String(reportId));
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

// ── LGPD: redação de dados (usado pelos webhooks obrigatórios da Nuvemshop) ──
function _tabelasComColuna(coluna) {
  const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  return tabelas.filter(t => {
    try { return db.prepare(`PRAGMA table_info(${t})`).all().some(c => c.name === coluna); }
    catch (e) { return false; }
  });
}
function _variacoesTelefone(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (!d) return [];
  const set = new Set([d]);
  if (d.startsWith('55') && d.length > 11) set.add(d.slice(2)); else set.add('55' + d);
  return [...set];
}
// store/redact — apaga TODOS os dados de uma loja (token, logs, configs, contatos, financeiro).
function redactStore(storeId) {
  if (!storeId) return { deleted: 0, tabelas: [] };
  const sid = String(storeId);
  let deleted = 0; const detalhe = [];
  for (const t of _tabelasComColuna('store_id')) {
    try {
      const info = db.prepare(`DELETE FROM ${t} WHERE store_id = ?`).run(sid);
      if (info.changes) { deleted += info.changes; detalhe.push(`${t}:${info.changes}`); }
    } catch (e) { /* ignora tabela incompatível */ }
  }
  return { deleted, tabelas: detalhe };
}
// customers/redact — apaga os dados de um cliente (por telefone/e-mail), na loja informada.
function redactCustomer(storeId, { phone, email } = {}) {
  const sid = storeId ? String(storeId) : null;
  let deleted = 0; const detalhe = [];
  const del = (t, coluna, valor) => {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    const temStore = cols.includes('store_id');
    const sql = `DELETE FROM ${t} WHERE ${coluna} = ?` + (temStore && sid ? ' AND store_id = ?' : '');
    try {
      const info = db.prepare(sql).run(...(temStore && sid ? [valor, sid] : [valor]));
      if (info.changes) { deleted += info.changes; detalhe.push(`${t}.${coluna}:${info.changes}`); }
    } catch (e) { /* ignora */ }
  };
  for (const t of _tabelasComColuna('telefone')) for (const f of _variacoesTelefone(phone)) del(t, 'telefone', f);
  if (email) for (const t of _tabelasComColuna('email')) del(t, 'email', String(email));
  return { deleted, tabelas: detalhe };
}
// customers/data_request — reúne os dados que o app guarda de um cliente.
function collectCustomerData(storeId, { phone, email } = {}) {
  const sid = storeId ? String(storeId) : null;
  const dados = {};
  const busca = (t, coluna, valores) => {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    const temStore = cols.includes('store_id');
    for (const v of valores) {
      const sql = `SELECT * FROM ${t} WHERE ${coluna} = ?` + (temStore && sid ? ' AND store_id = ?' : '');
      try { const rows = db.prepare(sql).all(...(temStore && sid ? [v, sid] : [v])); if (rows.length) (dados[t] = dados[t] || []).push(...rows); }
      catch (e) { /* ignora */ }
    }
  };
  for (const t of _tabelasComColuna('telefone')) busca(t, 'telefone', _variacoesTelefone(phone));
  if (email) for (const t of _tabelasComColuna('email')) busca(t, 'email', [String(email)]);
  return dados;
}

// ── Prospecção de lojas Nuvemshop ───────────────────────────────────────────
function upsertProspeccaoLoja(r) {
  db.prepare(`INSERT INTO prospeccao_lojas (domain, store_name, niche, email, whatsapp, instagram, final_url)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(domain) DO UPDATE SET
      store_name = excluded.store_name,
      niche      = excluded.niche,
      email      = CASE WHEN excluded.email     <> '' THEN excluded.email     ELSE prospeccao_lojas.email     END,
      whatsapp   = CASE WHEN excluded.whatsapp   <> '' THEN excluded.whatsapp   ELSE prospeccao_lojas.whatsapp   END,
      instagram  = CASE WHEN excluded.instagram  <> '' THEN excluded.instagram  ELSE prospeccao_lojas.instagram  END,
      final_url  = excluded.final_url
  `).run(r.domain, r.store_name || '', r.niche || 'outros', r.email || '', r.whatsapp || '', r.instagram || '', r.final_url || '');
}
function contarProspeccao() { return db.prepare('SELECT COUNT(*) c FROM prospeccao_lojas').get().c; }
function jaProspeccaoDomain(domain) { return !!db.prepare('SELECT 1 FROM prospeccao_lojas WHERE domain = ?').get(domain); }
function contarProspeccaoPorNicho() {
  return db.prepare("SELECT niche, COUNT(*) c FROM prospeccao_lojas GROUP BY niche ORDER BY c DESC").all();
}
function comContatoProspeccao() {
  return db.prepare("SELECT COUNT(*) c FROM prospeccao_lojas WHERE email <> '' OR whatsapp <> '' OR instagram <> ''").get().c;
}
function listarProspeccao() {
  return db.prepare("SELECT domain, store_name, niche, email, whatsapp, instagram, final_url FROM prospeccao_lojas ORDER BY niche, (CASE WHEN email='' AND whatsapp='' AND instagram='' THEN 1 ELSE 0 END), domain").all();
}
function limparProspeccao() { db.prepare('DELETE FROM prospeccao_lojas').run(); }

module.exports = {
  upsertProspeccaoLoja, contarProspeccao, jaProspeccaoDomain, contarProspeccaoPorNicho,
  comContatoProspeccao, listarProspeccao, limparProspeccao,
  redactStore, redactCustomer, collectCustomerData,
  criarFinanceiroState, getFinanceiroState, deleteFinanceiroState,
  salvarMercadoPagoConexao, getMercadoPagoConexao, desconectarMercadoPago,
  salvarTetoSaidas, salvarMovimentacaoFinanceira, listarMovimentacoesFinanceiras, getResumoFinanceiro,
  salvarNomeMovimentacao, listarNomesMovimentacoes,
  salvarRastreioContexto, getRastreioContexto,
  registrarUsoRastreio, usoRastreioJaContado, contarUsoRastreio, totalRastreiosMes,
  zerarUsoRastreioMes, trialJaConvertido, marcarTrialConvertido,
  upsertAssinatura, getAssinatura, ativarAssinaturaLicenca, cancelarAssinaturaLicenca, listarAssinaturas,
  salvarRelatorioMercadoPago, getRelatorioMercadoPago, listarRelatoriosMercadoPago, marcarRelatorioMercadoPagoImportado,
    jaPedidoRecebido,
  salvarEnvioAvulso, getEnvioAvulso, listarEnviosAvulsos, listarEnviosAvulsosMonitorar,
  atualizarEnvioAvulsoStatus, marcarEnvioAvulsoPrimeiraMensagem,
  listarClientesOperacionais, getClienteOperacional, listarLogsPorStore, getResumoAutomacoesStore,
  criarPainelUsuario, getPainelUsuario, atualizarPainelCredenciais,
  salvarResetPainel, getResetPainel, deleteResetPainel,
  criarPainelSessao, getPainelSessao, deletarPainelSessao,
  getPainelTemplates, salvarPainelTemplates,
  registrarLogAutomacao, listarLogsAutomacao, limparSessoesPainelExpiradas,
  saveToken, getToken, getAllStores,
  marcarEventoLoja, lojaComEventoRecente,
  marcarNotificado, jaNotificado,
  statusRastreio, getRastreioInfo, atualizarStatusRastreio, foiRastreioConsultadoHoje,
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
  getAdminStats, getLojistaStats, registrarVisita, getGestaoStats,
  salvarLead, listarLeads, contarLeads, vincularLeadALoja, deletarLead,
  addRastreioExtra, getRastreioExtra,
  upsertAuthSession, getAuthSession, completeAuthSession, deleteAuthSession,
  criarLicenca, criarTrial, getLicenca, getLicencaPorStore, vincularLicenca, validarLicenca,
  getLicencasPorPayment, salvarPaymentId, getLicencaPorChave, getMetas, salvarMetas, desvincularDispositivo, setMultiDispositivo,
  migrar
};
