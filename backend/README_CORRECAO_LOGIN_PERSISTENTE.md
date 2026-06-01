# Correção — Login persistente no painel LoggZap

Problema relatado: ao atualizar a página do navegador, o painel pedia login novamente.

Correção aplicada:

1. Mantido cookie `lz_admin_session` com validade de 7 dias.
2. Adicionado fallback com token salvo no `localStorage` (`lz_painel_token`).
3. Todas as chamadas do painel agora enviam `Authorization: Bearer <token>` quando o navegador tiver o token salvo.
4. O backend continua aceitando cookie, mas também aceita `Authorization: Bearer`.
5. O logout remove a sessão do banco e limpa o token local.
6. O atributo `Secure` do cookie agora é controlado automaticamente:
   - em produção/HTTPS, usa `Secure`;
   - em ambiente local/HTTP, não força `Secure` para evitar que o navegador descarte o cookie.

Após subir os arquivos, reinicie o backend e faça login uma vez. Depois atualize a página para validar.

Se quiser forçar cookie sem `Secure` em algum ambiente específico, defina:

COOKIE_SECURE=false

Se quiser forçar cookie com `Secure`:

COOKIE_SECURE=true
