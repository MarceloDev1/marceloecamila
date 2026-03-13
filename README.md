# Registro de acessos no Cloudflare

Este site agora pode registrar quem acessou e de onde acessou usando um Worker na borda do Cloudflare com persistencia em D1.

## O que fica salvo

- IP do visitante
- pais, regiao, cidade, timezone e coordenadas quando o Cloudflare informar
- rota acessada
- data e hora do acesso
- user-agent, referer, ASN, operadora e colo do Cloudflare

## Arquivos principais

- `_worker.js`: intercepta requisicoes, registra acessos e expõe a API privada `/api/accessos`
- `migrations/0001_create_access_logs.sql`: cria a tabela `access_logs`
- `painel.html`: painel simples para consultar os acessos com IP mascarado e filtros

## Configuracao no Cloudflare

1. Crie o banco D1:

   ```bash
   wrangler d1 create site-access-logs
   ```

2. Copie o `database_id` retornado e substitua o valor `COLOQUE_O_ID_DO_D1_AQUI` em `wrangler.jsonc`.

3. Rode a migracao:

   ```bash
   wrangler d1 migrations apply site-access-logs
   ```

4. Crie o token administrativo usado pelo painel e pela API:

   ```bash
   wrangler secret put ADMIN_TOKEN
   ```

5. Publique novamente o site:

   ```bash
   wrangler deploy
   ```

## Como consultar

- Abra `/painel.html`
- Informe o mesmo valor usado em `ADMIN_TOKEN`
- Use os filtros opcionais de pais e periodo
- Clique em `Carregar acessos`

## Observacao importante

Voce vai armazenar IP e geolocalizacao aproximada de visitantes. Isso pode gerar obrigacoes de privacidade e transparencia, entao vale incluir essa informacao na politica de privacidade do site se ele ficar publico.