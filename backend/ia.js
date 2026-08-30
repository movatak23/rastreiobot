// Atendimento por IA (Anthropic/Claude) do WhatsApp comercial do LoggZap.
// Mesmo padrão dos outros integradores: fetch direto, sem SDK, e degrada com segurança —
// sem ANTHROPIC_API_KEY apenas retorna null e o chamador transfere pra humano.
//
// Variáveis no Railway:
//   ANTHROPIC_API_KEY  — obrigatória pra ligar a IA
//   ANTHROPIC_MODEL    — opcional (padrão claude-haiku-4-5: barato e rápido, suficiente
//                        pra atendimento com base de conhecimento fechada)

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL   = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const URL     = 'https://api.anthropic.com/v1/messages';

// Marcador que a IA devolve quando NÃO deve responder sozinha. O código detecta,
// pausa a conversa e avisa o Ronaldo. É a trava contra o erro mais caro de um bot de
// vendas: inventar preço, prazo ou função que o produto não tem.
const TRANSFERIR = '[TRANSFERIR]';

function configurada() {
  return !!API_KEY;
}

function montarSystem(conhecimento) {
  return [
    'Você é o atendente virtual do LoggZap no WhatsApp. O LoggZap é um produto para',
    'lojistas da Nuvemshop: mostra as vendas da loja em tempo real e envia mensagens',
    'automáticas aos clientes finais pelo WhatsApp (rastreio, entrega, satisfação,',
    'recuperação de carrinho).',
    '',
    'COMO RESPONDER:',
    '- Português do Brasil, tom de conversa de WhatsApp: curto, cordial e direto.',
    '- No máximo 3 frases por resposta. Nada de texto longo ou lista enorme.',
    '- Não use markdown (nada de ** ou #). WhatsApp não renderiza.',
    '- Responda só a mensagem final ao cliente, sem explicar seu raciocínio.',
    '- Trate a pessoa por você. Não invente nome.',
    '',
    'REGRA MAIS IMPORTANTE:',
    'Use SOMENTE o que está na base de conhecimento abaixo. Se a pergunta não tiver',
    'resposta clara na base — principalmente preço, prazo, funcionalidade, cobrança,',
    'reembolso ou promessa de resultado — NÃO tente adivinhar e NÃO responda por',
    'aproximação. Nesse caso responda exatamente com ' + TRANSFERIR + ' e mais nada.',
    'Responda ' + TRANSFERIR + ' também se a pessoa pedir para falar com um humano,',
    'reclamar, cobrar algo, falar de assunto sensível ou parecer irritada.',
    'Errar um preço custa mais caro do que demorar pra responder.',
    '',
    '=== BASE DE CONHECIMENTO ===',
    (conhecimento || '(vazia — se a base está vazia, responda ' + TRANSFERIR + ' sempre)')
  ].join('\n');
}

// historico: [{ role:'user'|'assistant', texto }] em ordem cronológica.
// Retorna { texto } com a resposta, ou { transferir:true, motivo } quando o humano
// precisa assumir (IA desligada, falha de rede, base insuficiente ou pedido explícito).
async function responder(conhecimento, historico, pergunta) {
  if (!configurada()) return { transferir: true, motivo: 'IA não configurada (falta ANTHROPIC_API_KEY)' };

  const messages = [
    ...(Array.isArray(historico) ? historico : [])
      .filter((m) => m && m.texto)
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.texto) })),
    { role: 'user', content: String(pergunta || '') },
  ];

  try {
    const r = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: montarSystem(conhecimento),
        messages,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (d && d.error && d.error.message) || ('HTTP ' + r.status);
      console.error('[ia] falha:', msg);
      return { transferir: true, motivo: 'Falha na IA: ' + msg };
    }
    const txt = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!txt) return { transferir: true, motivo: 'IA devolveu resposta vazia' };
    if (txt.includes(TRANSFERIR)) return { transferir: true, motivo: 'A IA não tinha essa resposta na base' };
    return { texto: txt };
  } catch (e) {
    console.error('[ia] erro de rede:', e.message);
    return { transferir: true, motivo: 'Erro de rede ao chamar a IA' };
  }
}

module.exports = { configurada, responder, model: MODEL, TRANSFERIR };
