require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto     = require('crypto');
const { Resend } = require('resend');
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const cron    = require('node-cron');
const path    = require('path');
const db      = require('./db');

// Migração: criar tabelas novas no banco existente
db.migrar();


const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));
app.use(express.static(path.join(__dirname, 'public')));

const {
  NUVEM_CLIENT_ID,
  NUVEM_CLIENT_SECRET,
  APP_URL,
  EXTENSION_SECRET,
  PORT = 3000,
  MP_ACCESS_TOKEN,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  ZAPI_INSTANCE,
  ZAPI_TOKEN,
  ZAPI_CLIENT_TOKEN
} = process.env;

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  if (req.headers['x-secret'] !== EXTENSION_SECRET)
    return res.status(401).json({ error: 'Não autorizado.' });
  next();
}

// ── Nuvemshop API ─────────────────────────────────────────────────────────────
async function nuvemGet(storeId, path, params = {}) {
  const row = db.getToken(storeId);
  if (!row) throw new Error('Loja não autenticada.');
  const res = await axios.get(`https://api.nuvemshop.com.br/v1/${storeId}${path}`, {
    headers: {
      'Authentication': `bearer ${row.access_token}`,
      'User-Agent': `RastreioBot (${APP_URL})`,
      'Content-Type': 'application/json'
    },
    params
  });
  return res.data;
}

function formatTel(tel) {
  if (!tel) return null;
  const d = String(tel).replace(/\D/g, '');
  if (!d || d.length < 10) return null;
  if (d.startsWith('55') && d.length >= 12) return d;
  return '55' + d;
}

function diasUteisDesde(dateStr) {
  if (!dateStr) return null;
  const data = new Date(dateStr);
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  data.setHours(0,0,0,0);
  let dias = 0;
  const cur = new Date(data);
  while (cur < hoje) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDay();
    if (d !== 0 && d !== 6) dias++;
  }
  return dias;
}

// ── Limite diário por número ──────────────────────────────────────────────────
async function podEnviar(telefone) {
  const count = db.mensagensHoje(telefone);
  if (count >= 3) {
    console.log(`[Limite] ${telefone} já recebeu ${count} mensagens hoje. Bloqueado.`);
    return false;
  }
  return true;
}

// ── Z-API ─────────────────────────────────────────────────────────────────────
async function sendWhatsApp(telefone, mensagem, storeId) {
  let instance, token, clientToken;
  if (storeId) {
    const inst = db.getInstancia(storeId);
    if (inst) {
      instance    = inst.zapi_instance;
      token       = inst.zapi_token;
      clientToken = inst.zapi_client_token;
    }
  }
  if (!instance) {
    if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN)
      throw new Error('Z-API não configurada.');
    instance    = ZAPI_INSTANCE;
    token       = ZAPI_TOKEN;
    clientToken = ZAPI_CLIENT_TOKEN;
  }
  let numero = String(telefone).replace(/\D/g, '');
  if (numero.startsWith('55')) numero = numero.slice(2);
  const res = await axios.post(
    `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
    { phone: numero, message: mensagem },
    { headers: { 'Client-Token': clientToken, 'Content-Type': 'application/json' } }
  );
  return res.data;
}

// ── Correios API ──────────────────────────────────────────────────────────────
async function consultarCorreios(codigo) {
  const SEURASTREIO_KEY = process.env.SEURASTREIO_KEY;
  if (!SEURASTREIO_KEY) {
    console.error('[Correios] SEURASTREIO_KEY não configurada.');
    return null;
  }
  try {
    const res = await axios.get(
      `https://seurastreio.com.br/api/public/rastreio/${codigo}`,
      {
        headers: { 'Authorization': `Bearer ${SEURASTREIO_KEY}` },
        timeout: 15000
      }
    );
    const evento = res.data?.eventoMaisRecente;
    if (!evento) return null;
    const descricao = evento.descricao || evento.status || '';
    const desc_lower = descricao.toLowerCase();
    const entregue = desc_lower.includes('entregue') || desc_lower.includes('objeto entregue');
    let data = '', hora = '';
    if (evento.data) {
      const partes = String(evento.data).split(' ');
      data = partes[0] || '';
      hora = partes[1] || '';
    }
    return { status: evento.status || '', descricao, data, hora, entregue };
  } catch(e) {
    console.error(`[Correios] Erro ao consultar ${codigo}:`, e.message);
    return null;
  }
}

// ── Mensagens ─────────────────────────────────────────────────────────────────
function montarMensagem(template, pedido) {
  const TRANSPORTADORAS = {
    'Correios': { emoji:'📮', url:'https://rastreamento.correios.com.br/app/index.php?objeto={c}' },
    'Jadlog':   { emoji:'🚚', url:'https://www.jadlog.com.br/siteInstitucional/tracking.jad?cte={c}' },
    'Loggi':    { emoji:'⚡', url:'https://www.loggi.com/rastreador/?code={c}' },
  };
  const t = Object.entries(TRANSPORTADORAS).find(([k]) => (pedido.transportadora||'').toLowerCase().includes(k.toLowerCase()));
  const transp = t ? t[1] : { emoji:'📦', url:'https://rastreamento.correios.com.br/app/index.php?objeto={c}' };
  const transpNome = t ? t[0] : (pedido.transportadora || 'Transportadora');
  const link = pedido.rastreio ? transp.url.replace('{c}', encodeURIComponent(pedido.rastreio)) : '';
  const padrao =
    `Olá {nome}! 👋\n\nSeu pedido *#{numero}* foi enviado!\n\n` +
    `{emoji} *Transportadora:* {transportadora}\n` +
    `📦 *Código de rastreio:* *{codigo}*\n\n` +
    `🔗 Rastreie sua entrega:\n{link}\n\nQualquer dúvida é só chamar! 😊`;
  return (template || padrao)
    .replace(/{nome}/g,           pedido.cliente || 'Cliente')
    .replace(/{numero}/g,         pedido.numero  || '')
    .replace(/{codigo}/g,         pedido.rastreio || '')
    .replace(/{transportadora}/g, transpNome)
    .replace(/{emoji}/g,          transp.emoji)
    .replace(/{link}/g,           link);
}

function montarMensagemRastreio(pedido, evento) {
  const nome   = pedido.cliente || 'Cliente';
  const numero = pedido.numero;
  const link   = `https://rastreamento.correios.com.br/app/index.php?objeto=${pedido.rastreio}`;
  const desc   = (evento.descricao || '').toLowerCase();
  const data   = evento.data || '';
  const hora   = evento.hora || '';

  if (evento.entregue) {
    return (
      `✅ ${nome}, seu pedido *#${numero}* foi entregue!\n\n` +
      `Esperamos que você goste! Qualquer dúvida é só chamar. 😊`
    );
  }

  if (desc.includes('saiu para entrega') || desc.includes('saiu para a entrega') || desc.includes('entrega prevista')) {
    return (
      `🎉 ${nome}, seu pedido *#${numero}* saiu para entrega hoje!\n\n` +
      `Fique de olho, o entregador está a caminho! 📦\n` +
      `🔗 Rastreie: ${link}`
    );
  }

  if (desc.includes('postado') || desc.includes('objeto postado') || desc.includes('coletado')) {
    return (
      `📮 Olá, ${nome}! Seu pedido *#${numero}* foi postado!\n\n` +
      `Código de rastreio: *${pedido.rastreio}*\n` +
      `🔗 Rastreie: ${link}\n\n` +
      `Em breve chegará até você! 😊`
    );
  }

  return (
    `🚚 Boa notícia, ${nome}! Seu pedido *#${numero}* está a caminho!\n\n` +
    `📍 Status: *${evento.descricao}*\n` +
    `📅 ${data} às ${hora}\n\n` +
    `🔗 Rastreie: ${link}`
  );
}

// MSG_PAGAMENTO montada dinamicamente
function montarMensagemPagamento(nome, numero) {
  return (
    `👏👏👏 #Parabéns, ${nome}!👏👏👏\n` +
    `Seu pagamento do pedido *#${numero}* foi confirmado!\n\n` +
    `Nosso prazo de produção é de 3 dias úteis. Sua estampa entrou na fila de impressão agora e segue a sequência de pedidos.\n\n` +
    `Lembrando que este prazo está sujeito a alteração devido a necessidade de manutenção emergencial em nosso maquinário.`
  );
}

// ── CRON — Verificação a cada 30 minutos ─────────────────────────────────────
cron.schedule('*/30 * * * *', async () => {
  console.log('[Cron] Iniciando verificação...');
  try {
    const stores = db.getAllStores();
    for (const store of stores) {
      await verificarPagamentos(store.store_id);
      await verificarBoletosPendentes(store.store_id);
      await verificarCarrinhosAbandonados(store.store_id);
      await verificarRastreios(store.store_id);
      await verificarPosEntrega(store.store_id);
      await verificarPedidosParados(store.store_id);
    }
  } catch(e) {
    console.error('[Cron] Erro geral:', e.message);
  }
});

// ── Verificar pagamentos recentes ────────────────────────────────────────────
async function verificarPagamentos(storeId) {
  try {
    const desde = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 50,
      payment_status: 'paid',
      created_at_min: desde,
      fields: 'id,number,contact_name,contact_phone,payment_status,created_at'
    });

    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      if (db.jaConfirmacaoEnviada(String(o.id))) continue;

      const telefone = formatTel(o.contact_phone);
      if (!telefone) continue;

      try {
        await sendWhatsApp(telefone, montarMensagemPagamento(o.contact_name || 'Cliente', o.number));
        db.marcarConfirmacaoEnviada(String(o.id), storeId);
        console.log(`[Pagamento] WhatsApp enviado para pedido #${o.number}`);
      } catch(e) {
        console.error(`[Pagamento] Falha para #${o.number}:`, e.message);
      }

      await new Promise(r => setTimeout(r, 500));
    }
  } catch(e) {
    const msg = e.response?.data?.description || e.message || '';
    if (msg.includes('Last page is 0')) return;
    console.error(`[Pagamento] Erro loja ${storeId}:`, e.response?.data || e.message);
  }
}

// ── Stub functions (mínimas para compilar) ────────────────────────────────────
async function verificarBoletosPendentes(storeId) {}
async function verificarCarrinhosAbandonados(storeId) {}
async function verificarRastreios(storeId) {}
async function verificarPosEntrega(storeId) {}
async function verificarPedidosParados(storeId) {}

// ── OAuth ─────────────────────────────────────────────────────────────────────
app.get('/auth/install', (req, res) => {
  const { store_id, session_code } = req.query;
  const state = session_code ? `ext_${session_code}` : (store_id || 'manual');
  if (session_code) {
    try { db.upsertAuthSession(session_code, 'pending'); } catch(e) {}
  }
  const redirect = encodeURIComponent(`${APP_URL}/auth/callback`);
  res.redirect(`https://www.nuvemshop.com.br/apps/${NUVEM_CLIENT_ID}/authorize?state=${state}&redirect_uri=${redirect}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state: storeId } = req.query;
  if (!code) return res.status(400).send('Código OAuth ausente.');
  try {
    const { data } = await axios.post('https://www.nuvemshop.com.br/apps/authorize/token', {
      client_id: NUVEM_CLIENT_ID,
      client_secret: NUVEM_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code
    }, { headers: { 'Content-Type': 'application/json' } });
    const rawState = String(storeId || '');
    const sessionCode = rawState.startsWith('ext_') ? rawState.slice(4) : null;
    const sid = String(data.user_id || (sessionCode ? '' : storeId));
    if (sid) db.saveToken(sid, data.access_token);
    if (sessionCode) {
      const realSid = String(data.user_id || sid);
      if (realSid) db.saveToken(realSid, data.access_token);
      try { db.completeAuthSession(sessionCode, realSid); } catch(e) {}
    }
    const isExt = !!sessionCode;
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>*{font-family:sans-serif;text-align:center;}body{background:#0d0d10;color:#fff;padding:3rem;}h2{color:#00d084;}</style></head><body><h2>✅ RastreioBot conectado!</h2><p>Loja autenticada com sucesso.</p><p style="margin-top:1.5rem;">Seu <strong>Store ID</strong>:</p><code>${sid}</code>${isExt ? '<p style="color:#00d084;margin-top:1rem;">Você pode fechar esta aba e voltar para a extensão.</p>' : ''}</body></html>`);
  } catch(e) {
    console.error('OAuth erro:', e.response?.data || e.message);
    res.status(500).send('Erro na autenticação. Tente novamente.');
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  const stores = db.getAllStores();
  res.json({ ok: true, lojas: stores.length, versao: '2.5.0', cron: 'ativo (30min)' });
});

app.listen(PORT, () => {
  console.log(`RastreioBot v2.5.0 rodando na porta ${PORT}`);
  console.log('Cron ativo: verificação a cada 30 minutos');
});

// ── Keep-alive ───────────────────────────────────────────────────────────────
const APP_URL_PING = process.env.APP_URL || '';
if (APP_URL_PING) {
  cron.schedule('*/10 * * * *', async () => {
    try {
      await axios.get(`${APP_URL_PING}/status`, { timeout: 10000 });
      console.log('[Keep-alive] OK');
    } catch(e) {
      console.warn('[Keep-alive] Falha no ping:', e.message);
    }
  });
  console.log('Keep-alive ativo: ping a cada 10 minutos');
}
