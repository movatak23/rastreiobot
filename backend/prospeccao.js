// prospeccao.js — motor de busca de lojas Nuvemshop para o painel admin do LoggZap.
// Descobre lojas (Google Custom Search + DuckDuckGo), confirma pela impressão digital,
// extrai contato (email/WhatsApp/Instagram) e classifica por nicho. Roda em background.
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const BASES = ['lojavirtualnuvem.com.br', 'mitiendanube.com'];
const FINGERPRINT = /mitiendanube|tiendanube|lojavirtualnuvem|nuvemshop|nuvempago/i;
const IG = /instagram\.com\/([A-Za-z0-9_.]{2,40})/i;
const IG_IGNORE = new Set(['nuvemshop', 'tiendanube', 'p', 'explore', 'accounts', 'reel', 'reels', 'stories', 'tv']);
const WA = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|[?&]phone=)(\+?\d{10,15})/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:com|com\.br|net|net\.br|org|org\.br|io|store)\b/i;
const EMAIL_JUNK = /@2x|@3x|sentry|wixpress|example|exemplo|seunome|seuemail|teste@|email@email|@email\.com|@dominio|@seudominio|nuvemshop|tiendanube|\.png|\.jpg/i;

const NICHOS = [
  ['moda feminina', ['moda feminina', 'vestido', 'blusa', 'cropped', 'saia', 'conjunto feminino']],
  ['moda masculina', ['moda masculina', 'camisa masculina', 'bermuda', 'streetwear']],
  ['moda íntima', ['lingerie', 'moda intima', 'moda íntima', 'sutia', 'sutiã', 'calcinha', 'pijama']],
  ['moda fitness', ['fitness', 'legging', 'top esportivo', 'moda fitness']],
  ['calçados', ['calçado', 'calcado', 'tênis', 'tenis', 'sapato', 'sandália', 'sandalia', 'chinelo', 'bota']],
  ['infantil e bebê', ['infantil', 'bebê', 'bebe', 'kids', 'enxoval', 'maternidade', 'criança']],
  ['cosméticos e beleza', ['cosmético', 'cosmetico', 'maquiagem', 'beleza', 'skincare', 'perfume', 'cabelo', 'makeup']],
  ['suplementos', ['suplemento', 'whey', 'creatina', 'nutrição', 'nutricao', 'vitamina']],
  ['pet', ['petshop', 'ração', 'racao', 'cachorro', 'gato', 'aquário', 'aquario', 'pet ']],
  ['joias e acessórios', ['joia', 'jóia', 'semijoia', 'semijóia', 'bijuteria', 'acessório', 'acessorio', 'relógio', 'relogio', 'óculos', 'oculos']],
  ['eletrônicos', ['eletrônico', 'eletronico', 'celular', 'smartphone', 'gadget', 'fone', 'informática', 'informatica']],
  ['casa e decoração', ['decoração', 'decoracao', 'utilidades', 'cozinha', 'móveis', 'moveis', 'cama mesa']],
  ['papelaria e artesanato', ['papelaria', 'artesanato', 'scrapbook', 'personalizado', 'festa', 'convite', 'ateliê', 'atelie']],
  ['esportes', ['esporte', 'futebol', 'camisa de time', 'surf', 'skate', 'ciclismo', 'pesca']],
  ['automotivo', ['automotivo', 'som automotivo', 'acessório automotivo', 'peças', 'pecas']],
  ['sex shop', ['sex shop', 'sexshop', 'erótic', 'erotic', 'sensual']],
  ['alimentos e gourmet', ['gourmet', 'café', 'chocolate', 'tempero', 'vinho', 'cerveja artesanal', 'doces']],
  ['saúde e bem-estar', ['saúde', 'saude', 'bem-estar', 'ortopédic', 'ortopedic', 'massagem']],
  ['religioso', ['gospel', 'católic', 'catolic', 'evangélic', 'evangelic', 'religios', 'espírita', 'espirita']],
  ['tabacaria', ['tabacaria', 'narguile', 'narguilé', 'seda', 'headshop']],
];

function classificarNicho(name, html) {
  const hay = (name + ' ' + html.slice(0, 120000)).toLowerCase();
  let melhor = 'outros', score = 0;
  for (const [nicho, kws] of NICHOS) {
    let s = 0; for (const k of kws) if (hay.includes(k)) s++;
    if (s > score) { score = s; melhor = nicho; }
  }
  return melhor;
}

function limparDominio(u) {
  if (!u) return null;
  u = String(u).trim().replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].toLowerCase();
  return u || null;
}

async function fetchHtml(url) {
  const r = await axios.get(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
    timeout: 15000, maxRedirects: 3, maxContentLength: 2_500_000, responseType: 'text',
    validateStatus: s => s >= 200 && s < 400,
    transformResponse: x => x,
  });
  return { html: typeof r.data === 'string' ? r.data : String(r.data || ''), finalUrl: (r.request?.res?.responseUrl) || url };
}

// Visita a loja, confirma Nuvemshop e extrai tudo. Retorna null se não for Nuvemshop.
async function enrich(domain) {
  for (const scheme of ['https://', 'http://']) {
    try {
      const { html, finalUrl } = await fetchHtml(scheme + domain);
      if (!FINGERPRINT.test(html)) return null;
      let name = '';
      const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
      const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      name = ((og && og[1]) || (t && t[1]) || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      let ig = '';
      const igAll = html.match(new RegExp(IG.source, 'ig')) || [];
      for (const m of igAll) { const h = m.split('/').pop(); if (h && !IG_IGNORE.has(h.toLowerCase())) { ig = 'instagram.com/' + h; break; } }
      let wa = ''; const mw = html.match(WA); if (mw) wa = mw[1].replace(/\D/g, '');
      let email = ''; const me = html.match(new RegExp(EMAIL.source, 'ig')) || [];
      for (const e of me) { if (!EMAIL_JUNK.test(e)) { email = e; break; } }
      return { domain, final_url: finalUrl, store_name: name, niche: classificarNicho(name, html), instagram: ig, whatsapp: wa, email };
    } catch (_) { /* tenta http */ }
  }
  return null;
}

// ── Descoberta ──────────────────────────────────────────────────────────────
async function googleCSE(termo, paginas) {
  const key = process.env.GOOGLE_CSE_KEY, cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return [];
  const out = new Set();
  for (let p = 0; p < paginas; p++) {
    const start = 1 + p * 10;
    if (start > 91) break;
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&num=10&start=${start}&q=${encodeURIComponent(termo)}`;
      const r = await axios.get(url, { timeout: 15000 });
      const items = r.data.items || [];
      for (const it of items) { const d = limparDominio(it.link); if (d) out.add(d); }
      if (items.length < 10) break;
    } catch (e) { break; }
  }
  return [...out];
}

async function ddg(termo) {
  const out = new Set();
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(termo)}`;
    const { html } = await fetchHtml(url);
    for (const base of BASES) {
      const rx = new RegExp('([a-z0-9][a-z0-9-]{1,60}\\.' + base.replace(/\./g, '\\.') + ')', 'ig');
      let m; while ((m = rx.exec(html))) { let d = m[1].toLowerCase(); if (d.startsWith('2f')) d = d.slice(2); out.add(d); }
    }
  } catch (_) {}
  return [...out];
}

// ── Job em background (um por vez) ──────────────────────────────────────────
let job = { running: false, alvo: 0, checados: 0, salvos: 0, fonte: '', erro: '', inicio: 0, parar: false };

function status(db) {
  return {
    running: job.running, alvo: job.alvo, checados: job.checados,
    fonte: job.fonte, erro: job.erro, inicio: job.inicio,
    total: db.contarProspeccao(), comContato: db.comContatoProspeccao(),
    porNicho: db.contarProspeccaoPorNicho(),
    googleConfigurado: !!(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX),
  };
}

function stop() { job.parar = true; }

async function processarLote(dominios, db, concorrencia = 3) {
  const fila = dominios.slice();
  async function worker() {
    while (fila.length && !job.parar && db.contarProspeccao() < job.alvo) {
      const d = fila.shift();
      if (!d || db.jaProspeccaoDomain(d)) continue;
      job.checados++;
      try { const r = await enrich(d); if (r) { db.upsertProspeccaoLoja(r); job.salvos++; } } catch (_) {}
    }
  }
  await Promise.all(Array.from({ length: concorrencia }, worker));
}

// termosSemente: quando o usuário NÃO define nicho, varremos vários termos p/ diversificar.
function termosSemente(niche) {
  if (niche && niche.trim()) return [niche.trim()];
  return NICHOS.map(n => n[0]).concat(['loja', 'atacado', 'oficial']);
}

async function iniciar({ alvo, niche }, db) {
  if (job.running) return { ok: false, erro: 'Já existe uma busca rodando.' };
  alvo = Math.min(Math.max(Number(alvo) || 500, 10), 5000);
  job = { running: true, alvo, checados: 0, salvos: 0, fonte: '', erro: '', inicio: Date.now(), parar: false };
  const usarGoogle = !!(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX);
  job.fonte = usarGoogle ? 'Google CSE + DuckDuckGo' : 'DuckDuckGo (grátis, volume baixo — ligue o Google CSE)';

  (async () => {
    try {
      for (const termo of termosSemente(niche)) {
        if (job.parar || db.contarProspeccao() >= alvo) break;
        const candidatos = new Set();
        if (usarGoogle) {
          for (const base of BASES) (await googleCSE(`site:${base} ${termo}`.trim(), 10)).forEach(d => candidatos.add(d));
        }
        for (const base of BASES) (await ddg(`site:${base} ${termo}`.trim())).forEach(d => candidatos.add(d));
        const novos = [...candidatos].filter(d => d && !db.jaProspeccaoDomain(d));
        await processarLote(novos, db, 3);
      }
    } catch (e) { job.erro = e.message; }
    finally { job.running = false; }
  })();

  return { ok: true };
}

function toCSV(db) {
  const cols = ['niche', 'domain', 'store_name', 'email', 'whatsapp', 'instagram', 'final_url'];
  const esc = v => { v = (v == null ? '' : String(v)); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const linhas = [cols.join(',')];
  for (const r of db.listarProspeccao()) linhas.push(cols.map(c => esc(r[c])).join(','));
  return '﻿' + linhas.join('\r\n'); // BOM p/ Excel abrir acentos certo
}

module.exports = { iniciar, stop, status, toCSV, enrich, classificarNicho };
