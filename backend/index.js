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

  // Entregue
  if (evento.entregue) {
    return (
      `✅ ${nome}, seu pedido *#${numero}* foi entregue!\n\n` +
      `Esperamos que você goste! Qualquer dúvida é só chamar. 😊`
    );
  }

  // Saiu para entrega
  if (desc.includes('saiu para entrega') || desc.includes('saiu para a entrega') || desc.includes('entrega prevista')) {
    return (
      `🎉 ${nome}, seu pedido *#${numero}* saiu para entrega hoje!\n\n` +
      `Fique de olho, o entregador está a caminho! 📦\n` +
      `🔗 Rastreie: ${link}`
    );
  }

  // Postado (primeiro registro)
  if (desc.includes('postado') || desc.includes('objeto postado') || desc.includes('coletado')) {
    return (
      `📮 Olá, ${nome}! Seu pedido *#${numero}* foi postado!\n\n` +
      `Código de rastreio: *${pedido.rastreio}*\n` +
      `🔗 Rastreie: ${link}\n\n` +
      `Em breve chegará até você! 😊`
    );
  }

  // Em trânsito (padrão para demais status)
  return (
    `🚚 Boa notícia, ${nome}! Seu pedido *#${numero}* está a caminho!\n\n` +
    `📍 Status: *${evento.descricao}*\n` +
    `📅 ${data} às ${hora}\n\n` +
    `🔗 Rastreie: ${link}`
  );
}

// MSG_PAGAMENTO montada dinamicamente — ver montarMensagemPagamento()
function montarMensagemPagamento(nome, numero) {
  return (
    `👏👏👏 Parabéns, ${nome}!👏👏👏\n` +
    `Seu pagamento do pedido *#${numero}* foi confirmado!\n\n` +
    `Nosso prazo de produção é de 3 dias úteis. Sua estampa entrou na fila de impressão agora e segue a sequência de pedidos.\n\n` +
    `Lembrando que este prazo está sujeito a alteração devido a necessidade de manutenção emergencial em nosso maquinário.`
  );
}

// ── CRON — Roda a cada 30 minutos ─────────────────────────────────────────────
cron.schedule('*/30 * * * *', async () => {
  console.log('[Cron] Iniciando verificação...');
  try {
    const stores = db.getAllStores();
    for (const store of stores) {
      await verificarPagamentos(store.store_id);
      await verificarRastreios(store.store_id);
    }
  } catch(e) {
    console.error('[Cron] Erro geral:', e.message);
  }
});

// ── Verificar pagamentos recentes (últimas 2h) ────────────────────────────────
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
    console.error(`[Pagamento] Erro loja ${storeId}:`, e.response?.data || e.message);
  }
}

// ── Verificar mudanças de rastreio ────────────────────────────────────────────
async function verificarRastreios(storeId) {
  try {
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 200,
      payment_status: 'paid',
      fields: 'id,number,contact_name,contact_phone,shipping_status,shipping_tracking_number,created_at'
    });

    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const rastreio = o.shipping_tracking_number?.trim();
      if (!rastreio) continue;
      const telefone = formatTel(o.contact_phone);
      if (!telefone) continue;
      if (!/^[A-Z]{2}\d+[A-Z]{2}$/i.test(rastreio)) continue;
      if (db.statusRastreio(rastreio) === 'entregue') continue;

      const evento = await consultarCorreios(rastreio);
      if (!evento) continue;

      const statusAnterior = db.statusRastreio(rastreio);
      const statusNovo = evento.entregue ? 'entregue' : evento.descricao;

      if (statusNovo && statusNovo !== statusAnterior) {
        console.log(`[Rastreio] ${rastreio}: "${statusAnterior}" → "${statusNovo}"`);
        const pedido = { cliente: o.contact_name, numero: o.number, rastreio };
        try {
          await sendWhatsApp(telefone, montarMensagemRastreio(pedido, evento));
          console.log(`[Rastreio] WhatsApp enviado para #${o.number}`);
        } catch(e) {
          console.error(`[Rastreio] Falha para #${o.number}:`, e.message);
        }
        db.atualizarStatusRastreio(rastreio, statusNovo, evento.data + ' ' + evento.hora);
      } else if (!statusAnterior) {
        db.atualizarStatusRastreio(rastreio, statusNovo || 'postado', evento.data + ' ' + evento.hora);
      }

      await new Promise(r => setTimeout(r, 500));
    }
  } catch(e) {
    console.error(`[Rastreio] Erro loja ${storeId}:`, e.response?.data || e.message);
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
    <body><h2>✅ RastreioBot conectado!</h2><p>Loja autenticada com sucesso.</p>
    <p style="margin-top:1.5rem;">Seu <strong>Store ID</strong>:</p><code>${sid}</code>
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
      const statusRastreio = temRastreio ? db.statusRastreio(o.shipping_tracking_number.trim()) : null;
      resultado.push({
        order_id: String(o.id), numero: o.number, cliente: o.contact_name || '',
        telefone: tel, rastreio: o.shipping_tracking_number || '',
        transportadora: o.shipping_option || '',
        status: foiEnviado ? 'shipped' : (o.shipping_status || 'pending'),
        statusRastreio, diasUteis, statusPrazo, ja_notificado: jaEnviado, created_at: o.created_at
      });
    }
    resultado.sort((a, b) => {
      const p = x => x.statusPrazo === 'atrasado' ? 0 : x.statusPrazo === 'hoje' ? 1 : x.status === 'shipped' ? 2 : 3;
      return p(a) - p(b);
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
  res.json({ ok: true, lojas: stores.length, versao: '1.2.0', cron: 'ativo (30min)' });
});

// ── Enviar WhatsApp ───────────────────────────────────────────────────────────
app.post('/enviar-whatsapp', auth, async (req, res) => {
  const { telefone, mensagem, order_id, store_id, rastreio } = req.body;
  if (!telefone || !mensagem) return res.status(400).json({ error: 'telefone e mensagem obrigatórios.' });
  try {
    const result = await sendWhatsApp(telefone, mensagem);
    if (order_id && store_id) db.marcarNotificado(order_id, store_id, rastreio, telefone);
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

// ── Webhook Z-API — Resposta automática de rastreio ──────────────────────────
const GATILHOS = [
  'cadê meu pedido', 'cade meu pedido',
  'cadê meu código', 'cade meu codigo',
  'código de rastreio', 'codigo de rastreio',
  'preciso do código', 'preciso do codigo',
  'meu pedido ainda nao chegou', 'meu pedido não chegou',
  'rastreio', 'rastreamento', 'onde está meu pedido',
  'onde esta meu pedido', 'meu pedido'
];

function contemGatilho(texto) {
  const t = (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return GATILHOS.some(g => {
    const gn = g.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.includes(gn);
  });
}

app.post('/webhook/zapi', async (req, res) => {
  res.json({ ok: true }); // Responde imediatamente

  try {
    const body = req.body;

    // Ignora mensagens enviadas pelo próprio bot
    if (body.fromMe) return;
    if (!body.text?.message) return;

    const texto    = body.text.message;
    const telefone = body.phone; // formato: 5581999999999

    if (!contemGatilho(texto)) return;

    console.log(`[ZAPI] Gatilho detectado de ${telefone}: "${texto}"`);

    // Busca pedido mais recente pelo telefone em todas as lojas
    const stores = db.getAllStores();
    let pedidoEncontrado = null;

    for (const store of stores) {
      try {
        const orders = await nuvemGet(store.store_id, '/orders', {
          per_page: 50,
          payment_status: 'paid',
          fields: 'id,number,contact_name,contact_phone,shipping_tracking_number,shipping_option,created_at'
        });

        // Normaliza telefone para comparar
        const telLimpo = String(telefone).replace(/\D/g, '');

        const pedido = orders
          .filter(o => o.status !== 'cancelled')
          .find(o => {
            const t = formatTel(o.contact_phone);
            return t && String(t).replace(/\D/g, '').endsWith(telLimpo.slice(-10));
          });

        if (pedido) {
          pedidoEncontrado = { ...pedido, store_id: store.store_id };
          break;
        }
      } catch(e) {
        console.error(`[ZAPI] Erro ao buscar loja ${store.store_id}:`, e.message);
      }
    }

    if (!pedidoEncontrado) {
      await sendWhatsApp(telefone,
        `Olá! 😊 Não encontrei nenhum pedido vinculado a este número.\n\n` +
        `Se precisar de ajuda, entre em contato com nossa equipe!`
      );
      return;
    }

    const rastreio = pedidoEncontrado.shipping_tracking_number?.trim();
    const nome     = pedidoEncontrado.contact_name || 'Cliente';
    const numero   = pedidoEncontrado.number;
    const link     = rastreio
      ? `https://rastreamento.correios.com.br/app/index.php?objeto=${rastreio}`
      : null;

    // Busca status atual no DB
    const statusAtual = rastreio ? db.statusRastreio(rastreio) : null;

    let mensagem;
    if (!rastreio) {
      mensagem =
        `Olá, ${nome}! 😊\n\n` +
        `Seu pedido *#${numero}* ainda está em produção.\n\n` +
        `Assim que for enviado, você receberá o código de rastreio aqui. 📦`;
    } else {
      mensagem =
        `Olá, ${nome}! 😊\n\n` +
        `Seu pedido *#${numero}*:\n\n` +
        `📦 *Código de rastreio:* ${rastreio}\n` +
        (statusAtual ? `📍 *Status atual:* ${statusAtual}\n` : '') +
        `\n🔗 Rastreie aqui: ${link}`;
    }

    await sendWhatsApp(telefone, mensagem);
    console.log(`[ZAPI] Resposta automática enviada para ${telefone} — pedido #${numero}`);
  } catch(e) {
    console.error('[ZAPI] Erro no webhook:', e.message);
  }
});

app.listen(PORT, () => {
  console.log(`RastreioBot v1.3.0 rodando na porta ${PORT}`);
  console.log('Cron ativo: verificação a cada 30 minutos');
});
