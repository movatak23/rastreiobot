// Coleta o conteúdo do próprio site pra alimentar a IA do atendimento.
// A ideia: a fonte de verdade é o site. Se o Ronaldo muda preço ou texto lá, a
// atendente aprende sozinha na próxima coleta — sem alguém lembrar de editar base.

const axios = require('axios');

// Páginas que descrevem o produto. A landing vem primeiro (é a mais importante).
const PAGINAS = [
  { url: 'https://www.loggzap.com.br/',                  titulo: 'SITE — PÁGINA PRINCIPAL' },
  { url: 'https://cliente.loggzap.com.br/termos',        titulo: 'TERMOS DE USO' },
  { url: 'https://cliente.loggzap.com.br/privacidade',   titulo: 'POLÍTICA DE PRIVACIDADE' },
  { url: 'https://cliente.loggzap.com.br/manual',        titulo: 'MANUAL DE INSTALAÇÃO' },
];

const LIMITE_POR_PAGINA = 9000;   // evita estourar o prompt (e o custo por mensagem)
const LIMITE_TOTAL      = 26000;

// Extrai o texto legível de um HTML. Sem dependência externa: o objetivo não é
// renderizar bonito, é dar à IA as frases que o visitante lê.
function textoDoHtml(html) {
  let s = String(html || '');
  // Fora tudo que não é conteúdo visível.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
       .replace(/<style[\s\S]*?<\/style>/gi, ' ')
       .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
       .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
       .replace(/<!--[\s\S]*?-->/g, ' ');
  // Quebra de linha onde havia bloco, pra não grudar frases de seções diferentes.
  s = s.replace(/<\/(p|div|section|h[1-6]|li|tr|td|br)>/gi, '\n')
       .replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  // Entidades mais comuns.
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
       .replace(/&hellip;/g, '…').replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’');
  // Limpa espaços e linhas vazias em excesso.
  s = s.split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim())
       .filter(Boolean)
       .filter((l, i, a) => l !== a[i - 1])   // tira linha repetida em sequência
       .join('\n');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

// Baixa as páginas e devolve { texto, paginas:[{url,ok,chars}], erro }.
// Nunca lança: se o site estiver fora do ar, o chamador mantém o conteúdo anterior.
async function coletar() {
  const paginas = [];
  const partes = [];
  for (const p of PAGINAS) {
    try {
      const r = await axios.get(p.url, {
        timeout: 15000,
        headers: { 'User-Agent': 'LoggZap-Atendimento/1.0 (coleta interna de conteúdo)' },
      });
      const txt = textoDoHtml(r.data).slice(0, LIMITE_POR_PAGINA);
      if (txt) {
        partes.push('===== ' + p.titulo + ' =====\n' + txt);
        paginas.push({ url: p.url, ok: true, chars: txt.length });
      } else {
        paginas.push({ url: p.url, ok: false, chars: 0, erro: 'sem texto' });
      }
    } catch (e) {
      paginas.push({ url: p.url, ok: false, chars: 0, erro: e.message });
    }
  }
  const texto = partes.join('\n\n').slice(0, LIMITE_TOTAL);
  return { texto, paginas, ok: partes.length > 0 };
}

module.exports = { coletar, textoDoHtml, PAGINAS };
