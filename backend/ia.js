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

// Links oficiais. Ficam aqui (e não só no site coletado) porque a IA escreveu
// "loggzap.com" — sem o .br — e mandou o lead pra um endereço que não existe.
const LINK_SITE     = 'https://www.loggzap.com.br';
const LINK_EXTENSAO = 'https://chromewebstore.google.com/detail/loggzap-dashboard/dpfnpaepnholpjgbblljpinbkfoldlpp';
const LINK_PAINEL   = 'https://cliente.loggzap.com.br/painel';

// O prompt PEDE formato de WhatsApp, mas modelo nenhum obedece 100%. Aqui o código
// GARANTE: sem markdown, sem lista, curto e no máximo 1 emoji. Testado: a IA insistia
// em responder com **negrito** e 5 parágrafos, o que entrega na hora que é robô.
const RE_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

function humanizar(txt) {
  let s = String(txt || '').trim();
  // Conserta o domínio: ela mandou um lead pra "loggzap.com" (sem .br), que não existe.
  // Pega com ou sem www/http e não toca no que já está certo (o lookahead exclui .br).
  s = s.replace(/\b(?:https?:\/\/)?(?:www\.)?loggzap\.com\b(?!\.br)/gi, LINK_SITE);

  // Tira os links de cena antes de mexer no texto. Sem isso o corte por frases
  // enxergava os pontos do domínio como fim de frase e ENTREGAVA LINK PELA METADE
  // ("https://www.loggzap." em vez do endereço inteiro).
  const links = [];
  s = s.replace(/https?:\/\/[^\s<>"]+|\b[a-z0-9.-]+\.(?:com\.br|com|br)\b(?:\/[^\s<>"]*)?/gi, (m) => {
    links.push(m.replace(/[.,;:]$/, '')); // ponto final da frase não faz parte do link
    return ' @@L' + (links.length - 1) + '@@ ';
  });
  // Markdown fora: o WhatsApp mostraria os asteriscos crus.
  s = s.replace(/\*\*(.+?)\*\*/g, '$1')
       .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,!?])/g, '$1$2')
       .replace(/(^|\s)_(\S[^_]*?)_(?=\s|$|[.,!?])/g, '$1$2')
       .replace(/^#{1,6}\s*/gm, '')
       .replace(/^\s*[-•*]\s+/gm, '')   // vira frase, não item de lista
       .replace(/^\s*\d+[.)]\s+/gm, '');
  // Linhas em branco viram espaço simples — resposta de WhatsApp não tem parágrafo.
  s = s.split('\n').map(l => l.trim()).filter(Boolean).join(' ');
  s = s.replace(/\s{2,}/g, ' ').trim();

  // No máximo 3 frases. Corta em fim de frase, nunca no meio da palavra.
  const frases = s.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [s];
  if (frases.length > 3) s = frases.slice(0, 3).join('').trim();

  // No máximo 1 emoji.
  let vistos = 0;
  s = s.replace(RE_EMOJI, (m) => (++vistos <= 1 ? m : '')).replace(/\s{2,}/g, ' ').trim();

  // Rede de segurança de tamanho (ainda com os links fora, pra não cortar no meio deles).
  if (s.length > 420) {
    const corte = s.lastIndexOf(' ', 400);
    s = s.slice(0, corte > 200 ? corte : 400).trim().replace(/[,;:]$/, '') + '.';
  }

  // Devolve os links inteiros. Se algum ficou de fora por causa do corte, tudo bem —
  // melhor a resposta sem link do que com link quebrado.
  s = s.replace(/@@L(\d+)@@/g, (m, i) => links[Number(i)] || '');
  return s.replace(/\s{2,}/g, ' ').trim();
}

function configurada() {
  return !!API_KEY;
}

// conteudoSite = texto extraído do próprio site (fonte principal, atualizada sozinha).
// notas = base escrita à mão no painel, para complementar ou corrigir o site.
function montarSystem(conteudoSite, notas) {
  const temSite = !!String(conteudoSite || '').trim();
  const temNotas = !!String(notas || '').trim();
  return [
    'Você é o Ronaldo, atendente do LoggZap no WhatsApp. Você é HOMEM: fale de si',
    'sempre no masculino ("pronto", "obrigado", "eu mesmo"). O LoggZap é um produto para',
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
    '- Se perguntarem seu nome, diga que é o Ronaldo, do LoggZap.',
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
    '',
    'Responda ' + TRANSFERIR + ' SEMPRE, sem exceção, se o assunto for: nota fiscal,',
    'imposto, contabilidade, questão jurídica, contrato, dado de outro cliente,',
    'problema de pagamento já feito, pedido de desconto, parceria ou revenda.',
    'Nesses casos NÃO opine, NÃO explique e NÃO diga que o LoggZap não faz aquilo —',
    'apenas devolva ' + TRANSFERIR + '. Dar palpite fora do produto é o pior erro que',
    'você pode cometer aqui.',
    'Errar um preço custa mais caro do que demorar pra responder.',
    '',
    'LINKS — copie EXATAMENTE, nunca escreva de memória:',
    '- Site (é onde a pessoa começa o teste grátis): ' + LINK_SITE,
    '- Extensão do Chrome (só no computador): ' + LINK_EXTENSAO,
    '- Painel, para quem já tem conta: ' + LINK_PAINEL,
    'O domínio termina em .com.br — "loggzap.com" está ERRADO e leva a lugar nenhum.',
    'Não invente nem encurte endereço. Se o link que você precisa não está nesta lista,',
    'não mande link nenhum.',
    '',
    'NÚMEROS E COMPARAÇÕES:',
    '- Cite valor, prazo e limite exatamente como estão no material. Não arredonde.',
    '- Não invente comparação de preço ("sai mais barato", "compensa mais", "vale a',
    '  pena") a menos que esteja escrita no material. Um plano de valor maior NÃO é',
    '  mais barato — se for comparar, compare pelo que cada um inclui, não pelo preço.',
    '- Não prometa resultado ("vai vender mais", "recupera X%") fora do que está escrito.',
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
    const limpo = humanizar(txt);
    if (!limpo) return { transferir: true, motivo: 'Resposta vazia depois da limpeza' };
    return { texto: limpo };
  } catch (e) {
    console.error('[ia] erro de rede:', e.message);
    return { transferir: true, motivo: 'Erro de rede ao chamar a IA' };
  }
}

module.exports = { configurada, responder, model: MODEL, TRANSFERIR, humanizar };
