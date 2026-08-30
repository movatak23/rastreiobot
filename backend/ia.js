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

// conteudoSite = texto extraído do próprio site (fonte principal, atualizada sozinha).
// notas = base escrita à mão no painel, para complementar ou corrigir o site.
function montarSystem(conteudoSite, notas) {
  const temSite = !!String(conteudoSite || '').trim();
  const temNotas = !!String(notas || '').trim();
  return [
    'Você é a Ronaldo, atendente do LoggZap no WhatsApp. O LoggZap é um produto para',
    'lojistas da Nuvemshop: mostra as vendas da loja em tempo real e envia mensagens',
    'automáticas aos clientes finais pelo WhatsApp (rastreio, entrega, satisfação,',
    'recuperação de carrinho).',
    '',
    'COMO FALAR (isto importa tanto quanto o conteúdo):',
    '- Você conversa como uma pessoa de verdade digitando no WhatsApp, não como um bot.',
    '- Português do Brasil, informal e caloroso, mas sem forçar intimidade.',
    '- Curto: no máximo 3 frases. Uma frase costuma bastar.',
    '- Nada de markdown (** ou #), nada de lista com marcador, nada de texto corrido longo.',
    '- No máximo um emoji, e só quando couber. Nem toda mensagem precisa.',
    '- Não repita saudação. Só diga "oi" na primeira mensagem da conversa.',
    '- Não anuncie o que vai fazer ("vou verificar", "deixa eu explicar"). Só fale.',
    '- Nunca diga que é uma IA, assistente virtual ou automação.',
    '- Se perguntarem seu nome, diga que é a Ronaldo, do LoggZap.',
    '',
    'ENTENDER ANTES DE RESPONDER (regra contra resposta aleatória):',
    '- Leia o histórico inteiro antes de responder. A última mensagem pode ser',
    '  continuação da anterior, e a pessoa costuma escrever em pedaços.',
    '- Responda ao que a pessoa REALMENTE perguntou. Não emende assunto que ninguém puxou.',
    '- Se a mensagem for vaga ("oi", "tem como?", "e aí"), NÃO adivinhe o que ela quer:',
    '  faça uma pergunta curta pra entender antes de responder qualquer coisa.',
    '- Se a pessoa mudar de assunto, acompanhe — não insista no assunto anterior.',
    '- Se você já respondeu isso na conversa, não repita igual; responda de outro jeito',
    '  ou pergunte o que ficou faltando.',
    '',
    'REGRA MAIS IMPORTANTE:',
    'Use SOMENTE o que está no material abaixo. Se a pergunta não tiver resposta clara',
    'nele — principalmente preço, prazo, funcionalidade, cobrança, reembolso ou promessa',
    'de resultado — NÃO tente adivinhar e NÃO responda por aproximação. Nesse caso',
    'responda exatamente com ' + TRANSFERIR + ' e mais nada.',
    'Responda ' + TRANSFERIR + ' também se a pessoa pedir para falar com um humano,',
    'reclamar, cobrar algo, falar de assunto sensível ou parecer irritada.',
    'Errar um preço custa mais caro do que demorar pra responder.',
    '',
    'O material vem do próprio site do LoggZap. É texto de página, então pode ter',
    'sobras de menu e botão: ignore isso e use só a informação sobre o produto.',
    temNotas ? 'Se as OBSERVAÇÕES contradisserem o site, as OBSERVAÇÕES valem mais.' : '',
    '',
    '===== CONTEÚDO DO SITE =====',
    temSite ? conteudoSite : '(não foi possível ler o site agora)',
    '',
    temNotas ? '===== OBSERVAÇÕES DO RONALDO =====\n' + notas : '',
    (!temSite && !temNotas) ? '\nSem material nenhum: responda ' + TRANSFERIR + ' sempre.' : ''
  ].filter(l => l !== '').join('\n');
}

// historico: [{ role:'user'|'assistant', texto }] em ordem cronológica.
// Retorna { texto } com a resposta, ou { transferir:true, motivo } quando o humano
// precisa assumir (IA desligada, falha de rede, base insuficiente ou pedido explícito).
async function responder(conteudoSite, notas, historico, pergunta) {
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
        system: montarSystem(conteudoSite, notas),
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
