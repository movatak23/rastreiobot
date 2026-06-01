# Correção — Status Z-API verdadeiro por loja

## Problema corrigido
O painel Admin estava mostrando lojas trial/free como `Z-API online` mesmo sem instância própria configurada.

A causa era o fallback para variáveis globais (`ZAPI_INSTANCE`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`) dentro da função de status. Quando uma loja não tinha instância cadastrada, o backend consultava a instância global e marcava aquela loja como online indevidamente.

## Ajuste aplicado
- O status no painel Admin agora só consulta a Z-API quando a loja tem `zapi_instance` própria cadastrada.
- Loja sem instância própria aparece como `sem Z-API`.
- A consulta de status por loja usa `{ allowEnvFallback: false }`.
- O fallback global não é usado para pintar status individual de loja.

## Resultado esperado
- Loja premium 4757590 com instância configurada: `Z-API online`, se conectada.
- Loja trial/free 7693733 sem instância configurada: `sem Z-API`.

Depois de subir os arquivos, reinicie o backend e clique em `Atualizar` no painel.
