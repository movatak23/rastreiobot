# Diagnóstico de Envios Avulsos

Foi adicionada a rota interna:

GET /diag/envios-avulsos/:storeId

Ela serve para descobrir em qual endpoint/API a Nuvemshop expõe envios avulsos do tipo `#EA2766`.

## Importante

A rota é somente leitura:

- não envia WhatsApp;
- não marca notificado;
- não altera pedidos;
- não altera envios.

## Como testar

Suba o backend e acesse com header `x-secret`.

Exemplo:

```bash
curl "https://cliente.loggzap.com.br/diag/envios-avulsos/475790?envio=EA2766&codigo=AP022997557BR" \
  -H "x-secret: SUA_EXTENSION_SECRET"
```

Também pode testar apenas com Store ID:

```bash
curl "https://cliente.loggzap.com.br/diag/envios-avulsos/475790" \
  -H "x-secret: SUA_EXTENSION_SECRET"
```

## O que observar no retorno

Procure no JSON por:

```txt
resumo.possiveis_envios_avulsos_encontrados
encontrados
resultados[].ok
resultados[].sample_keys
```

Se algum endpoint retornar o envio avulso com nome, telefone e rastreio, então o próximo passo é criar a automação definitiva `verificarEnviosAvulsos(storeId)`.
