# APFiscal

Plataforma fiscal multiempresa para captura, manifestação, classificação e integração de documentos fiscais. O projeto usa um monorepo pnpm com Next.js, NestJS e Supabase/PostgreSQL.

## Arquitetura

```text
apps/web         Next.js 16 (porta 3000, único serviço público)
apps/api         NestJS 11 (porta 3001, somente rede interna)
packages/shared  regras e contratos compartilhados
supabase         migrations versionadas e RLS
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
- `20260820162700_apfiscal_harden_function_permissions.sql`: restringe funções `SECURITY DEFINER` e protege o cadastro de fornecedores por organização/empresa.

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
- Auth usa a URL pública do web nos redirects permitidos.

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
| `CERTIFICATE_ENCRYPTION_KEY` | API | 32 bytes em base64; não rotacionar sem recriptografar senhas |
| `NFE_ENVIRONMENT` | API | `1` produção, `2` homologação |
| `APFISCAL_*` | API | credenciais opcionais do fallback legado |

O Compose repassa `NEXT_PUBLIC_APP_URL` à API como `PUBLIC_APP_URL`, garantindo que convites do Supabase Auth apontem para o domínio público correto.

Na instalação self-hosted atual, que usa chaves JWT legadas, preencha as duas variáveis `*_PUBLISHABLE_KEY` com a `ANON_KEY` e `SUPABASE_SECRET_KEY` com a `SERVICE_ROLE_KEY`. A chave de serviço permanece somente na API.

Gere a chave AES fora do repositório:

```bash
openssl rand -base64 32
```

Nunca coloque valores reais em `.env.example`, commits, logs ou variáveis do frontend.

## NFeWizard e fallback

NFeWizard é o provedor padrão. O certificado A1 fica no bucket privado e a senha é armazenada com AES-256-GCM. A distribuição usa um checkpoint único por empresa/CNPJ, lock transacional e cooldown para os retornos 137/656. O fallback APFiscal só ocorre quando a preparação do NFeWizard falha antes de uma chamada à SEFAZ, evitando duplicidade de consumo e manifestações.

O backend fixa `nfewizard-io@1.1.2` (licença GPL-3.0). A validação XSD opcional que depende de JDK fica desativada na instalação; distribuição, consulta, eventos e validação do PKCS#12 não dependem dela. O mesmo upload A1 tenta provisionar o fallback APFiscal quando as variáveis `APFISCAL_*` estão completas e mantém o NFeWizard operacional caso esse provisionamento externo falhe.

## Operação e rollback

Antes de atualizar produção, mantenha backup do banco e a tag da imagem anterior. Para rollback da aplicação, redeploye a tag anterior no Dokploy. Migrations de dados/schema devem ser revertidas por uma migration compensatória revisada; não use `db reset` nem edite migration já aplicada.
