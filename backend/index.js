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

db.migrar();

const app = express();
// Guarda o corpo cru (necessário p/ verificar assinatura HMAC de webhooks, ex.: Seu|Rastreio)
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(cors({ origin: '*' }));
// Contador de visitas da landing (página inicial) para o painel de gestão.
app.get('/', (req, res, next) => { try { db.registrarVisita(); } catch (e) {} next(); });
app.use(express.static(path.join(__dirname, 'public')));


// ── Logs operacionais seguros / LoggZap ──────────────────────────────────────
// Este bloco é aditivo: se algo falhar no log, a automação principal continua.
const LOGGZAP_LOG_DIR = path.join(__dirname, 'data');
const LOGGZAP_LOG_FILE = path.join(LOGGZAP_LOG_DIR, 'automacoes-loggzap.json');


function ensureLoggzapLogFile() {
  // Mantido por compatibilidade. A persistência Premium agora usa SQLite via db.js.
}

function readLoggzapLogs() {
  try {
    return db.listarLogsAutomacao ? db.listarLogsAutomacao(1200) : [];
  } catch(e) {
    console.error('[LoggZap Logs] Falha ao ler logs do banco:', e.message);
    return [];
  }
}

function writeLoggzapLogs(logs) {
  // Mantido por compatibilidade. Novos logs são gravados diretamente no banco.
}

function safeLogAutomacao(evento) {
  try {
    if (db.registrarLogAutomacao) db.registrarLogAutomacao(evento || {});
  } catch(e) {
    console.error('[LoggZap Logs] Falha ao registrar log:', e.message);
  }
}


function adminLoggzapHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Admin LoggZap</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap');
  *{box-sizing:border-box}body{margin:0;background:#07090e;color:#eef0f8;font-family:Arial,sans-serif}
  h1,h2,h3,h4,h5,h6{font-family:'Poppins',Arial,sans-serif}
  .wrap{max-width:1220px;margin:0 auto;padding:32px 22px}
  .top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px}
  .logo{font-size:24px;font-weight:800}.logo span{color:#00d084}
  .card{background:#0c0f16;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:20px;margin-bottom:16px}
  input,select{background:#11151e;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#eef0f8;padding:10px 12px;width:100%;font:inherit}
  button{border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer;background:#00d084;color:#000}
  .btn2{background:#1e2430;color:#eef0f8;border:1px solid rgba(255,255,255,.12)}
  .btnDanger{background:#3a1d24;color:#ff9ca7;border:1px solid rgba(255,100,120,.32)}
  table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid rgba(255,255,255,.08);padding:10px;text-align:left;font-size:12px;vertical-align:top}
  th{color:#8b93a8;text-transform:uppercase;font-size:10px}pre{white-space:pre-wrap;margin:0;color:#8b93a8;max-height:160px;overflow:auto}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{background:#11151e;border-radius:10px;padding:14px}
  .metric strong{display:block;font-size:24px}.metric span{color:#8b93a8;font-size:12px}
  .err{background:rgba(224,90,90,.12);border:1px solid rgba(224,90,90,.35);color:#ff8f8f;border-radius:8px;padding:12px;margin:12px 0;display:none}
  .ok{background:rgba(0,208,132,.12);border:1px solid rgba(0,208,132,.35);color:#00d084;border-radius:8px;padding:12px;margin:12px 0;display:none}
  .hidden{display:none}.badge{display:inline-block;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:800}.bOk{background:rgba(0,208,132,.14);color:#00d084}.bWarn{background:rgba(232,160,48,.14);color:#f6c167}.bErr{background:rgba(224,90,90,.14);color:#ff8f8f}
  .actions{display:flex;gap:6px;flex-wrap:wrap}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.muted{color:#8b93a8;font-size:12px;line-height:1.5}
  @media(max-width:900px){.grid,.two{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top"><div class="logo">Admin <span>LoggZap</span></div><div class="actions"><button class="btn2" onclick="carregar()">Atualizar</button><button id="adminLogout" class="btn2 hidden" onclick="sairAdmin()">Sair</button></div></div>

  <div id="auth" class="card">
    <h2>Acesso interno</h2>
    <p class="muted">Use a mesma chave interna do backend para visualizar clientes, logs e status operacional.</p>
    <input id="secret" type="password" placeholder="EXTENSION_SECRET">
    <div class="err" id="err"></div>
    <br><br><button onclick="entrar()">Entrar</button>
  </div>

  <div id="painel" class="hidden">
    <div class="grid">
      <div class="metric"><strong id="mClientes">--</strong><span>Z-APIs online</span></div>
      <div class="metric"><strong id="mPagos">--</strong><span>pagantes ativos</span></div>
      <div class="metric"><strong id="mVencidos">--</strong><span>mensalidades vencidas</span></div>
      <div class="metric"><strong id="mFree">--</strong><span>contas free</span></div>
      <div class="metric"><strong id="mErros">--</strong><span>clientes com erro</span></div>
      <div class="metric"><strong id="mRastreiosMes">--</strong><span>rastreios no mês (Seu Rastreio)</span></div>
    </div>

    <div class="card">
      <h2>Clientes / lojas</h2>
      <input id="filtroCliente" placeholder="Filtrar por loja, cliente, plano ou erro" oninput="renderClientes()">
      <div style="overflow:auto">
        <table><thead><tr><th>Loja</th><th>Plano</th><th>Status</th><th>Rastreios/mês</th><th>Z-API</th><th>Painel</th><th>Templates</th><th>Última automação</th><th>Erro</th><th>Ações</th></tr></thead><tbody id="clientesBody"></tbody></table>
      </div>
    </div>

    <div class="card">
      <h2>Logs</h2>
      <button class="btn2" onclick="openLogs()">📋 Ver últimos logs</button>
    </div>

    <div id="logsModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:1000;padding:20px" onclick="if(event.target===this)closeLogs()">
      <div style="background:#0c0f16;border:1px solid rgba(255,255,255,.1);border-radius:14px;max-width:1000px;margin:20px auto;max-height:86vh;display:flex;flex-direction:column;padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h2 style="margin:0">Últimos logs</h2><button class="btn2" onclick="closeLogs()">✕ Fechar</button></div>
        <input id="filtroLog" placeholder="Filtrar por loja, pedido, telefone ou tipo" oninput="renderLogs()" style="margin-bottom:12px">
        <div style="overflow:auto;flex:1;min-height:0">
          <table><thead><tr><th>Data</th><th>Loja</th><th>Tipo</th><th>Pedido</th><th>Telefone</th><th>Mensagem / erro</th></tr></thead><tbody id="logsBody"></tbody></table>
        </div>
      </div>
    </div>


    <div class="card">
      <h2>Inteligência de mercado</h2>
      <p class="muted">Analise as lojas que acessam o LoggZap Free/Premium para identificar nichos com maior adesão, maior volume de pedidos e maior faturamento estimado. Os dados vêm da API da Nuvemshop e são usados apenas no painel interno.</p>
      <div class="actions">
        <button onclick="carregarInsights()">Atualizar insights de mercado</button>
        <button class="btn2" onclick="exportarInsights()">Exportar CSV</button>
      </div>
      <div class="err" id="insightsErr"></div><div class="ok" id="insightsOk"></div>

      <div class="grid" style="margin-top:12px">
        <div class="metric"><strong id="iLojas">--</strong><span>lojas analisadas</span></div>
        <div class="metric"><strong id="iNichos">--</strong><span>nichos identificados</span></div>
        <div class="metric"><strong id="iPedidos">--</strong><span>pedidos na amostra</span></div>
        <div class="metric"><strong id="iFaturamento">--</strong><span>faturamento estimado</span></div>
      </div>

      <h3>Nichos com maior potencial</h3>
      <div style="overflow:auto">
        <table><thead><tr><th>Nicho</th><th>Lojas</th><th>Pedidos</th><th>Faturamento estimado</th><th>Ticket médio</th><th>Prioridade</th></tr></thead><tbody id="nichosBody"></tbody></table>
      </div>

      <h3>Lojas analisadas</h3>
      <input id="filtroInsight" placeholder="Filtrar por loja, nicho, domínio ou Store ID" oninput="renderInsights()">
      <div style="overflow:auto">
        <table><thead><tr><th>Loja</th><th>Nicho</th><th>Domínio</th><th>Pedidos</th><th>Faturamento estimado</th><th>Ticket médio</th><th>Ações</th></tr></thead><tbody id="lojasInsightsBody"></tbody></table>
      </div>
    </div>

    <div class="card">
      <h2>Ações de suporte</h2>
      <div class="two">
        <div>
          <label>Store ID</label><input id="acaoStore" value="4757590" placeholder="Store ID">
          <label>Telefone para teste</label><input id="acaoTelefone" value="5581976041948" placeholder="5581999999999">
          <label>Tipo de teste</label>
          <select id="acaoTipo">
            <option value="pagamento_confirmado">Pagamento confirmado</option>
            <option value="pedido_postado">Código de rastreio</option>
            <option value="rastreio_atualizado">Movimentação de entrega</option>
            <option value="boleto_pix_pendente">Pix/boleto pendente</option>
            <option value="pesquisa_satisfacao">Pesquisa de satisfação</option>
          </select>
          <br><br>
          <button onclick="testarWhatsApp()">Enviar teste real</button>
          <button class="btn2" onclick="statusZapi()">Consultar Z-API</button>
          <br><br><button onclick="simularApresentacao()" style="background:#4f8ef7;color:#fff">🎬 Simular apresentação — envia TODAS as automações</button>
          <br><br><button onclick="verificarRastreiosAgora()" style="background:#00b37e;color:#fff">📦 Verificar rastreios agora (varredura real Seu|Rastreio)</button>
        </div>
        <div>
          <label>Resetar login do cliente</label><input id="resetLogin" placeholder="Novo login">
          <label>Nova senha</label><input id="resetSenha" type="password" placeholder="Nova senha">
          <br><br><button class="btn2" onclick="resetarSenha()">Resetar senha do painel</button>
          <hr style="border-color:rgba(255,255,255,.08);margin:18px 0">
          <label>Chave para desvincular dispositivo</label><input id="chaveDesvincular" placeholder="LZP-XXXX-XXXX-XXXX">
          <br><br><button class="btnDanger" onclick="desvincular()">Desvincular dispositivo</button>
        </div>
      </div>
      <div class="err" id="acaoErr"></div><div class="ok" id="acaoOk"></div>
    </div>
  </div>
</div>

<script>
const ADMIN_SECRET_KEY = 'lz_admin_loggzap_secret';
let secret = localStorage.getItem(ADMIN_SECRET_KEY) || '', clientes=[], logs=[];
function esc(v){return String(v??'').replace(/[<>&]/g,s=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]));}
function show(id,msg){const el=document.getElementById(id);el.innerHTML=msg;el.style.display='block';}
function hide(id){document.getElementById(id).style.display='none';}
async function api(path, opts={}){
  const r=await fetch(path,{...opts,headers:{'Content-Type':'application/json','x-secret':secret,...(opts.headers||{})}});
  const raw = await r.text();
  let d = {};
  try { d = raw ? JSON.parse(raw) : {}; } catch(e) { d = { error: raw || ('HTTP ' + r.status) }; }
  if(!r.ok||d.error) throw new Error(d.error||('Erro na solicitação. HTTP '+r.status));
  return d;
}
async function entrar(){
  secret=document.getElementById('secret').value.trim();
  if(!secret)return show('err','Informe a chave.');
  localStorage.setItem(ADMIN_SECRET_KEY, secret);
  await carregar(true);
}
function sairAdmin(){
  localStorage.removeItem(ADMIN_SECRET_KEY);
  secret='';
  location.reload();
}
async function carregar(first=false){
  try{
    if(!secret){
      secret = localStorage.getItem(ADMIN_SECRET_KEY) || '';
      if(!secret) throw new Error('Informe a chave interna para acessar o painel.');
    }
    const d=await api('/admin-loggzap/api/resumo');
    clientes=d.clientes||[]; logs=d.logs||[];
    const rm=document.getElementById('mRastreiosMes'); if(rm) rm.textContent=((d.resumo_contas||{}).rastreios_mes_total||0);
    localStorage.setItem(ADMIN_SECRET_KEY, secret);
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('painel').classList.remove('hidden');
    document.getElementById('adminLogout')?.classList.remove('hidden');
    renderClientes(); renderLogs();
  }catch(e){
    if(String(e.message||'').toLowerCase().includes('não autorizado')){
      localStorage.removeItem(ADMIN_SECRET_KEY);
      secret='';
      document.getElementById('auth').classList.remove('hidden');
      document.getElementById('painel').classList.add('hidden');
      document.getElementById('adminLogout')?.classList.add('hidden');
    }
    show(first?'err':'acaoErr',e.message);
  }
}
function badge(ok,label){return '<span class="badge '+(ok?'bOk':'bErr')+'">'+label+'</span>';}
function badgeWarn(label){return '<span class="badge bWarn">'+label+'</span>';}
function badgeZapi(c){
  if(c.zapi_conectada === true) return '<span class="badge bOk" title="Z-API conectada e confirmada em tempo real">Z-API online</span>';
  if(c.zapi_estado === 'not_configured' || c.zapi_configurada === false) return '<span class="badge bErr" title="Não há credenciais de Z-API para esta loja">sem Z-API</span>';
  if(c.zapi_estado === 'check_failed') return '<span class="badge bWarn" title="Não foi possível confirmar o status agora">falha consulta</span>';
  return '<span class="badge bErr" title="Z-API configurada, mas não confirmou conexão ativa">Z-API offline</span>';
}
function renderClientes(){
  const f=(document.getElementById('filtroCliente').value||'').toLowerCase();
  const rows=clientes.filter(c=>JSON.stringify(c).toLowerCase().includes(f));
  document.getElementById('mClientes').textContent=clientes.filter(c=>c.zapi_conectada===true).length;
  document.getElementById('mPagos').textContent=clientes.filter(c=>c.status_conta==='ativo').length;
  document.getElementById('mVencidos').textContent=clientes.filter(c=>c.status_conta==='vencido').length;
  document.getElementById('mFree').textContent=clientes.filter(c=>c.status_conta==='free').length;
  document.getElementById('mErros').textContent=clientes.filter(c=>c.ultimo_erro || (c.zapi_configurada && c.zapi_conectada===false)).length;
  document.getElementById('clientesBody').innerHTML=rows.map(c=>{
    const plano=c.plano?c.plano:'trial/free';
    const sc=c.status_conta==='vencido'?'<span class="badge bErr">vencido</span>':c.status_conta==='ativo'?'<span class="badge bOk">ativo</span>':'<span class="badge bWarn">free</span>';
    return '<tr>'+
      '<td><strong>'+esc(c.nome_cliente||c.store_id)+'</strong><br><span class="muted">'+esc(c.store_id)+'</span></td>'+
      '<td>'+esc(plano)+'<br><span class="muted">'+esc(c.expira_em||'')+'</span></td>'+
      '<td>'+sc+(c.assinatura_status?'<br><span class="muted">'+esc(c.assinatura_status)+'</span>':'')+'</td>'+
      '<td>'+(c.rastreios_usados||0)+' / '+(c.rastreios_limite||0)+'</td>'+
      '<td>'+badgeZapi(c)+(c.zapi_erro_status?'<br><span class="muted">'+esc(c.zapi_erro_status)+'</span>':'')+'</td>'+
      '<td>'+badge(c.painel_configurado,'Painel')+'</td>'+
      '<td>'+badge(c.templates_ok,(c.templates_configurados||0)+'/8')+'</td>'+
      '<td>'+esc(c.ultimo_tipo||'—')+'<br><span class="muted">'+esc(c.ultimo_log_em||'')+'</span></td>'+
      '<td>'+(c.ultimo_erro?'<span class="badge bErr">erro</span><br><span class="muted">'+esc(c.ultimo_erro)+'</span>':'<span class="badge bOk">sem erro</span>')+'</td>'+
      '<td><div class="actions"><button class="btn2" onclick="setStore(\\''+esc(c.store_id)+'\\')">Selecionar</button><button class="btn2" onclick="abrirWhats(\\''+esc(c.store_id)+'\\')">Suporte</button></div></td>'+
    '</tr>';
  }).join('');
}
function renderLogs(){
  const f=(document.getElementById('filtroLog').value||'').toLowerCase();
  const rows=logs.filter(l=>JSON.stringify(l).toLowerCase().includes(f)).slice().reverse().slice(0,250);
  document.getElementById('logsBody').innerHTML=rows.map(l=>'<tr>'+
    '<td>'+new Date(l.created_at).toLocaleString('pt-BR')+'</td>'+
    '<td>'+esc(l.store_id||'')+'</td>'+
    '<td>'+esc(l.tipo||'')+'</td>'+
    '<td>'+esc(l.pedido||'')+'</td>'+
    '<td>'+esc(l.telefone||'')+'</td>'+
    '<td><pre>'+(l.erro?('ERRO: '+esc(l.erro)):esc(l.mensagem||''))+'</pre></td>'+
  '</tr>').join('');
}
function openLogs(){document.getElementById('logsModal').style.display='block';renderLogs();}
function closeLogs(){document.getElementById('logsModal').style.display='none';}
function setStore(store){document.getElementById('acaoStore').value=store;}
function abrirWhats(store){window.open('https://wa.me/5581976041948?text='+encodeURIComponent('Preciso verificar o suporte da loja '+store),'_blank');}
async function testarWhatsApp(){
  hide('acaoErr');hide('acaoOk');
  try{const d=await api('/admin-loggzap/api/teste-whatsapp',{method:'POST',body:JSON.stringify({store_id:acaoStore.value,telefone:acaoTelefone.value,tipo:acaoTipo.value})});show('acaoOk','✅ Teste enviado.'); await carregar();}catch(e){show('acaoErr',e.message);}
}
async function simularApresentacao(){
  hide('acaoErr');hide('acaoOk');
  if(!acaoStore.value){show('acaoErr','Informe o Store ID.');return;}
  if(!acaoTelefone.value){show('acaoErr','Informe o telefone (com DDI, ex.: 5581999998888).');return;}
  if(!confirm('Enviar TODAS as mensagens das automações para '+acaoTelefone.value+'? (uma a cada ~2s)')) return;
  show('acaoOk','⏳ Enviando as mensagens em sequência... (leva ~15s, aguarde no celular)');
  try{
    const d=await api('/admin-loggzap/api/simular-automacoes',{method:'POST',body:JSON.stringify({store_id:acaoStore.value,telefone:acaoTelefone.value})});
    show('acaoOk','✅ Simulação enviada: '+d.total+'/'+d.de+' mensagens → '+(d.enviados||[]).join(', '));
    await carregar();
  }catch(e){show('acaoErr',e.message);}
}
async function verificarRastreiosAgora(){
  hide('acaoErr');hide('acaoOk');
  if(!acaoStore.value){show('acaoErr','Informe o Store ID.');return;}
  show('acaoOk','⏳ Rodando a varredura real de rastreios... (registra no Seu|Rastreio e dispara a notificação do status atual)');
  try{
    const d=await api('/admin-loggzap/api/verificar-rastreios-agora',{method:'POST',body:JSON.stringify({store_id:acaoStore.value})});
    show('acaoOk','✅ '+(d.msg||'Varredura executada.'));
    await carregar();
  }catch(e){show('acaoErr',e.message);}
}
function resumoStatusZapi(status){
  const s = status || {};
  const conectado = s.conectado === true || s.connected === true || s.estado === 'connected';
  const smartphone = s.smartphoneConnected === true || (s.data && s.data.smartphoneConnected === true);
  const erro = s.erro || s.error || (s.data && (s.data.error || s.data.message || s.data.description)) || '';

  if (conectado) {
    return {
      ok: true,
      html: '✅ <strong>Z-API conectada</strong><br>' +
        'A instância está online e o WhatsApp está pronto para receber os disparos da LoggZap.' +
        (smartphone ? '<br><span class="muted">Celular/WhatsApp vinculado confirmado.</span>' : '<br><span class="muted">Status do celular não informado pela Z-API.</span>')
    };
  }

  if (erro && String(erro).toLowerCase().includes('não configurada')) {
    return {
      ok: false,
      html: '❌ <strong>Z-API não configurada para esta loja</strong><br>' +
        'Confira se o Store ID está correto e se a loja possui Instance ID, Token e Client Token cadastrados.'
    };
  }

  if (erro && String(erro).toLowerCase().includes('function')) {
    return {
      ok: false,
      html: '❌ <strong>Consulta de status indisponível</strong><br>' +
        'O backend não encontrou a função responsável por consultar o status da Z-API.'
    };
  }

  return {
    ok: false,
    html: '⚠️ <strong>Z-API desconectada ou com falha</strong><br>' +
      'A instância não está confirmando conexão ativa. Verifique o painel da Z-API, leia o QR Code novamente se necessário e confirme se os tokens estão corretos.' +
      (erro ? '<br><span class="muted">Detalhe técnico: '+esc(erro)+'</span>' : '')
  };
}
async function statusZapi(){
  hide('acaoErr');hide('acaoOk');
  try{
    const d=await api('/admin-loggzap/api/zapi-status/'+encodeURIComponent(acaoStore.value));
    const r=resumoStatusZapi(d.status);
    const detalhes = '<details style="margin-top:8px"><summary>Ver retorno técnico</summary><pre>'+esc(JSON.stringify(d.status||{},null,2))+'</pre></details>';
    show(r.ok?'acaoOk':'acaoErr', r.html + detalhes);
  }catch(e){
    show('acaoErr','❌ <strong>Falha ao consultar a Z-API</strong><br>'+esc(e.message));
  }
}
async function resetarSenha(){
  hide('acaoErr');hide('acaoOk');
  try{await api('/admin-loggzap/api/reset-senha',{method:'POST',body:JSON.stringify({store_id:acaoStore.value,login:resetLogin.value,senha:resetSenha.value})});show('acaoOk','✅ Senha/login atualizados.'); await carregar();}catch(e){show('acaoErr',e.message);}
}
async function desvincular(){
  hide('acaoErr');hide('acaoOk');
  if(!confirm('Tem certeza que deseja desvincular o dispositivo desta chave?'))return;
  try{await api('/admin-loggzap/api/desvincular-dispositivo',{method:'POST',body:JSON.stringify({chave:chaveDesvincular.value})});show('acaoOk','✅ Dispositivo desvinculado.');}catch(e){show('acaoErr',e.message);}
}

// Mantém o acesso interno após F5. Se a chave estiver salva e válida,
// o painel abre direto; se estiver inválida, volta para a tela de login.
if(secret){
  const inputSecret = document.getElementById('secret');
  if(inputSecret) inputSecret.value = secret;
  carregar(true);
}
</script>
</body>
</html>`;
}

app.get('/admin-loggzap', (req, res) => {
  res.send(adminLoggzapHtml());
});

// ── Painel de GESTÃO / funil (visitas → instalações → pagantes) ──
app.get('/admin-loggzap/gestao', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gestao.html')));
app.get('/admin-loggzap/api/gestao', auth, (req, res) => {
  try { res.json({ success: true, ...db.getGestaoStats() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Lista detalhada das lojas: nome, email, whatsapp (da Nuvemshop) + versão/plano.
function rotuloPlanoLoja(sp) {
  if (sp.pago) return sp.plano === 'premium' ? 'Pro' : 'Essencial';
  if (sp.emTrial) return 'Trial';
  return 'Free';
}
app.get('/admin-loggzap/api/lojas', auth, async (req, res) => {
  try {
    const stores = db.getAllStores();
    const lojas = await Promise.all(stores.map(async (s) => {
      const sid = String(s.store_id);
      let nome = '', email = '', whatsapp = '';
      try {
        const st = await nuvemGet(sid, '/store');
        nome = (st && st.name && (typeof st.name === 'object' ? Object.values(st.name)[0] : st.name)) || (st && st.business_name) || '';
        email = (st && (st.email || st.contact_email)) || '';
        whatsapp = (st && (st.whatsapp_phone_number || st.phone)) || '';
      } catch (e) { /* loja sem acesso/token → deixa em branco */ }
      const tok = db.getToken(sid);
      let plano = 'Free';
      try { plano = rotuloPlanoLoja(statusPlanoLoja(sid)); } catch (e) {}
      return { store_id: sid, nome, email, whatsapp, plano, instalado_em: tok?.created_at || null };
    }));
    // Ordena por data de instalação (mais recente primeiro).
    lojas.sort((a, b) => String(b.instalado_em || '').localeCompare(String(a.instalado_em || '')));
    res.json({ success: true, total: lojas.length, lojas });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/admin-loggzap/api/logs', auth, (req, res) => {
  const logs = readLoggzapLogs();
  res.json({ success: true, total: logs.length, logs });
});


// ── Admin LoggZap Nota 9 — resumo operacional ────────────────────────────────

// ── Admin LoggZap — teste real de WhatsApp ───────────────────────────────────
app.post('/admin-loggzap/api/teste-whatsapp', auth, async (req, res) => {
  const { store_id, telefone, tipo } = req.body || {};

  if (!store_id) return res.status(400).json({ error: 'Informe o Store ID.' });
  if (!telefone) return res.status(400).json({ error: 'Informe o telefone para teste.' });

  const telefoneLimpo = String(telefone).replace(/\D/g, '');
  if (telefoneLimpo.length < 12) {
    return res.status(400).json({ error: 'Telefone inválido. Use o formato com DDI, por exemplo: 5581976041948.' });
  }

  try {
    const status = await getZapiStatusForStoreSafe(String(store_id));
    if (!status.conectado) {
      return res.status(400).json({
        error: 'Z-API não conectada ou não configurada para esta loja.',
        status
      });
    }

    const mensagem = renderTemplateTesteAdmin(String(store_id), tipo || 'pagamento_confirmado');
    const result = await sendWhatsApp(telefoneLimpo, mensagem, String(store_id));

    if (typeof safeLogAutomacao === 'function') {
      safeLogAutomacao({
        store_id: String(store_id),
        tipo: 'teste_real_' + (tipo || 'pagamento_confirmado'),
        telefone: telefoneLimpo,
        mensagem
      });
    }

    return res.json({ success: true, result });
  } catch(e) {
    if (typeof safeLogAutomacao === 'function') {
      safeLogAutomacao({
        store_id: String(store_id),
        tipo: 'teste_real_' + (tipo || 'pagamento_confirmado'),
        telefone: telefoneLimpo,
        erro: e.response?.data?.message || e.message
      });
    }

    return res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});


// Simulação de apresentação: dispara TODAS as mensagens das automações pro celular informado
app.post('/admin-loggzap/api/simular-automacoes', auth, async (req, res) => {
  const { store_id, telefone } = req.body || {};
  if (!store_id) return res.status(400).json({ error: 'Informe o Store ID.' });
  if (!telefone) return res.status(400).json({ error: 'Informe o telefone para a simulação.' });
  const telLimpo = String(telefone).replace(/\D/g, '');
  if (telLimpo.length < 12) return res.status(400).json({ error: 'Telefone inválido. Use o formato com DDI, ex.: 5581999998888.' });
  try {
    const status = await getZapiStatusForStoreSafe(String(store_id));
    if (!status.conectado) return res.status(400).json({ error: 'WhatsApp não conectado para esta loja.', status });

    const tipos = Object.keys(DEFAULT_AUTOMATION_TEMPLATES); // funil completo, em ordem
    const enviados = [];
    for (const tipo of tipos) {
      try {
        const mensagem = renderTemplateTesteAdmin(String(store_id), tipo);
        await sendWhatsApp(telLimpo, mensagem, String(store_id));
        enviados.push(tipo);
        if (typeof safeLogAutomacao === 'function') safeLogAutomacao({ store_id: String(store_id), tipo: 'simulacao_' + tipo, telefone: telLimpo, mensagem });
        await new Promise(r => setTimeout(r, 2000)); // intervalo de 2s entre as mensagens
      } catch(e) { console.error('[Simulação]', tipo, e.message); }
    }
    res.json({ success: true, enviados, total: enviados.length, de: tipos.length });
  } catch(e) {
    console.error('[Simulação automações]', e.message);
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

// Dispara a varredura REAL de rastreios na hora (registra no Seu|Rastreio + notifica o status atual).
app.post('/admin-loggzap/api/verificar-rastreios-agora', auth, (req, res) => {
  const { store_id } = req.body || {};
  if (!store_id) return res.status(400).json({ error: 'Informe o Store ID.' });
  // Responde NA HORA (a varredura pode levar minutos pelo espaçamento do Seu|Rastreio) e roda em segundo plano,
  // senão o Cloudflare corta em 100s (erro 524). A notificação sai sozinha quando a varredura chega no pedido.
  res.json({ success: true, msg: 'Varredura iniciada em segundo plano. Se houver pedido pago com código Correios (AA000000000BR) ainda não notificado, a mensagem sai em instantes no WhatsApp do cliente.' });
  verificarRastreios(String(store_id)).catch(e => console.error('[Verificar rastreios agora]', e.message));
});

app.get('/admin-loggzap/api/resumo', auth, async (req, res) => {
  try {
    let clientes = [];

    if (db.listarClientesOperacionais) {
      clientes = db.listarClientesOperacionais();
    } else {
      // Fallback seguro caso o db.js novo ainda não tenha sido publicado.
      const stores = db.getAllStores ? db.getAllStores() : [];
      const instancias = db.listarInstancias ? db.listarInstancias() : [];

      clientes = stores.map(s => {
        const storeId = String(s.store_id);
        const inst = instancias.find(i => String(i.store_id) === storeId) || {};
        const lic = db.getLicencaPorStore ? db.getLicencaPorStore(storeId) : null;

        return {
          store_id: storeId,
          nome_cliente: inst.nome_cliente || null,
          zapi_instance: inst.zapi_instance || null,
          plano: lic?.plano || null,
          chave: lic?.chave || null,
          expira_em: lic?.expira_em || null,
          templates_configurados: 0,
          total_logs: 0,
          logs_hoje: 0,
          ultimo_log_em: null,
          ultimo_tipo: null,
          ultimo_erro: null,
          premium_pronto: false,
          zapi_configurada: !!inst.zapi_instance,
          painel_configurado: false,
          licenca_ativa: !!lic,
          templates_ok: false
        };
      });
    }

    // Enriquece a lista com o status REAL da Z-API.
    // Antes o painel usava apenas "zapi_configurada", que só indica se existe credencial salva
    // e podia mostrar offline mesmo com a instância conectada via fallback/env.
    if (typeof getZapiStatusForStore === 'function') {
      clientes = await Promise.all((clientes || []).map(async (cliente) => {
        // Status verdadeiro por loja: se não existe instância gravada para o store_id,
        // não consulta a Z-API global e não marca como online.
        if (!cliente.zapi_instance) {
          return {
            ...cliente,
            zapi_configurada: false,
            zapi_conectada: false,
            zapi_estado: 'not_configured',
            zapi_erro_status: null,
            zapi_smartphone_connected: false,
            zapi_status_checked_at: new Date().toISOString()
          };
        }

        try {
          const status = await getZapiStatusForStore(String(cliente.store_id), { allowEnvFallback: false });
          const conectado = status?.conectado === true || status?.connected === true || status?.estado === 'connected';
          const naoConfigurada = status?.estado === 'not_configured' || String(status?.erro || '').toLowerCase().includes('não configurada');
          return {
            ...cliente,
            zapi_configurada: !naoConfigurada,
            zapi_conectada: conectado,
            zapi_estado: conectado ? 'connected' : (naoConfigurada ? 'not_configured' : (status?.estado || 'disconnected')),
            zapi_erro_status: conectado ? null : (status?.erro || status?.error || null),
            zapi_smartphone_connected: status?.smartphoneConnected === true || status?.data?.smartphoneConnected === true,
            zapi_status_checked_at: new Date().toISOString()
          };
        } catch (e) {
          return {
            ...cliente,
            zapi_conectada: false,
            zapi_estado: 'check_failed',
            zapi_erro_status: e.message || 'Falha ao consultar status da Z-API.',
            zapi_status_checked_at: new Date().toISOString()
          };
        }
      }));
    }

    // Enriquece com uso de rastreios, status da conta (free/ativo/vencido) e status da assinatura.
    const agora = new Date();
    clientes = clientes.map(c => {
      const sid = String(c.store_id);
      let usados = 0, limite = 50;
      try { usados = db.contarUsoRastreio ? db.contarUsoRastreio(sid) : 0; } catch(_) {}
      try { limite = getLimiteRastreio(sid); } catch(_) {}
      const assinatura = db.getAssinatura ? db.getAssinatura(sid) : null;
      const pago = !!c.plano && ['basic','premium','enterprise'].includes(String(c.plano).toLowerCase());
      const vencido = pago && c.expira_em && new Date(c.expira_em) < agora;
      const status_conta = !pago ? 'free' : (vencido ? 'vencido' : 'ativo');
      return { ...c, rastreios_usados: usados, rastreios_limite: limite,
        rastreios_pct: limite ? Math.min(100, Math.round(usados / limite * 100)) : 0,
        status_conta, assinatura_status: assinatura?.status || null };
    });

    const resumo_contas = {
      total: clientes.length,
      free: clientes.filter(c => c.status_conta === 'free').length,
      ativos: clientes.filter(c => c.status_conta === 'ativo').length,
      vencidos: clientes.filter(c => c.status_conta === 'vencido').length,
      rastreios_mes_total: db.totalRastreiosMes ? db.totalRastreiosMes() : 0
    };

    const logs = readLoggzapLogs ? readLoggzapLogs() : [];
    res.json({ success: true, clientes, resumo_contas, logs });
  } catch(e) {
    console.error('[Admin LoggZap resumo]', e);
    res.status(500).json({ error: e.message || 'Erro interno ao carregar resumo.' });
  }
});





// ── Admin LoggZap Nota 9 — rotas auxiliares seguras ──────────────────────────
app.get('/admin-loggzap/api/zapi-status/:storeId', auth, async (req, res) => {
  try {
    if (typeof getZapiStatusForStore === 'function') {
      const status = await getZapiStatusForStore(req.params.storeId);
      return res.json({ success: true, status });
    }
    return res.json({ success: false, status: { conectado: false, erro: 'Função de status Z-API não disponível nesta versão.' } });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/admin-loggzap/api/desvincular-dispositivo', auth, (req, res) => {
  const { chave } = req.body || {};
  if (!chave) return res.status(400).json({ error: 'Informe a chave.' });
  try {
    if (!db.desvincularDispositivo) return res.status(500).json({ error: 'Função de desvincular dispositivo não disponível no db.js.' });
    db.desvincularDispositivo(String(chave).trim());
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/admin-loggzap/api/multi-dispositivo', auth, (req, res) => {
  const { chave, ativar } = req.body || {};
  if (!chave) return res.status(400).json({ error: 'Informe a chave.' });
  try {
    if (!db.setMultiDispositivo) return res.status(500).json({ error: 'Função multi-dispositivo não disponível no db.js.' });
    const lic = db.setMultiDispositivo(String(chave).trim(), ativar !== false);
    if (!lic) return res.status(404).json({ error: 'Chave não encontrada.' });
    res.json({ success: true, chave: lic.chave, multi_dispositivo: !!lic.multi_dispositivo });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});



// ── Admin LoggZap — helpers de teste WhatsApp/Z-API ──────────────────────────
async function getZapiStatusForStore(storeId, options = {}) {
  // Se o provedor ativo é o Evolution, o status vem do estado da instância Evolution.
  if (WHATSAPP_PROVIDER === 'evolution') {
    const st = await evolutionState(storeId);
    return {
      conectado: st.conectado,
      connected: st.conectado,
      smartphoneConnected: st.conectado,
      estado: st.state,
      origem: 'evolution',
      erro: st.conectado ? null : (st.erro || `Evolution: ${st.state}`)
    };
  }

  const inst = db.getInstancia ? (db.getInstancia(String(storeId)) || null) : null;
  const allowEnvFallback = options.allowEnvFallback === true;

  // Para status por loja, NÃO podemos usar ZAPI_INSTANCE global como fallback.
  // Esse fallback fazia loja trial/free sem instância própria aparecer como conectada.
  const instance = inst?.zapi_instance || (allowEnvFallback ? process.env.ZAPI_INSTANCE : null);
  const token = inst?.zapi_token || (allowEnvFallback ? process.env.ZAPI_TOKEN : null);
  const client = inst?.zapi_client_token || (allowEnvFallback ? process.env.ZAPI_CLIENT_TOKEN : null);

  if (!instance || !token || !client) {
    return {
      conectado: false,
      connected: false,
      smartphoneConnected: false,
      estado: 'not_configured',
      origem: 'sem_instancia_da_loja',
      erro: 'Z-API não configurada para esta loja.'
    };
  }

  try {
    const r = await axios.get(
      `https://api.z-api.io/instances/${instance}/token/${token}/status`,
      {
        headers: {
          'Client-Token': client,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        validateStatus: () => true
      }
    );

    const data = r.data || {};
    const conectado = data.connected === true ||
      data.status === 'connected' ||
      data.status === 'CONNECTED' ||
      data.value === true;

    if (r.status < 200 || r.status >= 300) {
      return {
        conectado: false,
        connected: false,
        smartphoneConnected: data.smartphoneConnected === true,
        httpStatus: r.status,
        erro: data.error || data.message || data.description || `Erro HTTP ${r.status} ao consultar Z-API.`,
        data
      };
    }

    return {
      conectado,
      connected: conectado,
      smartphoneConnected: data.smartphoneConnected === true,
      estado: conectado ? 'connected' : (data.error || data.status || data.state || 'not_connected'),
      origem: inst ? 'instancia_da_loja' : 'env_global',
      erro: conectado ? null : (data.error || data.message || 'Instância não conectada.'),
      data
    };
  } catch(e) {
    return {
      conectado: false,
      connected: false,
      smartphoneConnected: false,
      erro: e.response?.data?.message || e.response?.data?.error || e.message
    };
  }
}

async function getZapiStatusForStoreSafe(storeId) {
  return getZapiStatusForStore(storeId, { allowEnvFallback: false });
}

function renderTemplateTesteAdmin(storeId, tipo) {
  const sample = {
    nome: 'Cliente Teste',
    numero: '12345',
    codigo: 'AB123456789BR',
    link: 'https://rastreamento.correios.com.br/app/index.php?objeto=AB123456789BR',
    transportadora: 'Correios',
    status: 'Objeto em trânsito para a unidade de distribuição',
    data: '31/05/2026',
    hora: '14:30',
    gateway: 'PIX',
    etapa: '24h'
  };

  const key = tipo || 'pagamento_confirmado';
  let template = null;

  try {
    const templates = typeof getStoreTemplates === 'function' ? getStoreTemplates(storeId) : {};
    template = templates[key];
  } catch(e) {}

  const fallbackMap = typeof DEFAULT_AUTOMATION_TEMPLATES !== 'undefined' ? DEFAULT_AUTOMATION_TEMPLATES : {
    pagamento_confirmado: 'Olá, {nome}! Seu pagamento do pedido #{numero} foi confirmado.',
    pedido_postado: 'Olá, {nome}! Seu pedido #{numero} foi postado. Código: {codigo}. Rastreie: {link}',
    rastreio_atualizado: 'Olá, {nome}! Seu pedido #{numero} teve uma nova movimentação: {status}. Rastreie: {link}',
    boleto_pix_pendente: 'Olá, {nome}! Seu pedido #{numero} ainda está aguardando pagamento.',
    pesquisa_satisfacao: 'Como foi sua experiência com o pedido #{numero}, {nome}?'
  };

  const finalTemplate = template || fallbackMap[key] || fallbackMap.pagamento_confirmado;
  if (typeof renderTemplate === 'function') return renderTemplate(finalTemplate, sample);

  return String(finalTemplate).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => sample[k] || '');
}



// ── Admin LoggZap — inteligência de mercado / nichos ─────────────────────────
function normalizarTexto(v) {
  if (!v) return '';
  if (typeof v === 'object') {
    return v.pt || v.en || v.es || Object.values(v).find(Boolean) || '';
  }
  return String(v);
}

function numeroMoeda(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function classificarNicho(store = {}, produtos = []) {
  const bruto = [
    store.type,
    normalizarTexto(store.name),
    normalizarTexto(store.description),
    ...(produtos || []).slice(0, 15).map(p => normalizarTexto(p.name) + ' ' + normalizarTexto(p.description))
  ].join(' ').toLowerCase();

  const mapa = [
    ['Moda / vestuário', ['clothing','fashion','moda','roupa','vestuário','camiseta','blusa','calça','vestido','look','fashion']],
    ['Beleza / cosméticos', ['beauty','beleza','cosmético','cosmetico','maquiagem','skin care','skincare','perfume','cabelo','unha']],
    ['Casa / decoração', ['home','casa','decoração','decoracao','móveis','moveis','lar','cozinha','mesa posta']],
    ['Eletrônicos / acessórios', ['electronic','eletrônico','eletronico','celular','fone','carregador','gadget','informática','informatica']],
    ['Pet', ['pet','cachorro','gato','ração','racao','animal']],
    ['Infantil / bebê', ['bebê','bebe','infantil','criança','crianca','kids','maternidade']],
    ['Saúde / bem-estar', ['saúde','saude','bem-estar','fitness','suplemento','academia','treino']],
    ['Alimentos / bebidas', ['food','alimento','bebida','café','cafe','doce','bolo','chocolate','gourmet']],
    ['Papelaria / personalizados', ['papelaria','personalizado','brinde','sublimação','sublimacao','dtf','adesivo','caneca']],
    ['Esporte / lazer', ['sports','esporte','bike','futebol','corrida','lazer']]
  ];

  for (const [nicho, termos] of mapa) {
    if (termos.some(t => bruto.includes(t))) return nicho;
  }

  return store.type ? String(store.type) : 'Não identificado';
}

function dominioLoja(store = {}) {
  if (Array.isArray(store.domains) && store.domains.length) return store.domains[0];
  if (store.original_domain) return store.original_domain;
  return null;
}

async function getStoreInfoSeguro(storeId) {
  try {
    return await nuvemGet(storeId, '/store');
  } catch(e) {
    return { id: storeId, erro_store: e.response?.data?.message || e.message };
  }
}

async function getProdutosAmostraSeguro(storeId) {
  try {
    const produtos = await nuvemGet(storeId, '/products', { per_page: 30, page: 1 });
    return Array.isArray(produtos) ? produtos : [];
  } catch(e) {
    return [];
  }
}

async function getPedidosAmostraSeguro(storeId) {
  try {
    const pedidos = await nuvemGet(storeId, '/orders', { per_page: 30, page: 1 });
    return Array.isArray(pedidos) ? pedidos : [];
  } catch(e) {
    return [];
  }
}

function calcularMetricasPedidos(pedidos = []) {
  let faturamento = 0;
  let pedidosPagos = 0;

  for (const o of pedidos || []) {
    const status = String(o.payment_status || o.financial_status || o.status || '').toLowerCase();
    const pago = !status || ['paid','closed','fulfilled','completed','pago','aprovado'].some(s => status.includes(s));
    const total = numeroMoeda(o.total || o.total_paid || o.subtotal || o.total_price || o.price);
    if (pago || total > 0) {
      faturamento += total;
      pedidosPagos++;
    }
  }

  return {
    pedidos: pedidos.length,
    pedidosPagos,
    faturamento,
    ticketMedio: pedidos.length ? faturamento / pedidos.length : 0
  };
}

function scoreNicho(n) {
  // Peso simples: lojas + pedidos + faturamento amostral.
  const lojas = Number(n.lojas || 0);
  const pedidos = Number(n.pedidos || 0);
  const fat = Number(n.faturamento || 0);
  const raw = (lojas * 20) + (pedidos * 2) + Math.min(fat / 100, 50);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

app.get('/admin-loggzap/api/mercado-insights', auth, async (req, res) => {
  try {
    const stores = db.getAllStores ? db.getAllStores() : [];
    const clientes = db.listarClientesOperacionais ? db.listarClientesOperacionais() : [];
    const clientesMap = new Map(clientes.map(c => [String(c.store_id), c]));
    const lojas = [];

    for (const s of stores) {
      const storeId = String(s.store_id);
      const [store, produtos, pedidos] = await Promise.all([
        getStoreInfoSeguro(storeId),
        getProdutosAmostraSeguro(storeId),
        getPedidosAmostraSeguro(storeId)
      ]);

      const metricas = calcularMetricasPedidos(pedidos);
      const cliente = clientesMap.get(storeId) || {};
      const nicho = classificarNicho(store, produtos);

      lojas.push({
        store_id: storeId,
        nome: normalizarTexto(store.name) || cliente.nome_cliente || storeId,
        nicho,
        tipoOriginal: store.type || null,
        urlPublica: dominioLoja(store),
        planoNuvemshop: store.plan_name || null,
        planoLoggZap: cliente.plano || 'free/trial',
        pedidos: metricas.pedidos,
        pedidosPagos: metricas.pedidosPagos,
        faturamento: Number(metricas.faturamento.toFixed(2)),
        ticketMedio: Number(metricas.ticketMedio.toFixed(2)),
        produtosAmostra: produtos.length,
        erro_store: store.erro_store || null
      });
    }

    const porNicho = new Map();
    for (const l of lojas) {
      const key = l.nicho || 'Não identificado';
      const acc = porNicho.get(key) || { nicho: key, lojas: 0, pedidos: 0, faturamento: 0 };
      acc.lojas += 1;
      acc.pedidos += Number(l.pedidos || 0);
      acc.faturamento += Number(l.faturamento || 0);
      porNicho.set(key, acc);
    }

    const nichos = [...porNicho.values()].map(n => ({
      ...n,
      faturamento: Number(n.faturamento.toFixed(2)),
      ticketMedio: n.pedidos ? Number((n.faturamento / n.pedidos).toFixed(2)) : 0,
      score: scoreNicho(n)
    })).sort((a,b) => b.score - a.score || b.faturamento - a.faturamento);

    const totalFaturamento = lojas.reduce((s,l) => s + Number(l.faturamento || 0), 0);
    const totalPedidos = lojas.reduce((s,l) => s + Number(l.pedidos || 0), 0);

    res.json({
      success: true,
      geradoEm: new Date().toISOString(),
      observacao: 'Faturamento e pedidos são estimativas baseadas na amostra de pedidos recentes retornada pela API da Nuvemshop.',
      totalLojas: lojas.length,
      totalPedidos,
      totalFaturamento: Number(totalFaturamento.toFixed(2)),
      nichos,
      lojas: lojas.sort((a,b) => Number(b.faturamento||0) - Number(a.faturamento||0))
    });
  } catch(e) {
    console.error('[Admin Mercado Insights]', e);
    res.status(500).json({ error: e.message || 'Erro ao gerar insights de mercado.' });
  }
});


// ── Painel administrativo Premium / Templates por loja ───────────────────────
const fs = require('fs');

const ADMIN_DATA_DIR = path.join(__dirname, 'data');
const ADMIN_DATA_FILE = path.join(ADMIN_DATA_DIR, 'loggzap-admin.json');

const DEFAULT_AUTOMATION_TEMPLATES = {
  pagamento_confirmado:
    '👏👏👏 #Parabéns, {nome}!👏👏👏\nSeu pagamento do pedido *#{numero}* foi confirmado!\n\nNosso prazo de produção é de 3 dias úteis. Sua estampa entrou na fila de impressão agora e segue a sequência de pedidos.',
  pedido_postado:
    '📮 Olá, {nome}! Seu pedido *#{numero}* foi postado!\n\nCódigo de rastreio: *{codigo}*\n🔗 Rastreie: {link}\n\nEm breve chegará até você! 😊',
  rastreio_atualizado:
    '🚚 Boa notícia, {nome}! Seu pedido *#{numero}* teve uma nova movimentação.\n\n📍 Status: *{status}*\n📅 {data} às {hora}\n\n🔗 Rastreie: {link}',
  saiu_para_entrega:
    '🎉 {nome}, seu pedido *#{numero}* saiu para entrega hoje!\n\nFique de olho, o entregador está a caminho! 📦\n🔗 Rastreie: {link}',
  pedido_entregue:
    '✅ {nome}, seu pedido *#{numero}* foi entregue!\n\nEsperamos que você goste! Qualquer dúvida é só chamar. 😊',
  carrinho_abandonado:
    'Olá, {nome}! 👋\n\nPercebemos que você deixou alguns itens no carrinho da nossa loja.\n\nAinda está interessado? Finalize sua compra aqui:\n🛒 {link}\n\nQualquer dúvida é só chamar! 😊',
  boleto_pix_pendente:
    'Olá, {nome}! 😊\n\nIdentificamos que seu pedido *#{numero}* ainda está aguardando pagamento.\n\nFinalize seu pagamento para garantir seu pedido!\n\nQualquer dúvida é só chamar. 💬\n\n_Se você já efetuou o pagamento por outros métodos, desconsidere esta mensagem._',
  pesquisa_satisfacao:
    'Como foi a sua experiência com o pedido *#{numero}*, {nome}? 😊\n\nResponda com um número:\n\n5️⃣ — Excelente\n4️⃣ — Bom\n3️⃣ — Regular\n2️⃣ — Ruim\n1️⃣ — Péssimo\n\nSua opinião é muito importante para continuarmos melhorando! 🙏'
};

const TEMPLATE_RULES = {
  pagamento_confirmado: ['{nome}', '{numero}'],
  pedido_postado: ['{nome}', '{numero}', '{codigo}', '{link}'],
  rastreio_atualizado: ['{nome}', '{numero}', '{status}', '{link}'],
  saiu_para_entrega: ['{nome}', '{numero}', '{link}'],
  pedido_entregue: ['{nome}', '{numero}'],
  carrinho_abandonado: ['{nome}', '{link}'],
  boleto_pix_pendente: ['{nome}', '{numero}'],
  pesquisa_satisfacao: ['{nome}', '{numero}']
};

const TEMPLATE_LABELS = {
  pagamento_confirmado: 'Pagamento confirmado',
  pedido_postado: 'Pedido postado / código de rastreio',
  rastreio_atualizado: 'Acompanhamento da entrega / movimentação',
  saiu_para_entrega: 'Saiu para entrega',
  pedido_entregue: 'Pedido entregue',
  carrinho_abandonado: 'Carrinho abandonado',
  boleto_pix_pendente: 'Pix, boleto ou pagamento pendente',
  pesquisa_satisfacao: 'Pesquisa de satisfação'
};


function ensureAdminData() {
  // Mantido por compatibilidade. O painel Premium agora usa SQLite via db.js.
}

function readAdminData() {
  // Mantido para compatibilidade com código legado. Novas operações usam funções específicas do db.js.
  return { users: {}, sessions: {}, templates: {} };
}

function writeAdminData(data) {
  // Mantido para compatibilidade. Não grava mais JSON.
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch(e) {
    return false;
  }
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const parts = raw.split(';').map(p => p.trim());
  const item = parts.find(p => p.startsWith(name + '='));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function painelAuth(req, res, next) {
  const token = getCookie(req, 'lz_admin_session') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });

  const session = db.getPainelSessao ? db.getPainelSessao(token) : null;
  if (!session || !session.store_id) {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }

  req.painel = session;
  next();
}

function createPainelSession(storeId, login) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  if (db.criarPainelSessao) db.criarPainelSessao(token, String(storeId), String(login), expiresAt);
  return token;
}

function painelSessionCookie(token, maxAgeSeconds = 60 * 60 * 24 * 7) {
  // Em produção HTTPS, mantém Secure. Em ambiente HTTP/local, não força Secure para o navegador aceitar o cookie.
  const secure = String(process.env.COOKIE_SECURE || '').toLowerCase();
  const useSecure = secure === 'false' ? false : (process.env.NODE_ENV === 'production' || secure === 'true');
  const base = `lz_admin_session=${encodeURIComponent(token || '')}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
  return useSecure ? base + '; Secure' : base;
}

function renderTemplate(text, vars = {}) {
  return String(text || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function getStoreTemplates(storeId) {
  const custom = db.getPainelTemplates ? db.getPainelTemplates(String(storeId)) : {};
  return { ...DEFAULT_AUTOMATION_TEMPLATES, ...(custom || {}) };
}

function getMensagemTemplate(storeId, key, fallback, vars = {}) {
  try {
    const templates = getStoreTemplates(storeId);
    const template = templates[key] || fallback;
    return renderTemplate(template, vars);
  } catch(e) {
    return renderTemplate(fallback, vars);
  }
}

function getRastreioTemplateKey(evento) {
  const desc = (evento?.descricao || '').toLowerCase();
  if (evento?.entregue) return 'pedido_entregue';
  if (desc.includes('saiu para entrega') || desc.includes('saiu para a entrega') || desc.includes('entrega prevista')) return 'saiu_para_entrega';
  if (desc.includes('postado') || desc.includes('objeto postado') || desc.includes('coletado')) return 'pedido_postado';
  return 'rastreio_atualizado';
}

function validateTemplatesPayload(templates = {}) {
  const erros = [];
  const avisos = [];
  const out = {};

  for (const key of Object.keys(DEFAULT_AUTOMATION_TEMPLATES)) {
    const label = TEMPLATE_LABELS[key] || key;
    const value = String(templates[key] ?? DEFAULT_AUTOMATION_TEMPLATES[key] ?? '').trim();

    if (!value) {
      erros.push(`${label}: a mensagem não pode ficar vazia.`);
      continue;
    }

    if (value.length > 900) {
      erros.push(`${label}: reduza o texto para até 900 caracteres.`);
    }

    const obrigatorias = TEMPLATE_RULES[key] || [];
    for (const variable of obrigatorias) {
      if (!value.includes(variable)) {
        erros.push(`${label}: mantenha a variável obrigatória ${variable}.`);
      }
    }

    const found = value.match(/\{[a-zA-Z0-9_]+\}/g) || [];
    const allowed = new Set(['{nome}', '{numero}', '{codigo}', '{link}', '{transportadora}', '{status}', '{data}', '{hora}', '{gateway}', '{etapa}']);
    for (const variable of found) {
      if (!allowed.has(variable)) {
        avisos.push(`${label}: a variável ${variable} não é reconhecida e pode ficar vazia no envio.`);
      }
    }

    out[key] = value;
  }

  return { ok: erros.length === 0, erros, avisos, templates: out };
}

function painelHtml() {
  const templateFields = Object.keys(DEFAULT_AUTOMATION_TEMPLATES).map(key => {
    const req = (TEMPLATE_RULES[key] || []).join(' ');
    return `
      <div class="template-card" data-key="${key}">
        <div class="template-head">
          <strong>${TEMPLATE_LABELS[key]}</strong>
          <span>Obrigatório: ${req}</span>
        </div>
        <div class="warning">Atenção: não remova as variáveis obrigatórias. Elas são substituídas automaticamente pelos dados reais do pedido.</div>
        <textarea id="tpl_${key}" rows="7"></textarea>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Painel Premium LoggZap</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap');
  *{box-sizing:border-box}body{margin:0;background:#07090e;color:#eef0f8;font-family:Arial,sans-serif}
  h1,h2,h3,h4,h5,h6{font-family:'Poppins',Arial,sans-serif}
  .wrap{max-width:1040px;margin:0 auto;padding:32px 22px}
  .top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:22px}
  .logo{font-size:24px;font-weight:800}.logo span{color:#00d084}
  .card{background:#0c0f16;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:24px;margin-bottom:18px}
  h1{font-size:26px;margin:0 0 8px}h2{font-size:20px;margin:0 0 14px}p{color:#8b93a8;line-height:1.6}
  label{display:block;font-size:12px;font-weight:700;color:#8b93a8;text-transform:uppercase;margin:12px 0 6px}
  input,textarea{width:100%;background:#11151e;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#eef0f8;padding:12px;font:inherit}
  textarea{resize:vertical;min-height:130px;line-height:1.5}
  button{border:0;border-radius:9px;padding:12px 16px;font-weight:700;cursor:pointer}
  .btn{background:#00d084;color:#000}.btn2{background:#1e2430;color:#eef0f8;border:1px solid rgba(255,255,255,.12)}
  .btn:disabled{opacity:.45;cursor:not-allowed}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .template-card{background:#11151e;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;margin-bottom:14px}
  .template-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}
  .template-head span{font-size:12px;color:#4f8ef7;text-align:right}
  .warning{background:rgba(232,160,48,.12);border:1px solid rgba(232,160,48,.35);color:#f6c167;border-radius:8px;padding:10px;font-size:13px;margin-bottom:10px}
  .info{background:rgba(79,142,247,.10);border:1px solid rgba(79,142,247,.28);color:#a9c7ff;border-radius:8px;padding:12px;margin:12px 0}
  .ok{background:rgba(0,208,132,.12);border:1px solid rgba(0,208,132,.35);color:#00d084;border-radius:8px;padding:12px;margin:12px 0;display:none}
  .err{background:rgba(224,90,90,.12);border:1px solid rgba(224,90,90,.35);color:#ff8f8f;border-radius:8px;padding:12px;margin:12px 0;display:none}
  .actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;position:sticky;bottom:0;background:#07090e;padding:14px 0;border-top:1px solid rgba(255,255,255,.08)}
  .muted{font-size:13px;color:#8b93a8}.hidden{display:none!important}
  @media(max-width:760px){.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="logo">Logg<span>Zap</span> Premium</div>
    <button class="btn2 hidden" id="logoutBtn">Sair</button>
  </div>

  <div id="authArea" class="grid">
    <div class="card">
      <h1>Entrar no painel</h1>
      <p>Acesse para configurar mensagens automáticas, trocar login e senha e testar os textos antes de salvar.</p>
      <label>Store ID</label><input id="loginStore" placeholder="Ex: 4757590">
      <label>Login</label><input id="loginUser" placeholder="Seu login">
      <label>Senha</label><input id="loginPass" type="password" placeholder="Sua senha">
      <div class="err" id="loginErr"></div>
      <button class="btn" onclick="login()">Entrar</button>
      <p style="margin-top:14px;text-align:center"><a href="#" onclick="toggleEsqueci();return false" style="color:#4f8ef7;font-size:13px;text-decoration:none">Esqueci minha senha</a></p>

      <div id="esqueciBox" style="display:none;margin-top:14px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px">
        <h2 style="font-size:16px;margin:0 0 10px">Recuperar senha</h2>
        <label>Store ID</label><input id="recStore" placeholder="Ex: 4757590">
        <div id="recCodigoBox" style="display:none">
          <label>Código (enviado ao seu email)</label><input id="recCodigo" placeholder="6 dígitos">
          <label>Nova senha</label><input id="recNovaSenha" type="password" placeholder="Nova senha (mín. 6)">
        </div>
        <div class="err" id="recErr"></div><div class="ok" id="recOk"></div>
        <button class="btn" id="recBtn" onclick="enviarCodigoReset()">Enviar código por email</button>
      </div>
    </div>
    <div class="card">
      <h1>Primeiro acesso</h1>
      <p>Crie o acesso administrativo da loja. Para segurança, informe a chave Premium recebida por e-mail.</p>
      <label>Store ID</label><input id="regStore" placeholder="Ex: 4757590">
      <label>Chave Premium</label><input id="regKey" placeholder="LZP-XXXX-XXXX-XXXX">
      <label>Login desejado</label><input id="regUser" placeholder="Ex: minha-loja">
      <label>Senha</label><input id="regPass" type="password" placeholder="Mínimo 6 caracteres">
      <div class="warning">Guarde esse acesso. Depois você poderá alterar login e senha dentro do painel.</div>
      <div class="err" id="regErr"></div>
      <button class="btn" onclick="register()">Criar acesso</button>
    </div>
  </div>

  <div id="panelArea" class="hidden">
    <div class="card" id="whatsappConnectBox">
      <h2>📱 Conecte seu WhatsApp</h2>
      <p>As mensagens automáticas são enviadas pelo <strong>seu próprio número de WhatsApp</strong>. Conecte-o uma vez escaneando o QR Code — é rápido e só precisa fazer isso uma vez.</p>
      <div id="waStatus" class="info">Verificando conexão...</div>
      <div id="waQrWrap" style="display:none;text-align:center;margin:14px 0">
        <img id="waQr" alt="QR Code do WhatsApp" style="max-width:260px;border-radius:8px;background:#fff;padding:8px">
        <p class="muted">No celular: WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> → aponte a câmera para o código acima.</p>
      </div>
      <div class="actions">
        <button class="btn" id="waConnectBtn" onclick="connectWhatsApp()">Conectar / mostrar QR</button>
        <button class="btn2" id="waRefreshBtn" onclick="loadWhatsAppStatus()">Atualizar status</button>
        <button class="btn2" id="waLogoutBtn" onclick="disconnectWhatsApp()" style="display:none">Desconectar</button>
      </div>
      <div class="err" id="waErr"></div>
    </div>

    <div class="card">
      <h1>Mensagens automáticas</h1>
      <p>Edite as mensagens usadas nas automações Premium. Antes de salvar, clique em <strong>Verificar mensagens</strong>. O sistema só permitirá salvar se a verificação estiver 100% OK.</p>
      <div class="info">
        Variáveis disponíveis: <strong>{nome}</strong>, <strong>{numero}</strong>, <strong>{codigo}</strong>, <strong>{link}</strong>, <strong>{transportadora}</strong>, <strong>{status}</strong>, <strong>{data}</strong>, <strong>{hora}</strong>, <strong>{gateway}</strong>, <strong>{etapa}</strong>.
      </div>
      ${templateFields}
      <div class="err" id="validateErr"></div>
      <div class="ok" id="validateOk"></div>
      <div class="actions">
        <button class="btn2" onclick="validateTemplates()">Verificar mensagens</button>
        <button class="btn" id="saveBtn" onclick="saveTemplates()" disabled>Salvar mensagens</button>
        <button class="btn2" onclick="sendTest()">Enviar teste simulado</button>
        <span class="muted">Recomendado: verifique tudo antes de salvar. O salvamento só libera se não houver erro.</span>
      </div>
    </div>


    <div class="card" id="premiumChecklistBox">
      <h2>Checklist Premium</h2>
      <p>Antes de considerar a automação pronta, confira se todos os itens estão verdes.</p>
      <div id="checklistStatus" class="info">Carregando checklist...</div>
      <button class="btn2" onclick="loadChecklist()">Atualizar checklist</button>
    </div>

    <div class="card">
      <h2>Teste real de WhatsApp</h2>
      <p>Envie uma mensagem real para o seu WhatsApp e confira se as automações estão funcionando como você quer.</p>
      <label>Telefone para teste</label><input id="realTestPhone" placeholder="5581999999999">
      <label>Tipo de mensagem</label>
      <select id="realTestType">
        <option value="pagamento_confirmado">Pagamento confirmado</option>
        <option value="pedido_postado">Código de rastreio</option>
        <option value="rastreio_atualizado">Movimentação de entrega</option>
        <option value="boleto_pix_pendente">Pix/boleto pendente</option>
        <option value="pesquisa_satisfacao">Pesquisa de satisfação</option>
      </select>
      <br><br><button class="btn2" onclick="sendRealWhatsAppTest()">Enviar teste real</button>
      <div class="err" id="realTestErr"></div><div class="ok" id="realTestOk"></div>
    </div>

    <div class="card">
      <h2>Alterar login e senha</h2>
      <p>Use esta área para trocar o login e a senha de acesso a este painel.</p>
      <label>Novo login</label><input id="newLogin" placeholder="Novo login">
      <label>Nova senha</label><input id="newPass" type="password" placeholder="Nova senha">
      <div class="err" id="credErr"></div><div class="ok" id="credOk"></div>
      <button class="btn2" onclick="changeCredentials()">Atualizar acesso</button>
    </div>
  </div>
</div>

<script>
let canSave = false;
const keys = ${JSON.stringify(Object.keys(DEFAULT_AUTOMATION_TEMPLATES))};

function show(id, msg) { const el=document.getElementById(id); el.innerHTML=msg; el.style.display='block'; }
function hide(id) { const el=document.getElementById(id); el.style.display='none'; }
function collectTemplates(){ const out={}; keys.forEach(k=>out[k]=document.getElementById('tpl_'+k).value); return out; }
function markDirty(){ canSave=false; document.getElementById('saveBtn').disabled=true; hide('validateOk'); }

function authHeaders(extra){
  const headers = Object.assign({}, extra || {});
  const token = localStorage.getItem('lz_painel_token');
  if(token) headers.Authorization = 'Bearer ' + token;
  return headers;
}
async function api(path, body){
  const r = await fetch(path,{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(body||{}), credentials:'same-origin'});
  const d = await r.json().catch(()=>({}));
  if(!r.ok || d.error) throw new Error(d.error || 'Erro na solicitação.');
  if(d.session_token) localStorage.setItem('lz_painel_token', d.session_token);
  return d;
}
async function apiGet(path){
  const r = await fetch(path,{headers:authHeaders(), credentials:'same-origin'});
  const d = await r.json().catch(()=>({}));
  if(!r.ok || d.error) throw new Error(d.error || 'Erro na solicitação.');
  if(d.session_token) localStorage.setItem('lz_painel_token', d.session_token);
  return d;
}

function toggleEsqueci(){const b=document.getElementById('esqueciBox');b.style.display=(!b.style.display||b.style.display==='none')?'block':'none';}
async function enviarCodigoReset(){
  hide('recErr');hide('recOk');
  const store=document.getElementById('recStore').value;
  if(!store){show('recErr','Informe o Store ID.');return;}
  try{
    const d=await api('/painel/api/forgot',{store_id:store});
    show('recOk','Se houver conta, enviamos um código para '+(d.email_mascarado||'seu email')+'. Confira também o spam.');
    document.getElementById('recCodigoBox').style.display='block';
    const btn=document.getElementById('recBtn');
    btn.textContent='Redefinir senha';
    btn.setAttribute('onclick','redefinirSenha()');
  }catch(e){show('recErr',e.message);}
}
async function redefinirSenha(){
  hide('recErr');hide('recOk');
  try{
    await api('/painel/api/reset',{store_id:document.getElementById('recStore').value,codigo:document.getElementById('recCodigo').value,senha:document.getElementById('recNovaSenha').value});
    show('recOk','✅ Senha redefinida! Faça login com a nova senha.');
    document.getElementById('recCodigoBox').style.display='none';
  }catch(e){show('recErr',e.message);}
}
async function login(){
  hide('loginErr');
  try{
    await api('/painel/api/login',{store_id:loginStore.value,login:loginUser.value,senha:loginPass.value});
    await loadPanel();
    await loadChecklist();
  }catch(e){show('loginErr',e.message);}
}
async function register(){
  hide('regErr');
  try{
    await api('/painel/api/register',{store_id:regStore.value,chave:regKey.value,login:regUser.value,senha:regPass.value});
    await loadPanel();
  }catch(e){show('regErr',e.message);}
}
async function loadPanel(){
  const data = await apiGet('/painel/api/templates');
  document.getElementById('authArea').classList.add('hidden');
  document.getElementById('panelArea').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  keys.forEach(k=>{ const el=document.getElementById('tpl_'+k); el.value=data.templates[k] || ''; el.addEventListener('input',markDirty); });
  markDirty();
}
async function validateTemplates(){
  hide('validateErr'); hide('validateOk');
  try{
    const d = await api('/painel/api/validate-templates',{templates:collectTemplates()});
    if(d.ok){
      canSave=true; document.getElementById('saveBtn').disabled=false;
      show('validateOk','✅ Verificação concluída. Tudo está pronto para salvar.' + (d.avisos?.length ? '<br><br>Avisos:<br>'+d.avisos.join('<br>') : ''));
    } else {
      canSave=false; document.getElementById('saveBtn').disabled=true;
      show('validateErr','Corrija antes de salvar:<br>'+d.erros.join('<br>'));
    }
  }catch(e){show('validateErr',e.message);}
}
async function saveTemplates(){
  hide('validateErr'); hide('validateOk');
  if(!canSave) return show('validateErr','Faça a verificação e corrija os erros antes de salvar.');
  try{
    const d = await api('/painel/api/templates',{templates:collectTemplates()});
    canSave=false; document.getElementById('saveBtn').disabled=true;
    show('validateOk','✅ Mensagens salvas com sucesso.');
  }catch(e){show('validateErr',e.message);}
}
async function sendTest(){
  hide('validateErr'); hide('validateOk');
  try{
    const d = await api('/painel/api/test-templates',{templates:collectTemplates()});
    show('validateOk','✅ Teste simulado gerado com sucesso:<br><br><pre style="white-space:pre-wrap">'+d.preview+'</pre>');
  }catch(e){show('validateErr',e.message);}
}

async function loadChecklist(){
  try{
    const d = await apiGet('/painel/api/checklist');
    const html = d.items.map(i => (i.ok ? '✅ ' : '⚠️ ') + i.label + (i.detalhe ? ' — ' + i.detalhe : '')).join('<br>');
    document.getElementById('checklistStatus').innerHTML = (d.pronto ? '<strong>✅ Premium pronto para operar</strong><br>' : '<strong>⚠️ Premium ainda precisa de atenção</strong><br>') + html;
  }catch(e){ document.getElementById('checklistStatus').innerHTML = 'Erro ao carregar checklist: '+e.message; }
}
async function sendRealWhatsAppTest(){
  hide('realTestErr'); hide('realTestOk');
  try{
    await api('/painel/api/test-whatsapp-real',{telefone:realTestPhone.value,tipo:realTestType.value});
    show('realTestOk','✅ Teste real enviado com sucesso.');
  }catch(e){show('realTestErr',e.message);}
}

async function changeCredentials(){
  hide('credErr'); hide('credOk');
  try{
    await api('/painel/api/credentials',{login:newLogin.value,senha:newPass.value});
    show('credOk','✅ Login e senha atualizados.');
  }catch(e){show('credErr',e.message);}
}
document.getElementById('logoutBtn').onclick = async ()=>{ await api('/painel/api/logout',{}).catch(()=>{}); localStorage.removeItem('lz_painel_token'); location.reload(); };
// ── Conexão do WhatsApp do lojista (Evolution / QR) ──
let waPollTimer = null;
function setWaStatus(txt, cls){ const el=document.getElementById('waStatus'); if(!el) return; el.textContent=txt; el.className=(cls||'info'); }
async function loadWhatsAppStatus(){
  try{
    const d = await apiGet('/painel/api/whatsapp/status');
    const connectBtn=document.getElementById('waConnectBtn'), logoutBtn=document.getElementById('waLogoutBtn'), qrWrap=document.getElementById('waQrWrap');
    if(!d.disponivel){ setWaStatus('Conexão de WhatsApp indisponível no momento. Fale com o suporte.','info'); if(connectBtn) connectBtn.style.display='none'; return; }
    if(d.conectado){
      setWaStatus('✅ WhatsApp conectado. Suas automações saem do seu número.','ok');
      if(qrWrap) qrWrap.style.display='none';
      if(connectBtn) connectBtn.style.display='none';
      if(logoutBtn) logoutBtn.style.display='inline-block';
      if(waPollTimer){ clearInterval(waPollTimer); waPollTimer=null; }
    } else {
      setWaStatus('⚠️ WhatsApp ainda não conectado. Clique em "Conectar / mostrar QR" e escaneie o código.','info');
      if(connectBtn) connectBtn.style.display='inline-block';
      if(logoutBtn) logoutBtn.style.display='none';
    }
  }catch(e){ setWaStatus('Erro ao verificar conexão: '+e.message,'err'); }
}
async function connectWhatsApp(){
  hide('waErr');
  try{
    const d = await api('/painel/api/whatsapp/conectar');
    if(d.conectado){ await loadWhatsAppStatus(); return; }
    if(d.qr){
      document.getElementById('waQr').src = d.qr;
      document.getElementById('waQrWrap').style.display='block';
      setWaStatus('Escaneie o QR Code abaixo com o WhatsApp do seu celular.','info');
      if(waPollTimer) clearInterval(waPollTimer);
      waPollTimer = setInterval(loadWhatsAppStatus, 4000);
    } else {
      show('waErr','Não foi possível gerar o QR agora. Clique em "Atualizar status" e tente novamente.');
    }
  }catch(e){ show('waErr', e.message); }
}
async function disconnectWhatsApp(){
  if(!confirm('Desconectar o WhatsApp? As automações param de enviar até você reconectar.')) return;
  hide('waErr');
  try{ await api('/painel/api/whatsapp/desconectar'); await loadWhatsAppStatus(); }
  catch(e){ show('waErr', e.message); }
}

apiGet('/painel/api/me').then(loadPanel).then(loadChecklist).then(loadWhatsAppStatus).catch(()=>{});
</script>
</body>
</html>`;
}

app.get('/painel', (req, res) => {
  res.send(painelHtml());
});

app.get('/painel/api/me', painelAuth, (req, res) => {
  const token = getCookie(req, 'lz_admin_session') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  res.json({ success: true, store_id: req.painel.store_id, login: req.painel.login, session_token: token });
});

app.post('/painel/api/register', (req, res) => {
  try {
    const { store_id, chave, login, senha } = req.body || {};
    if (!store_id || !chave || !login || !senha) return res.status(400).json({ error: 'Preencha Store ID, chave Premium, login e senha.' });
    if (String(senha).length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

    const validacao = db.validarLicenca(String(chave).trim(), String(store_id).trim());
    if (!validacao?.valida || validacao.plano !== 'premium') {
      return res.status(403).json({ error: 'Chave Premium inválida para esta loja.' });
    }

    if (db.getPainelUsuario && db.getPainelUsuario(String(store_id))) {
      return res.status(409).json({ error: 'Esta loja já possui acesso. Use a tela de login ou altere a senha dentro do painel.' });
    }

    if (!db.criarPainelUsuario || !db.salvarPainelTemplates) {
      return res.status(500).json({ error: 'Banco do painel Premium não está disponível.' });
    }

    db.criarPainelUsuario(String(store_id), String(login).trim(), hashPassword(String(senha)));
    db.salvarPainelTemplates(String(store_id), { ...DEFAULT_AUTOMATION_TEMPLATES });

    const token = createPainelSession(store_id, String(login).trim());
    res.setHeader('Set-Cookie', painelSessionCookie(token));
    res.json({ success: true, session_token: token });
  } catch(e) {
    console.error('[Painel] register:', e.message);
    res.status(500).json({ error: 'Erro ao criar acesso.' });
  }
});

// Esqueci minha senha — envia código de 6 dígitos por email (o login do painel é o email)
app.post('/painel/api/forgot', async (req, res) => {
  try {
    const { store_id } = req.body || {};
    if (!store_id) return res.status(400).json({ error: 'Informe o Store ID.' });
    const user = db.getPainelUsuario ? db.getPainelUsuario(String(store_id)) : null;
    if (!user) return res.json({ success: true, email_mascarado: null }); // não revela se existe
    const email = String(user.login || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'O login desta conta não é um email. Peça a redefinição ao suporte.' });
    }
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const expira = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.salvarResetPainel(String(store_id), codigo, expira);
    try { await enviarCodigoResetEmail(email, codigo); } catch(e) { console.error('[Reset email]', e.message); }
    const mascarado = email.replace(/^(.).*(@.*)$/, (m, a, b) => a + '***' + b);
    res.json({ success: true, email_mascarado: mascarado });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/painel/api/reset', (req, res) => {
  try {
    const { store_id, codigo, senha } = req.body || {};
    if (!store_id || !codigo || !senha) return res.status(400).json({ error: 'Preencha o código e a nova senha.' });
    if (String(senha).length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
    const reset = db.getResetPainel ? db.getResetPainel(String(store_id)) : null;
    if (!reset || !reset.codigo) return res.status(400).json({ error: 'Nenhum código pendente. Solicite um novo.' });
    if (new Date(reset.expira_em) < new Date()) { db.deleteResetPainel(String(store_id)); return res.status(400).json({ error: 'Código expirado. Solicite um novo.' }); }
    if (String(codigo).trim() !== String(reset.codigo)) return res.status(400).json({ error: 'Código incorreto.' });
    const user = db.getPainelUsuario(String(store_id));
    if (!user) return res.status(404).json({ error: 'Conta não encontrada.' });
    db.atualizarPainelCredenciais(String(store_id), user.login, hashPassword(String(senha)));
    db.deleteResetPainel(String(store_id));
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/painel/api/login', (req, res) => {
  try {
    const { store_id, login, senha } = req.body || {};
    if (!store_id || !login || !senha) return res.status(400).json({ error: 'Preencha Store ID, login e senha.' });

    // Senha mestra full — acesso ao painel de qualquer loja (definida em PAINEL_MASTER_PASS no Railway)
    const MASTER = process.env.PAINEL_MASTER_PASS;
    if (MASTER && String(senha) === MASTER) {
      const token = createPainelSession(store_id, String(login).trim() || 'master');
      res.setHeader('Set-Cookie', painelSessionCookie(token));
      return res.json({ success: true, session_token: token });
    }

    const user = db.getPainelUsuario ? db.getPainelUsuario(String(store_id)) : null;
    if (!user || user.login !== String(login).trim() || !verifyPassword(String(senha), user.password_hash)) {
      return res.status(401).json({ error: 'Login, senha ou Store ID inválidos.' });
    }
    const token = createPainelSession(store_id, user.login);
    res.setHeader('Set-Cookie', painelSessionCookie(token));
    res.json({ success: true, session_token: token });
  } catch(e) {
    console.error('[Painel] login:', e.message);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
});

app.post('/painel/api/logout', painelAuth, (req, res) => {
  const token = getCookie(req, 'lz_admin_session') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token && db.deletarPainelSessao) db.deletarPainelSessao(token);
  res.setHeader('Set-Cookie', painelSessionCookie('', 0));
  res.json({ success: true });
});

app.get('/painel/api/templates', painelAuth, (req, res) => {
  res.json({ success: true, templates: getStoreTemplates(req.painel.store_id), labels: TEMPLATE_LABELS, rules: TEMPLATE_RULES });
});

app.post('/painel/api/validate-templates', painelAuth, (req, res) => {
  const result = validateTemplatesPayload(req.body?.templates || {});
  res.json(result);
});

app.post('/painel/api/templates', painelAuth, (req, res) => {
  const result = validateTemplatesPayload(req.body?.templates || {});
  if (!result.ok) return res.status(400).json(result);
  if (!db.salvarPainelTemplates) return res.status(500).json({ error: 'Banco de templates não disponível.' });
  db.salvarPainelTemplates(String(req.painel.store_id), result.templates);
  res.json({ success: true });
});

app.post('/painel/api/test-templates', painelAuth, (req, res) => {
  const result = validateTemplatesPayload(req.body?.templates || {});
  if (!result.ok) return res.status(400).json(result);

  const sample = {
    nome: 'Cliente Teste',
    numero: '12345',
    codigo: 'AB123456789BR',
    link: 'https://rastreamento.correios.com.br/app/index.php?objeto=AB123456789BR',
    transportadora: 'Correios',
    status: 'Objeto em trânsito para a unidade de distribuição',
    data: '31/05/2026',
    hora: '14:30',
    gateway: 'PIX',
    etapa: '24h'
  };

  const preview = Object.entries(result.templates)
    .map(([key, value]) => `### ${TEMPLATE_LABELS[key] || key}\n${renderTemplate(value, sample)}`)
    .join('\n\n--------------------------\n\n');

  res.json({ success: true, preview });
});


app.get('/painel/api/checklist', painelAuth, async (req, res) => {
  try {
    const sid = String(req.painel.store_id);
    const checklist = checklistPremium(sid);
    let conn;
    if (EVOLUTION_URL && EVOLUTION_API_KEY) {
      const st = await evolutionState(sid);
      conn = { conectado: st.conectado, estado: st.state, erro: st.conectado ? '' : 'Conecte pelo QR no topo do painel.' };
    } else {
      conn = await getZapiStatusForStore(sid);
    }
    const items = checklist.items.map(i => i.key === 'zapi_config' ? { ...i, ok: !!conn.conectado, detalhe: conn.conectado ? 'Conectado' : (conn.erro || conn.estado || '') } : i);
    res.json({ success: true, pronto: items.every(i => i.ok), items, conn });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/painel/api/test-whatsapp-real', painelAuth, async (req, res) => {
  const { telefone, tipo } = req.body || {};
  if (!telefone) return res.status(400).json({ error: 'Informe um telefone para teste.' });

  const storeId = String(req.painel.store_id);
  const conectado = (EVOLUTION_URL && EVOLUTION_API_KEY)
    ? await lojaEvolutionConectada(storeId)
    : (await getZapiStatusForStore(storeId)).conectado;
  if (!conectado) return res.status(400).json({ error: 'Seu WhatsApp ainda não está conectado. Conecte pelo QR no topo do painel e tente novamente.' });

  try {
    const mensagem = renderTemplateTesteAdmin(storeId, tipo || 'pagamento_confirmado');
    const result = await sendWhatsApp(telefone, mensagem, storeId);
    safeLogAutomacao({ store_id: storeId, tipo: 'teste_cliente_' + (tipo || 'pagamento_confirmado'), telefone, mensagem });
    res.json({ success: true, result });
  } catch(e) {
    safeLogAutomacao({ store_id: storeId, tipo: 'teste_cliente_' + (tipo || 'pagamento_confirmado'), telefone, erro: e.message });
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});


// ── Lojista: conectar o PRÓPRIO WhatsApp (Evolution) via QR, pelo painel ──
// Funciona sempre que a Evolution estiver configurada — independente do provedor de
// ENVIO atual — para o lojista pré-conectar o número dele antes do corte p/ Evolution.
app.post('/painel/api/whatsapp/conectar', painelAuth, async (req, res) => {
  const storeId = String(req.painel.store_id);
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY)
    return res.status(400).json({ error: 'Conexão de WhatsApp indisponível no momento. Fale com o suporte.' });
  try {
    const out = await evolutionConnect(storeId);
    const st = await evolutionState(storeId);
    res.json({ success: true, qr: out.qr, code: out.code, estado: st.state, conectado: st.conectado });
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

app.get('/painel/api/whatsapp/status', painelAuth, async (req, res) => {
  const storeId = String(req.painel.store_id);
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY)
    return res.json({ success: true, disponivel: false, conectado: false });
  try {
    const st = await evolutionState(storeId);
    res.json({ success: true, disponivel: true, conectado: st.conectado, estado: st.state });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/painel/api/whatsapp/desconectar', painelAuth, async (req, res) => {
  const storeId = String(req.painel.store_id);
  try {
    await evolutionLogout(storeId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/painel/api/credentials', painelAuth, (req, res) => {
  try {
    const { login, senha } = req.body || {};
    if (!login || !senha) return res.status(400).json({ error: 'Informe novo login e nova senha.' });
    if (String(senha).length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

    const user = db.getPainelUsuario ? db.getPainelUsuario(String(req.painel.store_id)) : null;
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (!db.atualizarPainelCredenciais) return res.status(500).json({ error: 'Banco do painel não disponível.' });
    db.atualizarPainelCredenciais(String(req.painel.store_id), String(login).trim(), hashPassword(String(senha)));

    res.json({ success: true });
  } catch(e) {
    console.error('[Painel] credentials:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar login e senha.' });
  }
});



const {
  NUVEM_CLIENT_ID, NUVEM_CLIENT_SECRET, APP_URL, EXTENSION_SECRET,
  PORT = 3000, MP_ACCESS_TOKEN, ZAPI_INSTANCE, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN
} = process.env;

function ensureDefaultZapiStoreBinding() {
  // Correção definitiva: a Z-API global do .env não deve ser usada como fallback
  // para todas as lojas, porque isso gera falso positivo em trial/free.
  // Porém, quando já existe uma instância global funcionando, ela precisa ficar
  // vinculada explicitamente a uma loja premium. Por padrão usamos a loja atual
  // informada pelo cliente; em produção, pode ser sobrescrita por ZAPI_DEFAULT_STORE_ID.
  const storeId = String(process.env.ZAPI_DEFAULT_STORE_ID || process.env.ZAPI_STORE_ID || '4757590').trim();
  if (!storeId || !ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) return;
  try {
    const atual = db.getInstancia ? db.getInstancia(storeId) : null;
    if (!atual && db.salvarInstancia) {
      db.salvarInstancia(storeId, ZAPI_INSTANCE, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, process.env.ZAPI_DEFAULT_STORE_NAME || 'Loja Premium');
      console.log(`[ZAPI] Instância global vinculada explicitamente à loja ${storeId}.`);
    }
  } catch (e) {
    console.error('[ZAPI] Falha ao vincular instância global à loja padrão:', e.message);
  }
}
ensureDefaultZapiStoreBinding();

function auth(req, res, next) {
  const suppliedSecret = req.headers['x-secret'] || req.query.x_secret;
  if (suppliedSecret !== EXTENSION_SECRET)
    return res.status(401).json({ error: 'Não autorizado.' });
  next();
}

// User-Agent conforme boas práticas da Nuvemshop: nome do app + appID + e-mail de contato.
// (Homologação Partners: o header deve identificar o app e um canal para o suporte acionar.)
const NUVEM_USER_AGENT = 'LoggZap/2.5.1 (30935; contato@loggzap.com.br)';

async function nuvemGet(storeId, path, params = {}) {
  const row = db.getToken(storeId);
  if (!row) throw new Error('Loja não autenticada.');
  try {
    const res = await axios.get(`https://api.nuvemshop.com.br/v1/${storeId}${path}`, {
      headers: {
        'Authentication': `bearer ${row.access_token}`,
        'User-Agent': NUVEM_USER_AGENT,
        'Content-Type': 'application/json'
      },
      params
    });
    return res.data;
  } catch (e) {
    // A Nuvemshop responde 404 "Last page is 0" quando uma consulta paginada
    // (ex.: /orders com um filtro) não tem nenhum resultado. Não é erro: tratamos
    // como lista vazia, num único lugar, sem lançar exceção e sem retry.
    const status = e.response?.status;
    const desc = e.response?.data?.description || '';
    if (status === 404 && desc.includes('Last page is 0')) return [];
    throw e;
  }
}

// Eventos de webhook que substituem o polling. order/* cobrem pagamento, criação,
// atualização (envio/entrega) e cancelamento; checkout/* cobrem carrinho abandonado.
const NUVEM_WEBHOOK_EVENTS = ['order/created', 'order/paid', 'order/updated', 'order/cancelled', 'checkout/created', 'checkout/updated'];

// Registra (idempotente) os webhooks de pedido/checkout de uma loja apontando para o
// nosso receptor. Chamado no /auth/callback (instalação) e na rota de backfill.
async function registrarWebhooksNuvem(storeId) {
  const row = db.getToken(storeId);
  if (!row) return { ok: false, erro: 'loja sem token' };
  const url = `${BACKEND_URL}/webhooks/nuvemshop/orders`;
  let existentes = [];
  try { existentes = await nuvemGet(storeId, '/webhooks', { per_page: 200 }); } catch (e) { existentes = []; }
  const jaTem = new Set((Array.isArray(existentes) ? existentes : []).filter(w => w && w.url === url).map(w => w.event));
  const resultados = [];
  for (const event of NUVEM_WEBHOOK_EVENTS) {
    if (jaTem.has(event)) { resultados.push({ event, status: 'ja-existe' }); continue; }
    try {
      await axios.post(`https://api.nuvemshop.com.br/v1/${storeId}/webhooks`,
        { event, url },
        { headers: { 'Authentication': `bearer ${row.access_token}`, 'User-Agent': NUVEM_USER_AGENT, 'Content-Type': 'application/json' }, timeout: 15000 });
      resultados.push({ event, status: 'criado' });
    } catch (e) {
      // 422 = evento já existe/indisponível no plano da loja; não é fatal, seguimos.
      resultados.push({ event, status: 'erro', http: e.response?.status, desc: String(e.response?.data?.description || e.response?.data || e.message).slice(0, 120) });
    }
  }
  console.log(`[Webhooks] loja ${storeId}: ` + resultados.map(r => `${r.event}=${r.status}`).join(' '));
  return { ok: true, resultados };
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

async function podEnviar(telefone) {
  const count = db.mensagensHoje(telefone);
  if (count >= 3) {
    console.log(`[Limite] ${telefone} já recebeu ${count} mensagens hoje. Bloqueado.`);
    return false;
  }
  return true;
}

// ── Provedor de WhatsApp: 'zapi' (padrão) | 'evolution' ─────────────────────
// CORTE SECO: default = evolution (cada loja envia pelo próprio WhatsApp).
// Rollback de emergência = setar WHATSAPP_PROVIDER=zapi no Railway (volta a ponte central).
const WHATSAPP_PROVIDER = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();
const EVOLUTION_URL = (process.env.EVOLUTION_URL || '').replace(/\/$/, '');
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

function evolutionInstanceName(storeId) {
  return storeId ? `loja_${String(storeId).replace(/\W/g, '')}` : 'default';
}

async function sendViaEvolution(numeroComDDI, mensagem, storeId) {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY)
    throw new Error('Evolution não configurado (EVOLUTION_URL/EVOLUTION_API_KEY).');
  const instance = evolutionInstanceName(storeId);
  const res = await axios.post(
    `${EVOLUTION_URL}/message/sendText/${instance}`,
    { number: numeroComDDI, text: mensagem },
    { headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  return res.data;
}

// Gestão de instância Evolution (onboarding self-service de WhatsApp por loja)
async function evolutionEnsureInstance(storeId) {
  const instance = evolutionInstanceName(storeId);
  try {
    await axios.post(`${EVOLUTION_URL}/instance/create`,
      { instanceName: instance, integration: 'WHATSAPP-BAILEYS', qrcode: true },
      { headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' }, timeout: 30000 });
  } catch (e) {
    // 403/409 ou "already in use" = instância já existe → seguimos normalmente
    const msg = JSON.stringify(e.response?.data || '');
    if (![403, 409].includes(e.response?.status) && !/already|exists|in use/i.test(msg)) {
      console.warn('[Evolution] create instance aviso:', e.response?.status, msg.slice(0, 160));
    }
  }
  // Configura o webhook de inbound (respostas do cliente) apontando pro backend.
  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  if (base) {
    try {
      await axios.post(`${EVOLUTION_URL}/webhook/set/${instance}`,
        { webhook: { enabled: true, url: `${base}/webhook/evolution`, webhookByEvents: false, webhookBase64: false, events: ['MESSAGES_UPSERT'] } },
        { headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 });
    } catch (e) {
      console.warn('[Evolution] webhook/set aviso:', e.response?.status, JSON.stringify(e.response?.data || '').slice(0, 120));
    }
  }
  return instance;
}

async function evolutionConnect(storeId) {
  const instance = await evolutionEnsureInstance(storeId);
  const r = await axios.get(`${EVOLUTION_URL}/instance/connect/${instance}`,
    { headers: { apikey: EVOLUTION_API_KEY }, timeout: 30000 });
  const d = r.data || {};
  return { instance, qr: d.base64 || d.qrcode?.base64 || null, code: d.code || d.pairingCode || null };
}

async function evolutionState(storeId) {
  const instance = evolutionInstanceName(storeId);
  try {
    const r = await axios.get(`${EVOLUTION_URL}/instance/connectionState/${instance}`,
      { headers: { apikey: EVOLUTION_API_KEY }, timeout: 15000, validateStatus: () => true });
    const state = r.data?.instance?.state || r.data?.state || 'close';
    return { state, conectado: state === 'open' };
  } catch (e) {
    return { state: 'error', conectado: false, erro: e.message };
  }
}

async function evolutionLogout(storeId) {
  const instance = evolutionInstanceName(storeId);
  await axios.delete(`${EVOLUTION_URL}/instance/logout/${instance}`,
    { headers: { apikey: EVOLUTION_API_KEY }, timeout: 15000, validateStatus: () => true });
  return { instance };
}

// Cache curto (60s) do estado de conexão Evolution por loja, para não bater na API
// da Evolution a cada envio de automação.
const _evoStateCache = new Map();
async function lojaEvolutionConectada(storeId) {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !storeId) return false;
  const key = String(storeId);
  const c = _evoStateCache.get(key);
  if (c && (Date.now() - c.ts) < 60000) return c.open;
  const st = await evolutionState(key).catch(() => ({ conectado: false }));
  _evoStateCache.set(key, { open: !!st.conectado, ts: Date.now() });
  return !!st.conectado;
}

// Checklist do painel Premium (função estava sendo chamada mas não existia → corrige o 500).
function checklistPremium(storeId) {
  const items = [
    { key: 'zapi_config', label: 'WhatsApp conectado', ok: false, detalhe: '' } // preenchido na rota com o status real
  ];
  try {
    const sp = statusPlanoLoja(String(storeId));
    if (sp.pago) items.push({ key: 'plano', label: 'Plano ativo', ok: true, detalhe: 'Plano ' + sp.plano });
    else if (sp.emTrial) items.push({ key: 'plano', label: 'Plano ativo', ok: true, detalhe: 'Em teste (7 dias grátis) — todas as funções liberadas' });
    else items.push({ key: 'plano', label: 'Plano ativo', ok: false, detalhe: 'Teste encerrado — ative um plano para voltar a enviar.' });
  } catch (e) {
    items.push({ key: 'plano', label: 'Plano ativo', ok: false, detalhe: '' });
  }
  return { items };
}

async function sendWhatsApp(telefone, mensagem, storeId) {
  // PLANO FREE (trial encerrado, sem pagar) = só visualização, SEM disparos.
  if (storeId && !statusPlanoLoja(String(storeId)).podeDisparar) {
    const err = new Error('Sem disparos no plano free (teste encerrado). Ative um plano para voltar a enviar.');
    err.code = 'PLANO_SEM_DISPARO';
    throw err;
  }
  // REGRA PADRÃO: o envio sai pelo WhatsApp do PRÓPRIO lojista (Evolution).
  // - WHATSAPP_PROVIDER=evolution (corte seco): SEMPRE Evolution; loja sem conexão
  //   NÃO envia (erro WA_NAO_CONECTADO), sem cair no Z-API central.
  // - Caso contrário (ponte, pré-corte): loja conectada usa o próprio número;
  //   loja ainda não conectada cai no Z-API central.
  const modoEvolution = WHATSAPP_PROVIDER === 'evolution';
  const conectada = await lojaEvolutionConectada(storeId);
  if (modoEvolution || conectada) {
    if (modoEvolution && !conectada) {
      const err = new Error('WhatsApp da loja não conectado (Evolution). Conecte pelo QR no painel.');
      err.code = 'WA_NAO_CONECTADO';
      throw err;
    }
    let full = String(telefone).replace(/\D/g, '');
    if (!full.startsWith('55')) full = '55' + full;
    return await sendViaEvolution(full, mensagem, storeId);
  }

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

async function consultarCorreios(codigo) {
  const SEURASTREIO_KEY = process.env.SEURASTREIO_KEY;
  if (!SEURASTREIO_KEY) { console.error('[Correios] SEURASTREIO_KEY não configurada.'); return null; }
  try {
    const res = await axios.get(
      `https://seurastreio.com.br/api/public/rastreio/${codigo}`,
      { headers: { 'Authorization': `Bearer ${SEURASTREIO_KEY}` }, timeout: 15000 }
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

// Nome da transportadora a partir do método de frete da Nuvemshop (+ formato do código).
// Código no formato dos Correios (AA000000000BR) é sempre Correios, independentemente do texto.
function nomeTransportadora(shippingOption, codigo) {
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(String(codigo || ''))) return 'Correios';
  const s = String(shippingOption || '').toLowerCase();
  if (/jadlog/.test(s)) return 'Jadlog';
  if (/loggi/.test(s)) return 'Loggi';
  if (/total\s*express/.test(s)) return 'Total Express';
  if (/azul/.test(s)) return 'Azul Cargo';
  if (/\bj&t\b|jt\s*express/.test(s)) return 'J&T Express';
  if (/correios|pac|sedex/.test(s)) return 'Correios';
  const nome = String(shippingOption || '').trim();
  return nome ? nome.slice(0, 40) : 'Transportadora';
}

// Link de rastreio correto por transportadora. Correios pelo site dos Correios; demais
// pelo rastreador da própria transportadora. Se desconhecida, cai no rastreador do
// agregador (Seu|Rastreio) que resolve por código, evitando link quebrado dos Correios.
function linkRastreio(codigo, transportadora) {
  const c = encodeURIComponent(String(codigo || ''));
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(String(codigo || ''))) return `https://rastreamento.correios.com.br/app/index.php?objeto=${c}`;
  const t = String(transportadora || '').toLowerCase();
  if (/jadlog/.test(t))        return `https://www.jadlog.com.br/siteInstitucional/tracking.jad?cte=${c}`;
  if (/loggi/.test(t))         return `https://www.loggi.com/rastreador/${c}`;
  if (/total\s*express/.test(t)) return `https://tracking.totalexpress.com.br/poupup_new.php?reid=&pedido=${c}`;
  if (/azul/.test(t))          return `https://www.azulcargo.com.br/rastreio?codigo=${c}`;
  if (/correios|pac|sedex/.test(t)) return `https://rastreamento.correios.com.br/app/index.php?objeto=${c}`;
  return `https://seurastreio.com.br/${c}`; // agregador multi-transportadora (resolve pelo código)
}

function montarMensagemRastreio(pedido, evento) {
  const nome   = pedido.cliente || 'Cliente';
  const numero = pedido.numero;
  const link   = linkRastreio(pedido.rastreio, pedido.transportadora);
  const desc   = (evento.descricao || '').toLowerCase();
  const data   = evento.data || '';
  const hora   = evento.hora || '';
  if (evento.entregue) {
    return `✅ ${nome}, seu pedido *#${numero}* foi entregue!\n\nEsperamos que você goste! Qualquer dúvida é só chamar. 😊`;
  }
  if (desc.includes('saiu para entrega') || desc.includes('saiu para a entrega') || desc.includes('entrega prevista')) {
    return `🎉 ${nome}, seu pedido *#${numero}* saiu para entrega hoje!\n\nFique de olho, o entregador está a caminho! 📦\n🔗 Rastreie: ${link}`;
  }
  if (desc.includes('postado') || desc.includes('objeto postado') || desc.includes('coletado')) {
    return `📮 Olá, ${nome}! Seu pedido *#${numero}* foi postado!\n\nCódigo de rastreio: *${pedido.rastreio}*\n🔗 Rastreie: ${link}\n\nEm breve chegará até você! 😊`;
  }
  return `🚚 Boa notícia, ${nome}! Seu pedido *#${numero}* está a caminho!\n\n📍 Status: *${evento.descricao}*\n📅 ${data} às ${hora}\n\n🔗 Rastreie: ${link}`;
}

function montarMensagemPagamento(nome, numero) {
  return (
    `👏👏👏 #Parabéns, ${nome}!👏👏👏\n` +
    `Seu pagamento do pedido *#${numero}* foi confirmado!\n\n` +
    `Nosso prazo de produção é de 3 dias úteis. Sua estampa entrou na fila de impressão agora e segue a sequência de pedidos.\n\n` +
    `Lembrando que este prazo está sujeito a alteração devido a necessidade de manutenção emergencial em nosso maquinário.`
  );
}

cron.schedule('0 3 * * 0', () => {
  try { db.limparRegistrosAntigos(); console.log('[Limpeza] Banco limpo com sucesso.'); }
  catch(e) { console.error('[Limpeza] Erro:', e.message); }
});

// Lojas sem NENHUM pedido/checkout: marcadas aqui (em memória) para pular as consultas
// à Nuvemshop nos próximos ciclos, revalidando de hora em hora. Evita o volume de 404
// "Last page is 0" que uma loja vazia geraria a cada 30 min. Reseta a cada deploy (re-sonda).
const lojasVazias = new Map(); // store_id -> timestamp (ms) da última confirmação de "vazia"
const LOJA_VAZIA_TTL_MS = 60 * 60 * 1000; // revalida de hora em hora

// Event-gating: o cron só consulta a Nuvemshop de lojas que tiveram um evento de
// pedido/checkout (via webhook) dentro desta janela. Lojas paradas não são consultadas
// → acaba o volume de LIST /orders vazios (404) que travava a homologação Partners.
const JANELA_ATIVIDADE_MS = (parseInt(process.env.JANELA_ATIVIDADE_DIAS || '21', 10) || 21) * 24 * 60 * 60 * 1000;

// Processa um ciclo de automações de UMA loja (bate na Nuvemshop). Extraído para ser
// reusado pelo cron E pelo webhook de pedidos (processamento imediato do evento).
// NÃO chama verificarEnviosAvulsos — isso é local e roda sempre, no laço do cron.
async function processarLojaCiclo(store) {
  const sid = store.store_id;
  // FREE (teste encerrado, sem plano) = sem disparos → nem consulta a Nuvemshop.
  if (!statusPlanoLoja(String(sid)).podeDisparar) return;

  // Loja confirmada vazia há menos de 1h: pula as consultas à Nuvemshop.
  const marcada = lojasVazias.get(sid);
  if (marcada && (Date.now() - marcada) < LOJA_VAZIA_TTL_MS) return;

  // ── Consolidação: busca os pedidos PAGOS uma única vez por ciclo ──
  // Alimenta 4 das automações (evita 4x /orders por loja).
  let pedidosPagos = [];
  try {
    pedidosPagos = await nuvemGet(sid, '/orders', {
      per_page: 200,
      payment_status: 'paid',
      fields: 'id,number,contact_name,contact_phone,status,shipping_status,shipping_tracking_number,created_at'
    });
  } catch(e) { console.error(`[Cron] Falha ao buscar pedidos pagos loja ${sid}:`, e.response?.data || e.message); }

  await verificarPagamentos(sid, pedidosPagos);
  const pendCount = await verificarBoletosPendentes(sid);          // consulta própria (pending)
  const checkoutCount = await verificarCarrinhosAbandonados(sid, pedidosPagos); // /checkouts + pagos reaproveitados
  await verificarPosEntrega(sid, pedidosPagos);
  await verificarPedidosParados(sid, pedidosPagos);

  // Só marca "vazia" se TODAS as contagens deram 0.
  if (pedidosPagos.length === 0 && pendCount === 0 && checkoutCount === 0) {
    if (!lojasVazias.has(sid)) console.log(`[Cron] Loja ${sid} sem pedidos/checkouts → pausando consultas por 1h.`);
    lojasVazias.set(sid, Date.now());
  } else {
    lojasVazias.delete(sid);
  }
}

cron.schedule('*/30 * * * *', async () => {
  console.log('[Cron] Iniciando verificação...');
  try {
    const stores = db.getAllStores();
    for (const store of stores) {
      const sid = store.store_id;
      // Envios avulsos são LOCAIS (Correios/SeuRastreio) — rodam sempre, não batem na Nuvemshop.
      await verificarEnviosAvulsos(sid);
      // Nuvemshop: só processa lojas com evento de pedido recente (event-gated pelo webhook).
      // Loja sem webhook recente = nada novo → não consulta a API (elimina os 404 de loja parada).
      if (!db.lojaComEventoRecente(sid, JANELA_ATIVIDADE_MS)) continue;
      await processarLojaCiclo(store);
    }
  } catch(e) { console.error('[Cron] Erro geral:', e.message); }
});

// Rastreios: 1x por dia às 18h (limite SeuRastreio 200/mês)
cron.schedule('0 18 * * *', async () => {
  console.log('[Cron Rastreios] Iniciando verificação diária 18h...');
  try {
    const stores = db.getAllStores();
    for (const store of stores) {
      await verificarRastreios(store.store_id);
    }
  } catch(e) { console.error('[Cron Rastreios] Erro geral:', e.message); }
});

function montarMensagemCarrinho(etapa, nome, link) {
  const msgs = {
    30: `Olá, ${nome}! 👋\n\nPercebemos que você deixou alguns itens no carrinho da nossa loja.\n\nAinda está interessado? Finalize sua compra aqui:\n🛒 ${link}\n\nQualquer dúvida é só chamar! 😊`,
    60: `Oi, ${nome}! Tudo bem? 😊\n\nNotamos que sua compra ainda não foi concluída. Teve algum problema no pagamento?\n\nEstamos aqui para ajudar! Responda essa mensagem ou finalize agora:\n🛒 ${link}`,
    1440: `${nome}, sua sacola ainda está te esperando! 🛍️\n\n⚠️ *Atenção:* Os itens no seu carrinho têm estoque limitado e podem esgotar a qualquer momento.\n\nNão deixe para depois — garanta o seu agora:\n🛒 ${link}`,
    2880: `${nome}, última chance! ⏰\n\nSua reserva expira em breve e os produtos do seu carrinho voltam para o estoque.\n\nFinalize sua compra antes que acabe:\n🛒 ${link}\n\n_Esta é a última notificação sobre este carrinho._`
  };
  return msgs[etapa] || null;
}

function montarMensagemBoleto(etapa, nome, numero, gateway) {
  const aviso = `\n\n_Se você já efetuou o pagamento por outros métodos, desconsidere esta mensagem._`;
  const msgs = {
    300: `Olá, ${nome}! 😊\n\nIdentificamos que seu pedido *#${numero}* ainda está aguardando pagamento.\n\nFinalize seu pagamento para garantir seu pedido!\n\nQualquer dúvida é só chamar. 💬${aviso}`,
    1440: `${nome}, seu pedido *#${numero}* ainda está pendente! ⏳\n\nTeve alguma dificuldade com o pagamento? Estamos aqui para ajudar!\n\nResponda essa mensagem se precisar de suporte. 😊${aviso}`,
    4320: `⚠️ ${nome}, *última chance!*\n\nSeu pedido *#${numero}* está prestes a ser cancelado por falta de pagamento.\n\nFinalize agora para não perder sua reserva!\n\nQualquer problema, é só falar. 💬${aviso}`
  };
  return msgs[etapa] || null;
}

// ── Verificar boletos/Pix/pedidos manuais não pagos ──────────────────────────
// CORREÇÃO: removido parâmetro 'fields' que causava erro 404 na Nuvemshop
// para pedidos manuais (sem gateway definido)
async function verificarBoletosPendentes(storeId) {
  try {
    const cfg = db.getConfig(storeId) || {};
    if (cfg.boleto_ativo === 0) { console.log(`[DIAG-PEND] loja ${storeId}: boleto_ativo=0 (desligado)`); return null; }
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 100,
      payment_status: 'pending'
    });
    console.log(`[DIAG-PEND] loja ${storeId}: ${Array.isArray(orders) ? orders.length : 'N/A'} pedidos com payment_status=pending`);

    const agora = Date.now();
    let puladoCancelado = 0, puladoCartao = 0, puladoSemTel = 0, puladoIdade = 0, puladoEtapa = 0, puladoJaEnviado = 0, enviados = 0;

    for (const o of orders) {
      if (o.status === 'cancelled') { puladoCancelado++; continue; }

      const gw = (o.gateway || '').toLowerCase();
      const ehCartao = gw.includes('credit') || gw.includes('credito') ||
                       gw.includes('debit')  || gw.includes('debito')  ||
                       gw.includes('card');
      if (ehCartao) { puladoCartao++; continue; }

      const telefone = formatTel(o.contact_phone);
      if (!telefone) { puladoSemTel++; continue; }

      const criadoEm = new Date(o.created_at).getTime();
      const minutos  = Math.floor((agora - criadoEm) / 60000);
      const id       = String(o.id);
      const nome     = o.contact_name || 'Cliente';

      if (minutos > 10080) { puladoIdade++; continue; } // teto: ignora pendente com mais de 7 dias

      let etapa = null;
      if (minutos >= 300  && minutos < 1440)  etapa = 300;   // 5h
      if (minutos >= 1440 && minutos < 4320)  etapa = 1440;  // 24h
      if (minutos >= 4320 && minutos < 10080) etapa = 4320;  // 72h
      if (!etapa) { puladoEtapa++; console.log(`[DIAG-PEND] #${o.number}: idade ${minutos}min, fora das etapas (precisa 300-10080)`); continue; }

      if (db.jaBoletoEnviado(id, etapa)) { puladoJaEnviado++; continue; }

      const metodoLabel = gw.includes('pix') ? 'PIX' : gw === '' ? 'link de pagamento' : 'boleto';
      const mensagem = getMensagemTemplate(storeId, 'boleto_pix_pendente', montarMensagemBoleto(etapa, nome, o.number, metodoLabel), { nome, numero: o.number, gateway: metodoLabel, etapa });
      if (!mensagem) continue;

      try {
        if (!await podEnviar(telefone, storeId)) continue;
        await sendWhatsApp(telefone, mensagem, storeId);
        db.marcarBoletoEnviado(id, storeId, etapa);
        db.registrarMensagem(telefone);
        enviados++;
        console.log(`[Boleto/Manual] Etapa ${etapa}min → ${nome} pedido #${o.number} (${metodoLabel || 'manual'})`);
        safeLogAutomacao({ store_id: storeId, tipo: 'pagamento_pendente', pedido: o.number, telefone, mensagem });
      } catch(e) {
        console.error(`[Boleto/Manual] Falha para #${o.number}:`, e.message);
        safeLogAutomacao({ store_id: storeId, tipo: 'pagamento_pendente', pedido: o.number, telefone, erro: e.message });
      }
      await new Promise(r => setTimeout(r, 500));
    }
    console.log(`[DIAG-PEND] loja ${storeId}: resumo → enviados=${enviados} | cancelado=${puladoCancelado} cartao=${puladoCartao} semTel=${puladoSemTel} idade+7d=${puladoIdade} foraEtapa=${puladoEtapa} jaEnviado=${puladoJaEnviado}`);
    return orders.length; // contagem de pendentes (0 = sem pedido pendente)
  } catch(e) {
    const msg = e.response?.data?.description || e.message || '';
    if (msg.includes('Last page is 0')) { console.log(`[DIAG-PEND] loja ${storeId}: Nuvemshop retornou 'Last page is 0' (query sem resultados)`); return 0; }
    console.error(`[Boleto] Erro loja ${storeId}:`, e.response?.data || e.message);
    return null; // erro real → desconhecido (não marca a loja como vazia)
  }
}

async function verificarCarrinhosAbandonados(storeId, pedidosPagos = null) {
  try {
    const cfg = db.getConfig(storeId) || {};
    if (cfg.carrinho_ativo === 0) return null;
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
      let etapa = null;
      if (minutos >= 30   && minutos < 90)   etapa = 30;
      if (minutos >= 60   && minutos < 120)  etapa = 60;
      if (minutos >= 1440 && minutos < 1500) etapa = 1440;
      if (minutos >= 2880 && minutos < 2940) etapa = 2880;
      if (!etapa) continue;
      if (db.jaCarrinhoEnviado(id, etapa)) continue;
      const mensagem = getMensagemTemplate(storeId, 'carrinho_abandonado', montarMensagemCarrinho(etapa, nome, link), { nome, link, etapa });
      if (!mensagem) continue;
      try {
        if (!await podEnviar(telefone, storeId)) continue;
        await sendWhatsApp(telefone, mensagem, storeId);
        db.marcarCarrinhoEnviado(id, storeId, etapa, telefone);
        db.registrarMensagem(telefone);
        console.log(`[Carrinho] Etapa ${etapa}min enviada para ${nome} — carrinho #${id}`);
        safeLogAutomacao({ store_id: storeId, tipo: 'carrinho_abandonado', pedido: id, telefone, mensagem });
      } catch(e) {
        console.error(`[Carrinho] Falha etapa ${etapa}min para #${id}:`, e.message);
        safeLogAutomacao({ store_id: storeId, tipo: 'carrinho_abandonado', pedido: id, telefone, erro: e.message });
      }
      await new Promise(r => setTimeout(r, 500));
    }
    try {
      // Reaproveita os pedidos pagos já buscados no ciclo (consolidação).
      // Se chamada isolada, busca só os campos que esta parte usa.
      const pagos = pedidosPagos || await nuvemGet(storeId, '/orders', {
        per_page: 100,
        payment_status: 'paid',
        fields: 'id,contact_phone,created_at'
      });
      for (const o of pagos) {
        const tel = formatTel(o.contact_phone);
        if (tel) db.marcarCarrinhoRecuperado(tel, storeId);
      }
    } catch(e) { /* silencioso */ }
    return Array.isArray(carrinhos) ? carrinhos.length : 0; // qtd de carrinhos abandonados
  } catch(e) {
    const msg = e.response?.data?.description || e.message || '';
    if (msg.includes('Last page is 0')) return 0;
    console.error(`[Carrinho] Erro loja ${storeId}:`, e.response?.data || e.message);
    return null; // erro real → desconhecido (não marca a loja como vazia)
  }
}

async function verificarPagamentos(storeId, pedidosPagos = null) {
  try {
    const cfg = db.getConfig(storeId) || {};
    if (cfg.pagamento_ativo === 0) return;
    const desdeMs = Date.now() - 2 * 60 * 60 * 1000;
    // Se a lista de pedidos pagos já foi buscada no ciclo (consolidação), reaproveita
    // e filtra as últimas 2h em memória — mantém a trava de só notificar pedidos recentes.
    // Se chamada isolada (botão "verificar agora"), busca como antes.
    const orders = pedidosPagos
      ? pedidosPagos.filter(o => new Date(o.created_at).getTime() >= desdeMs)
      : await nuvemGet(storeId, '/orders', {
          per_page: 50,
          payment_status: 'paid',
          created_at_min: new Date(desdeMs).toISOString()
        });
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      if (db.jaConfirmacaoEnviada(String(o.id))) continue;
      const telefone = formatTel(o.contact_phone);
      if (!telefone) continue;
      try {
        await sendWhatsApp(telefone, getMensagemTemplate(storeId, 'pagamento_confirmado', montarMensagemPagamento(o.contact_name || 'Cliente', o.number), { nome: o.contact_name || 'Cliente', numero: o.number }), storeId);
        db.marcarConfirmacaoEnviada(String(o.id), storeId);
        db.registrarClienteAtivo(telefone, storeId);
        console.log(`[Pagamento] WhatsApp enviado para pedido #${o.number}`);
        safeLogAutomacao({ store_id: storeId, tipo: 'pagamento_confirmado', pedido: o.number, telefone, mensagem: 'Confirmação de pagamento enviada.' });
      } catch(e) {
        console.error(`[Pagamento] Falha para #${o.number}:`, e.message);
        safeLogAutomacao({ store_id: storeId, tipo: 'pagamento_confirmado', pedido: o.number, telefone, erro: e.message });
      }
      await new Promise(r => setTimeout(r, 500));
    }
  } catch(e) {
    const msg = e.response?.data?.description || e.message || '';
    if (msg.includes('Last page is 0')) return;
    console.error(`[Pagamento] Erro loja ${storeId}:`, e.response?.data || e.message);
  }
}

// Limite de rastreios/mês por plano (1 rastreio = 1 código único no mês).
// free=50 (só visualização, SEM disparos), trial=50 (TODAS as funções, rastreio
// travado em 50 p/ não estourar a cota), basic=300, premium=1000, enterprise=ilimitado.
const RASTREIO_LIMITES = { free: 50, trial: 50, basic: 200, premium: 500, enterprise: 1000000 };
const TRIAL_DIAS = 7;

// Estado do plano da loja. Trial = 7 dias após instalar (tokens.created_at), com TODAS
// as funções liberadas. Fora do trial e sem pagar = free (só visualização, sem disparos).
function statusPlanoLoja(storeId) {
  const lic = db.getLicencaPorStore ? db.getLicencaPorStore(storeId) : null;
  const pago = !!(lic && lic.plano && (lic.status ? lic.status === 'ativa' : true) && (!lic.expira_em || new Date(lic.expira_em) > new Date()));
  let emTrial = false;
  if (!pago) {
    try {
      const tok = db.getToken ? db.getToken(storeId) : null;
      if (tok && tok.created_at) {
        const inicio = Date.parse(String(tok.created_at).replace(' ', 'T') + 'Z');
        emTrial = !isNaN(inicio) && (Date.now() - inicio) < TRIAL_DIAS * 86400000;
      }
    } catch (e) {}
  }
  const plano = pago ? String(lic.plano).toLowerCase() : (emTrial ? 'trial' : 'free');
  return { pago, emTrial, plano, podeDisparar: pago || emTrial };
}
function getLimiteRastreio(storeId) {
  const { plano } = statusPlanoLoja(storeId);
  return RASTREIO_LIMITES[plano] != null ? RASTREIO_LIMITES[plano] : 50;
}

async function verificarRastreios(storeId) {
  try {
    const cfg = db.getConfig(storeId) || {};
    if (cfg.rastreio_ativo === 0) return;
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 200,
      payment_status: 'paid',
      fields: 'id,number,contact_name,contact_phone,shipping_status,shipping_tracking_number,shipping_option,created_at'
    });
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const rastreio = o.shipping_tracking_number?.trim();
      if (!rastreio) continue;
      const telefone = formatTel(o.contact_phone);
      if (!telefone) continue;
      // Aceita Correios (AA000000000BR) E códigos de TRANSPORTADORA (Jadlog/Loggi/etc.).
      // Antes o filtro só deixava passar o formato dos Correios — por isso pedidos de
      // transportadora nunca eram rastreados nem recebiam mensagem. O agregador
      // Seu|Rastreio resolve a transportadora pelo próprio código.
      const rastreioLimpo = String(rastreio).replace(/\s+/g, '');
      const ehCorreios = /^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(rastreioLimpo);
      // Código de transportadora: alfanumérico, 8-40, com ao menos um dígito (evita
      // registrar textos que a loja às vezes digita no campo, ex.: "aguardando").
      const ehCodigoValido = ehCorreios || (/^[A-Za-z0-9-]{8,40}$/.test(rastreioLimpo) && /\d/.test(rastreioLimpo));
      if (!ehCodigoValido) continue;
      const transp = nomeTransportadora(o.shipping_option, rastreio);
      // Limite de rastreios do plano: só bloqueia CÓDIGO NOVO acima do limite (os já rastreados no mês continuam).
      if (!db.usoRastreioJaContado(storeId, rastreio)) {
        if (db.contarUsoRastreio(storeId) >= getLimiteRastreio(storeId)) continue; // plano no limite → não inicia rastreio novo
        db.registrarUsoRastreio(storeId, rastreio);
      }
      // Registra contexto (código → loja/pedido/telefone) para o webhook do Seu|Rastreio conseguir enviar.
      try { db.salvarRastreioContexto(rastreio, storeId, o.number, o.contact_name, telefone, transp); } catch(e) {}
      if (db.statusRastreio(rastreio) === 'entregue') continue;
      // Modelo recomendado pelo Seu Rastreio: registra o código 1x na API e deixa o webhook cuidar do resto.
      // Só (re)consulta se: nunca foi registrado (1ª vez) OU rede de segurança (>3 dias sem nenhum evento).
      const infoRast = db.getRastreioInfo ? db.getRastreioInfo(rastreio) : null;
      let precisaConsultar = !infoRast;
      if (infoRast && infoRast.atualizado_em) {
        const diasSemEvento = (Date.now() - new Date(infoRast.atualizado_em).getTime()) / (24 * 60 * 60 * 1000);
        if (diasSemEvento > 3) precisaConsultar = true; // fallback: webhook pode ter falhado
      }
      if (!precisaConsultar) continue; // já registrado e com eventos recentes → o webhook é a fonte
      if (db.foiRastreioConsultadoHoje(rastreio)) continue; // respeita o limite de requisições (1/s → 1x/dia por código)
      await new Promise(r => setTimeout(r, 2000)); // espaçamento entre requests (bem abaixo de 1/s)
      const evento = await consultarCorreios(rastreio);
      if (!evento) continue;
      const statusAnterior = db.statusRastreio(rastreio);
      const statusNovo = evento.entregue ? 'entregue' : evento.descricao;
      if (statusNovo && statusNovo !== statusAnterior) {
        console.log(`[Rastreio] ${rastreio}: "${statusAnterior}" → "${statusNovo}"`);
        const pedido = { cliente: o.contact_name, numero: o.number, rastreio, transportadora: transp };
        try {
          if (!await podEnviar(telefone, storeId)) continue;
          await sendWhatsApp(telefone, getMensagemTemplate(storeId, getRastreioTemplateKey(evento), montarMensagemRastreio(pedido, evento), { nome: o.contact_name || 'Cliente', numero: o.number, codigo: rastreio, link: linkRastreio(rastreio, transp), transportadora: transp, status: evento.descricao || evento.status || '', data: evento.data || '', hora: evento.hora || '' }), storeId);
          db.registrarMensagem(telefone);
          db.registrarClienteAtivo(telefone, storeId);
          console.log(`[Rastreio] WhatsApp enviado para #${o.number}`);
          safeLogAutomacao({ store_id: storeId, tipo: 'rastreio', pedido: o.number, telefone, mensagem: evento.descricao || evento.status || 'Atualização de rastreio enviada.' });
          if (evento.entregue && !db.jaSatisfacaoEnviada(String(o.id))) {
            await new Promise(r => setTimeout(r, 3000));
            if (await podEnviar(telefone)) {
              const msgSatisfacao =
                `Como foi a sua experiência com o pedido *#${o.number}*, ${o.contact_name || 'Cliente'}? 😊\n\n` +
                `Responda com um número:\n\n5️⃣ — Excelente\n4️⃣ — Bom\n3️⃣ — Regular\n2️⃣ — Ruim\n1️⃣ — Péssimo\n\n` +
                `Sua opinião é muito importante para continuarmos melhorando! 🙏`;
              await sendWhatsApp(telefone, getMensagemTemplate(storeId, 'pesquisa_satisfacao', msgSatisfacao, { nome: o.contact_name || 'Cliente', numero: o.number }), storeId);
              db.marcarSatisfacaoEnviada(String(o.id), storeId);
              db.registrarMensagem(telefone);
              console.log(`[Satisfação] Pesquisa enviada para #${o.number}`);
              safeLogAutomacao({ store_id: storeId, tipo: 'pesquisa_satisfacao', pedido: o.number, telefone, mensagem: 'Pesquisa de satisfação enviada.' });
            }
          }
        } catch(e) { console.error(`[Rastreio] Falha para #${o.number}:`, e.message); }
        db.atualizarStatusRastreio(rastreio, statusNovo, evento.data + ' ' + evento.hora);
      } else if (!statusAnterior) {
        db.atualizarStatusRastreio(rastreio, statusNovo || 'postado', evento.data + ' ' + evento.hora);
      }
      await new Promise(r => setTimeout(r, 7000));
    }
  } catch(e) { console.error(`[Rastreio] Erro loja ${storeId}:`, e.response?.data || e.message); }
}

app.get('/auth/install', (req, res) => {
  const { store_id, session_code } = req.query;
  const state = session_code ? `ext_${session_code}` : (store_id || 'manual');
  if (session_code) { try { db.upsertAuthSession(session_code, 'pending'); } catch(e) {} }
  res.redirect(`https://www.nuvemshop.com.br/apps/${NUVEM_CLIENT_ID}/authorize?state=${state}`);
});

// ── Meta CAPI: rastreia a INSTALAÇÃO real (server-side) quando a loja conecta. ──
// A conversão de verdade acontece fora do site (OAuth), então o pixel do browser
// não a enxerga; aqui mandamos o evento direto pro Meta. Requer META_CAPI_TOKEN no Railway.
const META_PIXEL_ID = process.env.META_PIXEL_ID || '2038947806731470';
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN || '';
async function dispararCapiInstalacao(req, storeId) {
  if (!META_CAPI_TOKEN) return; // sem token → no-op (não quebra o fluxo)
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    const payload = { data: [{
      event_name: 'CompleteRegistration',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: 'https://loggzap.com.br',
      event_id: 'install_' + String(storeId), // dedup
      user_data: {
        client_ip_address: ip,
        client_user_agent: ua,
        external_id: crypto.createHash('sha256').update(String(storeId)).digest('hex')
      },
      custom_data: { content_name: 'Instalacao LoggZap', store_id: String(storeId) }
    }]};
    await axios.post(`https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(META_CAPI_TOKEN)}`, payload, { timeout: 8000 });
    console.log('[CAPI] Instalação enviada ao Meta (loja ' + storeId + ')');
  } catch (e) {
    console.error('[CAPI] falha:', e.response?.data?.error?.message || e.message);
  }
}

// Diagnóstico do CAPI: confirma se o token está neste serviço e se o Meta aceita o evento.
app.get('/admin-loggzap/api/testar-capi', auth, async (req, res) => {
  if (!META_CAPI_TOKEN) return res.json({ ok: false, capiTokenConfigurado: false, msg: 'META_CAPI_TOKEN NAO esta setado neste servico (rastreiobot).' });
  try {
    const payload = { data: [{
      event_name: 'CompleteRegistration',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: 'https://loggzap.com.br',
      event_id: 'capi_test_' + Date.now(),
      user_data: {
        client_ip_address: '8.8.8.8',
        client_user_agent: 'LoggZapCapiTest/1.0',
        external_id: crypto.createHash('sha256').update('teste-capi').digest('hex')
      },
      custom_data: { content_name: 'Teste CAPI LoggZap' }
    }] };
    if (req.query.test_code) payload.test_event_code = req.query.test_code;
    const r = await axios.post(`https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(META_CAPI_TOKEN)}`, payload, { timeout: 10000 });
    res.json({ ok: true, capiTokenConfigurado: true, pixel: META_PIXEL_ID, metaResposta: r.data });
  } catch (e) {
    res.json({ ok: false, capiTokenConfigurado: true, erroMeta: e.response?.data?.error || e.message });
  }
});

app.get('/auth/callback', async (req, res) => {
  const { code, state: storeId } = req.query;
  if (!code) return res.status(400).send('Código OAuth ausente.');
  try {
    const { data } = await axios.post('https://www.nuvemshop.com.br/apps/authorize/token', {
      client_id: NUVEM_CLIENT_ID, client_secret: NUVEM_CLIENT_SECRET, grant_type: 'authorization_code', code
    }, { headers: { 'Content-Type': 'application/json' } });
    const rawState = String(storeId || '');
    const sessionCode = rawState.startsWith('ext_') ? rawState.slice(4) : null;
    const sid = String(data.user_id || (sessionCode ? '' : storeId));
    if (sid) db.saveToken(sid, data.access_token);
    // Registra os webhooks de pedido/checkout desta loja (não bloqueia a resposta ao lojista).
    if (sid) registrarWebhooksNuvem(sid).catch(e => console.error('[Webhooks] install erro:', e.message));
    // Rastreia a instalação no Meta (CAPI server-side) — conversão real do anúncio.
    if (sid) dispararCapiInstalacao(req, sid).catch(() => {});
    if (sessionCode) {
      const realSid = String(data.user_id || sid);
      if (realSid) db.saveToken(realSid, data.access_token);
      try { db.completeAuthSession(sessionCode, realSid); } catch(e) {}
    }
    const isExt = !!sessionCode;
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>*{font-family:sans-serif;text-align:center;}body{background:#0d0d10;color:#fff;padding:3rem;}
    h2{color:#00d084;}code{background:#1e1e25;padding:4px 10px;border-radius:6px;font-size:18px;color:#00d084;}</style></head>
    <body><h2>✅ LoggZap conectado!</h2><p>Loja autenticada com sucesso.</p>
    <p style="margin-top:1.5rem;">Seu <strong>Store ID</strong>:</p><code>${sid}</code>
    ${isExt ? '<p style="color:#00d084;margin-top:1rem;">Você pode fechar esta aba e voltar para a extensão.</p>' : '<p style="color:#888;margin-top:1.5rem;">Cole esse ID nas configurações da extensão.</p>'}
    </body></html>`);
  } catch(e) {
    console.error('OAuth erro:', e.response?.data || e.message);
    res.status(500).send('Erro na autenticação. Tente novamente.');
  }
});

app.get('/pedidos/:storeId', auth, async (req, res) => {
  const { storeId } = req.params;
  const prazo = parseInt(req.query.prazo || '3');
  const incluirNotificados = req.query.incluir_notificados === 'true';
  try {
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 200, payment_status: 'paid',
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
      const satisfacaoEnviada = db.jaSatisfacaoEnviada ? db.jaSatisfacaoEnviada(String(o.id)) : false;
      const recebidoPorRastreio = !!(statusRastreio && String(statusRastreio).toLowerCase().includes('entreg'));
      const recebidoPorLog = db.jaPedidoRecebido
        ? db.jaPedidoRecebido(String(o.id), storeId, o.number, o.shipping_tracking_number || '')
        : false;
      const recebido = !!(satisfacaoEnviada || recebidoPorRastreio || recebidoPorLog);
      resultado.push({
        order_id: String(o.id), numero: o.number, cliente: o.contact_name || '',
        telefone: tel, rastreio: o.shipping_tracking_number || '',
        transportadora: o.shipping_option || '',
        status: foiEnviado ? 'shipped' : (o.shipping_status || 'pending'),
        statusRastreio, recebido, satisfacao_enviada: satisfacaoEnviada,
        recebido_por_rastreio: recebidoPorRastreio, recebido_por_log: recebidoPorLog,
        diasUteis, statusPrazo, ja_notificado: jaEnviado, created_at: o.created_at
      });
    }
    resultado.sort((a, b) => {
      const p = x => x.recebido ? 4 : x.statusPrazo === 'atrasado' ? 0 : x.statusPrazo === 'hoje' ? 1 : x.status === 'shipped' ? 2 : 3;
      return p(a) - p(b);
    });
    res.json({ success: true, total: resultado.length, pedidos: resultado });
  } catch(e) {
    console.error('Erro /pedidos:', e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/notificado', auth, (req, res) => {
  const { order_id, store_id, rastreio, telefone } = req.body;
  if (!order_id || !store_id) return res.status(400).json({ error: 'order_id e store_id obrigatórios.' });
  db.marcarNotificado(order_id, store_id, rastreio, telefone);
  res.json({ success: true });
});

app.get('/admin/clientes', auth, (req, res) => {
  const clientes = db.listarInstancias();
  const stores   = db.getAllStores();
  res.json({ success: true, total: clientes.length, clientes, stores });
});

app.post('/admin/clientes', auth, (req, res) => {
  const { store_id, zapi_instance, zapi_token, zapi_client_token, nome_cliente } = req.body;
  if (!store_id || !zapi_instance || !zapi_token || !zapi_client_token)
    return res.status(400).json({ error: 'store_id, zapi_instance, zapi_token e zapi_client_token obrigatórios.' });
  db.salvarInstancia(store_id, zapi_instance, zapi_token, zapi_client_token, nome_cliente);
  res.json({ success: true, message: `Cliente ${nome_cliente || store_id} cadastrado.` });
});

app.delete('/admin/clientes/:storeId', auth, (req, res) => {
  const { storeId } = req.params;
  res.json({ success: true, message: `Cliente ${storeId} removido.` });
});

// ── Diagnóstico temporário — ver telefones em notificados ────────────────────
app.get('/diag/notificados', auth, (req, res) => {
  try {
    const rows = db.listarNotificadosRecentes();
    res.json({ total: rows.length, rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Verificar se telefone já é cliente ativo (consultado pelo Movatak) ────────
app.get('/cliente-ativo/:telefone', async (req, res) => {
  try {
    const tel = String(req.params.telefone).replace(/\D/g, '');
    if (!tel || tel.length < 10) return res.json({ ativo: false });
    const telVariants = [tel, '55' + tel, tel.replace(/^55/, '')];
    const ativo = db.jaClienteAtivo(tel);
    res.json({ ativo, telefone: tel });
  } catch(e) {
    res.json({ ativo: false });
  }
});

app.get('/rastreio-publico', async (req, res) => {
  const { codigo } = req.query;
  if (!codigo) return res.status(400).json({ success: false, error: 'Código obrigatório.' });
  const evento = await consultarCorreios(codigo);
  if (!evento) return res.json({ success: false, error: 'Não encontrado.' });
  res.json({ success: true, evento });
});




// ── Conectores Financeiros — Mercado Pago ───────────────────────────────────
const MP_CLIENT_ID = process.env.MP_CLIENT_ID || '';
const MP_CLIENT_SECRET = process.env.MP_CLIENT_SECRET || '';
const MP_REDIRECT_URI = process.env.MP_REDIRECT_URI || 'https://cliente.loggzap.com.br/mercadopago/callback';

function mpMonthRange(query = {}) {
  const now = new Date();
  const y = Number(query.ano || now.getFullYear());
  const m = Number(query.mes || (now.getMonth() + 1));
  const inicio = query.inicio ? new Date(String(query.inicio)) : new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const fim = query.fim ? new Date(String(query.fim)) : new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return {
    inicio,
    fim,
    inicioISO: inicio.toISOString(),
    fimISO: fim.toISOString(),
    inicioDate: inicio.toISOString().slice(0, 10),
    fimDate: fim.toISOString().slice(0, 10)
  };
}

function mpAuthUrl(storeId) {
  if (!MP_CLIENT_ID) throw new Error('MP_CLIENT_ID não configurado no backend.');
  const state = `mp_${String(storeId)}_${crypto.randomBytes(8).toString('hex')}`;
  db.criarFinanceiroState(state, String(storeId));
  const u = new URL('https://auth.mercadopago.com.br/authorization');
  u.searchParams.set('client_id', MP_CLIENT_ID);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('platform_id', 'mp');
  u.searchParams.set('state', state);
  u.searchParams.set('redirect_uri', MP_REDIRECT_URI);
  return u.toString();
}

async function mpTrocarToken(body) {
  if (!MP_CLIENT_ID || !MP_CLIENT_SECRET) throw new Error('Credenciais do Mercado Pago não configuradas no backend.');
  const res = await axios.post('https://api.mercadopago.com/oauth/token', body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 20000
  });
  return res.data;
}

async function mpGarantirToken(storeId) {
  const conn = db.getMercadoPagoConexao(storeId);
  if (!conn || conn.status !== 'conectado' || !conn.access_token) throw new Error('Mercado Pago não conectado para esta loja.');

  const expiresAt = Number(conn.expires_at || 0);
  const precisaRenovar = conn.refresh_token && expiresAt && (Date.now() > (expiresAt - (1000 * 60 * 60 * 24 * 7)));

  if (!precisaRenovar) return conn.access_token;

  const data = await mpTrocarToken({
    grant_type: 'refresh_token',
    client_id: MP_CLIENT_ID,
    client_secret: MP_CLIENT_SECRET,
    refresh_token: conn.refresh_token
  });

  const atualizado = db.salvarMercadoPagoConexao(storeId, {
    mp_user_id: data.user_id || conn.mp_user_id,
    access_token: data.access_token,
    refresh_token: data.refresh_token || conn.refresh_token,
    expires_at: Date.now() + (Number(data.expires_in || 0) * 1000),
    scope: data.scope || conn.scope
  });

  return atualizado.access_token;
}


function classificarMovimentacaoMercadoPago(descricao, pagamento = {}) {
  const texto = [
    descricao,
    pagamento.description,
    pagamento.statement_descriptor,
    pagamento.external_reference,
    pagamento.additional_info?.items?.map(i => i?.title).join(' '),
    pagamento.point_of_interaction?.transaction_data?.transaction_id,
    pagamento.metadata ? JSON.stringify(pagamento.metadata) : ''
  ].filter(Boolean).join(' ').toLowerCase();

  const regrasSaida = [
    { categoria: 'frete_nuvem_envio', termos: ['crédito nuvem envio', 'credito nuvem envio', 'nuvem envio'] },
    { categoria: 'transporte_uber', termos: ['uber', 'uber trip', 'uber *', 'uber do brasil'] },
    { categoria: 'compra_insumos', termos: ['soprador', 'pistola', 'vonder', 'ferramenta', 'ferramentas', 'insumo', 'insumos', 'suprimento', 'suprimentos'] },
    { categoria: 'compra_fornecedor', termos: ['mercado livre', 'amazon', 'shopee', 'aliexpress', 'magazine luiza', 'kabum', 'kalunga'] }
  ];

  for (const regra of regrasSaida) {
    if (regra.termos.some(t => texto.includes(t))) {
      return {
        tipo: 'saida',
        categoria: regra.categoria,
        motivo: `Classificado como saída pela regra: ${regra.categoria}.`
      };
    }
  }

  const op = String(pagamento.operation_type || '').toLowerCase();
  const statusDetail = String(pagamento.status_detail || '').toLowerCase();

  // Regra conservadora: só considera entrada quando não bateu em regras de saída.
  // A API de pagamentos é incompleta para extrato real; compras feitas pela conta podem aparecer como pagamentos aprovados.
  return {
    tipo: 'entrada',
    categoria: 'pagamento_aprovado',
    motivo: `Classificado como entrada padrão. operation_type=${op || 'n/a'} status_detail=${statusDetail || 'n/a'}.`
  };
}


async function mpSyncPagamentos(storeId, range) {
  const token = await mpGarantirToken(storeId);
  const url = new URL('https://api.mercadopago.com/v1/payments/search');
  url.searchParams.set('sort', 'date_created');
  url.searchParams.set('criteria', 'desc');
  url.searchParams.set('range', 'date_created');
  url.searchParams.set('begin_date', range.inicioISO);
  url.searchParams.set('end_date', range.fimISO);
  url.searchParams.set('limit', '100');

  const res = await axios.get(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 25000
  });

  const results = res.data?.results || [];
  for (const p of results) {
    const paymentId = String(p.id || p.payment_id || '');
    if (!paymentId) continue;

    const status = String(p.status || '').toLowerCase();
    const data = p.date_approved || p.date_created || p.money_release_date || new Date().toISOString();
    const descricao = p.description || p.statement_descriptor || `Pagamento ${paymentId}`;
    const valorBruto = Number(p.transaction_amount || 0);
    const estornado = Number(p.transaction_amount_refunded || 0);

    const classificacao = classificarMovimentacaoMercadoPago(descricao, p);

    if (status === 'approved' && valorBruto > 0) {
      db.salvarMovimentacaoFinanceira({
        store_id: storeId,
        conector: 'mercado_pago',
        origem_id: paymentId,
        data,
        descricao,
        tipo: classificacao.tipo,
        valor: valorBruto,
        categoria: classificacao.categoria,
        raw_json: {
          ...p,
          classificacao_loggzap: classificacao.motivo
        }
      });
    }

    const taxas = Array.isArray(p.fee_details)
      ? p.fee_details.reduce((acc, f) => acc + Math.abs(Number(f.amount || 0)), 0)
      : 0;

    if (taxas > 0) {
      db.salvarMovimentacaoFinanceira({
        store_id: storeId,
        conector: 'mercado_pago',
        origem_id: `${paymentId}:fees`,
        data,
        descricao: `Taxas Mercado Pago — ${descricao}`,
        tipo: 'taxa',
        valor: taxas,
        categoria: 'taxas',
        raw_json: { payment_id: paymentId, fee_details: p.fee_details || [] }
      });
    }

    if (estornado > 0 || status === 'refunded') {
      db.salvarMovimentacaoFinanceira({
        store_id: storeId,
        conector: 'mercado_pago',
        origem_id: `${paymentId}:refund`,
        data,
        descricao: `Estorno/Reembolso — ${descricao}`,
        tipo: 'estorno',
        valor: estornado || valorBruto,
        categoria: 'estornos',
        raw_json: p
      });
    }
  }

  return { total_importados: results.length };
}


function csvSplitLine(line, sep = ';') {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === sep && !inQ) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(v => String(v || '').trim());
}

function parseCsvMercadoPago(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].split(';').length >= lines[0].split(',').length) ? ';' : ',';
  const headers = csvSplitLine(lines[0], sep).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = csvSplitLine(line, sep);
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] ?? '');
    return obj;
  });
}

function getCampoMp(row, nomes) {
  for (const n of nomes) {
    if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return row[n];
  }
  const keys = Object.keys(row);
  for (const n of nomes) {
    const found = keys.find(k => k.toLowerCase() === String(n).toLowerCase());
    if (found && String(row[found] || '').trim() !== '') return row[found];
  }
  return '';
}

function numMp(v) {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  // Suporta "1.234,56" e "1234.56".
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function classificarLinhaSettlement(row) {
  const tipoTransacao = String(getCampoMp(row, ['TRANSACTION_TYPE', 'Transaction type', 'TIPO_DE_TRANSACAO', 'Tipo de transação'])).toUpperCase();
  const metodo = String(getCampoMp(row, ['PAYMENT_METHOD_TYPE', 'PAYMENT_METHOD', 'Payment method', 'MEIO_DE_PAGAMENTO']));
  const source = String(getCampoMp(row, ['SOURCE_ID', 'Source ID', 'SOURCE']));
  const ext = String(getCampoMp(row, ['EXTERNAL_REFERENCE', 'External reference', 'REFERENCIA_EXTERNA']));
  const meta = String(getCampoMp(row, ['METADATA', 'Metadata', 'DESCRIPTION', 'DESCRICAO', 'Descrição']));
  const descricaoBase = [tipoTransacao, metodo, source, ext, meta].filter(Boolean).join(' • ');

  const transactionAmount = numMp(getCampoMp(row, ['TRANSACTION_AMOUNT', 'Transaction amount']));
  const netAmount = numMp(getCampoMp(row, ['SETTLEMENT_NET_AMOUNT', 'REAL_AMOUNT', 'Settlement net amount']));
  const feeAmount = numMp(getCampoMp(row, ['FEE_AMOUNT', 'MKP_FEE_AMOUNT', 'FINANCING_FEE_AMOUNT', 'TAXES_AMOUNT', 'SHIPPING_FEE_AMOUNT']));

  let tipo = 'entrada';
  let valor = Math.abs(netAmount || transactionAmount || 0);
  let categoria = 'extrato_mercado_pago';

  const text = descricaoBase.toLowerCase();

  if (
    tipoTransacao.includes('WITHDRAW') ||
    tipoTransacao.includes('PAYOUT') ||
    tipoTransacao.includes('TRANSFER') ||
    tipoTransacao.includes('DEBIT') ||
    tipoTransacao.includes('PAYMENT') && transactionAmount < 0 ||
    netAmount < 0 ||
    text.includes('pix enviado') ||
    text.includes('transferência enviada') ||
    text.includes('transferencia enviada') ||
    text.includes('pagamento com qr pix') ||
    text.includes('mercado livre') ||
    text.includes('uber') ||
    text.includes('canva') ||
    text.includes('nuvem envio')
  ) {
    tipo = 'saida';
    categoria = 'saida_extrato_mp';
    valor = Math.abs(netAmount || transactionAmount || 0);
  }

  if (tipoTransacao.includes('REFUND') || tipoTransacao.includes('CHARGEBACK')) {
    tipo = 'estorno';
    categoria = 'estorno_extrato_mp';
  }

  if (tipoTransacao.includes('FEE') || feeAmount < 0) {
    tipo = 'taxa';
    categoria = 'taxa_extrato_mp';
    valor = Math.abs(feeAmount || netAmount || transactionAmount || 0);
  }

  if (tipoTransacao.includes('SETTLEMENT') && netAmount > 0 && !text.includes('nuvem envio')) {
    tipo = 'entrada';
    categoria = 'entrada_extrato_mp';
    valor = Math.abs(netAmount || transactionAmount || 0);
  }

  const data = getCampoMp(row, ['TRANSACTION_DATE', 'SETTLEMENT_DATE', 'DATE', 'Data', 'DATA']) || new Date().toISOString();
  const origem = getCampoMp(row, ['SOURCE_ID', 'ORDER_ID', 'EXTERNAL_REFERENCE']) || require('crypto').createHash('md5').update(JSON.stringify(row)).digest('hex');

  return {
    origem_id: `settlement:${origem}:${tipo}`,
    data,
    descricao: descricaoBase || `Movimentação Mercado Pago ${origem}`,
    tipo,
    valor,
    categoria,
    raw_json: row
  };
}

async function mpConfigurarSettlementReport(storeId) {
  const token = await mpGarantirToken(storeId);
  const conn = db.getMercadoPagoConexao(storeId);
  const prefix = `loggzap-settlement-${String(conn?.mp_user_id || storeId)}`;

  const payload = {
    file_name_prefix: prefix,
    show_fee_prevision: true,
    show_chargeback_cancel: true,
    coupon_detailed: true,
    include_withdraw: true,
    shipping_detail: true,
    refund_detailed: true,
    display_timezone: 'GMT-03',
    header_language: 'en',
    separator: ';',
    frequency: { hour: 0, type: 'monthly', value: 1 },
    columns: [
      { key: 'TRANSACTION_DATE' },
      { key: 'SOURCE_ID' },
      { key: 'EXTERNAL_REFERENCE' },
      { key: 'PAYMENT_METHOD_TYPE' },
      { key: 'PAYMENT_METHOD' },
      { key: 'TRANSACTION_TYPE' },
      { key: 'TRANSACTION_AMOUNT' },
      { key: 'FEE_AMOUNT' },
      { key: 'SETTLEMENT_NET_AMOUNT' },
      { key: 'REAL_AMOUNT' },
      { key: 'SHIPPING_FEE_AMOUNT' },
      { key: 'TAXES_AMOUNT' },
      { key: 'ORDER_ID' },
      { key: 'SHIPPING_ID' },
      { key: 'METADATA' }
    ]
  };

  try {
    await axios.get('https://api.mercadopago.com/v1/account/settlement_report/config', {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
      timeout: 20000
    });
    const res = await axios.put('https://api.mercadopago.com/v1/account/settlement_report/config', payload, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 20000
    });
    return { configured: true, method: 'update', data: res.data };
  } catch(e) {
    const res = await axios.post('https://api.mercadopago.com/v1/account/settlement_report/config', payload, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 20000
    });
    return { configured: true, method: 'create', data: res.data };
  }
}

async function mpGerarSettlementReport(storeId, range) {
  const token = await mpGarantirToken(storeId);
  await mpConfigurarSettlementReport(storeId);
  const res = await axios.post('https://api.mercadopago.com/v1/account/settlement_report', {
    begin_date: range.inicioISO,
    end_date: range.fimISO
  }, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json', 'Content-Type': 'application/json' },
    timeout: 25000
  });

  const saved = db.salvarRelatorioMercadoPago(storeId, res.data);
  return { task: res.data, saved };
}

async function mpListarSettlementReports(storeId) {
  const token = await mpGarantirToken(storeId);
  const res = await axios.get('https://api.mercadopago.com/v1/account/settlement_report/list', {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    timeout: 25000
  });

  const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
  for (const r of list) db.salvarRelatorioMercadoPago(storeId, r);
  return list;
}

async function mpImportarSettlementReport(storeId, fileName) {
  if (!fileName) throw new Error('file_name obrigatório para importar relatório.');
  const token = await mpGarantirToken(storeId);
  const res = await axios.get(`https://api.mercadopago.com/v1/account/settlement_report/${encodeURIComponent(fileName)}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 45000,
    responseType: 'text',
    transformResponse: [d => d]
  });

  const rows = parseCsvMercadoPago(res.data);
  let importadas = 0;
  for (const row of rows) {
    const mov = classificarLinhaSettlement(row);
    if (!mov.valor) continue;
    db.salvarMovimentacaoFinanceira({
      store_id: storeId,
      conector: 'mercado_pago',
      origem_id: mov.origem_id,
      data: mov.data,
      descricao: mov.descricao,
      tipo: mov.tipo,
      valor: mov.valor,
      categoria: mov.categoria,
      raw_json: mov.raw_json
    });
    importadas++;
  }

  const relatorios = db.listarRelatoriosMercadoPago(storeId, 50);
  const rel = relatorios.find(r => r.file_name === fileName);
  if (rel) db.marcarRelatorioMercadoPagoImportado(storeId, rel.report_id, fileName);

  return { file_name: fileName, linhas: rows.length, importadas };
}


function handleMercadoPagoConnect(req, res) {
  try {
    const url = mpAuthUrl(req.params.storeId);
    return res.redirect(url);
  } catch(e) {
    return res.status(500).send(`Erro ao iniciar conexão Mercado Pago: ${e.message}`);
  }
}

app.get('/mercadopago/connect/:storeId', auth, handleMercadoPagoConnect);
app.get('/api/mercadopago/connect/:storeId', auth, handleMercadoPagoConnect);
app.get('/financeiro/mercadopago/connect/:storeId', auth, handleMercadoPagoConnect);
app.get('/financeiro/mercadopago/connect-url/:storeId', auth, (req, res) => {
  try {
    const url = mpAuthUrl(req.params.storeId);
    res.json({ success: true, url });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/mercadopago/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) return res.status(400).send(`Mercado Pago retornou erro: ${error_description || error}`);
  if (!code || !state) return res.status(400).send('Callback inválido: code/state ausente.');

  try {
    const st = db.getFinanceiroState(String(state));
    if (!st) return res.status(400).send('Sessão de conexão expirada ou inválida. Volte à extensão e tente novamente.');

    const data = await mpTrocarToken({
      grant_type: 'authorization_code',
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      code: String(code),
      redirect_uri: MP_REDIRECT_URI
    });

    db.salvarMercadoPagoConexao(st.store_id, {
      mp_user_id: data.user_id,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in || 0) * 1000),
      scope: data.scope
    });
    db.deleteFinanceiroState(String(state));

    res.send(`
      <html><body style="font-family:Arial;background:#0d0d10;color:#fff;padding:32px">
        <h2>Mercado Pago conectado com sucesso ✅</h2>
        <p>Você já pode voltar para a extensão LoggZap e atualizar a aba Conectores financeiros.</p>
      </body></html>
    `);
  } catch(e) {
    console.error('[Mercado Pago callback]', e.response?.data || e.message);
    res.status(500).send(`Erro ao conectar Mercado Pago: ${e.response?.data?.message || e.message}`);
  }
});

app.get('/financeiro/status/:storeId', auth, (req, res) => {
  const conn = db.getMercadoPagoConexao(req.params.storeId);
  res.json({
    success: true,
    conector: conn?.conector || 'mercado_pago',
    conectado: !!(conn && conn.status === 'conectado' && conn.access_token),
    status: conn?.status || 'desconectado',
    mp_user_id: conn?.mp_user_id || null,
    teto_saidas: Number(conn?.teto_saidas || 0),
    updated_at: conn?.updated_at || null,
    connect_url: `/mercadopago/connect/${encodeURIComponent(req.params.storeId)}`
  });
});

app.post('/financeiro/teto-saidas', auth, (req, res) => {
  const { store_id, teto } = req.body || {};
  if (!store_id) return res.status(400).json({ error: 'store_id obrigatório.' });
  const conn = db.salvarTetoSaidas(store_id, Number(teto || 0));
  res.json({ success: true, teto_saidas: Number(conn?.teto_saidas || 0) });
});

app.post('/financeiro/mercadopago/desconectar', auth, (req, res) => {
  const { store_id } = req.body || {};
  if (!store_id) return res.status(400).json({ error: 'store_id obrigatório.' });
  const conn = db.desconectarMercadoPago(store_id);
  res.json({ success: true, status: conn?.status || 'desconectado' });
});

// Nome personalizado de transação (persistido no backend p/ sincronizar entre computadores)
app.post('/financeiro/mercadopago/nome', auth, (req, res) => {
  const { store_id, origem_id, nome } = req.body || {};
  if (!store_id || !origem_id) return res.status(400).json({ error: 'store_id e origem_id obrigatórios.' });
  try {
    const out = db.salvarNomeMovimentacao(String(store_id), String(origem_id), nome);
    res.json({ success: true, ...out });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/financeiro/mercadopago/nomes/:storeId', auth, (req, res) => {
  try {
    res.json({ success: true, nomes: db.listarNomesMovimentacoes(req.params.storeId) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});



app.get('/financeiro/mercadopago/relatorio/status-rota/:storeId', auth, (req, res) => {
  const conn = db.getMercadoPagoConexao(req.params.storeId);
  res.json({
    success: true,
    rota_relatorio_ativa: true,
    mercado_pago_conectado: !!(conn && conn.status === 'conectado' && conn.access_token),
    store_id: String(req.params.storeId)
  });
});


app.post('/financeiro/mercadopago/relatorio/configurar', auth, async (req, res) => {
  const { store_id } = req.body || {};
  if (!store_id) return res.status(400).json({ error: 'store_id obrigatório.' });
  try {
    const out = await mpConfigurarSettlementReport(store_id);
    res.json({ success: true, ...out });
  } catch(e) {
    console.error('[MP Settlement Config]', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.message || e.message, details: e.response?.data || null });
  }
});

app.post('/financeiro/mercadopago/relatorio/gerar', auth, async (req, res) => {
  const { store_id, inicio, fim } = req.body || {};
  if (!store_id) return res.status(400).json({ error: 'store_id obrigatório.' });
  const range = mpMonthRange({ inicio, fim });
  try {
    const out = await mpGerarSettlementReport(store_id, range);
    res.json({ success: true, mensagem: 'Relatório solicitado. Aguarde alguns minutos e clique em Verificar relatórios.', periodo: { inicio: range.inicioDate, fim: range.fimDate }, ...out });
  } catch(e) {
    console.error('[MP Settlement Gerar]', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.message || e.message, details: e.response?.data || null });
  }
});

app.get('/financeiro/mercadopago/relatorio/listar/:storeId', auth, async (req, res) => {
  try {
    const list = await mpListarSettlementReports(req.params.storeId);
    res.json({ success: true, total: list.length, relatorios: list, locais: db.listarRelatoriosMercadoPago(req.params.storeId, 30) });
  } catch(e) {
    console.error('[MP Settlement Listar]', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.message || e.message, details: e.response?.data || null });
  }
});

app.post('/financeiro/mercadopago/relatorio/importar', auth, async (req, res) => {
  const { store_id, file_name } = req.body || {};
  if (!store_id) return res.status(400).json({ error: 'store_id obrigatório.' });
  if (!file_name) return res.status(400).json({ error: 'file_name obrigatório.' });
  try {
    const out = await mpImportarSettlementReport(store_id, file_name);
    res.json({ success: true, mensagem: 'Extrato real importado com sucesso.', ...out });
  } catch(e) {
    console.error('[MP Settlement Importar]', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.message || e.message, details: e.response?.data || null });
  }
});



function normalizarValorBR(valor) {
  const s = String(valor || '').replace(/[^\d,.-]/g, '').trim();
  if (!s) return 0;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function hashExtratoManual(storeId, descricao, valor, data) {
  return crypto.createHash('sha1')
    .update([storeId, descricao, valor, data].map(v => String(v || '').trim().toLowerCase()).join('|'))
    .digest('hex');
}

function classificarTextoExtratoMercadoPago(descricao, valorInformado) {
  const texto = String(descricao || '').toLowerCase();
  const valor = Number(valorInformado || 0);

  const termosSaida = [
    'pix enviado', 'transferência enviada', 'transferencia enviada',
    'pagamento mercado livre', 'pagamento com qr pix', 'pagamento pix',
    'uber', 'canva', 'mercado livre', 'amazon', 'shopee', 'aliexpress',
    'nuvem envio', 'crédito nuvem envio', 'credito nuvem envio',
    'saque', 'retirada', 'envio de dinheiro', 'compra'
  ];

  const termosEntrada = [
    'transferência recebida', 'transferencia recebida',
    'pix recebido', 'recebimento', 'pagamento recebido',
    'venda', 'dinheiro recebido', 'entrada'
  ];

  if (valor < 0 || termosSaida.some(t => texto.includes(t))) {
    return { tipo: 'saida', categoria: texto.includes('uber') ? 'transporte_uber' : texto.includes('nuvem envio') ? 'frete_nuvem_envio' : 'saida_extrato_manual' };
  }

  if (valor > 0 || termosEntrada.some(t => texto.includes(t))) {
    return { tipo: 'entrada', categoria: 'entrada_extrato_manual' };
  }

  return { tipo: 'saida', categoria: 'saida_extrato_manual' };
}

function parseExtratoMercadoPagoTexto(texto, storeId) {
  const raw = String(texto || '').replace(/\r/g, '\n');
  const linhas = raw.split('\n').map(l => l.trim()).filter(Boolean);

  const movimentos = [];
  let buffer = [];

  const valorRegex = /([+-]?\s*R\$\s*[\d.]+,\d{2}|R\$\s*[\d.]+,\d{2}\s*[+-]?)/i;
  const dataRegex = /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2}|hoje|ontem)/i;

  function normalizarData(s) {
    const hoje = new Date();
    const lower = String(s || '').toLowerCase();
    if (lower.includes('hoje')) return hoje.toISOString();
    if (lower.includes('ontem')) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString();
    }
    const m = String(s || '').match(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/);
    if (m) {
      const parts = m[0].split('/');
      const dia = Number(parts[0]);
      const mes = Number(parts[1]);
      let ano = parts[2] ? Number(parts[2]) : hoje.getFullYear();
      if (ano < 100) ano += 2000;
      return new Date(ano, mes - 1, dia, 12, 0, 0).toISOString();
    }
    const iso = String(s || '').match(/\d{4}-\d{2}-\d{2}/);
    if (iso) return new Date(iso[0] + 'T12:00:00').toISOString();
    return hoje.toISOString();
  }

  function flush(linhaComValor) {
    const bloco = [...buffer, linhaComValor].join(' ').replace(/\s+/g, ' ').trim();
    buffer = [];

    const vm = bloco.match(valorRegex);
    if (!vm) return;

    const valorToken = vm[0];
    const temMenos = /-\s*R\$|R\$[^+-]*-/.test(valorToken) || bloco.includes('- R$');
    const temMais = /\+\s*R\$|R\$[^+-]*\+/.test(valorToken) || bloco.includes('+ R$');

    let valor = normalizarValorBR(valorToken);
    if (temMenos) valor = -Math.abs(valor);
    if (temMais) valor = Math.abs(valor);

    let descricao = bloco.replace(valorRegex, ' ').replace(dataRegex, ' ').replace(/\s+/g, ' ').trim();
    if (!descricao) descricao = 'Movimentação Mercado Pago';

    const dm = bloco.match(dataRegex);
    const data = normalizarData(dm ? dm[0] : '');

    const classificacao = classificarTextoExtratoMercadoPago(descricao, valor);
    const origemHash = hashExtratoManual(storeId, descricao, Math.abs(valor).toFixed(2), data.slice(0, 10));

    movimentos.push({
      origem_id: `manual_mp:${origemHash}`,
      data,
      descricao,
      tipo: classificacao.tipo,
      valor: Math.abs(valor),
      categoria: classificacao.categoria,
      raw_json: { origem: 'extrato_colado', bloco, valor_original: valorToken }
    });
  }

  for (const linha of linhas) {
    if (valorRegex.test(linha)) flush(linha);
    else buffer.push(linha);
    if (buffer.length > 4) buffer.shift();
  }

  return movimentos;
}

app.post('/financeiro/mercadopago/extrato-colado/importar', auth, (req, res) => {
  const { store_id, texto } = req.body || {};
  if (!store_id) return res.status(400).json({ error: 'store_id obrigatório.' });
  if (!texto || String(texto).trim().length < 10) return res.status(400).json({ error: 'Cole o texto do extrato do Mercado Pago.' });

  try {
    const movimentos = parseExtratoMercadoPagoTexto(texto, String(store_id));
    if (!movimentos.length) {
      return res.status(400).json({
        error: 'Não encontrei movimentações com valor no texto colado. Copie o texto do extrato ou use OCR antes de colar.'
      });
    }

    let importadas = 0;
    let duplicadas = 0;

    for (const m of movimentos) {
      const antes = db.listarMovimentacoesFinanceiras(store_id, m.data.slice(0, 10), m.data.slice(0, 10), 500)
        .find(x => x.origem_id === m.origem_id && x.tipo === m.tipo);
      db.salvarMovimentacaoFinanceira({
        store_id,
        conector: 'mercado_pago',
        origem_id: m.origem_id,
        data: m.data,
        descricao: m.descricao,
        tipo: m.tipo,
        valor: m.valor,
        categoria: m.categoria,
        raw_json: m.raw_json
      });
      if (antes) duplicadas++;
      else importadas++;
    }

    res.json({
      success: true,
      mensagem: 'Extrato colado importado com sucesso.',
      total_lidas: movimentos.length,
      importadas,
      duplicadas,
      movimentos: movimentos.slice(0, 50)
    });
  } catch(e) {
    console.error('[Extrato colado MP]', e.message);
    res.status(500).json({ error: e.message });
  }
});



// ── Financeiro Oficial MP — entradas, saídas e teto ─────────────────────────
function mpValorOficial(v) {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function mpGet(row, names) {
  const keys = Object.keys(row || {});
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return row[n];
    const k = keys.find(x => x.toLowerCase() === String(n).toLowerCase());
    if (k && String(row[k]).trim() !== '') return row[k];
  }
  return '';
}

function mpCsvRows(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const split = (line, sep) => {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (ch === sep && !q) {
        out.push(cur); cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map(v => String(v || '').trim());
  };

  const sep = (lines[0].split(';').length >= lines[0].split(',').length) ? ';' : ',';
  const headers = split(lines[0], sep);
  return lines.slice(1).map(line => {
    const vals = split(line, sep);
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] ?? '');
    return obj;
  });
}

function mpMovimentoOficial(row, storeId) {
  const tipoTransacao = String(mpGet(row, ['TRANSACTION_TYPE', 'Transaction type', 'TIPO_DE_TRANSACAO'])).toUpperCase();
  const net = mpValorOficial(mpGet(row, [
    'SETTLEMENT_NET_AMOUNT',
    'Settlement net amount',
    'REAL_AMOUNT',
    'NET_CREDIT_AMOUNT',
    'NET_RECEIVED_AMOUNT',
    'AMOUNT'
  ]));
  const bruto = mpValorOficial(mpGet(row, ['TRANSACTION_AMOUNT', 'Transaction amount']));
  const valorImpacto = net || bruto;
  if (!valorImpacto) return null;

  const tipo = valorImpacto >= 0 ? 'entrada' : 'saida';
  const data = mpGet(row, ['TRANSACTION_DATE', 'SETTLEMENT_DATE', 'DATE', 'Data', 'DATA']) || new Date().toISOString();
  const source = mpGet(row, ['SOURCE_ID', 'ORDER_ID', 'EXTERNAL_REFERENCE', 'ID']) || crypto.createHash('md5').update(JSON.stringify(row)).digest('hex');
  const desc = [
    tipoTransacao || 'MOVIMENTO',
    mpGet(row, ['DESCRIPTION', 'DESCRICAO', 'METADATA', 'PAYMENT_METHOD_TYPE']),
    source
  ].filter(Boolean).join(' • ');

  return {
    store_id: storeId,
    conector: 'mercado_pago',
    origem_id: `oficial_mp:${source}:${tipoTransacao}:${Math.abs(valorImpacto).toFixed(2)}`,
    data,
    descricao: desc,
    tipo,
    valor: Math.abs(valorImpacto),
    categoria: tipo === 'entrada' ? 'entrada_oficial_mp' : 'saida_oficial_mp',
    raw_json: {
      origem: 'relatorio_oficial_mp',
      transaction_type: tipoTransacao,
      settlement_net_amount: net,
      transaction_amount: bruto,
      row
    }
  };
}

function mpResumoOficial(storeId, inicio, fim) {
  const dados = db.getResumoFinanceiro(storeId, inicio, fim);
  const movs = (dados.movimentacoes || []).filter(m =>
    String(m.categoria || '').includes('_oficial_mp') ||
    String(m.raw_json || '').includes('relatorio_oficial_mp')
  );

  const conn = db.getMercadoPagoConexao(storeId);
  const resumo = {
    entradas: 0,
    saidas: 0,
    taxas: 0,
    estornos: 0,
    saldo_operacional: 0,
    teto_saidas: Number(conn?.teto_saidas || 0),
    disponivel_teto: Number(conn?.teto_saidas || 0),
    uso_teto_percentual: 0
  };

  for (const m of movs) {
    const v = Math.abs(Number(m.valor || 0));
    if (m.tipo === 'entrada') resumo.entradas += v;
    if (m.tipo === 'saida') resumo.saidas += v;
  }

  resumo.saldo_operacional = resumo.entradas - resumo.saidas;
  resumo.disponivel_teto = resumo.teto_saidas ? Math.max(0, resumo.teto_saidas - resumo.saidas) : 0;
  resumo.uso_teto_percentual = resumo.teto_saidas ? (resumo.saidas / resumo.teto_saidas) * 100 : 0;

  return { resumo, movimentacoes: movs, conexao: conn };
}

async function mpConfigOficial(storeId) {
  const token = await mpGarantirToken(storeId);
  const conn = db.getMercadoPagoConexao(storeId);
  const prefix = `loggzap-oficial-${String(conn?.mp_user_id || storeId)}`;

  const payload = {
    file_name_prefix: prefix,
    show_fee_prevision: false,
    show_chargeback_cancel: true,
    scheduled: false,
    coupon_detailed: false,
    include_withdraw: true,
    shipping_detail: true,
    refund_detailed: true,
    display_timezone: 'GMT-03',
    header_language: 'en',
    separator: ';',
    columns: [
      { key: 'TRANSACTION_DATE' },
      { key: 'SOURCE_ID' },
      { key: 'EXTERNAL_REFERENCE' },
      { key: 'TRANSACTION_TYPE' },
      { key: 'TRANSACTION_AMOUNT' },
      { key: 'SETTLEMENT_NET_AMOUNT' }
    ]
  };

  try {
    await axios.post('https://api.mercadopago.com/v1/account/settlement_report/config', payload, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 25000
    });
  } catch(e) {
    try {
      await axios.put('https://api.mercadopago.com/v1/account/settlement_report/config', payload, {
        headers: { Authorization: `Bearer ${token}`, accept: 'application/json', 'Content-Type': 'application/json' },
        timeout: 25000
      });
    } catch(e2) {
      // Se já houver configuração válida, continuamos; se for erro real, a geração vai apontar.
      console.warn('[MP Oficial] Config warning:', e2.response?.data || e2.message);
    }
  }
}

async function mpGerarOficial(storeId, range) {
  const token = await mpGarantirToken(storeId);
  await mpConfigOficial(storeId);
  const res = await axios.post('https://api.mercadopago.com/v1/account/settlement_report', {
    begin_date: range.inicioISO,
    end_date: range.fimISO
  }, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json', 'Content-Type': 'application/json' },
    timeout: 25000
  });
  db.salvarRelatorioMercadoPago(storeId, res.data || {});
  return res.data;
}

async function mpListarOficial(storeId, range) {
  const token = await mpGarantirToken(storeId);
  const tentativas = [];

  async function tentar(url) {
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
        timeout: 25000
      });
      return res.data;
    } catch(e) {
      tentativas.push({ url, error: e.response?.data || e.message });
      return null;
    }
  }

  const search = new URL('https://api.mercadopago.com/v1/account/settlement_report/search');
  search.searchParams.set('begin_date', range.inicioISO);
  search.searchParams.set('end_date', range.fimISO);
  search.searchParams.set('limit', '50');
  let data = await tentar(search.toString());
  if (!data) data = await tentar('https://api.mercadopago.com/v1/account/settlement_report/list');

  const list = Array.isArray(data) ? data : (data?.results || data?.reports || data?.data || []);
  for (const r of list) db.salvarRelatorioMercadoPago(storeId, r);
  return { list, tentativas };
}

async function mpImportarOficialFile(storeId, fileName) {
  const token = await mpGarantirToken(storeId);
  const res = await axios.get(`https://api.mercadopago.com/v1/account/settlement_report/${encodeURIComponent(fileName)}`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'text',
    transformResponse: [d => d],
    timeout: 50000
  });

  const rows = mpCsvRows(res.data);
  let importadas = 0;
  let ignoradas = 0;
  for (const row of rows) {
    const mov = mpMovimentoOficial(row, storeId);
    if (!mov) { ignoradas++; continue; }
    db.salvarMovimentacaoFinanceira(mov);
    importadas++;
  }
  return { file_name: fileName, linhas: rows.length, importadas, ignoradas };
}

async function mpSincronizarOficial(storeId, query = {}) {
  const range = mpMonthRange(query);
  const conn = db.getMercadoPagoConexao(storeId);
  if (!conn || conn.status !== 'conectado' || !conn.access_token) {
    return {
      conectado: false,
      status_oficial: 'desconectado',
      mensagem: 'Mercado Pago ainda não conectado.',
      periodo: { inicio: range.inicioDate, fim: range.fimDate },
      ...mpResumoOficial(storeId, range.inicioDate, range.fimDate)
    };
  }

  const listOut = await mpListarOficial(storeId, range);
  const arquivos = (listOut.list || []).filter(r => r.file_name || r.filename || r.file);
  let importadas = 0;
  let importados = [];

  for (const r of arquivos.slice(0, 5)) {
    const file = r.file_name || r.filename || r.file;
    if (!file) continue;
    try {
      const out = await mpImportarOficialFile(storeId, file);
      importadas += out.importadas || 0;
      importados.push(out);
    } catch(e) {
      console.warn('[MP Oficial] Falha ao importar', file, e.response?.data || e.message);
    }
  }

  let gerado = null;
  let status = importadas > 0 ? 'importado' : 'aguardando_relatorio';

  if (!arquivos.length || importadas === 0) {
    try {
      gerado = await mpGerarOficial(storeId, range);
      status = 'relatorio_solicitado';
    } catch(e) {
      console.error('[MP Oficial] Falha ao gerar:', e.response?.data || e.message);
      throw e;
    }
  }

  const dados = mpResumoOficial(storeId, range.inicioDate, range.fimDate);
  return {
    conectado: true,
    status_oficial: status,
    mensagem: status === 'importado'
      ? 'Relatório oficial importado.'
      : 'Relatório oficial solicitado. Aguarde alguns minutos e atualize novamente.',
    periodo: { inicio: range.inicioDate, fim: range.fimDate },
    importadas,
    importados,
    relatorios_encontrados: arquivos.length,
    gerado,
    ...dados
  };
}


app.get('/financeiro/mercadopago/:storeId', auth, async (req, res) => {
  const { storeId } = req.params;
  const range = mpMonthRange(req.query);
  try {
    const conn = db.getMercadoPagoConexao(storeId);
    const conectado = !!(conn && conn.status === 'conectado' && conn.access_token);
    // Lê do banco (movimentações já sincronizadas) para o período pedido — sem chamar a API do MP.
    const dados = mpResumoOficial(storeId, range.inicioDate, range.fimDate);
    res.json({
      success: true,
      conector: 'mercado_pago',
      conectado,
      status: conectado ? 'conectado' : 'desconectado',
      mp_user_id: conn?.mp_user_id || null,
      updated_at: conn?.updated_at || null,
      periodo: { inicio: range.inicioDate, fim: range.fimDate },
      resumo: dados.resumo,
      movimentacoes: dados.movimentacoes,
      observacao: 'Resumo e extrato do relatório financeiro oficial do Mercado Pago. Positivos = entradas, negativos = saídas.'
    });
  } catch(e) {
    console.error('[Financeiro MP Resumo]', e.message);
    res.status(500).json({ error: e.message });
  }
});


const handleFinanceiroMpOficialSincronizar = async (req, res) => {
  const { store_id, inicio, fim } = req.body || {};
  if (!store_id) return res.status(400).json({ error: 'store_id obrigatório.' });
  try {
    const out = await mpSincronizarOficial(String(store_id), { inicio, fim });
    res.json({ success: true, ...out });
  } catch(e) {
    console.error('[Financeiro MP Oficial Sync]', e.response?.data || e.message);
    res.status(500).json({
      error: e.response?.data?.message || e.message,
      details: e.response?.data || null
    });
  }
};
app.post('/financeiro/mercadopago/oficial/sincronizar', auth, handleFinanceiroMpOficialSincronizar);
app.post('/api/financeiro/mercadopago/oficial/sincronizar', auth, handleFinanceiroMpOficialSincronizar);
app.post('/financeiro/oficial/sincronizar', auth, handleFinanceiroMpOficialSincronizar);

app.get('/financeiro/mercadopago/oficial/status-rota/:storeId', auth, (req, res) => {
  const conn = db.getMercadoPagoConexao(req.params.storeId);
  res.json({
    success: true,
    rota_oficial_ativa: true,
    store_id: String(req.params.storeId),
    mercado_pago_conectado: !!(conn && conn.status === 'conectado' && conn.access_token)
  });
});



// ── Envios Avulsos — processamento manual assistido ─────────────────────────
function extrairEnvioAvulsoDoTexto(texto) {
  const raw = String(texto || '').replace(/\r/g, '').trim();
  const linhas = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const semCpf = raw.replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, ' ');

  const rastreio = (raw.match(/\b[A-Z]{2}\d{9}[A-Z]{2}\b/i) || [])[0]?.toUpperCase() || null;
  const codigoEnvio = (raw.match(/#?\bEA\d+\b/i) || [])[0]?.replace(/^#/, '').toUpperCase() || (rastreio ? `EA-${rastreio}` : null);
  const email = (raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || null;
  const valor = (raw.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/i) || [])[0] || null;
  const prazo = (raw.match(/\d+\s*a\s*\d+\s*dias(?:\s*úteis|\s*uteis)?/i) || [])[0] || null;

  let telefone = null;
  const linhasTelefone = linhas.filter(l => /telefone|celular|whats|whatsapp|\(\d{2}\)/i.test(l) && !/cpf|cnpj/i.test(l));
  const candidatosTel = [...linhasTelefone, semCpf].join('\n').match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)9?\d{4}[-\s]?\d{4}/g) || [];
  for (const c of candidatosTel) {
    const f = formatTel(c);
    if (f) { telefone = f; break; }
  }

  const ignorarLinha = (l) => {
    const s = String(l || '').trim();
    if (!s) return true;
    if (/dados do cliente/i.test(s)) return true;
    if (/cpf|cnpj/i.test(s)) return true;
    if (rastreio && s.toUpperCase().includes(rastreio)) return true;
    if (codigoEnvio && s.toUpperCase().replace('#','').includes(codigoEnvio.replace('#',''))) return true;
    if (email && s.includes(email)) return true;
    if (valor && s.includes(valor)) return true;
    if (prazo && s.toLowerCase().includes(prazo.toLowerCase())) return true;
    if (/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(s)) return true;
    if (/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)9?\d{4}[-\s]?\d{4}/.test(s)) return true;
    if (/^avulso$/i.test(s)) return true;
    if (/^correios|pac|sedex|jadlog|loggi/i.test(s)) return true;
    return false;
  };

  let nome = null;
  const idxDados = linhas.findIndex(l => /dados do cliente/i.test(l));
  if (idxDados >= 0) {
    for (let i = idxDados + 1; i < linhas.length; i++) {
      if (!ignorarLinha(linhas[i])) { nome = linhas[i]; break; }
    }
  }
  if (!nome) nome = linhas.find(l => !ignorarLinha(l)) || 'Cliente';

  let transportadora = 'Correios';
  if (/jadlog/i.test(raw)) transportadora = 'Jadlog';
  else if (/loggi/i.test(raw)) transportadora = 'Loggi';
  else if (/correios|pac|sedex/i.test(raw)) transportadora = 'Correios';

  let modalidade = null;
  const modalidadeLinha = linhas.find(l => /(correios|pac|sedex|jadlog|loggi)/i.test(l));
  if (modalidadeLinha) modalidade = modalidadeLinha;

  const erros = [];
  if (!rastreio) erros.push('Não encontrei o código de rastreio. Exemplo: AP022997557BR.');
  if (!telefone) erros.push('Não encontrei o telefone com DDD. Exemplo: (75) 98196-4692.');
  if (!nome || nome === 'Cliente') erros.push('Não encontrei o nome do cliente.');

  return {
    ok: erros.length === 0,
    erros,
    dados: {
      codigo_envio: codigoEnvio,
      nome_cliente: nome || 'Cliente',
      telefone,
      email,
      codigo_rastreio: rastreio,
      transportadora,
      modalidade,
      prazo,
      valor,
      raw_text: raw
    }
  };
}

function montarMensagemEnvioAvulso(envio, evento) {
  const nome = envio.nome_cliente || 'Cliente';
  const rastreio = envio.codigo_rastreio;
  const numero = envio.codigo_envio || rastreio;
  const transportadora = envio.transportadora || 'Correios';
  const link = `https://rastreamento.correios.com.br/app/index.php?objeto=${rastreio}`;
  const prazo = envio.prazo ? `\nPrazo estimado: *${envio.prazo}*` : '';

  if (!evento) {
    return `📮 Olá, ${nome}! Seu envio já foi gerado.\n\nCódigo de rastreio: *${rastreio}*\nTransportadora: *${transportadora}*${prazo}\n\n🔗 Acompanhe sua entrega:\n${link}`;
  }

  return montarMensagemRastreio({
    cliente: nome,
    numero,
    rastreio
  }, evento);
}

const processarEnvioAvulsoHandler = async (req, res) => {
  const { store_id, texto } = req.body || {};
  const storeId = String(store_id || '').trim();

  if (!storeId) return res.status(400).json({ error: 'Store ID obrigatório.' });
  if (!texto || String(texto).trim().length < 10) return res.status(400).json({ error: 'Cole os dados do envio avulso.' });

  try {
    const sp = statusPlanoLoja(storeId);
    if (!(sp.emTrial || sp.plano === 'premium')) {
      return res.status(403).json({ error: 'Envios avulsos automáticos: disponíveis no período de teste e no plano Pro.' });
    }

    const parsed = extrairEnvioAvulsoDoTexto(texto);
    if (!parsed.ok) return res.status(400).json({ error: parsed.erros.join(' ') });

    const dados = { ...parsed.dados, store_id: storeId };

    const envioExistente = db.getEnvioAvulso
      ? db.getEnvioAvulso(storeId, dados.codigo_rastreio)
      : null;

    if (envioExistente && envioExistente.primeira_mensagem_em) {
      safeLogAutomacao({
        store_id: storeId,
        tipo: 'envio_avulso_duplicado',
        pedido: envioExistente.codigo_envio || dados.codigo_envio || dados.codigo_rastreio,
        telefone: envioExistente.telefone || dados.telefone,
        mensagem: 'Envio avulso já estava em monitoramento. Nenhuma nova mensagem foi enviada.',
        extra: {
          rastreio: dados.codigo_rastreio,
          primeira_mensagem_em: envioExistente.primeira_mensagem_em
        }
      });

      return res.json({
        success: true,
        duplicate: true,
        ja_monitorado: true,
        mensagem: 'Este envio avulso já está em monitoramento. Nenhuma nova mensagem foi enviada.',
        envio: envioExistente,
        dados_extraidos: {
          codigo_envio: envioExistente.codigo_envio || dados.codigo_envio,
          nome_cliente: envioExistente.nome_cliente || dados.nome_cliente,
          telefone: envioExistente.telefone || dados.telefone,
          email: envioExistente.email || dados.email,
          codigo_rastreio: envioExistente.codigo_rastreio || dados.codigo_rastreio,
          transportadora: envioExistente.transportadora || dados.transportadora,
          prazo: envioExistente.prazo || dados.prazo,
          valor: envioExistente.valor || dados.valor,
          primeira_mensagem_em: envioExistente.primeira_mensagem_em
        }
      });
    }

    const evento = await consultarCorreios(dados.codigo_rastreio);
    const statusInicial = evento?.entregue ? 'entregue' : (evento?.descricao || evento?.status || 'capturado');

    db.salvarEnvioAvulso({
      ...dados,
      ultimo_status: statusInicial,
      ultimo_evento_json: evento ? JSON.stringify(evento) : null,
      entregue_em: evento?.entregue ? new Date().toISOString() : null,
      ativo: evento?.entregue ? 0 : 1
    });

    if (!await podEnviar(dados.telefone, storeId)) {
      safeLogAutomacao({ store_id: storeId, tipo: 'envio_avulso_bloqueado_limite', pedido: dados.codigo_envio, telefone: dados.telefone, erro: 'Limite diário de mensagens atingido.' });
      return res.status(429).json({ error: 'Este telefone já atingiu o limite diário de mensagens.' });
    }

    const fallback = montarMensagemEnvioAvulso(dados, evento);
    const mensagem = getMensagemTemplate(storeId, evento ? getRastreioTemplateKey(evento) : 'pedido_postado', fallback, {
      nome: dados.nome_cliente || 'Cliente',
      numero: dados.codigo_envio || dados.codigo_rastreio,
      codigo: dados.codigo_rastreio,
      link: `https://rastreamento.correios.com.br/app/index.php?objeto=${dados.codigo_rastreio}`,
      transportadora: dados.transportadora || 'Correios',
      status: evento?.descricao || evento?.status || 'Envio gerado',
      data: evento?.data || '',
      hora: evento?.hora || ''
    });

    await sendWhatsApp(dados.telefone, mensagem, storeId);
    db.registrarMensagem(dados.telefone);
    db.registrarClienteAtivo(dados.telefone, storeId);
    db.marcarEnvioAvulsoPrimeiraMensagem(storeId, dados.codigo_rastreio);

    safeLogAutomacao({
      store_id: storeId,
      tipo: 'envio_avulso',
      pedido: dados.codigo_envio || dados.codigo_rastreio,
      telefone: dados.telefone,
      mensagem,
      extra: { rastreio: dados.codigo_rastreio, nome: dados.nome_cliente }
    });

    res.json({
      success: true,
      mensagem: 'Envio avulso capturado, mensagem enviada e rastreio em monitoramento.',
      envio: db.getEnvioAvulso(storeId, dados.codigo_rastreio),
      dados_extraidos: {
        codigo_envio: dados.codigo_envio,
        nome_cliente: dados.nome_cliente,
        telefone: dados.telefone,
        email: dados.email,
        codigo_rastreio: dados.codigo_rastreio,
        transportadora: dados.transportadora,
        prazo: dados.prazo,
        valor: dados.valor
      }
    });
  } catch(e) {
    console.error('[Envio Avulso] Erro:', e.message);
    safeLogAutomacao({ store_id: storeId, tipo: 'envio_avulso_erro', erro: e.message });
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
};

app.post('/envios-avulsos/processar', auth, processarEnvioAvulsoHandler);
app.post('/api/envios-avulsos/processar', auth, processarEnvioAvulsoHandler);
app.post('/envio-avulso/processar', auth, processarEnvioAvulsoHandler);
app.post('/envios-avulso/processar', auth, processarEnvioAvulsoHandler);


const listarEnviosAvulsosHandler = (req, res) => {
  try {
    const envios = db.listarEnviosAvulsos(String(req.params.storeId), Number(req.query.limit || 100));
    res.json({ success: true, total: envios.length, envios });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

app.get('/envios-avulsos/:storeId', auth, listarEnviosAvulsosHandler);
app.get('/api/envios-avulsos/:storeId', auth, listarEnviosAvulsosHandler);


async function verificarEnviosAvulsos(storeId) {
  try {
    const envios = db.listarEnviosAvulsosMonitorar ? db.listarEnviosAvulsosMonitorar(storeId, 200) : [];
    for (const envio of envios) {
      if (!envio.codigo_rastreio || db.statusRastreio(envio.codigo_rastreio) === 'entregue') continue;

      const evento = await consultarCorreios(envio.codigo_rastreio);
      if (!evento) continue;

      const statusAnterior = envio.ultimo_status || db.statusRastreio(envio.codigo_rastreio);
      const statusNovo = evento.entregue ? 'entregue' : (evento.descricao || evento.status || '');
      if (!statusNovo || statusNovo === statusAnterior) continue;

      const mensagem = getMensagemTemplate(storeId, getRastreioTemplateKey(evento), montarMensagemEnvioAvulso(envio, evento), {
        nome: envio.nome_cliente || 'Cliente',
        numero: envio.codigo_envio || envio.codigo_rastreio,
        codigo: envio.codigo_rastreio,
        link: `https://rastreamento.correios.com.br/app/index.php?objeto=${envio.codigo_rastreio}`,
        transportadora: envio.transportadora || 'Correios',
        status: evento.descricao || evento.status || '',
        data: evento.data || '',
        hora: evento.hora || ''
      });

      if (!await podEnviar(envio.telefone, storeId)) continue;

      await sendWhatsApp(envio.telefone, mensagem, storeId);
      db.registrarMensagem(envio.telefone);
      db.registrarClienteAtivo(envio.telefone, storeId);
      db.atualizarEnvioAvulsoStatus(storeId, envio.codigo_rastreio, statusNovo, evento, evento.entregue);
      db.atualizarStatusRastreio(envio.codigo_rastreio, statusNovo);

      safeLogAutomacao({
        store_id: storeId,
        tipo: 'envio_avulso_monitoramento',
        pedido: envio.codigo_envio || envio.codigo_rastreio,
        telefone: envio.telefone,
        mensagem,
        extra: { rastreio: envio.codigo_rastreio, status: statusNovo }
      });
    }
  } catch(e) {
    console.error(`[Envio Avulso] Erro ao monitorar loja ${storeId}:`, e.message);
  }
}


// ── Diagnóstico — Envios avulsos / Nuvem Envio ───────────────────────────────
// Uso interno. Esta rota NÃO dispara mensagens e NÃO altera dados.
// Ela testa possíveis endpoints da Nuvemshop/Nuvem Envio para descobrir onde
// aparecem envios avulsos do tipo #EA2766.
app.get('/diag/envios-avulsos/:storeId', auth, async (req, res) => {
  const { storeId } = req.params;
  const envioId = String(req.query.envio || req.query.id || '').replace(/^#/, '').trim();
  const codigo = String(req.query.codigo || req.query.rastreio || '').trim();

  const candidatos = [
    { nome: 'orders_recentes', path: '/orders', params: { per_page: 50, page: 1, fields: 'id,number,contact_name,contact_phone,contact_email,shipping_status,shipping_tracking_number,shipping_tracking_url,shipping_option,created_at,total,customer' } },
    { nome: 'orders_search_envio', path: '/orders', params: { per_page: 50, page: 1, q: envioId || codigo || 'EA' } },
    { nome: 'shipping_options', path: '/shipping_options', params: { per_page: 20, page: 1 } },
    { nome: 'shipping_carriers', path: '/shipping_carriers', params: { per_page: 20, page: 1 } },
    { nome: 'shipping_methods', path: '/shipping_methods', params: { per_page: 20, page: 1 } },
    { nome: 'shipping_labels', path: '/shipping_labels', params: { per_page: 20, page: 1 } },
    { nome: 'shipments', path: '/shipments', params: { per_page: 20, page: 1 } },
    { nome: 'shipping_shipments', path: '/shipping/shipments', params: { per_page: 20, page: 1 } },
    { nome: 'logistics_shipments', path: '/logistics/shipments', params: { per_page: 20, page: 1 } },
    { nome: 'nuvem_envio_shipments', path: '/nuvem_envio/shipments', params: { per_page: 20, page: 1 } },
    { nome: 'fulfillments', path: '/fulfillments', params: { per_page: 20, page: 1 } }
  ];

  if (envioId) {
    candidatos.push(
      { nome: 'shipping_label_por_id', path: `/shipping_labels/${encodeURIComponent(envioId)}`, params: {} },
      { nome: 'shipment_por_id', path: `/shipments/${encodeURIComponent(envioId)}`, params: {} },
      { nome: 'nuvem_envio_por_id', path: `/nuvem_envio/shipments/${encodeURIComponent(envioId)}`, params: {} }
    );
  }

  function limitarObjeto(obj, depth = 0) {
    if (obj === null || obj === undefined) return obj;
    if (depth > 3) return '[depth-limit]';
    if (Array.isArray(obj)) return obj.slice(0, 3).map(v => limitarObjeto(v, depth + 1));
    if (typeof obj !== 'object') return obj;

    const out = {};
    for (const [k, v] of Object.entries(obj).slice(0, 30)) {
      const key = String(k).toLowerCase();

      // Reduzir exposição no diagnóstico. O objetivo é descobrir estrutura/endpoint,
      // não vazar documento/endereço completo.
      if (key.includes('cpf') || key.includes('cnpj') || key.includes('document')) {
        out[k] = '[oculto]';
      } else if (key.includes('address') || key.includes('endereco')) {
        out[k] = '[endereço oculto]';
      } else {
        out[k] = limitarObjeto(v, depth + 1);
      }
    }
    return out;
  }

  function extrairPossiveisEnvios(payload) {
    const arr = Array.isArray(payload) ? payload : [payload];
    return arr.flatMap(item => {
      const campos = JSON.stringify(item || {}).toLowerCase();
      const tracking = item?.shipping_tracking_number || item?.tracking_number || item?.tracking || item?.code || item?.codigo || '';
      const number = item?.number || item?.id || item?.order_id || item?.shipment_id || '';
      const ehAvulso = String(number).toUpperCase().startsWith('EA') || campos.includes('"avulso"') || campos.includes('#ea') || campos.includes('nuvem envio');
      const bateCodigo = codigo && campos.includes(codigo.toLowerCase());
      const bateEnvio = envioId && campos.includes(envioId.toLowerCase());
      if (ehAvulso || bateCodigo || bateEnvio) {
        return [{
          id: item?.id || item?.shipment_id || item?.order_id || null,
          numero: number || null,
          cliente: item?.contact_name || item?.customer?.name || item?.shipping_address?.name || item?.name || null,
          telefone: item?.contact_phone || item?.customer?.phone || item?.shipping_address?.phone || null,
          email: item?.contact_email || item?.customer?.email || null,
          rastreio: tracking || null,
          status: item?.shipping_status || item?.status || null,
          amostra: limitarObjeto(item)
        }];
      }
      return [];
    });
  }

  const resultados = [];

  for (const c of candidatos) {
    const inicio = Date.now();
    try {
      const data = await nuvemGet(storeId, c.path, c.params);
      const arr = Array.isArray(data) ? data : (data ? [data] : []);
      resultados.push({
        nome: c.nome,
        path: c.path,
        params: c.params,
        ok: true,
        status: 200,
        tempo_ms: Date.now() - inicio,
        tipo: Array.isArray(data) ? 'array' : typeof data,
        total_amostra: arr.length,
        possiveis_envios_avulsos: extrairPossiveisEnvios(data),
        sample_keys: arr[0] && typeof arr[0] === 'object' ? Object.keys(arr[0]).slice(0, 40) : [],
        sample: limitarObjeto(arr[0] || data || null)
      });
    } catch (e) {
      resultados.push({
        nome: c.nome,
        path: c.path,
        params: c.params,
        ok: false,
        status: e.response?.status || null,
        tempo_ms: Date.now() - inicio,
        erro: e.response?.data?.message || e.response?.data?.description || e.message,
        data: limitarObjeto(e.response?.data || null)
      });
    }
  }

  const encontrados = resultados.flatMap(r =>
    (r.possiveis_envios_avulsos || []).map(x => ({ endpoint: r.nome, path: r.path, ...x }))
  );

  res.json({
    success: true,
    store_id: String(storeId),
    filtros: { envio: envioId || null, codigo: codigo || null },
    objetivo: 'Diagnosticar onde a Nuvemshop/Nuvem Envio expõe envios avulsos #EA para futura automação.',
    aviso: 'Esta rota é somente leitura. Não envia WhatsApp, não marca notificado e não altera pedidos/envios.',
    resumo: {
      endpoints_testados: resultados.length,
      endpoints_com_sucesso: resultados.filter(r => r.ok).length,
      possiveis_envios_avulsos_encontrados: encontrados.length
    },
    encontrados,
    resultados
  });
});


app.get('/status', (req, res) => {
  const stores = db.getAllStores();
  res.json({ ok: true, lojas: stores.length, versao: '2.5.1', cron: 'ativo (30min)' });
});

// TEMPORÁRIO (diagnóstico de pendentes) — remover após validar.
// Roda a verificação na hora e devolve os pedidos pendentes crus para inspeção.
app.get('/diag/pendentes/:storeId', async (req, res) => {
  const storeId = req.params.storeId;
  try {
    const cfg = db.getConfig(storeId) || {};
    const orders = await nuvemGet(storeId, '/orders', { per_page: 100, payment_status: 'pending' });
    const agora = Date.now();
    const detalhe = (Array.isArray(orders) ? orders : []).map(o => {
      const criadoEm = new Date(o.created_at).getTime();
      const minutos = Math.floor((agora - criadoEm) / 60000);
      return {
        numero: o.number, status: o.status, gateway: o.gateway || '(vazio)',
        telefone: o.contact_phone || '(vazio)', criado_em: o.created_at,
        idade_min: minutos, idade_dias: Math.floor(minutos / 1440),
        na_janela: (minutos >= 300 && minutos <= 10080)
      };
    });
    // Dispara a verificação real também (com os logs [DIAG-PEND] no Railway)
    await verificarBoletosPendentes(storeId);
    res.json({
      ok: true, storeId, boleto_ativo: cfg.boleto_ativo,
      total_pendentes: detalhe.length,
      na_janela_5h_7d: detalhe.filter(d => d.na_janela).length,
      pedidos: detalhe
    });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

app.get('/admin/dashboard', auth, (req, res) => {
  try { res.json({ success: true, ...db.getAdminStats() }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/dashboard/:storeId', auth, async (req, res) => {
  const { storeId } = req.params;
  try {
    const stats = db.getLojistaStats(storeId);
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/dashboard-nuvem/:storeId', auth, async (req, res) => {
  const { storeId } = req.params;
  try {
    const _agora = new Date();
    const _brt = new Date(_agora.getTime() - 3 * 60 * 60 * 1000);
    const _ano = _brt.getUTCFullYear(), _mes = _brt.getUTCMonth(), _dia = _brt.getUTCDate();
    const _brtIso = (y, m, d) => new Date(Date.UTC(y, m, d, 3, 0, 0)).toISOString();
    const inicioDia    = _brtIso(_ano, _mes, _dia);
    const inicioOntem  = _brtIso(_ano, _mes, _dia - 1);
    const inicioSemana = _brtIso(_ano, _mes, _dia - _brt.getUTCDay());
    const inicioMes    = _brtIso(_ano, _mes, 1);
    const nuvemSafe = async (path, params) => {
      try { return await nuvemGet(storeId, path, params); }
      catch(e) {
        const status = e.response?.status;
        if (status === 404 || (e.response?.data?.description || '').includes('Last page is 0')) return [];
        throw e;
      }
    };
    const [pedidosHoje, pedidosOntem, pedidosSemana, pedidosMes] = await Promise.all([
      nuvemSafe('/orders', { created_at_min: inicioDia,    per_page: 200 }),
      nuvemSafe('/orders', { created_at_min: inicioOntem,  created_at_max: inicioDia, per_page: 200 }),
      nuvemSafe('/orders', { created_at_min: inicioSemana, per_page: 200 }),
      nuvemSafe('/orders', { created_at_min: inicioMes,    per_page: 200 })
    ]);
    const pagosHoje   = pedidosHoje.filter(p => p.payment_status === 'paid');
    const pagosOntem  = pedidosOntem.filter(p => p.payment_status === 'paid');
    const pagosSemana = pedidosSemana.filter(p => p.payment_status === 'paid');
    const pagosMes    = pedidosMes.filter(p => p.payment_status === 'paid');
    const totalHoje       = pagosHoje.reduce((s, p) => s + parseFloat(p.total || 0), 0);
    const freteHoje       = pagosHoje.reduce((s, p) => s + parseFloat(p.shipping_cost_owner || 0), 0);
    const ticketMedioHoje = pagosHoje.length > 0 ? totalHoje / pagosHoje.length : 0;
    const totalOntem = pagosOntem.reduce((s, p) => s + parseFloat(p.total || 0), 0);
    const variacaoValor = totalOntem > 0 ? ((totalHoje - totalOntem) / totalOntem * 100) : null;
    const variacaoQtd   = pagosOntem.length > 0 ? ((pagosHoje.length - pagosOntem.length) / pagosOntem.length * 100) : null;
    const aguardandoPagamento = pedidosHoje.filter(p => p.payment_status === 'pending').length;
    const aguardandoEnvio     = pedidosHoje.filter(p => p.payment_status === 'paid' && p.shipping_status === 'unpacked').length;
    const prodContagem = {};
    for (const p of pagosHoje) {
      for (const prod of (p.products || [])) {
        const nome = prod.name || 'Produto';
        prodContagem[nome] = (prodContagem[nome] || 0) + (prod.quantity || 1);
      }
    }
    const prodMaisVendido = Object.entries(prodContagem).sort((a,b) => b[1]-a[1])[0] || null;
    const contagemHoras = {};
    for (const p of pedidosHoje) {
      const h = new Date(p.created_at).getHours();
      contagemHoras[h] = (contagemHoras[h] || 0) + 1;
    }
    const picoPar = Object.entries(contagemHoras).sort((a,b) => b[1]-a[1])[0];
    const horaPico = picoPar ? `${String(picoPar[0]).padStart(2,'0')}h` : null;
    const totalSemana  = pagosSemana.reduce((s, p) => s + parseFloat(p.total || 0), 0);
    const freteSemana  = pagosSemana.reduce((s, p) => s + parseFloat(p.shipping_cost_owner || 0), 0);
    const totalMes     = pagosMes.reduce((s, p) => s + parseFloat(p.total || 0), 0);
    const freteMes     = pagosMes.reduce((s, p) => s + parseFloat(p.shipping_cost_owner || 0), 0);
    const ticketSemana = pagosSemana.length > 0 ? totalSemana / pagosSemana.length : 0;
    const ticketMes    = pagosMes.length    > 0 ? totalMes    / pagosMes.length    : 0;
    const ultimos = pedidosHoje.slice(0, 5).map(p => ({
      numero: p.number, total: parseFloat(p.total || 0), status: p.payment_status,
      cliente: p.customer ? (p.customer.name || 'Cliente') : 'Cliente',
      hora: new Date(p.created_at).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', timeZone:'America/Recife' })
    }));
    let score = 100;
    const totalPedidos = pagosHoje.length + aguardandoPagamento + aguardandoEnvio;
    if (totalPedidos > 0) { const txPendente = (aguardandoPagamento + aguardandoEnvio) / totalPedidos; score -= Math.round(txPendente * 40); }
    if (totalHoje === 0) score -= 20;
    score = Math.max(0, Math.min(100, score));
    res.json({
      success: true,
      hoje: { qtd: pagosHoje.length, total: totalHoje, frete: freteHoje, ticketMedio: ticketMedioHoje, variacaoValor, variacaoQtd, aguardandoPagamento, aguardandoEnvio, prodMaisVendido, horaPico },
      semana: { qtd: pagosSemana.length, total: totalSemana },
      mes:    { qtd: pagosMes.length, total: totalMes, frete: freteMes },
      semana_det: { qtd: pagosSemana.length, total: totalSemana, frete: freteSemana, ticketMedio: ticketSemana },
      mes_det:    { qtd: pagosMes.length,    total: totalMes,    frete: freteMes,    ticketMedio: ticketMes    },
      ultimos, score,
      atualizadoEm: new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', timeZone:'America/Recife' })
    });
  } catch(e) {
    console.error('[Dashboard Nuvem]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/auth/status', (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code obrigatorio' });
  try {
    const row = db.getAuthSession(code);
    if (!row) return res.json({ status: 'pending' });
    if (row.status === 'done') { db.deleteAuthSession(code); return res.json({ status: 'done', store_id: row.store_id }); }
    res.json({ status: row.status });
  } catch(e) { res.json({ status: 'pending' }); }
});

async function enviarCodigoResetEmail(email, codigo) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'LoggZap <contato@loggzap.com.br>', to: email, subject: 'Código de recuperação de senha - LoggZap',
    html: '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0d0d10;color:#ededf2;padding:32px;border-radius:12px">' +
      '<h2 style="color:#4f8ef7">LoggZap Dashboard</h2>' +
      '<p>Você pediu para redefinir a senha do seu painel. Use este código (válido por 30 minutos):</p>' +
      '<div style="background:#1e1e25;border:1px solid #4f8ef7;border-radius:8px;padding:16px;text-align:center;margin:24px 0">' +
      '<code style="font-size:30px;color:#00d084;letter-spacing:8px">' + codigo + '</code></div>' +
      '<p style="color:#888;font-size:12px">Se não foi você, ignore este email. LoggZap | contato@loggzap.com.br</p></div>'
  });
}

async function enviarChavePorEmail(email, chave, plano, expiraEm) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const expira = new Date(expiraEm).toLocaleDateString('pt-BR');
  await resend.emails.send({
    from: 'LoggZap <contato@loggzap.com.br>', to: email, subject: 'Sua chave de ativacao LoggZap',
    html: '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0d0d10;color:#ededf2;padding:32px;border-radius:12px">' +
      '<h2 style="color:#4f8ef7">LoggZap Dashboard</h2><p>Seu pagamento foi confirmado! Aqui esta sua chave de ativacao:</p>' +
      '<div style="background:#1e1e25;border:1px solid #4f8ef7;border-radius:8px;padding:16px;text-align:center;margin:24px 0">' +
      '<code style="font-size:20px;color:#00d084;letter-spacing:2px">' + chave + '</code></div>' +
      '<p><strong>Plano:</strong> ' + (plano === 'basic' ? 'Essencial - R$97/mês' : 'Pro - R$147/mês') + '</p>' +
      '<p><strong>Valido ate:</strong> ' + expira + '</p>' +
      '<p style="margin-top:24px">Para ativar: abra a extensao → Configuracoes → Cole a chave → Ativar chave.</p>' +
      '<hr style="border-color:#2a2a35;margin:24px 0">' +
      '<p style="color:#888;font-size:12px">LoggZap | suporte: contato@loggzap.com.br</p></div>'
  });
}

function gerarChave(plano) {
  const prefixo = plano === 'premium' ? 'LZP' : 'LZB';
  const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
  return prefixo + '-' + rand.slice(0,4) + '-' + rand.slice(4,8) + '-' + rand.slice(8);
}

app.get('/teste/email', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'Informe ?email=seu@email.com' });
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'LoggZap <contato@loggzap.com.br>', to: email, subject: '✅ Teste de email LoggZap',
      html: '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0d0d10;color:#ededf2;padding:32px;border-radius:12px">' +
        '<h2 style="color:#00d084">✅ Email funcionando!</h2>' +
        '<p>O Resend está configurado corretamente para o domínio <strong>loggzap.com.br</strong>.</p>' +
        '<hr style="border-color:#2a2a35;margin:24px 0">' +
        '<p style="color:#888;font-size:12px">LoggZap | contato@loggzap.com.br</p></div>'
    });
    res.json({ success: true, enviado_para: email });
  } catch(e) { console.error('[Teste Email]', e.message); res.status(500).json({ error: e.message }); }
});

// ── Assinatura ────────────────────────────────────────────────────────────────
const SUBSCRIPTION_PREMIUM_ID = '69189cab6a0f41579bb1e5bbd49bc860';
const SUBSCRIPTION_PREMIUM_URL = 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=' + SUBSCRIPTION_PREMIUM_ID;
const BACKEND_URL = 'https://cliente.loggzap.com.br';

app.get('/assinar', (req, res) => {
  const plano = (req.query.plano || '').toLowerCase();
  if (!['basic', 'premium'].includes(plano)) return res.status(400).send('Plano inválido.');

  const dadosPlano = {
    basic: {
      nome: 'Essencial',
      preco: 'R$ 97/mês',
      titulo: 'Assinar Plano Essencial',
      descricao: 'Dashboard, financeiro e rastreio automático — até 200 rastreios/mês.',
      badge: 'PLANO ESSENCIAL'
    },
    premium: {
      nome: 'Pro',
      preco: 'R$ 147/mês',
      titulo: 'Assinar Plano Pro',
      descricao: 'Tudo do Essencial + automações via WhatsApp — até 500 rastreios/mês.',
      badge: 'PLANO PRO'
    }
  };

  const p = dadosPlano[plano];

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LoggZap — ${p.titulo}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#07090e;color:#eef0f8;font-family:Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  h1,h2,h3,.logo{font-family:'Poppins',Arial,sans-serif}
  .card{background:#0c0f16;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px 36px;max-width:440px;width:100%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.35)}
  .logo{font-size:26px;font-weight:800;margin-bottom:8px}
  .logo span{color:#00d084}
  .badge{display:inline-block;background:rgba(0,208,132,0.1);border:1px solid rgba(0,208,132,0.25);color:#00d084;font-size:12px;font-weight:700;padding:4px 14px;border-radius:100px;margin-bottom:22px;letter-spacing:.5px}
  h2{font-size:22px;font-weight:800;margin-bottom:8px}
  .preco{font-size:30px;font-weight:800;color:#00d084;margin-bottom:8px}
  p{font-size:14px;color:#8b93a8;margin-bottom:24px;line-height:1.65}
  label{display:block;font-size:11px;font-weight:700;letter-spacing:1px;color:#8b93a8;text-align:left;margin-bottom:6px;text-transform:uppercase}
  input{width:100%;background:#11151e;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px 16px;color:#eef0f8;font-size:15px;outline:none;margin-bottom:16px;font-family:inherit}
  input:focus{border-color:#00d084}
  button{width:100%;background:#00d084;color:#000;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit}
  button:hover{opacity:.88}
  button:disabled{opacity:.5;cursor:not-allowed}
  .erro{background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.3);color:#f87171;border-radius:8px;padding:12px;font-size:13px;display:none;margin-bottom:12px;text-align:left}
  .nota{font-size:12px;color:#555568;margin-top:14px;margin-bottom:0}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Logg<span>Zap</span></div>
  <div class="badge">${p.badge}</div>
  <h2>${p.titulo}</h2>
  <div class="preco">${p.preco}</div>
  <p>${p.descricao}<br>Sua chave de ativação será enviada automaticamente para o email informado após a confirmação do pagamento.</p>
  <div class="erro" id="erro"></div>
  <label for="email">Email para receber a chave</label>
  <input type="email" id="email" placeholder="seu@email.com" autocomplete="email">
  <button id="btn" onclick="pagar()">Ir para o pagamento →</button>
  <p class="nota">Pagamento processado pelo Mercado Pago.</p>
</div>
<script>
const PLANO = '${plano}';
const STORE = new URLSearchParams(location.search).get('store') || '';
async function pagar() {
  const email = document.getElementById('email').value.trim();
  const erro = document.getElementById('erro');
  const btn = document.getElementById('btn');
  erro.style.display = 'none';
  if (!email || !email.includes('@')) { erro.textContent = 'Informe um email válido.'; erro.style.display = 'block'; return; }
  btn.textContent = 'Gerando pagamento...'; btn.disabled = true;
  try {
    const endpoint = STORE ? '/assinatura/criar' : '/checkout/criar';
    const body = STORE ? { plano: PLANO, email, store_id: STORE } : { plano: PLANO, email };
    const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (d.url) { window.location.href = d.url; }
    else { erro.textContent = d.error || 'Erro ao gerar checkout.'; erro.style.display = 'block'; btn.textContent = 'Ir para o pagamento →'; btn.disabled = false; }
  } catch { erro.textContent = 'Erro de conexão. Tente novamente.'; erro.style.display = 'block'; btn.textContent = 'Ir para o pagamento →'; btn.disabled = false; }
}
document.getElementById('email').addEventListener('keydown', e => { if (e.key === 'Enter') pagar(); });
</script>
</body>
</html>`);
});

app.post('/checkout/criar', async (req, res) => {
  const { plano, email } = req.body;
  if (!plano || !email) return res.status(400).json({ error: 'plano e email obrigatorios' });
  if (!MP_ACCESS_TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN nao configurado' });
  const precos = { basic: 97, premium: 147 };
  const nomes  = { basic: 'LoggZap Essencial', premium: 'LoggZap Pro' };
  const meses  = 1;
  if (!precos[plano]) return res.status(400).json({ error: 'plano invalido' });
  try {
    const { data } = await axios.post('https://api.mercadopago.com/checkout/preferences', {
      items: [{ title: nomes[plano], quantity: 1, unit_price: precos[plano], currency_id: 'BRL' }],
      payer: { email },
      back_urls: { success: BACKEND_URL + '/checkout/sucesso?plano=' + plano, failure: BACKEND_URL + '/checkout/erro?plano=' + plano, pending: BACKEND_URL + '/checkout/pendente?plano=' + plano },
      auto_return: 'approved',
      external_reference: JSON.stringify({ plano, email, meses }),
      notification_url: BACKEND_URL + '/webhook/mp'
    }, { headers: { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN, 'Content-Type': 'application/json' } });
    res.json({ success: true, url: data.init_point, id: data.id });
  } catch(e) { console.error('[Checkout MP]', e.response?.data || e.message); res.status(500).json({ error: e.message }); }
});

// Assinatura recorrente (Mercado Pago preapproval, vinculada à loja) — cobra automático todo mês
app.post('/assinatura/criar', async (req, res) => {
  const { plano, email, store_id } = req.body || {};
  if (!plano || !email || !store_id) return res.status(400).json({ error: 'plano, email e store_id obrigatorios' });
  if (!MP_ACCESS_TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN nao configurado' });
  const precos = { basic: 97, premium: 147 };
  const nomes  = { basic: 'LoggZap Essencial', premium: 'LoggZap Pro' };
  if (!precos[plano]) return res.status(400).json({ error: 'plano invalido' });
  try {
    const { data } = await axios.post('https://api.mercadopago.com/preapproval', {
      reason: nomes[plano] + ' — assinatura mensal',
      external_reference: JSON.stringify({ store_id: String(store_id), plano, email }),
      payer_email: email,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: precos[plano], currency_id: 'BRL' },
      back_url: BACKEND_URL + '/checkout/sucesso?plano=' + plano,
      status: 'pending',
      notification_url: BACKEND_URL + '/webhook/mp'
    }, { headers: { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN, 'Content-Type': 'application/json' } });
    db.upsertAssinatura(String(store_id), data.id, plano, data.status || 'pending', email, data.next_payment_date || null);
    res.json({ success: true, url: data.init_point, id: data.id });
  } catch(e) {
    console.error('[Assinatura MP]', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

app.post('/webhook/mp', async (req, res) => {
  res.sendStatus(200);
  const { type, data } = req.body;

  // Pagamento único — Basic
  if (type === 'payment') {
    try {
      const { data: pagamento } = await axios.get('https://api.mercadopago.com/v1/payments/' + data.id, { headers: { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN } });
      if (pagamento.status !== 'approved') return;
      const ref = JSON.parse(pagamento.external_reference || '{}');
      const { plano, email, meses = 1 } = ref;
      if (!plano || !email) return;
      const jaProcessado = db.getLicencasPorPayment(String(data.id));
      if (jaProcessado) return;
      const chave = gerarChave(plano);
      db.criarLicenca(chave, plano, null, meses);
      db.salvarPaymentId(chave, String(data.id));
      await enviarChavePorEmail(email, chave, plano, new Date(Date.now() + meses * 30 * 24 * 60 * 60 * 1000).toISOString());
      console.log('[MP] Licenca ' + chave + ' gerada para ' + email + ' — plano ' + plano);
    } catch(e) { console.error('[Webhook MP]', e.message); }
  }

  const mpHeaders = { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN };

  // Assinatura recorrente — cobrança mensal aprovada → renova a licença da loja
  if (type === 'subscription_authorized_payment') {
    try {
      if (db.getLicencasPorPayment && db.getLicencasPorPayment(String(data.id))) return; // idempotência
      const { data: ap } = await axios.get('https://api.mercadopago.com/authorized_payments/' + data.id, { headers: mpHeaders });
      const preapprovalId = ap.preapproval_id;
      if (!preapprovalId) return;
      const aprovado = ap.status === 'approved' || ap.status === 'processed' || ap.payment?.status === 'approved';
      if (!aprovado) return;
      const { data: sub } = await axios.get('https://api.mercadopago.com/preapproval/' + preapprovalId, { headers: mpHeaders });
      let ref = {}; try { ref = JSON.parse(sub.external_reference || '{}'); } catch(_) {}
      if (ref.store_id) {
        // Fluxo vinculado à loja: renova licença (+35 dias) e marca assinatura ativa
        db.ativarAssinaturaLicenca(String(ref.store_id), ref.plano || 'premium', 35);
        db.upsertAssinatura(String(ref.store_id), preapprovalId, ref.plano || 'premium', 'authorized', sub.payer_email, sub.next_payment_date || null);
        db.salvarPaymentId('SUB-' + ref.store_id, String(data.id));
        console.log('[MP Sub] Renovada loja ' + ref.store_id + ' — ' + (ref.plano || 'premium'));
      } else if (sub.preapproval_plan_id === SUBSCRIPTION_PREMIUM_ID && sub.payer_email) {
        // Compat: plano antigo por e-mail (gera chave)
        const chave = gerarChave('premium');
        db.criarLicenca(chave, 'premium', null, 1);
        db.salvarPaymentId(chave, String(data.id));
        await enviarChavePorEmail(sub.payer_email, chave, 'premium', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
        console.log('[MP Sub] (compat) Licenca ' + chave + ' — ' + sub.payer_email);
      }
    } catch(e) { console.error('[Webhook Subscription]', e.message); }
  }

  // Assinatura recorrente — mudança de status (autorizada / pausada / cancelada)
  if (type === 'subscription_preapproval') {
    try {
      const { data: sub } = await axios.get('https://api.mercadopago.com/preapproval/' + data.id, { headers: mpHeaders });
      let ref = {}; try { ref = JSON.parse(sub.external_reference || '{}'); } catch(_) {}
      if (!ref.store_id) return;
      db.upsertAssinatura(String(ref.store_id), String(data.id), ref.plano || 'premium', sub.status, sub.payer_email, sub.next_payment_date || null);
      if (sub.status === 'authorized') {
        db.ativarAssinaturaLicenca(String(ref.store_id), ref.plano || 'premium', 35);
        console.log('[MP Sub] Autorizada loja ' + ref.store_id);
      } else if (sub.status === 'cancelled' || sub.status === 'paused') {
        db.cancelarAssinaturaLicenca(String(ref.store_id), sub.status);
        console.log('[MP Sub] ' + sub.status + ' loja ' + ref.store_id);
      }
    } catch(e) { console.error('[Webhook Preapproval]', e.message); }
  }
});


// ── App LoggZap Mobile — login por chave de licença ──────────────────────────
// Rota usada pelo app nativo Android/iOS.
// Não altera o fluxo da extensão: apenas valida a chave, identifica a loja vinculada
// e devolve os dados necessários para o app carregar Dashboard/Pedidos/Metas.
app.post('/licenca/login-app', auth, (req, res) => {
  try {
    const { chave } = req.body || {};
    const chaveLimpa = String(chave || '').trim();

    if (!chaveLimpa) {
      return res.status(400).json({
        success: false,
        valida: false,
        error: 'Informe a chave de licença.'
      });
    }

    // Chave master full — acessa a loja definida em MASTER_STORE_ID, em qualquer dispositivo
    const MASTER = process.env.LICENCA_MASTER_KEY;
    if (MASTER && chaveLimpa === MASTER) {
      const masterStore = process.env.MASTER_STORE_ID ? String(process.env.MASTER_STORE_ID) : null;
      if (!masterStore) {
        return res.status(409).json({ success: false, valida: false, error: 'Defina MASTER_STORE_ID no servidor para usar a chave master no app.' });
      }
      const tokenMaster = db.getToken ? db.getToken(masterStore) : null;
      const instanciaMaster = db.getInstancia ? db.getInstancia(masterStore) : null;
      return res.json({
        success: true,
        valida: true,
        plano: 'premium',
        master: true,
        store_id: masterStore,
        expira_em: null,
        zapi_configurada: !!instanciaMaster,
        premium_pronto: !!instanciaMaster
      });
    }

    const lic = db.getLicencaPorChave
      ? db.getLicencaPorChave(chaveLimpa)
      : db.getLicenca(chaveLimpa);

    if (!lic) {
      return res.status(404).json({
        success: false,
        valida: false,
        error: 'Chave não encontrada.'
      });
    }

    if (lic.status && lic.status !== 'ativa') {
      return res.status(403).json({
        success: false,
        valida: false,
        error: 'Licença inativa.'
      });
    }

    if (lic.expira_em && new Date(lic.expira_em) < new Date()) {
      return res.status(403).json({
        success: false,
        valida: false,
        error: 'Licença expirada.'
      });
    }

    if (!lic.store_id) {
      return res.status(409).json({
        success: false,
        valida: false,
        error: 'Esta chave ainda não está vinculada a uma loja. Ative a licença na extensão ou peça suporte para vincular.'
      });
    }

    const storeId = String(lic.store_id);
    const token = db.getToken ? db.getToken(storeId) : null;

    if (!token) {
      return res.status(409).json({
        success: false,
        valida: false,
        error: 'A loja vinculada ainda não está autenticada na Nuvemshop.'
      });
    }

    const instancia = db.getInstancia ? db.getInstancia(storeId) : null;

    return res.json({
      success: true,
      valida: true,
      plano: lic.plano,
      store_id: storeId,
      expira_em: lic.expira_em,
      zapi_configurada: !!instancia,
      premium_pronto: lic.plano === 'premium' ? !!instancia : true
    });

  } catch (e) {
    console.error('[Licenca Login App]', e.message);
    return res.status(500).json({
      success: false,
      valida: false,
      error: e.message
    });
  }
});

app.post('/licenca/validar', auth, (req, res) => {
  const { chave, store_id } = req.body;
  if (!chave || !store_id) return res.status(400).json({ error: 'chave e store_id obrigatorios' });
  // Chave master full — qualquer loja, qualquer dispositivo (definida em LICENCA_MASTER_KEY no Railway)
  const MASTER = process.env.LICENCA_MASTER_KEY;
  if (MASTER && String(chave).trim() === MASTER) {
    return res.json({ valida: true, plano: 'premium', master: true, multi_dispositivo: true, expira_em: null });
  }
  res.json(db.validarLicenca(chave, store_id));
});

app.get('/licenca/status/:storeId', auth, (req, res) => {
  const lic = db.getLicencaPorStore(req.params.storeId);
  if (!lic) return res.json({ plano: 'trial', valida: false });
  if (new Date(lic.expira_em) < new Date()) return res.json({ plano: 'trial', valida: false, motivo: 'expirada' });
  res.json({ plano: lic.plano, valida: true, expira_em: lic.expira_em });
});


// ── Cadastro de novo usuário ──────────────────────────────────────────────────
app.post('/cadastro', async (req, res) => {
  const { nome, email, whatsapp, plano } = req.body;
  if (!nome || !email) return res.status(400).json({ error: 'Nome e email são obrigatórios.' });

  const CHROME_URL = 'https://chromewebstore.google.com/detail/loggzap-dashboard/dpfnpaepnholpjgbblljpinbkfoldlpp';

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const nomeFormatado = nome.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    const isPremium = (plano === 'premium');

    await resend.emails.send({
      from: 'LoggZap <contato@loggzap.com.br>',
      to: email,
      subject: '⚡ Seu LoggZap Dashboard está pronto para instalar',
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background:#07090e;font-family:'DM Sans',Arial,sans-serif;color:#eef0f8">
          <div style="max-width:600px;margin:0 auto;padding:40px 24px">
            <div style="text-align:center;margin-bottom:36px">
              <span style="font-size:32px;font-weight:800">Logg<span style="color:#00d084">Zap</span></span>
            </div>
            <div style="background:#0c0f16;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:32px">
              <h1 style="font-size:22px;font-weight:700;margin:0 0 12px">Olá, ${nomeFormatado}! 👋</h1>
              <p style="color:#8b93a8;font-size:15px;line-height:1.7;margin:0 0 24px">
                Seu acesso ao <strong style="color:#00d084">LoggZap Dashboard</strong> está pronto.
                Clique no botão abaixo para instalar direto pela Chrome Web Store.
              </p>

              <div style="background:#11151e;border-radius:10px;padding:20px;margin-bottom:24px">
                <div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#00d084;text-transform:uppercase;margin-bottom:12px">Passo 1 — Instale a extensão</div>
                <p style="color:#8b93a8;font-size:14px;margin:0 0 16px">Clique no botão abaixo para instalar direto pela Chrome Web Store:</p>
                <a href="${CHROME_URL}" style="display:inline-block;background:#00d084;color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">🔗 Instalar LoggZap no Chrome</a>
              </div>

              <div style="background:#11151e;border-radius:10px;padding:20px;margin-bottom:24px">
                <div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#00d084;text-transform:uppercase;margin-bottom:12px">Passo 2 — Leia o manual</div>
                <p style="color:#8b93a8;font-size:14px;margin:0 0 16px">O manual completo de instalação está disponível online:</p>
                <a href="https://cliente.loggzap.com.br/manual" style="display:inline-block;border:1px solid rgba(255,255,255,0.15);color:#eef0f8;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">📖 Ver manual de instalação</a>
              </div>

            </div>

            <div style="text-align:center;margin-top:32px">
              <p style="color:#424a61;font-size:13px">Seu trial de 7 dias começa quando você instalar a extensão.</p>
              <p style="color:#424a61;font-size:13px;margin-top:8px">Dúvidas? <a href="mailto:contato@loggzap.com.br" style="color:#00d084">contato@loggzap.com.br</a></p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log('[Cadastro] Lead registrado:', nome, email, plano);

    // Notificar leads@loggzap.com.br
    try {
      await resend.emails.send({
        from: 'LoggZap <contato@loggzap.com.br>',
        to: 'leads@loggzap.com.br',
        subject: `🔔 Novo lead: ${nome} — Plano ${plano}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0c0f16;color:#eef0f8;border-radius:12px">
          <h2 style="color:#00d084;margin:0 0 20px">Novo cadastro no LoggZap</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#8b93a8;font-size:14px">Nome</td><td style="padding:8px 0;font-size:14px"><strong>${nome}</strong></td></tr>
            <tr><td style="padding:8px 0;color:#8b93a8;font-size:14px">Email</td><td style="padding:8px 0;font-size:14px"><a href="mailto:${email}" style="color:#00d084">${email}</a></td></tr>
            <tr><td style="padding:8px 0;color:#8b93a8;font-size:14px">WhatsApp</td><td style="padding:8px 0;font-size:14px">${whatsapp || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8b93a8;font-size:14px">Plano</td><td style="padding:8px 0;font-size:14px"><strong style="color:#00d084">${plano}</strong></td></tr>
            <tr><td style="padding:8px 0;color:#8b93a8;font-size:14px">Data</td><td style="padding:8px 0;font-size:14px">${new Date().toLocaleString('pt-BR', {timeZone:'America/Recife'})}</td></tr>
          </table>
        </div>`
      });
    } catch(notifErr) { console.error('[Cadastro] Erro notif lead:', notifErr.message); }

    res.json({ success: true, redirect: CHROME_URL });
  } catch(e) {
    console.error('[Cadastro] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao enviar email. Tente novamente.' });
  }
});

app.get('/ranking/:storeId', auth, async (req, res) => {
  const { storeId } = req.params;
  const tipo = req.query.tipo || 'valor'; // 'valor' ou 'compras'
  const dias = parseInt(req.query.dias || '360');
  try {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
    const orders = await nuvemGet(storeId, '/orders', {
      per_page: 200,
      payment_status: 'paid',
      created_at_min: desde
    });

    const clientes = {};
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const tel = formatTel(o.contact_phone);
      const nome = o.contact_name || 'Cliente';
      const key = tel || nome;
      if (!clientes[key]) clientes[key] = { nome, telefone: tel, total: 0, compras: 0 };
      clientes[key].total += parseFloat(o.total || 0);
      clientes[key].compras += 1;
    }

    const lista = Object.values(clientes)
      .sort((a, b) => tipo === 'compras' ? b.compras - a.compras : b.total - a.total)
      .slice(0, 20)
      .map((c, i) => ({ posicao: i + 1, ...c, total: Math.round(c.total * 100) / 100 }));

    res.json({ success: true, tipo, dias, total: lista.length, clientes: lista });
  } catch(e) {
    const msg = e.response?.data?.description || e.message || '';
    if (msg.includes('Last page is 0')) return res.json({ success: true, tipo, dias, total: 0, clientes: [] });
    console.error(`[Ranking] Erro loja ${storeId}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/download/extensao', (req, res) => {
  const file = path.join(__dirname, 'public', 'LoggZap_v2.9.1.zip');
  res.download(file, 'LoggZap_Dashboard_v2.9.1.zip');
});

app.get('/manual', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'manual-loggzap.html')); });

app.get('/checkout/sucesso', (req, res) => {
  const plano = String(req.query.plano || '').toLowerCase();
  const isPremium = plano === 'premium';
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pagamento aprovado - LoggZap</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#07090e;color:#eef0f8;font-family:Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  h1,h2,h3,.logo{font-family:'Poppins',Arial,sans-serif}
  .card{background:#0c0f16;border:1px solid rgba(0,208,132,.22);border-radius:18px;padding:42px 34px;max-width:560px;width:100%;text-align:center;box-shadow:0 24px 90px rgba(0,0,0,.45)}
  .logo{font-size:26px;font-weight:800;margin-bottom:18px}.logo span{color:#00d084}
  .icon{font-size:54px;margin-bottom:16px}
  h1{font-size:26px;line-height:1.2;margin-bottom:12px;color:#00d084}
  p{font-size:15px;color:#a0a6ba;line-height:1.7;margin-bottom:18px}
  .box{background:#11151e;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:18px;text-align:left;margin:22px 0}
  .box strong{color:#eef0f8}.box ul{list-style:none;padding:0;margin:10px 0 0}.box li{font-size:14px;color:#a0a6ba;line-height:1.8}
  .btn{display:inline-block;background:#00d084;color:#000;text-decoration:none;font-weight:800;border-radius:10px;padding:13px 22px;margin-top:8px}
  .muted{font-size:12px;color:#555568;margin-top:16px;margin-bottom:0}
</style>
</head>
<body>
  <div class="card">
    <div class="logo">Logg<span>Zap</span></div>
    <div class="icon">✅</div>
    <h1>Pagamento aprovado!</h1>
    <p>Sua compra foi confirmada. A chave de ativação será enviada automaticamente para o e-mail informado no pagamento.</p>
    ${isPremium ? `
    <div class="box">
      <strong>Próximo passo - configuração Premium</strong>
      <ul>
        <li>✅ Nosso suporte entrará em contato em até 24h.</li>
        <li>✅ A equipe vai ativar a licença Premium junto com você.</li>
        <li>✅ Também vamos configurar a automação, Z-API e testes de envio.</li>
      </ul>
    </div>
    <p>Enquanto isso, mantenha acesso ao painel da Nuvemshop e ao WhatsApp que será usado na automação.</p>` : `
    <div class="box">
      <strong>Próximo passo</strong>
      <ul>
        <li>✅ Verifique seu e-mail para copiar a chave de ativação.</li>
        <li>✅ Abra a extensão LoggZap e cole a chave na área de plano.</li>
      </ul>
    </div>`}
    <a class="btn" href="https://cliente.loggzap.com.br/manual">Ver manual de instalação</a>
    <p class="muted">Caso não receba o e-mail em alguns minutos, fale com o suporte: contato@loggzap.com.br</p>
  </div>
</body>
</html>`);
});
app.get('/checkout/erro',    (req, res) => { res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700&display=swap" rel="stylesheet"></head><body style="background:#0d0d10;color:#fff;font-family:sans-serif;text-align:center;padding:3rem"><h2 style="color:#e05a5a;font-family:\'Poppins\',sans-serif">Pagamento nao aprovado</h2><p>Tente novamente ou entre em contato: contato@loggzap.com.br</p></body></html>'); });
app.get('/checkout/pendente',(req, res) => { res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700&display=swap" rel="stylesheet"></head><body style="background:#0d0d10;color:#fff;font-family:sans-serif;text-align:center;padding:3rem"><h2 style="color:#e8a030;font-family:\'Poppins\',sans-serif">Pagamento em processamento</h2><p>Voce recebera a chave por email assim que o pagamento for confirmado.</p></body></html>'); });

app.post('/teste/email', auth, async (req, res) => {
  const { email, plano = 'basic' } = req.body;
  if (!email) return res.status(400).json({ error: 'email obrigatorio' });
  try {
    const chave = gerarChave(plano);
    const expiraEm = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.criarLicenca(chave, plano, null, 1);
    let emailEnviado = false;
    try {
      await Promise.race([enviarChavePorEmail(email, chave, plano, expiraEm), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))]);
      emailEnviado = true;
    } catch(emailErr) { console.error('[Teste Email] Falha no envio:', emailErr.message); }
    res.json({ success: true, chave, emailEnviado, mensagem: emailEnviado ? 'Email enviado!' : 'Licenca criada mas email falhou.' });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/diagnostico/:storeId', async (req, res) => {
  const { storeId } = req.params;
  try {
    const row = db.getToken(storeId);
    if (!row) return res.json({ erro: 'Token nao encontrado no banco', storeId });
    const token = row.access_token;
    const tokenPreview = token ? token.substring(0, 10) + '...' : 'VAZIO';
    let nuvemRes = null, nuvemErro = null;
    try {
      const r = await axios.get(`https://api.nuvemshop.com.br/v1/${storeId}/orders`, {
        headers: { 'Authentication': `bearer ${token}`, 'User-Agent': NUVEM_USER_AGENT },
        params: { per_page: 1 }
      });
      nuvemRes = { status: r.status, total: Array.isArray(r.data) ? r.data.length : 'nao array' };
    } catch(e) { nuvemErro = { status: e.response?.status, msg: e.response?.data || e.message }; }
    res.json({ storeId, tokenPreview, nuvemRes, nuvemErro });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post('/ativar', auth, (req, res) => {
  const { chave, store_id } = req.body;
  if (!chave || !store_id) return res.status(400).json({ error: 'chave e store_id obrigatorios' });
  const CHAVES = { 'LOGGZAP-BASIC-2026': 'basic', 'LOGGZAP-PREMIUM-2026': 'premium' };
  const plano = CHAVES[chave.toUpperCase()];
  if (!plano) return res.status(400).json({ error: 'Chave invalida.' });
  res.json({ success: true, plano, store_id });
});

app.get('/config/:storeId', auth, (req, res) => {
  try { res.json({ success: true, config: db.getConfig(req.params.storeId) }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/config/:storeId', auth, (req, res) => {
  try { db.salvarConfig(req.params.storeId, req.body); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/optout', auth, (req, res) => {
  const { telefone, storeId, acao } = req.body;
  if (!telefone) return res.status(400).json({ error: 'telefone obrigatório' });
  if (acao === 'remover') db.removerOptOut(telefone);
  else db.marcarOptOut(telefone, storeId);
  res.json({ success: true });
});

app.get('/frete/:storeId', auth, async (req, res) => {
  const { storeId } = req.params;
  try {
    const orders = await nuvemGet(storeId, '/orders', { per_page: 200, payment_status: 'paid', fields: 'id,number,shipping_cost_customer,created_at' });
    const agora  = new Date();
    const hoje   = new Date(agora); hoje.setHours(0,0,0,0);
    const semana = new Date(agora); semana.setDate(semana.getDate() - 7); semana.setHours(0,0,0,0);
    const mes    = new Date(agora); mes.setDate(mes.getDate() - 30);      mes.setHours(0,0,0,0);
    function calcPeriod(desde) {
      const period   = orders.filter(o => new Date(o.created_at) >= desde);
      const comFrete = period.filter(o => parseFloat(o.shipping_cost_customer || 0) > 0);
      const total    = comFrete.reduce((acc, o) => acc + parseFloat(o.shipping_cost_customer || 0), 0);
      return { total: Math.round(total * 100) / 100, pedidos: comFrete.length, pedidosTotal: period.length };
    }
    res.json({ success: true, hoje: calcPeriod(hoje), semana: calcPeriod(semana), mes: calcPeriod(mes) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/carrinho-stats/:storeId', auth, async (req, res) => {
  try { res.json({ success: true, ...db.getCarrinhoStats(req.params.storeId) }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/enviar-whatsapp', auth, async (req, res) => {
  const { telefone, mensagem, order_id, store_id, rastreio } = req.body;
  if (!telefone || !mensagem) return res.status(400).json({ error: 'telefone e mensagem obrigatórios.' });
  try {
    const result = await sendWhatsApp(telefone, mensagem, store_id);
    if (order_id && store_id) db.marcarNotificado(order_id, store_id, rastreio, telefone);
    res.json({ success: true, result });
  } catch(e) { res.status(500).json({ success: false, error: e.response?.data?.message || e.message }); }
});

app.get('/whatsapp/status', auth, async (req, res) => {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN)
    return res.json({ conectado: false, erro: 'Z-API não configurada.' });
  try {
    const r = await axios.get(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/status`, { headers: { 'Client-Token': ZAPI_CLIENT_TOKEN } });
    const conectado = r.data?.connected === true || r.data?.status === 'connected';
    res.json({ conectado, estado: r.data?.status || 'unknown', data: r.data });
  } catch(e) { res.json({ conectado: false, erro: e.message }); }
});

app.get('/whatsapp/qrcode', auth, (req, res) => { res.json({ success: false, error: 'Com Z-API o QR Code é gerado no painel de z-api.io.' }); });
app.post('/whatsapp/criar-instancia', auth, (req, res) => { res.json({ success: true, message: 'Z-API não precisa criar instância via API.' }); });

// ── WhatsApp self-service (Evolution): conectar por QR, status e desconectar ──
app.post('/whatsapp/conectar', auth, async (req, res) => {
  const { store_id } = req.body || {};
  if (!store_id) return res.status(400).json({ error: 'store_id obrigatório.' });
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY)
    return res.status(400).json({ error: 'Evolution não configurada neste serviço (EVOLUTION_URL/EVOLUTION_API_KEY).' });
  try {
    const out = await evolutionConnect(String(store_id));
    const st = await evolutionState(String(store_id));
    res.json({ success: true, qr: out.qr, code: out.code, estado: st.state, conectado: st.conectado });
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

app.get('/whatsapp/status/:storeId', auth, async (req, res) => {
  try {
    const st = await getZapiStatusForStore(String(req.params.storeId));
    res.json({ success: true, conectado: !!st.conectado, estado: st.estado || null, provedor: WHATSAPP_PROVIDER });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/whatsapp/desconectar', auth, async (req, res) => {
  const { store_id } = req.body || {};
  if (!store_id) return res.status(400).json({ error: 'store_id obrigatório.' });
  try {
    if (WHATSAPP_PROVIDER === 'evolution') await evolutionLogout(String(store_id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Uso de rastreios do mês vs limite do plano
app.get('/rastreio/uso/:storeId', auth, (req, res) => {
  try {
    const storeId = String(req.params.storeId);
    const usados = db.contarUsoRastreio(storeId);
    const limite = getLimiteRastreio(storeId);
    const plano = (db.getLicencaPorStore ? db.getLicencaPorStore(storeId)?.plano : null) || 'free';
    res.json({ success: true, usados, limite, restante: Math.max(0, limite - usados), plano });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function verificarPosEntrega(storeId, pedidosPagos = null) {
  try {
    const cfg = db.getConfig(storeId) || {};
    if (cfg.pos_entrega_ativo === 0) return;
    // Reaproveita a lista de pedidos pagos do ciclo; se chamada isolada, busca.
    const orders = pedidosPagos || await nuvemGet(storeId, '/orders', { per_page: 100, payment_status: 'paid', fields: 'id,number,contact_name,contact_phone,shipping_status,created_at' });
    const templatePadrao = `Olá, {nome}! 🎉\n\nSeu pedido *#{numero}* foi entregue! Esperamos que você tenha adorado.\n\nConta pra gente o que achou? Sua opinião é muito importante para nós! 😊`;
    const template = cfg.template_pos_entrega || templatePadrao;
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      if (o.shipping_status !== 'delivered') continue;
      if (db.jaPosEntregaEnviado(String(o.id))) continue;
      const telefone = formatTel(o.contact_phone);
      if (!telefone) continue;
      const nome = o.contact_name || 'Cliente';
      const mensagem = template.replace('{nome}', nome).replace('{numero}', o.number);
      try {
        if (!await podEnviar(telefone, storeId)) continue;
        await sendWhatsApp(telefone, mensagem, storeId);
        db.marcarPosEntregaEnviado(String(o.id), storeId);
        db.registrarMensagem(telefone);
        console.log(`[PósEntrega] Enviado para ${nome} — pedido #${o.number}`);
        safeLogAutomacao({ store_id: storeId, tipo: 'pos_entrega', pedido: o.number, telefone, mensagem });
      } catch(e) { console.error(`[PósEntrega] Falha #${o.number}:`, e.message); }
      await new Promise(r => setTimeout(r, 500));
    }
  } catch(e) {
    const msg = e.response?.data?.description || e.message || '';
    if (msg.includes('Last page is 0')) return;
    console.error(`[PósEntrega] Erro loja ${storeId}:`, e.message);
  }
}

async function verificarPedidosParados(storeId, pedidosPagos = null) {
  try {
    const cfg = db.getConfig(storeId) || {};
    if (cfg.parado_ativo === 0) return;
    const diasLimite = cfg.alerta_parado_dias || 5;
    // Reaproveita a lista de pedidos pagos do ciclo; se chamada isolada, busca.
    const orders = pedidosPagos || await nuvemGet(storeId, '/orders', { per_page: 100, payment_status: 'paid', fields: 'id,number,contact_name,contact_phone,shipping_status,shipping_tracking_number,created_at' });
    const inst = db.getInstancia(storeId);
    if (!inst) return;
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      if (o.shipping_status === 'shipped' || o.shipping_status === 'delivered') continue;
      if (o.shipping_tracking_number?.trim()) continue;
      if (db.jaAlertaParadoEnviado(String(o.id))) continue;
      const diasUteis = diasUteisDesde(o.created_at);
      if (diasUteis < diasLimite) continue;
      const nome = o.contact_name || 'Cliente';
      const telLojistaMsg = process.env.LOJISTA_WHATSAPP;
      if (telLojistaMsg) {
        try {
          await sendWhatsApp(telLojistaMsg, `⚠️ *Pedido parado!*\n\nO pedido *#${o.number}* de *${nome}* está há *${diasUteis} dias úteis* sem envio.\n\nVerifique e atualize o rastreio para evitar reclamações.`, storeId);
          db.marcarAlertaParadoEnviado(String(o.id), storeId);
          console.log(`[Parado] Alerta enviado ao lojista — pedido #${o.number}`);
        } catch(e) { console.error(`[Parado] Falha ao alertar lojista #${o.number}:`, e.message); }
      }
      await new Promise(r => setTimeout(r, 500));
    }
  } catch(e) {
    const msg = e.response?.data?.description || e.message || '';
    if (msg.includes('Last page is 0')) return;
    console.error(`[Parado] Erro loja ${storeId}:`, e.message);
  }
}

cron.schedule('0 8 * * 1', async () => {
  console.log('[Relatório] Gerando relatório semanal...');
  try {
    const stores = db.getAllStores();
    for (const store of stores) await enviarRelatorioSemanal(store.store_id);
  } catch(e) { console.error('[Relatório] Erro:', e.message); }
});

async function enviarRelatorioSemanal(storeId) {
  try {
    const orders = await nuvemGet(storeId, '/orders', { per_page: 200, payment_status: 'paid', fields: 'id,number,contact_name,shipping_status,shipping_tracking_number,created_at' });
    const prazo = 3;
    let atrasados = [], pendentes = [], entregues = [], emTransito = [];
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const diasUteis = diasUteisDesde(o.created_at);
      const temRastreio = !!(o.shipping_tracking_number?.trim());
      const foiEnviado = o.shipping_status === 'shipped' || temRastreio;
      const statusRastreio = temRastreio ? db.statusRastreio(o.shipping_tracking_number.trim()) : null;
      if (statusRastreio === 'entregue') entregues.push(o);
      else if (temRastreio) emTransito.push(o);
      else if (!foiEnviado && diasUteis > prazo) atrasados.push(o);
      else if (!foiEnviado) pendentes.push(o);
    }
    const hoje = new Date().toLocaleDateString('pt-BR');
    const msgWA =
      `📊 *Relatório Semanal DTFclub*\n📅 ${hoje}\n\n` +
      `⚠️ *Atrasados (sem envio):* ${atrasados.length}\n` +
      `📦 *Aguardando envio:* ${pendentes.length}\n` +
      `🚚 *Em trânsito:* ${emTransito.length}\n` +
      `✅ *Entregues:* ${entregues.length}\n\n` +
      (atrasados.length > 0 ? `*Pedidos atrasados:*\n` + atrasados.slice(0,10).map(o => `• #${o.number} — ${o.contact_name}`).join('\n') : `Nenhum pedido atrasado! 🎉`);
    await sendWhatsApp('5581996852660', msgWA);
    console.log('[Relatório] WhatsApp enviado');
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
    const atrasadosHtml = atrasados.length
      ? atrasados.map(o => `<tr><td>#${o.number}</td><td>${o.contact_name}</td><td>${diasUteisDesde(o.created_at)} dias úteis</td></tr>`).join('')
      : '<tr><td colspan="3">Nenhum pedido atrasado 🎉</td></tr>';
    await transporter.sendMail({
      from: process.env.EMAIL_USER, to: 'dtfclub23@gmail.com', subject: `📊 Relatório Semanal DTFclub — ${hoje}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f5f5f5;padding:20px;border-radius:12px;">
        <h2 style="color:#00d084;">📊 Relatório Semanal DTFclub</h2><p style="color:#666;">Gerado em ${hoje}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0;">
          <div style="background:#fff;padding:15px;border-radius:8px;border-left:4px solid #e05a5a;"><div style="font-size:28px;font-weight:bold;color:#e05a5a;">${atrasados.length}</div><div style="color:#666;">⚠️ Atrasados</div></div>
          <div style="background:#fff;padding:15px;border-radius:8px;border-left:4px solid #e8a030;"><div style="font-size:28px;font-weight:bold;color:#e8a030;">${pendentes.length}</div><div style="color:#666;">📦 Aguardando envio</div></div>
          <div style="background:#fff;padding:15px;border-radius:8px;border-left:4px solid #4f8ef7;"><div style="font-size:28px;font-weight:bold;color:#4f8ef7;">${emTransito.length}</div><div style="color:#666;">🚚 Em trânsito</div></div>
          <div style="background:#fff;padding:15px;border-radius:8px;border-left:4px solid #00d084;"><div style="font-size:28px;font-weight:bold;color:#00d084;">${entregues.length}</div><div style="color:#666;">✅ Entregues</div></div>
        </div>
        <h3 style="color:#e05a5a;">Pedidos Atrasados</h3>
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;">
          <thead style="background:#e05a5a;color:#fff;"><tr><th style="padding:10px;text-align:left;">Pedido</th><th style="padding:10px;text-align:left;">Cliente</th><th style="padding:10px;text-align:left;">Dias úteis</th></tr></thead>
          <tbody>${atrasadosHtml}</tbody>
        </table></div>`
    });
    console.log('[Relatório] E-mail enviado para dtfclub23@gmail.com');
  } catch(e) { console.error('[Relatório] Erro ao enviar:', e.message); }
}

const GATILHOS = ['cadê meu pedido','cade meu pedido','cadê meu código','cade meu codigo','código de rastreio','codigo de rastreio','preciso do código','preciso do codigo','meu pedido ainda nao chegou','meu pedido não chegou','rastreio','rastreamento','onde está meu pedido','onde esta meu pedido'];

function contemGatilho(texto) {
  const t = (texto || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return GATILHOS.some(g => { const gn = g.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return t === gn; });
}

// ── Webhook Seu|Rastreio (tempo real; substitui o polling 1x/dia, sem limite de 200/mês) ──
app.post('/webhook/seurastreio', async (req, res) => {
  const secret = process.env.SEURASTREIO_WEBHOOK_SECRET || '';
  try {
    if (secret) {
      const sig = String(req.headers['x-seurastreio-signature'] || '');
      const m = /t=(\d+),\s*v1=([a-f0-9]+)/i.exec(sig);
      const t = m ? m[1] : String(req.headers['x-seurastreio-timestamp'] || '');
      const v1 = m ? m[2] : '';
      const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
      const esperado = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
      const okSig = !!v1 && esperado.length === v1.length &&
        crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(v1));
      if (!okSig) return res.status(401).json({ error: 'assinatura inválida' });
      if (t && (Date.now() / 1000 - Number(t)) > 300) return res.status(401).json({ error: 'timestamp expirado' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'falha na verificação de assinatura' });
  }

  // Responde rápido pra evitar retries; processa em seguida.
  res.json({ success: true });

  try {
    const body = req.body || {};
    const codigo = String(body.tracking?.codigo || '').toUpperCase();
    if (!codigo) return;

    const ctx = db.getRastreioContexto(codigo);
    if (!ctx || !ctx.telefone || !ctx.store_id) {
      console.warn('[SeuRastreio Webhook] sem contexto (código ainda não visto na varredura):', codigo);
      return;
    }

    const descricao = body.tracking?.lastEventDescription || body.eventLabel || body.event || 'Atualização de rastreio';
    const entregue = body.event === 'entregue';
    const statusNovo = entregue ? 'entregue' : descricao;
    if (statusNovo && statusNovo === db.statusRastreio(codigo)) return; // status já enviado
    if (!await podEnviar(ctx.telefone)) return;

    const evento = { descricao, status: descricao, entregue, data: '', hora: '' };
    const transpCtx = nomeTransportadora(ctx.transportadora, codigo);
    const pedido = { cliente: ctx.contact_name, numero: ctx.order_number, rastreio: codigo, transportadora: transpCtx };
    await sendWhatsApp(
      ctx.telefone,
      getMensagemTemplate(ctx.store_id, getRastreioTemplateKey(evento), montarMensagemRastreio(pedido, evento),
        { nome: ctx.contact_name || 'Cliente', numero: ctx.order_number, codigo,
          link: linkRastreio(codigo, transpCtx),
          transportadora: transpCtx, status: descricao, data: '', hora: '' }),
      ctx.store_id
    );
    db.atualizarStatusRastreio(codigo, statusNovo);
    if (db.registrarMensagem) db.registrarMensagem(ctx.telefone);
    if (typeof safeLogAutomacao === 'function') safeLogAutomacao({ store_id: ctx.store_id, tipo: 'rastreio_webhook', pedido: ctx.order_number, telefone: ctx.telefone, mensagem: descricao });
    console.log(`[SeuRastreio Webhook] enviado ${codigo} (${statusNovo}) → ${ctx.telefone}`);
  } catch (e) {
    console.error('[SeuRastreio Webhook] erro:', e.message);
  }
});

// Lógica compartilhada de resposta ao cliente (usada pelos webhooks Z-API e Evolution).
// storeIdContexto = loja cuja instância recebeu a mensagem (Evolution sabe; Z-API não).
async function processarRespostaCliente(telefone, texto, storeIdContexto) {
  if (!telefone || !texto) return;
  if (!contemGatilho(texto)) return;
  console.log(`[Inbound] Gatilho detectado de ${telefone}: "${texto}"`);
  const stores = db.getAllStores();
  let pedidoEncontrado = null;
  for (const store of stores) {
    try {
      const orders = await nuvemGet(store.store_id, '/orders', { per_page: 50, payment_status: 'paid', fields: 'id,number,contact_name,contact_phone,shipping_tracking_number,shipping_option,created_at' });
      const telLimpo = String(telefone).replace(/\D/g, '');
      const pedido = orders.filter(o => o.status !== 'cancelled').find(o => { const t = formatTel(o.contact_phone); return t && String(t).replace(/\D/g, '').endsWith(telLimpo.slice(-10)); });
      if (pedido) { pedidoEncontrado = { ...pedido, store_id: store.store_id }; break; }
    } catch(e) { console.error(`[Inbound] Erro ao buscar loja ${store.store_id}:`, e.message); }
  }
  const lojaResposta = pedidoEncontrado?.store_id || storeIdContexto || null;
  const palavrasOptOut = ['parar','sair','stop','não quero','nao quero','cancelar','descadastrar'];
  if (palavrasOptOut.some(p => texto.toLowerCase().includes(p))) {
    db.marcarOptOut(telefone, lojaResposta);
    await sendWhatsApp(telefone, `Tudo bem! Você não receberá mais mensagens automáticas. 😊\n\nSe precisar de ajuda, fale conosco diretamente.`, lojaResposta);
    console.log(`[OptOut] ${telefone} optou por sair.`);
    return;
  }
  if (!pedidoEncontrado) {
    await sendWhatsApp(telefone, `Olá! 😊 Não encontrei nenhum pedido vinculado a este número.\n\nSe precisar de ajuda, entre em contato com nossa equipe!`, lojaResposta);
    return;
  }
  const rastreio = pedidoEncontrado.shipping_tracking_number?.trim();
  const nome     = pedidoEncontrado.contact_name || 'Cliente';
  const numero   = pedidoEncontrado.number;
  const link     = rastreio ? `https://rastreamento.correios.com.br/app/index.php?objeto=${rastreio}` : null;
  const statusAtual = rastreio ? db.statusRastreio(rastreio) : null;
  let mensagem;
  if (!rastreio) {
    mensagem = `Olá, ${nome}! 😊\n\nSeu pedido *#${numero}* ainda está em produção.\n\nAssim que for enviado, você receberá o código de rastreio aqui. 📦`;
  } else {
    mensagem = `Olá, ${nome}! 😊\n\nSeu pedido *#${numero}*:\n\n📦 *Código de rastreio:* ${rastreio}\n` + (statusAtual ? `📍 *Status atual:* ${statusAtual}\n` : '') + `\n🔗 Rastreie aqui: ${link}`;
  }
  if (await podEnviar(telefone)) {
    await sendWhatsApp(telefone, mensagem, pedidoEncontrado.store_id);
    db.registrarMensagem(telefone);
    console.log(`[Inbound] Resposta automática enviada para ${telefone} — pedido #${numero}`);
  }
}

app.post('/webhook/zapi', async (req, res) => {
  res.json({ ok: true });
  try {
    const body = req.body || {};
    if (body.fromMe) return;
    if (!body.text?.message) return;
    await processarRespostaCliente(body.phone, body.text.message, null);
  } catch(e) { console.error('[ZAPI] Erro no webhook:', e.message); }
});

// Inbound do Evolution (MESSAGES_UPSERT). A loja vem no nome da instância (loja_<id>).
app.post('/webhook/evolution', async (req, res) => {
  res.json({ ok: true });
  try {
    const b = req.body || {};
    const data = b.data || {};
    const key = data.key || {};
    if (key.fromMe) return;
    const jid = key.remoteJid || '';
    if (!jid || jid.endsWith('@g.us')) return; // ignora grupos
    const texto = data.message?.conversation || data.message?.extendedTextMessage?.text || '';
    const telefone = String(jid).split('@')[0];
    const storeIdContexto = String(b.instance || '').replace(/^loja_/, '') || null;
    if (texto) await processarRespostaCliente(telefone, texto, storeIdContexto);
  } catch(e) { console.error('[Evolution] Erro no webhook inbound:', e.message); }
});

// ── Páginas públicas de privacidade ───────────────────────────────────────────
app.get('/privacidade', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacidade.html'));
});

app.get('/politica-de-privacidade', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacidade.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacidade.html'));
});

app.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacidade.html'));
});


// ── Webhooks LGPD / Nuvemshop (obrigatórios: verificam assinatura e apagam dados) ──
function verificarHmacNuvem(req) {
  try {
    const secret = NUVEM_CLIENT_SECRET;
    if (!secret) return true; // sem secret configurado (ambiente de teste): não bloqueia
    const header = String(req.headers['x-linkedstore-hmac-sha256'] || '');
    if (!header || !req.rawBody) return false;
    const hex = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    const b64 = crypto.createHmac('sha256', secret).update(req.rawBody).digest('base64');
    const bate = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    return bate(header, hex) || bate(header, b64);
  } catch (e) { return false; }
}
function clienteDoWebhook(body) {
  const c = body.customer || {};
  return {
    phone: c.phone || c.telephone || c.identification || body.phone || null,
    email: c.email || body.email || null,
  };
}

app.post('/webhooks/lgpd/store-redact', (req, res) => {
  if (!verificarHmacNuvem(req)) return res.status(401).json({ error: 'assinatura inválida' });
  try {
    const storeId = String(req.body.store_id || req.body.store || '');
    const r = db.redactStore(storeId);
    console.log(`[LGPD] store-redact loja ${storeId}: ${r.deleted} registro(s) apagado(s) [${r.tabelas.join(', ')}]`);
    return res.status(200).json({ success: true, deleted: r.deleted });
  } catch (e) { console.error('[LGPD] store-redact erro:', e.message); return res.status(200).json({ success: false }); }
});

app.post('/webhooks/lgpd/customers-redact', (req, res) => {
  if (!verificarHmacNuvem(req)) return res.status(401).json({ error: 'assinatura inválida' });
  try {
    const storeId = String(req.body.store_id || req.body.store || '');
    const r = db.redactCustomer(storeId, clienteDoWebhook(req.body));
    console.log(`[LGPD] customers-redact loja ${storeId}: ${r.deleted} registro(s) apagado(s) [${r.tabelas.join(', ')}]`);
    return res.status(200).json({ success: true, deleted: r.deleted });
  } catch (e) { console.error('[LGPD] customers-redact erro:', e.message); return res.status(200).json({ success: false }); }
});

app.post('/webhooks/lgpd/customers-data-request', (req, res) => {
  if (!verificarHmacNuvem(req)) return res.status(401).json({ error: 'assinatura inválida' });
  try {
    const storeId = String(req.body.store_id || req.body.store || '');
    const dados = db.collectCustomerData(storeId, clienteDoWebhook(req.body));
    const qtd = Object.values(dados).reduce((s, arr) => s + arr.length, 0);
    console.log(`[LGPD] customers-data-request loja ${storeId}: ${qtd} registro(s) encontrado(s)`);
    return res.status(200).json({ success: true, data: dados });
  } catch (e) { console.error('[LGPD] customers-data-request erro:', e.message); return res.status(200).json({ success: false }); }
});

// ── Webhook de PEDIDOS/CHECKOUTS da Nuvemshop (event-gated: substitui o polling) ──
// Marca a loja como "com atividade" e processa na hora. O cron */30 passa a só varrer
// lojas com evento recente → some o volume de LIST /orders vazios (404) das lojas paradas.
const webhookDebounce = new Map(); // store_id -> ts (ms) do último processamento imediato
const WEBHOOK_DEBOUNCE_MS = 60 * 1000; // evita rajada de eventos virar rajada de LIST

app.post('/webhooks/nuvemshop/orders', (req, res) => {
  if (!verificarHmacNuvem(req)) return res.status(401).json({ error: 'assinatura inválida' });
  const sid = String(req.body?.store_id || req.body?.store || '');
  const event = String(req.body?.event || '');
  // A Nuvemshop exige 2xx ágil: responde já e processa em background.
  res.status(200).json({ ok: true });
  if (!sid) return;
  try {
    db.marcarEventoLoja(sid);
    lojasVazias.delete(sid); // novo evento → a loja não está mais "vazia"
  } catch (e) { console.error('[WebhookNuvem] marcar evento erro:', e.message); }
  console.log(`[WebhookNuvem] loja ${sid} evento ${event}`);
  // Processamento imediato (com debounce por loja para não transformar uma rajada de
  // eventos numa rajada de LIST). O cron continua como rede de segurança.
  const agora = Date.now();
  if (agora - (webhookDebounce.get(sid) || 0) < WEBHOOK_DEBOUNCE_MS) return;
  webhookDebounce.set(sid, agora);
  processarLojaCiclo({ store_id: sid }).catch(e => console.error(`[WebhookNuvem] processar loja ${sid} erro:`, e.message));
});

// Backfill: registra os webhooks nas lojas JÁ instaladas (rodar uma vez). Protegido por auth admin.
app.post('/admin-loggzap/api/registrar-webhooks', auth, async (req, res) => {
  try {
    const stores = db.getAllStores();
    const resultado = [];
    for (const s of stores) {
      const r = await registrarWebhooksNuvem(s.store_id).catch(e => ({ ok: false, erro: e.message }));
      // Semeia atividade (uma vez) se a loja já tem pedido pago, para ela continuar
      // recebendo automação sem esperar o próximo webhook. Loja parada NÃO é semeada.
      let semeada = false;
      try {
        const probe = await nuvemGet(s.store_id, '/orders', { payment_status: 'paid', per_page: 1, fields: 'id' });
        if (Array.isArray(probe) && probe.length) { db.marcarEventoLoja(s.store_id); semeada = true; }
      } catch (e) { /* loja vazia → 404 tratado, não semeia */ }
      resultado.push({ store_id: s.store_id, semeada, ...r });
    }
    res.json({ ok: true, total: stores.length, resultado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`LoggZap v2.5.1 rodando na porta ${PORT}`);
  console.log('Cron ativo: verificação a cada 30 minutos (event-gated por webhook)');
});

const APP_URL_PING = process.env.APP_URL || '';
if (APP_URL_PING) {
  cron.schedule('*/10 * * * *', async () => {
    try { await axios.get(`${APP_URL_PING}/status`, { timeout: 10000 }); console.log('[Keep-alive] OK'); }
    catch(e) { console.warn('[Keep-alive] Falha no ping:', e.message); }
  });
  console.log('Keep-alive ativo: ping a cada 10 minutos');
}
