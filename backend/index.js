require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
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
    // Busca pedidos pagos (inclui todos os status de envio)
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 200,
      payment_status: 'paid',
      fields: 'id,number,contact_name,contact_phone,shipping_status,shipping_tracking_number,shipping_option,created_at'
    });

    const resultado = [];

    for (const o of orders) {
      // Ignora cancelados
      if (o.status === 'cancelled') continue;

      const jaEnviado = db.jaNotificado(String(o.id));
      if (jaEnviado && !incluirNotificados) continue;

      const tel = formatTel(o.contact_phone);
      const diasUteis = diasUteisDesde(o.created_at);
      let statusPrazo = null;

      // Pedido com rastreio = já foi enviado, independente do shipping_status
      const temRastreio = !!(o.shipping_tracking_number && o.shipping_tracking_number.trim());
      const foiEnviado  = o.shipping_status === 'shipped' || temRastreio;

      if (!foiEnviado) {
        statusPrazo = diasUteis > prazo ? 'atrasado' : diasUteis === prazo ? 'hoje' : 'ok';
      }

      resultado.push({
        order_id:      String(o.id),
        numero:        o.number,
        cliente:       o.contact_name || '',
        telefone:      tel,
        rastreio:      o.shipping_tracking_number || '',
        transportadora: o.shipping_option || '',
        status:        foiEnviado ? 'shipped' : (o.shipping_status || 'pending'),
        diasUteis,
        statusPrazo,
        ja_notificado: jaEnviado,
        created_at:    o.created_at
      });
    }

    // Ordena: atrasados primeiro, depois enviados não notificados
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

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  const stores = db.getAllStores();
  res.json({ ok: true, lojas: stores.length, versao: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`RastreioBot rodando na porta ${PORT}`);
});


// ── Evolution API — Envio de mensagens WhatsApp ───────────────────────────────

const EVO_URL      = process.env.EVOLUTION_URL;    // URL do serviço Evolution no Railway
const EVO_KEY      = process.env.EVOLUTION_KEY;    // API Key da Evolution
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || 'rastreiobot'; // nome da instância

async function sendWhatsApp(telefone, mensagem) {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN)
    throw new Error('Z-API não configurada. Adicione ZAPI_INSTANCE, ZAPI_TOKEN e ZAPI_CLIENT_TOKEN nas variáveis.');

  // Formata telefone: remove DDI 55 pois Z-API não quer
  let numero = String(telefone).replace(/\D/g, '');
  if (numero.startsWith('55')) numero = numero.slice(2);

  const res = await axios.post(
    `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`,
    { phone: numero, message: mensagem },
    {
      headers: {
        'Client-Token': ZAPI_CLIENT_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );

  return res.data;
}

// Rota: envia mensagem via Evolution API
app.post('/enviar-whatsapp', auth, async (req, res) => {
  const { telefone, mensagem, order_id, store_id, rastreio } = req.body;
  if (!telefone || !mensagem) return res.status(400).json({ error: 'telefone e mensagem obrigatórios.' });

  try {
    const result = await sendWhatsApp(telefone, mensagem);

    // Marca como notificado automaticamente após envio
    if (order_id && store_id) {
      db.marcarNotificado(order_id, store_id, rastreio, telefone);
    }

    res.json({ success: true, result });
  } catch(e) {
    const errMsg = e.response?.data?.message || e.message;
    res.status(500).json({ success: false, error: errMsg });
  }
});

// Rota: verifica status Z-API
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

// Rota: stub para compatibilidade (Z-API não precisa de QR via backend)
app.get('/whatsapp/qrcode', auth, (req, res) => {
  res.json({ success: false, error: 'Com Z-API o QR Code é gerado no painel de z-api.io. Escaneie lá e volte aqui.' });
});

// Rota: stub criar instância (não necessário na Z-API)
app.post('/whatsapp/criar-instancia', auth, (req, res) => {
  res.json({ success: true, message: 'Z-API não precisa criar instância via API. Já está configurada.' });
});
