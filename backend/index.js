require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const cron    = require('node-cron');
const db      = require('./db');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const {
  NUVEM_CLIENT_ID,
  NUVEM_CLIENT_SECRET,
  APP_URL,
  EXTENSION_SECRET,
  PORT = 3000,
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

// ── Z-API ─────────────────────────────────────────────────────────────────────
async function sendWhatsApp(telefone, mensagem) {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN)
    throw new Error('Z-API não configurada.');

  let numero = String(telefone).replace(/\D/g, '');
  if (numero.startsWith('55')) numero = numero.slice(2);

  const res = await axios.post(
    `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`,
    { phone: numero, message: mensagem },
    { headers: { 'Client-Token': ZAPI_CLIENT_TOKEN, 'Content-Type': 'application/json' } }
  );
  return res.data;
}

// ── Correios API ──────────────────────────────────────────────────────────────
async function consultarCorreios(codigo) {
  try {
    const res = await axios.get(
      `https://api.linketrack.com/track/json?user=teste&token=1abcd00b2731640afbe0134bcecbe4d1b4c78a60f7d90b06329b0a7c8d5bab&codigo=${codigo}`,
      { timeout: 10000 }
    );
    // Retorna o último evento
    const eventos = res.data?.eventos || [];
    if (!eventos.length) return null;
    const ultimo = eventos[0];
    return {
      status: ultimo.status || '',
      descricao: ultimo.descricao || '',
      data: ultimo.data || '',
      hora: ultimo.hora || '',
      entregue: (ultimo.status || '').toLowerCase().includes('entregue') ||
                (ultimo.descricao || '').toLowerCase().includes('objeto entregue')
    };
  } catch(e) {
    console.error(`[Correios] Erro ao consultar ${codigo}:`, e.message);
    return null;
  }
}

// ── Mensagem de atualização de rastreio ───────────────────────────────────────
function montarMensagemRastreio(pedido, evento) {
  const emoji = evento.entregue ? '✅' : '📦';
  const status = evento.entregue
    ? 'Seu pedido foi *entregue*!'
    : `*${evento.descricao}*`;

  return (
    `Olá ${pedido.cliente || 'Cliente'}! 👋\n\n` +
    `${emoji} Atualização do seu pedido *#${pedido.numero}*:\n\n` +
    `${status}\n` +
    `📅 ${evento.data} às ${evento.hora}\n\n` +
    `🔗 Rastreie: https://rastreamento.correios.com.br/app/index.php?objeto=${pedido.rastreio}\n\n` +
    `Qualquer dúvida é só chamar! 😊`
  );
}

// ── CRON — Notificação automática por mudança de status ──────────────────────
// Roda a cada 30 minutos
cron.schedule('*/30 * * * *', async () => {
  console.log('[Cron] Iniciando verificação de rastreios...');
  try {
    const stores = db.getAllStores();
    for (const store of stores) {
      await verificarRastreiosLoja(store.store_id);
    }
  } catch(e) {
    console.error('[Cron] Erro geral:', e.message);
  }
});

async function verificarRastreiosLoja(storeId) {
  try {
    // Busca pedidos com rastreio que ainda não foram entregues
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 200,
      payment_status: 'paid',
      fields: 'id,number,contact_name,contact_phone,shipping_status,shipping_tracking_number,shipping_option,created_at'
    });

    for (const o of orders) {
      if (o.status === 'cancelled') continue;

      const rastreio = o.shipping_tracking_number?.trim();
      if (!rastreio) continue; // Sem rastreio, pula

      const telefone = formatTel(o.contact_phone);
      if (!telefone) continue; // Sem telefone, pula

      // Só notifica Correios por enquanto (código começa com letras)
      if (!/^[A-Z]{2}\d+[A-Z]{2}$/i.test(rastreio)) continue;

      // Verifica se já foi entregue (não precisa mais consultar)
      const jaEntregue = db.statusRastreio(rastreio) === 'entregue';
      if (jaEntregue) continue;

      // Consulta status atual nos Correios
      const evento = await consultarCorreios(rastreio);
      if (!evento) continue;

      const statusAnterior = db.statusRastreio(rastreio);
      const statusNovo = evento.entregue ? 'entregue' : evento.descricao;

      // Se status mudou, notifica o cliente
      if (statusNovo && statusNovo !== statusAnterior) {
        console.log(`[Cron] Status mudou: ${rastreio} — "${statusAnterior}" → "${statusNovo}"`);

        const pedido = {
          cliente:  o.contact_name || 'Cliente',
          numero:   o.number,
          rastreio: rastreio
        };

        const mensagem = montarMensagemRastreio(pedido, evento);

        try {
          await sendWhatsApp(telefone, mensagem);
          console.log(`[Cron] WhatsApp enviado para pedido #${o.number}`);
        } catch(e) {
          console.error(`[Cron] Falha ao enviar WhatsApp para #${o.number}:`, e.message);
        }

        // Atualiza status no DB independente do envio
        db.atualizarStatusRastreio(rastreio, statusNovo, evento.data + ' ' + evento.hora);
      } else {
        // Sem mudança — garante que o registro existe no DB
        if (!statusAnterior) {
          db.atualizarStatusRastreio(rastreio, statusNovo || 'postado', evento.data + ' ' + evento.hora);
        }
      }

      // Pequena pausa para não sobrecarregar a API dos Correios
      await new Promise(r => setTimeout(r, 500));
    }
  } catch(e) {
    console.error(`[Cron] Erro na loja ${storeId}:`, e.response?.data || e.message);
  }
}

// ── OAuth ─────────────────────────────────────────────────────────────────────
app.get('/auth/install', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).send('Informe store_id');
  const redirect = encodeURIComponent(`${APP_URL}/auth/callback`);
  res.redirect(`https://www.nuvemshop.com.br/apps/${NUVEM_CLIENT_ID}/authorize?state=${store_id}&redirect_uri=${redirect}`);
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

    const sid = String(data.user_id || storeId);
    db.saveToken(sid, data.access_token);

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>*{font-family:sans-serif;text-align:center;}body{background:#0d0d10;color:#fff;padding:3rem;}
    h2{color:#00d084;}code{background:#1e1e25;padding:4px 10px;border-radius:6px;font-size:18px;color:#00d084;}</style></head>
    <body>
      <h2>✅ RastreioBot conectado!</h2>
      <p>Loja autenticada com sucesso.</p>
      <p style="margin-top:1.5rem;">Seu <strong>Store ID</strong>:</p>
      <code>${sid}</code>
      <p style="color:#888;margin-top:1.5rem;">Cole esse ID nas configurações da extensão.</p>
    </body></html>`);
  } catch(e) {
    console.error('OAuth erro:', e.response?.data || e.message);
    res.status(500).send('Erro na autenticação. Tente novamente.');
  }
});

// ── Pedidos ───────────────────────────────────────────────────────────────────
app.get('/pedidos/:storeId', auth, async (req, res) => {
  const { storeId } = req.params;
  const prazo = parseInt(req.query.prazo || '3');
  const incluirNotificados = req.query.incluir_notificados === 'true';

  try {
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 200,
      payment_status: 'paid',
      fields: 'id,number,contact_name,contact_phone,shipping_status,shipping_tracking_number,shipping_option,created_at'
    });

    const resultado = [];

    for (const o of orders) {
      if (o.status === 'cancelled') continue;

      const jaEnviado = db.jaNotificado(String(o.id));
      if (jaEnviado && !incluirNotificados) continue;

      const tel = formatTel(o.contact_phone);
      const diasUteis = diasUteisDesde(o.created_at);
      let statusPrazo = null;

      const temRastreio = !!(o.shipping_tracking_number && o.shipping_tracking_number.trim());
      const foiEnviado  = o.shipping_status === 'shipped' || temRastreio;

      if (!foiEnviado) {
        statusPrazo = diasUteis > prazo ? 'atrasado' : diasUteis === prazo ? 'hoje' : 'ok';
      }

      // Inclui status do rastreio automático se existir
      const statusRastreio = temRastreio ? db.statusRastreio(o.shipping_tracking_number.trim()) : null;

      resultado.push({
        order_id:      String(o.id),
        numero:        o.number,
        cliente:       o.contact_name || '',
        telefone:      tel,
        rastreio:      o.shipping_tracking_number || '',
        transportadora: o.shipping_option || '',
        status:        foiEnviado ? 'shipped' : (o.shipping_status || 'pending'),
        statusRastreio,
        diasUteis,
        statusPrazo,
        ja_notificado: jaEnviado,
        created_at:    o.created_at
      });
    }

    resultado.sort((a, b) => {
      const prioA = a.statusPrazo === 'atrasado' ? 0 : a.statusPrazo === 'hoje' ? 1 : a.status === 'shipped' ? 2 : 3;
      const prioB = b.statusPrazo === 'atrasado' ? 0 : b.statusPrazo === 'hoje' ? 1 : b.status === 'shipped' ? 2 : 3;
      return prioA - prioB;
    });

    res.json({ success: true, total: resultado.length, pedidos: resultado });
  } catch(e) {
    console.error('Erro /pedidos:', e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Marcar notificado ─────────────────────────────────────────────────────────
app.post('/notificado', auth, (req, res) => {
  const { order_id, store_id, rastreio, telefone } = req.body;
  if (!order_id || !store_id) return res.status(400).json({ error: 'order_id e store_id obrigatórios.' });
  db.marcarNotificado(order_id, store_id, rastreio, telefone);
  res.json({ success: true });
});

// ── Forçar verificação manual via extensão ────────────────────────────────────
app.post('/verificar-rastreios', auth, async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id obrigatório.' });
  res.json({ success: true, message: 'Verificação iniciada em background.' });
  // Roda sem bloquear a resposta
  verificarRastreiosLoja(store_id).catch(e => console.error('[Manual]', e.message));
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  const stores = db.getAllStores();
  res.json({ ok: true, lojas: stores.length, versao: '1.1.0', cron: 'ativo (30min)' });
});

// ── Enviar WhatsApp ───────────────────────────────────────────────────────────
app.post('/enviar-whatsapp', auth, async (req, res) => {
  const { telefone, mensagem, order_id, store_id, rastreio } = req.body;
  if (!telefone || !mensagem) return res.status(400).json({ error: 'telefone e mensagem obrigatórios.' });

  try {
    const result = await sendWhatsApp(telefone, mensagem);
    if (order_id && store_id) {
      db.marcarNotificado(order_id, store_id, rastreio, telefone);
    }
    res.json({ success: true, result });
  } catch(e) {
    res.status(500).json({ success: false, error: e.response?.data?.message || e.message });
  }
});

// ── Status Z-API ──────────────────────────────────────────────────────────────
app.get('/whatsapp/status', auth, async (req, res) => {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN)
    return res.json({ conectado: false, erro: 'Z-API não configurada.' });
  try {
    const r = await axios.get(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/status`,
      { headers: { 'Client-Token': ZAPI_CLIENT_TOKEN } }
    );
    const conectado = r.data?.connected === true || r.data?.status === 'connected';
    res.json({ conectado, estado: r.data?.status || 'unknown', data: r.data });
  } catch(e) {
    res.json({ conectado: false, erro: e.message });
  }
});

app.get('/whatsapp/qrcode', auth, (req, res) => {
  res.json({ success: false, error: 'Com Z-API o QR Code é gerado no painel de z-api.io.' });
});

app.post('/whatsapp/criar-instancia', auth, (req, res) => {
  res.json({ success: true, message: 'Z-API não precisa criar instância via API.' });
});

app.listen(PORT, () => {
  console.log(`RastreioBot v1.1.0 rodando na porta ${PORT}`);
  console.log('Cron de rastreio automático: a cada 30 minutos');
});
