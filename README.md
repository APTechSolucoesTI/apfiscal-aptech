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

| Variável                                                                           | Serviço   | Observação                                                                                 |
| ---------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`                                                         | web/build | URL pública do Supabase                                                                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                                             | web/build | chave publishable/anon, nunca secret                                                       |
| `NEXT_PUBLIC_APP_URL`                                                              | web       | domínio HTTPS final                                                                        |
| `SUPABASE_URL`                                                                     | API       | URL alcançável pelo container                                                              |
| `SUPABASE_PUBLISHABLE_KEY`                                                         | API       | valida JWT e consultas com RLS                                                             |
| `SUPABASE_SECRET_KEY`                                                              | API       | segredo exclusivo do backend                                                               |
| `SUPABASE_JWT_SECRET`                                                              | API       | `JWT_SECRET` da instalação Supabase; usado apenas para token RLS efêmero                   |
| `AUTH_SESSION_SECRET`                                                              | API + web | segredo próprio da sessão APFiscal; mínimo 32 caracteres                                   |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | API       | envio de confirmação, convite e redefinição de senha                                       |
| `CERTIFICATE_ENCRYPTION_KEY`                                                       | API       | 32 bytes em base64; não rotacionar sem recriptografar senhas                               |
| `NFE_ENVIRONMENT`                                                                  | API       | `1` produção, `2` homologação                                                              |
| `APFISCAL_*`                                                                       | API       | credenciais opcionais do fallback legado                                                   |
| `REDIS_URL`                                                                        | API       | Redis interno usado pelas filas BullMQ; o Compose já aponta para `apfiscal-redis`          |
| `TOTVS_SQL_HOST`, `TOTVS_SQL_PORT`, `TOTVS_SQL_DATABASE`                           | API       | endereço TCP e banco do TOTVS RM                                                           |
| `TOTVS_SQL_USER`, `TOTVS_SQL_PASSWORD`                                             | API       | login SQL dedicado, preferencialmente com permissão somente `SELECT`                       |
| `TOTVS_SQL_ENCRYPT`, `TOTVS_SQL_TRUST_SERVER_CERTIFICATE`                          | API       | TLS do SQL Server; aceite certificado não confiável apenas em rede controlada              |
| `TOTVS_COLIGADAS`                                                                  | API       | allowlist numérica, por padrão `1,2`                                                       |
| `TOTVS_WRITES_ENABLED`                                                             | API       | mantenha `false`; escrita exige SQL real homologado e versionado                           |
| `NFE_RECONCILIATION_BATCH_SIZE`                                                    | API       | resumos antigos revisados por ciclo; máximo seguro `10` para evitar rajadas contra a SEFAZ |
| `TOTVS_CONNECTION_KEYS`                                                            | API       | chaves das conexões disponíveis, separadas por vírgula; a conexão atual é `TOTVS_GRANJA`   |
| `TOTVS_DEFAULT_CONNECTION_KEY`                                                     | API       | conexão usada para compatibilidade com as variáveis legadas; use `TOTVS_GRANJA`            |
| `TOTVS_CONNECTION_<CHAVE>_DESCRIPTION`                                             | API       | identificação legível do banco, sem armazenar credenciais no banco APFiscal                |
| `TOTVS_CONNECTION_<CHAVE>_*`                                                       | API       | host, porta, database, usuário, senha, TLS, coligadas e trava de escrita de cada banco     |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_INITIAL_PASSWORD`                                  | API       | bootstrap único do Super Admin; remova a senha do ambiente depois da primeira criação      |
| `NFSE_ADN_BASE_URL`                                                                | API       | endpoint oficial da ADN NFS-e; o exemplo já contém a URL de produção                       |
| `NFSE_ADN_MIN_INTERVAL_MINUTES`                                                    | API       | intervalo mínimo de proteção entre consultas ADN; mantenha pelo menos `15`                 |

O Compose repassa `NEXT_PUBLIC_APP_URL` à API como `PUBLIC_APP_URL`, garantindo que os e-mails da autenticação própria do APFiscal apontem para o domínio público correto. O login não usa Supabase Auth nem aceita usuários de outros sistemas do mesmo Supabase.

Na instalação self-hosted atual, que usa chaves JWT legadas, preencha as duas variáveis `*_PUBLISHABLE_KEY` com a `ANON_KEY` e `SUPABASE_SECRET_KEY` com a `SERVICE_ROLE_KEY`. A chave de serviço permanece somente na API.

Gere a chave AES fora do repositório:

```bash
openssl rand -base64 32
```

Nunca coloque valores reais em `.env.example`, commits, logs ou variáveis do frontend.

## NFeWizard e fallback

NFeWizard é o provedor padrão. O certificado A1 fica no bucket privado e a senha é armazenada com AES-256-GCM. A distribuição usa um checkpoint único por empresa/CNPJ, lock transacional e cooldown para os retornos 137/656. Durante o cooldown, novas tentativas manuais retornam HTTP 429 com o horário exato de liberação e ficam bloqueadas na interface; os agendamentos permanecem ativos e retomam sozinhos depois desse horário. O fallback APFiscal só ocorre quando a preparação do NFeWizard falha antes de uma chamada à SEFAZ, evitando duplicidade de consumo e manifestações.

O backend fixa `nfewizard-io@1.1.2` (licença GPL-3.0). A validação XSD opcional que depende de JDK fica desativada na instalação; distribuição, consulta, eventos e validação do PKCS#12 não dependem dela. O mesmo upload A1 tenta provisionar o fallback APFiscal quando as variáveis `APFISCAL_*` estão completas e mantém o NFeWizard operacional caso esse provisionamento externo falhe.

Cada sincronização reconcilia documentos novos e conhecidos. XML completo já armazenado mas ainda não importado passa pelo mesmo importador canônico da importação manual; resumos pendentes são revisitados em lote, sem criar notas duplicadas. O retorno separa documentos descobertos, novos, conhecidos, resumos, XMLs completos, importações, duplicatas, aguardando liberação e erros individuais.

## TOTVS RM

A integração usa SQL Server direto com `mssql` e três filas BullMQ: `totvs-sync` para leitura RM → APFiscal, `nfe-sync` para consultas fiscais recorrentes e `totvs-integration` para NF-e → RM. O Compose inclui um Redis privado e persistente. Horários do RM, recorrência NF-e por empresa, janela incremental, vínculos de coligadas, checkpoints e logs ficam em **Configurações → Sincronizações**.

As consultas de leitura foram transcritas dos dois serviços PHP legados e cobrem representantes, categorias, fornecedores, três tipos de endereço, países, estados, municípios, contatos, transportadoras, centros de custo, condições de pagamento, defaults do fornecedor, produtos (`TPRODUTO` + `TPRODUTODEF`) e plano financeiro (`FTB1`). Somente locais de estoque continuam marcados como aguardando confirmação de schema. Não há SQL inventado.

`TOTVS_WRITES_ENABLED=false` é o padrão e a API possui uma segunda guarda central contra mutações. O payload de integração da NF-e já reúne cabeçalho, fornecedor, itens/produtos, rateios de centro de custo, cobrança e pagamentos, mas nenhuma nota recebe `integrado_totvs` até existir SQL de movimento homologado e uma transação real retornar sucesso. A antiga confirmação manual está bloqueada.

Para liberar leitura, crie no SQL Server um usuário dedicado com acesso apenas `SELECT` às tabelas consultadas, configure as variáveis `TOTVS_SQL_*`, faça o deploy e use **Testar SELECT 1**. Não habilite escrita ao mesmo usuário.

### Múltiplos bancos TOTVS

As credenciais ficam exclusivamente no ambiente da API. O banco APFiscal armazena somente a chave da conexão vinculada à empresa, por exemplo `TOTVS_GRANJA`; senha, usuário e host nunca são persistidos nem devolvidos ao frontend. A descrição e o nome do database são metadados sanitizados exibidos para o Super Admin confirmar o alvo do teste.

Para a conexão atual, configure `TOTVS_CONNECTION_KEYS=TOTVS_GRANJA,TOTVS_GRANJA_HOMOLOG`, `TOTVS_DEFAULT_CONNECTION_KEY=TOTVS_GRANJA` e os blocos `TOTVS_CONNECTION_TOTVS_GRANJA_*` e `TOTVS_CONNECTION_TOTVS_GRANJA_HOMOLOG_*` do `.env.example`. O vínculo da empresa sempre guarda a chave principal. Quando o Super Admin ativa o modo homologação da organização, toda leitura e gravação resolve automaticamente a chave correspondente com sufixo `_HOMOLOG`; por exemplo, `TOTVS_GRANJA` passa a usar `TOTVS_GRANJA_HOMOLOG`. Para outro cliente, repita o mesmo padrão de pares. Depois do redeploy da API, o Super Admin testa as conexões e vincula cada empresa à conexão e ao escopo corretos. Usuários comuns veem e executam somente conexões já vinculadas à própria organização.

As variáveis legadas `TOTVS_SQL_*` continuam aceitas apenas para a conexão padrão, permitindo atualizar o deploy atual sem interrupção. Migre para os blocos prefixados assim que possível.

## NFS-e recebida/tomada

A integração usa a API oficial do Ambiente de Dados Nacional (ADN), com consulta incremental por NSU e autenticação mTLS pelo mesmo certificado A1 da empresa. Cada resposta JSON é expandida, os XMLs compactados são descomprimidos e somente NFS-e cujo tomador corresponde exatamente ao CNPJ da empresa são gravadas. Os documentos são persistidos tanto no histórico de distribuição quanto em `fiscal_documents`, ficando disponíveis na tela de NFS-e. O maior NSU do lote vira o checkpoint e cada execução faz somente uma consulta externa, respeitando o intervalo mínimo da ADN. Provedores municipais permanecem como adapters explícitos e bloqueados até existir configuração homologada para o município; não há consulta municipal simulada.

Em **Configurações → Sincronizações**, selecione `Ambiente Nacional (ADN)`, defina a recorrência, teste o certificado e execute a primeira sincronização manual. A tela mostra última execução, próxima execução, estado do agendamento e último erro. Respostas HTTP 429 da ADN respeitam `Retry-After`, persistem o próximo horário permitido e não desativam a recorrência automática.

## Super Admin

O usuário inicial é criado uma única vez a partir de `SUPERADMIN_EMAIL` e `SUPERADMIN_INITIAL_PASSWORD`. Após confirmar o primeiro acesso em `/admin`, remova `SUPERADMIN_INITIAL_PASSWORD` do Dokploy e redeploye a API; reinícios não recriam nem redefinem a senha existente.

Os planos são administrados por conta/organização, não por usuário. Em `/admin`, o Super Admin pode criar e editar planos, preço descritivo, disponibilidade, recursos e limites de usuários, empresas, documentos mensais e conexões TOTVS. Também pode atribuir um plano a cada conta e definir exceções individuais. As regras são verificadas na API e no PostgreSQL; ocultar ou desabilitar controles no frontend não é a única proteção. Contas que já existiam na aplicação da migration são preservadas como `Enterprise`, enquanto novas contas começam no `Starter`.

### Checklist de atualização no Dokploy

1. Faça backup do PostgreSQL e mantenha disponível a imagem/tag anterior.
2. Aplique as novas migrations em ordem, sem editar migrations já executadas e sem usar `db reset`.
3. Cadastre no ambiente da API o bloco `TOTVS_GRANJA`, as variáveis NFS-e e, apenas no primeiro start, a senha inicial do Super Admin.
4. Faça build e redeploy de API e web pelo Compose. Não publique a API diretamente.
5. Confirme `/health/ready`, entre no painel Super Admin, teste `TOTVS_GRANJA` e revise os vínculos empresa/coligada.
6. Execute uma sincronização TOTVS manual e uma NF-e/NFS-e manual antes de habilitar as recorrências.
7. Remova `SUPERADMIN_INITIAL_PASSWORD` e faça novo redeploy da API.

## Operação e rollback

Antes de atualizar produção, mantenha backup do banco e a tag da imagem anterior. Para rollback da aplicação, redeploye a tag anterior no Dokploy. Migrations de dados/schema devem ser revertidas por uma migration compensatória revisada; não use `db reset` nem edite migration já aplicada.
