# Correção final — Z-API por loja e login persistente

## 1. Status verdadeiro da Z-API por loja

O painel não usa mais a Z-API global como fallback para todas as lojas.

Regra aplicada:

- loja trial/free sem instância própria: `sem Z-API`;
- loja premium sem instância própria: `sem Z-API configurada`;
- loja premium com instância própria: consulta a Z-API real daquela loja;
- se conectada: `Z-API online`;
- se desconectada: `Z-API offline`.

## 2. Migração segura da instância global atual

Como a loja 4757590 já usa a instância configurada no `.env`, o backend agora faz uma vinculação automática e explícita dessa instância à loja `4757590`, caso ela ainda não exista no banco.

Pode ser sobrescrito por variável de ambiente:

```env
ZAPI_DEFAULT_STORE_ID=4757590
ZAPI_DEFAULT_STORE_NAME=Nome da Loja
```

Isso evita o erro anterior: a loja trial/free aparecendo como online porque herdava a Z-API global.

## 3. Login persistente do Admin LoggZap

O painel interno `/admin-loggzap` agora salva a chave interna no `localStorage` e tenta abrir automaticamente após atualizar a página.

Se a chave salva estiver inválida, o sistema limpa o acesso local e volta para a tela de login.

## 4. Login persistente do painel do lojista

O endpoint `/painel/api/me` agora também devolve o `session_token`, reforçando a persistência por token no navegador.

## 5. Após subir o ZIP

1. Suba todos os arquivos deste ZIP.
2. Reinicie o backend.
3. Abra `/admin-loggzap`.
4. Faça login uma vez.
5. Atualize a página.
6. Confirme que a loja 4757590 aparece com o status real da própria instância.

