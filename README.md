# APFiscal

Plataforma fiscal multiempresa para captura, manifestação, classificação e integração de documentos fiscais. O projeto usa um monorepo pnpm com Next.js, NestJS e Supabase/PostgreSQL.

## Arquitetura

```text
apps/web         Next.js 16 (porta 3000, único serviço público)
apps/api         NestJS 11 (porta 3001, somente rede interna)
packages/shared  regras e contratos compartilhados
supabase         migrations versionadas e RLS
Redis/BullMQ     filas e agendamentos das sincronizações NF-e e TOTVS
```

O navegador acessa somente o domínio do `web`. Requisições para `/backend/*` são encaminhadas pelo Next ao container `apfiscal-api`; a API não deve receber domínio público no Dokploy.

## Desenvolvimento local

Requisitos: Node.js 22 ou superior, pnpm 11 e um projeto Supabase compatível.

1. Instale as dependências: `pnpm install`.
2. Copie `apps/web/.env.example` para `apps/web/.env.local` e `apps/api/.env.example` para `apps/api/.env`.
3. Preencha as chaves sem usar `service_role` no web.
4. Aplique as migrations descritas abaixo.
5. Execute `pnpm dev` e abra `http://localhost:3000`.

Comandos de qualidade: `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`.

## Banco e migrations

O domínio fiscal vive exclusivamente no schema `apfiscal`, sem reutilizar tabelas de outros produtos que estejam no mesmo PostgreSQL. As migrations ativas são:

- `20260820162134_apfiscal_bootstrap.sql`: cria o schema, 34 tabelas, tipos, índices, triggers, RBAC, RLS, checkpoint/lock fiscal e configura o bucket privado `fiscal-xml`;
- `20260820162700_apfiscal_harden_function_permissions.sql`: restringe funções `SECURITY DEFINER` e protege o cadastro de fornecedores por organização/empresa;
- `20260821150000_apfiscal_link_fiscal_documents_suppliers.sql`: cria o vínculo interno fornecedor → NF-e e faz backfill por CNPJ/CPF;
- `20260821153000_apfiscal_totvs_rm_integration.sql`: cria configurações, checkpoints, staging, execuções, idempotência e RBAC do TOTVS RM.
- `20260821183000_apfiscal_synchronization_hardening.sql`: aceita os códigos reais do RM, adiciona recorrência NF-e, status parcial e troca atômica de coligadas.
- `20260821184500_apfiscal_resync_totvs_product_links.sql`: força uma recarga única dos produtos para preencher família, grupo e subgrupo.
- `20260821190000_apfiscal_resync_totvs_derived_classifications.sql`: completa prefixos ausentes no RM e refaz os vínculos derivados.

As 24 migrations históricas que originaram o bootstrap foram preservadas em `supabase/legacy-migrations/` apenas para auditoria. Não as aplique: em ambientes novos, somente os arquivos de `supabase/migrations/` são executáveis.

O ambiente Supabase informado para este projeto já recebeu as duas migrations. Para provisionar outro ambiente, faça backup, teste em homologação e aplique:

```bash
npx supabase db push --db-url "postgresql://USUARIO:SENHA@HOST:5432/postgres"
```

Depois valide no Supabase:

- `apfiscal` está na lista de schemas expostos pela Data API;
- a role `authenticator` possui `apfiscal` em `pgrst.db_schemas` e o PostgREST recarregou o schema;
- RLS está ativa e as policies existem;
- o bucket `fiscal-xml` é privado;
- `PUBLIC_APP_URL` aponta para o web público nos links de confirmação, convite e recuperação emitidos pela autenticação própria do APFiscal.

Não execute reset do banco remoto. Novas alterações devem ser novas migrations.

## Deploy no Dokploy

### 1. Criar o projeto

1. Conecte o repositório Git no Dokploy.
2. Crie uma aplicação do tipo **Docker Compose**.
3. Informe `docker-compose.dokploy.yml` como arquivo Compose.
4. Configure todas as variáveis da seção seguinte no ambiente da aplicação.
5. Faça o build/deploy.
6. Publique somente o serviço `apfiscal-web`, porta `3000`, no domínio HTTPS desejado.
7. Não publique a porta `3001`; o web resolve `http://apfiscal-api:3001` pela rede interna.

Os health checks são `/api/health` no web e `/health/ready` na API. Alterações em variáveis `NEXT_PUBLIC_*` exigem novo build da imagem web.

### 2. Variáveis do Dokploy

Use [`.env.example`](./.env.example) como lista do Compose. Os arquivos específicos explicam cada variável: [`apps/web/.env.example`](./apps/web/.env.example) e [`apps/api/.env.example`](./apps/api/.env.example).

| Variável | Serviço | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | web/build | URL pública do Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web/build | chave publishable/anon, nunca secret |
| `NEXT_PUBLIC_APP_URL` | web | domínio HTTPS final |
| `SUPABASE_URL` | API | URL alcançável pelo container |
| `SUPABASE_PUBLISHABLE_KEY` | API | valida JWT e consultas com RLS |
| `SUPABASE_SECRET_KEY` | API | segredo exclusivo do backend |
| `SUPABASE_JWT_SECRET` | API | `JWT_SECRET` da instalação Supabase; usado apenas para token RLS efêmero |
| `AUTH_SESSION_SECRET` | API + web | segredo próprio da sessão APFiscal; mínimo 32 caracteres |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | API | envio de confirmação, convite e redefinição de senha |
| `CERTIFICATE_ENCRYPTION_KEY` | API | 32 bytes em base64; não rotacionar sem recriptografar senhas |
| `NFE_ENVIRONMENT` | API | `1` produção, `2` homologação |
| `APFISCAL_*` | API | credenciais opcionais do fallback legado |
| `REDIS_URL` | API | Redis interno usado pelas filas BullMQ; o Compose já aponta para `apfiscal-redis` |
| `TOTVS_SQL_HOST`, `TOTVS_SQL_PORT`, `TOTVS_SQL_DATABASE` | API | endereço TCP e banco do TOTVS RM |
| `TOTVS_SQL_USER`, `TOTVS_SQL_PASSWORD` | API | login SQL dedicado, preferencialmente com permissão somente `SELECT` |
| `TOTVS_SQL_ENCRYPT`, `TOTVS_SQL_TRUST_SERVER_CERTIFICATE` | API | TLS do SQL Server; aceite certificado não confiável apenas em rede controlada |
| `TOTVS_COLIGADAS` | API | allowlist numérica, por padrão `1,2` |
| `TOTVS_WRITES_ENABLED` | API | mantenha `false`; escrita exige SQL real homologado e versionado |
| `NFE_RECONCILIATION_BATCH_SIZE` | API | quantidade de resumos antigos revisitada por sincronização, padrão `50` |

O Compose repassa `NEXT_PUBLIC_APP_URL` à API como `PUBLIC_APP_URL`, garantindo que os e-mails da autenticação própria do APFiscal apontem para o domínio público correto. O login não usa Supabase Auth nem aceita usuários de outros sistemas do mesmo Supabase.

Na instalação self-hosted atual, que usa chaves JWT legadas, preencha as duas variáveis `*_PUBLISHABLE_KEY` com a `ANON_KEY` e `SUPABASE_SECRET_KEY` com a `SERVICE_ROLE_KEY`. A chave de serviço permanece somente na API.

Gere a chave AES fora do repositório:

```bash
openssl rand -base64 32
```

Nunca coloque valores reais em `.env.example`, commits, logs ou variáveis do frontend.

## NFeWizard e fallback

NFeWizard é o provedor padrão. O certificado A1 fica no bucket privado e a senha é armazenada com AES-256-GCM. A distribuição usa um checkpoint único por empresa/CNPJ, lock transacional e cooldown para os retornos 137/656. O fallback APFiscal só ocorre quando a preparação do NFeWizard falha antes de uma chamada à SEFAZ, evitando duplicidade de consumo e manifestações.

O backend fixa `nfewizard-io@1.1.2` (licença GPL-3.0). A validação XSD opcional que depende de JDK fica desativada na instalação; distribuição, consulta, eventos e validação do PKCS#12 não dependem dela. O mesmo upload A1 tenta provisionar o fallback APFiscal quando as variáveis `APFISCAL_*` estão completas e mantém o NFeWizard operacional caso esse provisionamento externo falhe.

Cada sincronização reconcilia documentos novos e conhecidos. XML completo já armazenado mas ainda não importado passa pelo mesmo importador canônico da importação manual; resumos pendentes são revisitados em lote, sem criar notas duplicadas. O retorno separa documentos descobertos, novos, conhecidos, resumos, XMLs completos, importações, duplicatas, aguardando liberação e erros individuais.

## TOTVS RM

A integração usa SQL Server direto com `mssql` e três filas BullMQ: `totvs-sync` para leitura RM → APFiscal, `nfe-sync` para consultas fiscais recorrentes e `totvs-integration` para NF-e → RM. O Compose inclui um Redis privado e persistente. Horários do RM, recorrência NF-e por empresa, janela incremental, vínculos de coligadas, checkpoints e logs ficam em **Configurações → Sincronizações**.

As consultas de leitura foram transcritas dos dois serviços PHP legados e cobrem representantes, categorias, fornecedores, três tipos de endereço, países, estados, municípios, contatos, transportadoras, centros de custo, condições de pagamento, defaults do fornecedor, produtos (`TPRODUTO` + `TPRODUTODEF`) e plano financeiro (`FTB1`). Somente locais de estoque continuam marcados como aguardando confirmação de schema. Não há SQL inventado.

`TOTVS_WRITES_ENABLED=false` é o padrão e a API possui uma segunda guarda central contra mutações. O payload de integração da NF-e já reúne cabeçalho, fornecedor, itens/produtos, rateios de centro de custo, cobrança e pagamentos, mas nenhuma nota recebe `integrado_totvs` até existir SQL de movimento homologado e uma transação real retornar sucesso. A antiga confirmação manual está bloqueada.

Para liberar leitura, crie no SQL Server um usuário dedicado com acesso apenas `SELECT` às tabelas consultadas, configure as variáveis `TOTVS_SQL_*`, faça o deploy e use **Testar SELECT 1**. Não habilite escrita ao mesmo usuário.

## Operação e rollback

Antes de atualizar produção, mantenha backup do banco e a tag da imagem anterior. Para rollback da aplicação, redeploye a tag anterior no Dokploy. Migrations de dados/schema devem ser revertidas por uma migration compensatória revisada; não use `db reset` nem edite migration já aplicada.
