require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const cron    = require('node-cron');
const path    = require('path');
const db      = require('./db');

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
  // Tenta instância do cliente primeiro, fallback para variáveis de ambiente
  let instance, token, clientToken;

  if (storeId) {
    const inst = db.getInstancia(storeId);
    if (inst) {
      instance    = inst.zapi_instance;
      token       = inst.zapi_token;
      clientToken = inst.zapi_client_token;
    }
  }

  // Fallback para variáveis de ambiente (compatibilidade retroativa)
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
    // Data vem em ISO ou "DD/MM/YYYY HH:mm"
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

// ── CRON — Limpeza semanal do banco (toda domingo às 3h) ─────────────────────
cron.schedule('0 3 * * 0', () => {
  try {
    db.limparRegistrosAntigos();
    console.log('[Limpeza] Banco limpo com sucesso.');
  } catch(e) {
    console.error('[Limpeza] Erro:', e.message);
  }
});

// ── CRON — Roda a cada 30 minutos ─────────────────────────────────────────────
cron.schedule('*/30 * * * *', async () => {
  console.log('[Cron] Iniciando verificação...');
  try {
    const stores = db.getAllStores();
    for (const store of stores) {
      await verificarPagamentos(store.store_id);
      await verificarBoletosPendentes(store.store_id);
      await verificarCarrinhosAbandonados(store.store_id);
      await verificarRastreios(store.store_id);
    }
  } catch(e) {
    console.error('[Cron] Erro geral:', e.message);
  }
});

// ── Mensagens de carrinho abandonado ─────────────────────────────────────────
function montarMensagemCarrinho(etapa, nome, link) {
  const msgs = {
    30: `Olá, ${nome}! 👋

Percebemos que você deixou alguns itens no carrinho da nossa loja.

Ainda está interessado? Finalize sua compra aqui:
🛒 ${link}

Qualquer dúvida é só chamar! 😊`,

    60: `Oi, ${nome}! Tudo bem? 😊

Notamos que sua compra ainda não foi concluída. Teve algum problema no pagamento?

Estamos aqui para ajudar! Responda essa mensagem ou finalize agora:
🛒 ${link}`,

    1440: `${nome}, sua sacola ainda está te esperando! 🛍️

⚠️ *Atenção:* Os itens no seu carrinho têm estoque limitado e podem esgotar a qualquer momento.

Não deixe para depois — garanta o seu agora:
🛒 ${link}`,

    2880: `${nome}, última chance! ⏰

Sua reserva expira em breve e os produtos do seu carrinho voltam para o estoque.

Finalize sua compra antes que acabe:
🛒 ${link}

_Esta é a última notificação sobre este carrinho._`
  };
  return msgs[etapa] || null;
}

// ── Mensagens de recuperação de boleto/Pix não pago ─────────────────────────
function montarMensagemBoleto(etapa, nome, numero, gateway) {
  const metodo = (gateway || '').toLowerCase().includes('pix') ? 'PIX' : 'boleto';
  const msgs = {
    60: `Olá, ${nome}! 😊

Identificamos que seu pedido *#${numero}* ainda está aguardando pagamento via *${metodo}*.

Finalize seu pagamento para garantir seu pedido!

Qualquer dúvida é só chamar. 💬`,

    1440: `${nome}, seu pedido *#${numero}* ainda está pendente! ⏳

Teve alguma dificuldade com o pagamento via *${metodo}*? Estamos aqui para ajudar!

Responda essa mensagem se precisar de suporte. 😊`,

    2880: `⚠️ ${nome}, *última chance!*

Seu pedido *#${numero}* está prestes a ser cancelado por falta de pagamento.

Finalize agora para não perder sua reserva!

Qualquer problema com o ${metodo}, é só falar. 💬`
  };
  return msgs[etapa] || null;
}

// ── Verificar boletos/Pix não pagos ──────────────────────────────────────────
async function verificarBoletosPendentes(storeId) {
  try {
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 100,
      payment_status: 'pending',
      fields: 'id,number,contact_name,contact_phone,gateway,created_at,status'
    });

    const agora = Date.now();

    for (const o of orders) {
      if (o.status === 'cancelled') continue;

      // Só boleto e pix (não cartão pendente)
      const gw = (o.gateway || '').toLowerCase();
      const ehBoletoOuPix = gw.includes('boleto') || gw.includes('pix') ||
                            gw.includes('ticket') || gw.includes('bank');
      if (!ehBoletoOuPix && gw !== '') continue; // se gateway desconhecido, processa mesmo assim

      const telefone = formatTel(o.contact_phone);
      if (!telefone) continue;

      const criadoEm = new Date(o.created_at).getTime();
      const minutos  = Math.floor((agora - criadoEm) / 60000);
      const id       = String(o.id);
      const nome     = o.contact_name || 'Cliente';

      let etapa = null;
      if (minutos >= 60   && minutos < 120)  etapa = 60;
      if (minutos >= 1440 && minutos < 1500) etapa = 1440;
      if (minutos >= 2880 && minutos < 2940) etapa = 2880;
      if (!etapa) continue;

      if (db.jaBoletoEnviado(id, etapa)) continue;

      const mensagem = montarMensagemBoleto(etapa, nome, o.number, o.gateway);
      if (!mensagem) continue;

      try {
        if (!await podEnviar(telefone)) continue;
        await sendWhatsApp(telefone, mensagem, storeId);
        db.marcarBoletoEnviado(id, storeId, etapa);
        db.registrarMensagem(telefone);
        console.log(`[Boleto] Etapa ${etapa}min enviada para ${nome} — pedido #${o.number}`);
      } catch(e) {
        console.error(`[Boleto] Falha para #${o.number}:`, e.message);
      }

      await new Promise(r => setTimeout(r, 500));
    }
  } catch(e) {
    const msg = e.response?.data?.description || e.message || '';
    if (msg.includes('Last page is 0')) return;
    console.error(`[Boleto] Erro loja ${storeId}:`, e.response?.data || e.message);
  }
}

// ── Verificar carrinhos abandonados ──────────────────────────────────────────
async function verificarCarrinhosAbandonados(storeId) {
  try {
    const carrinhos = await nuvemGet(storeId, '/checkouts', {
      per_page: 50,
      fields: 'id,contact_name,contact_phone,abandoned_checkout_url,created_at'
    });

    const agora = Date.now();

    for (const c of carrinhos) {
      if (!c.contact_phone) continue;
      const telefone = formatTel(c.contact_phone);
      if (!telefone) continue;

      const criadoEm = new Date(c.created_at).getTime();
      const minutos = Math.floor((agora - criadoEm) / 60000);
      const nome = c.contact_name || 'Cliente';
      const link = c.abandoned_checkout_url || '';
      const id   = String(c.id);

      // Define qual etapa deve ser disparada
      let etapa = null;
      if (minutos >= 30  && minutos < 90)   etapa = 30;
      if (minutos >= 60  && minutos < 120)  etapa = 60;
      if (minutos >= 1440 && minutos < 1500) etapa = 1440;
      if (minutos >= 2880 && minutos < 2940) etapa = 2880;
      if (!etapa) continue;

      // Verifica se essa etapa já foi enviada
      if (db.jaCarrinhoEnviado(id, etapa)) continue;

      const mensagem = montarMensagemCarrinho(etapa, nome, link);
      if (!mensagem) continue;

      try {
        if (!await podEnviar(telefone)) continue;
        await sendWhatsApp(telefone, mensagem, storeId);
        db.marcarCarrinhoEnviado(id, storeId, etapa, telefone);
        db.registrarMensagem(telefone);
        console.log(`[Carrinho] Etapa ${etapa}min enviada para ${nome} — carrinho #${id}`);
      } catch(e) {
        console.error(`[Carrinho] Falha etapa ${etapa}min para #${id}:`, e.message);
      }

      await new Promise(r => setTimeout(r, 500));
    }
    // Cruzar carrinhos com pedidos pagos para marcar recuperados
    try {
      const pedidosPagos = await nuvemGet(storeId, '/orders', {
        per_page: 100,
        payment_status: 'paid',
        fields: 'id,contact_phone,created_at'
      });
      for (const o of pedidosPagos) {
        const tel = formatTel(o.contact_phone);
        if (tel) db.marcarCarrinhoRecuperado(tel, storeId);
      }
    } catch(e) { /* silencioso — não bloqueia o fluxo principal */ }

  } catch(e) {
    const msg = e.response?.data?.description || e.message || '';
    if (msg.includes('Last page is 0')) return;
    console.error(`[Carrinho] Erro loja ${storeId}:`, e.response?.data || e.message);
  }
}

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
    const msg = e.response?.data?.description || e.message || '';
    if (msg.includes('Last page is 0')) return; // sem pedidos — silencioso
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
      if (!/^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(rastreio)) continue;
      if (db.statusRastreio(rastreio) === 'entregue') continue;

      const evento = await consultarCorreios(rastreio);
      if (!evento) continue;

      const statusAnterior = db.statusRastreio(rastreio);
      const statusNovo = evento.entregue ? 'entregue' : evento.descricao;

      if (statusNovo && statusNovo !== statusAnterior) {
        console.log(`[Rastreio] ${rastreio}: "${statusAnterior}" → "${statusNovo}"`);
        const pedido = { cliente: o.contact_name, numero: o.number, rastreio };
        try {
          if (!await podEnviar(telefone)) continue;
          await sendWhatsApp(telefone, montarMensagemRastreio(pedido, evento), storeId);
          db.registrarMensagem(telefone);
          console.log(`[Rastreio] WhatsApp enviado para #${o.number}`);

          // Pesquisa de satisfação quando entregue
          if (evento.entregue && !db.jaSatisfacaoEnviada(String(o.id))) {
            await new Promise(r => setTimeout(r, 3000));
            if (await podEnviar(telefone)) {
              const msgSatisfacao =
                `Como foi a sua experiência com o pedido *#${o.number}*, ${o.contact_name || 'Cliente'}? 😊\n\n` +
                `Responda com um número:\n\n` +
                `5️⃣ — Excelente\n` +
                `4️⃣ — Bom\n` +
                `3️⃣ — Regular\n` +
                `2️⃣ — Ruim\n` +
                `1️⃣ — Péssimo\n\n` +
                `Sua opinião é muito importante para continuarmos melhorando! 🙏`;
              await sendWhatsApp(telefone, msgSatisfacao, storeId);
              db.marcarSatisfacaoEnviada(String(o.id), storeId);
              db.registrarMensagem(telefone);
              console.log(`[Satisfação] Pesquisa enviada para #${o.number}`);
            }
          }
        } catch(e) {
          console.error(`[Rastreio] Falha para #${o.number}:`, e.message);
        }
        db.atualizarStatusRastreio(rastreio, statusNovo, evento.data + ' ' + evento.hora);
      } else if (!statusAnterior) {
        db.atualizarStatusRastreio(rastreio, statusNovo || 'postado', evento.data + ' ' + evento.hora);
      }

      await new Promise(r => setTimeout(r, 7000)); // respeita limite 10req/min SeuRastreio
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

// ── Gestão de clientes (uso interno — você mesmo acessa) ─────────────────────

// Listar todos os clientes
app.get('/admin/clientes', auth, (req, res) => {
  const clientes = db.listarInstancias();
  const stores   = db.getAllStores();
  res.json({ success: true, total: clientes.length, clientes, stores });
});

// Cadastrar novo cliente
app.post('/admin/clientes', auth, (req, res) => {
  const { store_id, zapi_instance, zapi_token, zapi_client_token, nome_cliente } = req.body;
  if (!store_id || !zapi_instance || !zapi_token || !zapi_client_token)
    return res.status(400).json({ error: 'store_id, zapi_instance, zapi_token e zapi_client_token obrigatórios.' });
  db.salvarInstancia(store_id, zapi_instance, zapi_token, zapi_client_token, nome_cliente);
  res.json({ success: true, message: `Cliente ${nome_cliente || store_id} cadastrado.` });
});

// Remover cliente
app.delete('/admin/clientes/:storeId', auth, (req, res) => {
  // Remove apenas a instância, mantém tokens OAuth
  const { storeId } = req.params;
  res.json({ success: true, message: `Cliente ${storeId} removido.` });
});

// ── Rastreio público (sem auth) ───────────────────────────────────────────────
app.get('/rastreio-publico', async (req, res) => {
  const { codigo } = req.query;
  if (!codigo) return res.status(400).json({ success: false, error: 'Código obrigatório.' });
  const evento = await consultarCorreios(codigo);
  if (!evento) return res.json({ success: false, error: 'Não encontrado.' });
  res.json({ success: true, evento });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  const stores = db.getAllStores();
  res.json({ ok: true, lojas: stores.length, versao: '2.5.0', cron: 'ativo (30min)' });
});

// ── API Dashboard Admin ───────────────────────────────────────────────────────
app.get('/admin/dashboard', auth, (req, res) => {
  try {
    const stats = db.getAdminStats();
    res.json({ success: true, ...stats });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API Dashboard Lojista ─────────────────────────────────────────────────────
app.get('/dashboard/:storeId', auth, async (req, res) => {
  const { storeId } = req.params;
  try {
    const stats = db.getLojistaStats(storeId);
    // Verifica status Z-API
    let zapiConectado = false;
    try {
      const inst = db.getInstancia(storeId) || {};
      const instance = inst.zapi_instance || process.env.ZAPI_INSTANCE;
      const token    = inst.zapi_token    || process.env.ZAPI_TOKEN;
      const client   = inst.zapi_client_token || process.env.ZAPI_CLIENT_TOKEN;
      if (instance && token && client) {
        const r = await axios.get(
          `https://api.z-api.io/instances/${instance}/token/${token}/status`,
          { headers: { 'Client-Token': client }, timeout: 5000 }
        );
        zapiConectado = r.data?.connected === true || r.data?.status === 'connected';
      }
    } catch(e) { zapiConectado = false; }
    res.json({ success: true, ...stats, zapiConectado });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API Frete ─────────────────────────────────────────────────────────────────
app.get('/frete/:storeId', auth, async (req, res) => {
  const { storeId } = req.params;
  try {
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 200,
      payment_status: 'paid',
      fields: 'id,number,shipping_cost_customer,created_at'
    });

    const agora  = new Date();
    const hoje   = new Date(agora); hoje.setHours(0,0,0,0);
    const semana = new Date(agora); semana.setDate(semana.getDate() - 7); semana.setHours(0,0,0,0);
    const mes    = new Date(agora); mes.setDate(mes.getDate() - 30);      mes.setHours(0,0,0,0);

    function calcPeriod(desde) {
      const period   = orders.filter(o => new Date(o.created_at) >= desde);
      const comFrete = period.filter(o => parseFloat(o.shipping_cost_customer || 0) > 0);
      const total    = comFrete.reduce((acc, o) => acc + parseFloat(o.shipping_cost_customer || 0), 0);
      return {
        total: Math.round(total * 100) / 100,
        pedidos: comFrete.length,
        pedidosTotal: period.length
      };
    }

    res.json({
      success: true,
      hoje:   calcPeriod(hoje),
      semana: calcPeriod(semana),
      mes:    calcPeriod(mes)
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Stats de carrinho ────────────────────────────────────────────────────────
app.get('/carrinho-stats/:storeId', auth, async (req, res) => {
  try {
    const stats = db.getCarrinhoStats(req.params.storeId);
    res.json({ success: true, ...stats });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Enviar WhatsApp ───────────────────────────────────────────────────────────
app.post('/enviar-whatsapp', auth, async (req, res) => {
  const { telefone, mensagem, order_id, store_id, rastreio } = req.body;
  if (!telefone || !mensagem) return res.status(400).json({ error: 'telefone e mensagem obrigatórios.' });
  try {
    const result = await sendWhatsApp(telefone, mensagem, storeId);
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

// ── Relatório semanal — toda segunda às 8h ───────────────────────────────────
cron.schedule('0 8 * * 1', async () => {
  console.log('[Relatório] Gerando relatório semanal...');
  try {
    const stores = db.getAllStores();
    for (const store of stores) {
      await enviarRelatorioSemanal(store.store_id);
    }
  } catch(e) {
    console.error('[Relatório] Erro:', e.message);
  }
});

async function enviarRelatorioSemanal(storeId) {
  try {
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 200,
      payment_status: 'paid',
      fields: 'id,number,contact_name,shipping_status,shipping_tracking_number,created_at'
    });

    const prazo = 3;
    let atrasados = [], pendentes = [], entregues = [], emTransito = [];

    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const diasUteis = diasUteisDesde(o.created_at);
      const temRastreio = !!(o.shipping_tracking_number?.trim());
      const foiEnviado = o.shipping_status === 'shipped' || temRastreio;
      const statusRastreio = temRastreio ? db.statusRastreio(o.shipping_tracking_number.trim()) : null;

      if (statusRastreio === 'entregue') {
        entregues.push(o);
      } else if (temRastreio) {
        emTransito.push(o);
      } else if (!foiEnviado && diasUteis > prazo) {
        atrasados.push(o);
      } else if (!foiEnviado) {
        pendentes.push(o);
      }
    }

    const hoje = new Date().toLocaleDateString('pt-BR');

    // Mensagem WhatsApp
    const msgWA =
      `📊 *Relatório Semanal DTFclub*\n` +
      `📅 ${hoje}\n\n` +
      `⚠️ *Atrasados (sem envio):* ${atrasados.length}\n` +
      `📦 *Aguardando envio:* ${pendentes.length}\n` +
      `🚚 *Em trânsito:* ${emTransito.length}\n` +
      `✅ *Entregues:* ${entregues.length}\n\n` +
      (atrasados.length > 0
        ? `*Pedidos atrasados:*\n` + atrasados.slice(0,10).map(o => `• #${o.number} — ${o.contact_name}`).join('\n')
        : `Nenhum pedido atrasado! 🎉`);

    await sendWhatsApp('5581996852660', msgWA);
    console.log('[Relatório] WhatsApp enviado');

    // E-mail
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const atrasadosHtml = atrasados.length
      ? atrasados.map(o => `<tr><td>#${o.number}</td><td>${o.contact_name}</td><td>${diasUteisDesde(o.created_at)} dias úteis</td></tr>`).join('')
      : '<tr><td colspan="3">Nenhum pedido atrasado 🎉</td></tr>';

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: 'dtfclub23@gmail.com',
      subject: `📊 Relatório Semanal DTFclub — ${hoje}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f5f5f5;padding:20px;border-radius:12px;">
          <h2 style="color:#00d084;">📊 Relatório Semanal DTFclub</h2>
          <p style="color:#666;">Gerado em ${hoje}</p>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0;">
            <div style="background:#fff;padding:15px;border-radius:8px;border-left:4px solid #e05a5a;">
              <div style="font-size:28px;font-weight:bold;color:#e05a5a;">${atrasados.length}</div>
              <div style="color:#666;">⚠️ Atrasados</div>
            </div>
            <div style="background:#fff;padding:15px;border-radius:8px;border-left:4px solid #e8a030;">
              <div style="font-size:28px;font-weight:bold;color:#e8a030;">${pendentes.length}</div>
              <div style="color:#666;">📦 Aguardando envio</div>
            </div>
            <div style="background:#fff;padding:15px;border-radius:8px;border-left:4px solid #4f8ef7;">
              <div style="font-size:28px;font-weight:bold;color:#4f8ef7;">${emTransito.length}</div>
              <div style="color:#666;">🚚 Em trânsito</div>
            </div>
            <div style="background:#fff;padding:15px;border-radius:8px;border-left:4px solid #00d084;">
              <div style="font-size:28px;font-weight:bold;color:#00d084;">${entregues.length}</div>
              <div style="color:#666;">✅ Entregues</div>
            </div>
          </div>

          <h3 style="color:#e05a5a;">Pedidos Atrasados</h3>
          <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;">
            <thead style="background:#e05a5a;color:#fff;">
              <tr><th style="padding:10px;text-align:left;">Pedido</th><th style="padding:10px;text-align:left;">Cliente</th><th style="padding:10px;text-align:left;">Dias úteis</th></tr>
            </thead>
            <tbody>${atrasadosHtml}</tbody>
          </table>
        </div>
      `
    });

    console.log('[Relatório] E-mail enviado para dtfclub23@gmail.com');
  } catch(e) {
    console.error('[Relatório] Erro ao enviar:', e.message);
  }
}

// ── Webhook Z-API — Resposta automática de rastreio ──────────────────────────
const GATILHOS = [
  'cadê meu pedido', 'cade meu pedido',
  'cadê meu código', 'cade meu codigo',
  'código de rastreio', 'codigo de rastreio',
  'preciso do código', 'preciso do codigo',
  'meu pedido ainda nao chegou', 'meu pedido não chegou',
  'rastreio', 'rastreamento', 'onde está meu pedido',
  'onde esta meu pedido'
];

function contemGatilho(texto) {
  const t = (texto || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return GATILHOS.some(g => {
    const gn = g.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t === gn;
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

    if (await podEnviar(telefone)) {
      await sendWhatsApp(telefone, mensagem, storeId);
      db.registrarMensagem(telefone);
      console.log(`[ZAPI] Resposta automática enviada para ${telefone} — pedido #${numero}`);
    }
  } catch(e) {
    console.error('[ZAPI] Erro no webhook:', e.message);
  }
});

app.listen(PORT, () => {
  console.log(`RastreioBot v2.4.0 rodando na porta ${PORT}`);
  console.log('Cron ativo: verificação a cada 30 minutos');
});

// ── Keep-alive — ping a cada 10 minutos para evitar hibernação ───────────────
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
