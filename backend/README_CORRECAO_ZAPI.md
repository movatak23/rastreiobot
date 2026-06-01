# Correção Z-API - LoggZap

Correção aplicada no backend:

- criada a função `getZapiStatusForStore(storeId)`, que estava sendo chamada pelo painel, mas não existia no arquivo enviado;
- mantido `getZapiStatusForStoreSafe(storeId)` como alias para compatibilidade;
- a rota `/admin-loggzap/api/zapi-status/:storeId` agora consegue consultar o status real da Z-API;
- o endpoint usado é o oficial da Z-API: `GET /instances/{instanceId}/token/{token}/status`, com header `Client-Token`;
- resposta normalizada com `conectado`, `connected`, `smartphoneConnected`, `estado`, `erro` e `data`;
- arquivos normalizados para deploy: `index.js`, `db.js`, `package.json` e `Procfile`.

Depois de subir os arquivos, reinicie o backend.
